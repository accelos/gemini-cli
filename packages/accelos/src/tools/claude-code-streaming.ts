/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { query, type Options } from "@anthropic-ai/claude-code";

/**
 * Permission modes for Claude Code
 */
const permissionModeSchema = z.enum([
  "default", // Default permission behavior
  "acceptEdits", // Accept edits without asking
  "bypassPermissions", // Bypass all permission checks
  "plan", // Plan mode only
]).describe("Permission mode for tool execution");

/**
 * Claude Code tool options schema
 */
const claudeCodeOptionsSchema = z.object({
  customSystemPrompt: z.string().optional().describe("Custom system prompt for the Claude Code session"),
  appendSystemPrompt: z.string().optional().describe("Additional system prompt to append"),
  maxTurns: z.number().int().positive().max(500).optional().describe("Maximum number of conversation turns (default: 20)"),
  allowedTools: z.array(z.string()).optional().describe("List of specific tools to allow (e.g., ['bash', 'read', 'write'])"),
  permissionMode: permissionModeSchema.optional().describe("Permission mode for tool execution"),
  debug: z.boolean().optional().describe("Enable debug logging"),
  model: z.string().optional().describe("Model to use for the session"),
  continue: z.boolean().optional().describe("Continue from previous session"),
  resume: z.string().optional().describe("Resume from specific session ID"),
});

/**
 * Input schema for the Claude Code tool
 */
const claudeCodeStreamingInputSchema = z.object({
  prompt: z.string().min(1).describe("The query or task to send to Claude Code"),
  options: claudeCodeOptionsSchema.optional().describe("Optional configuration for the Claude Code session"),
});

/**
 * Output schema for the Claude Code tool
 */
const claudeCodeStreamingOutputSchema = z.object({
  result: z.string().describe("The final response from Claude Code"),
  metadata: z.object({
    turnsUsed: z.number().describe("Number of conversation turns used"),
    toolsCalled: z.array(z.string()).describe("List of tools that were called during execution"),
    sessionId: z.string().optional().describe("Session ID for multi-turn conversations"),
    hasErrors: z.boolean().describe("Whether any errors occurred during execution"),
    executionTime: z.number().describe("Execution time in milliseconds"),
    streamingEventsEmitted: z.number().describe("Number of streaming events emitted"),
  }).describe("Metadata about the Claude Code execution"),
});

/**
 * Streaming Claude Code tool for Mastra
 * 
 * This tool provides real-time progress updates from Claude Code operations,
 * showing detailed logs of what Claude Code is doing internally.
 */
export const claudeCodeStreamingTool = createTool({
  id: "claude-code-streaming",
  description: `Execute queries using Claude Code with real-time progress streaming. Shows detailed logs of Claude Code's internal operations, tool calls, and thinking process.`,
  inputSchema: claudeCodeStreamingInputSchema,
  outputSchema: claudeCodeStreamingOutputSchema,
  execute: async ({ context }) => {
    const { prompt, options = {} } = context;
    const startTime = Date.now();
    let streamingEventsEmitted = 0;
    
    // Console logging for progress tracking
    const safeWrite = (event: any) => {
      // Just count the events for metadata
      streamingEventsEmitted++;
    };

    // Helper to emit progress events
    const emitProgress = (type: string, payload: any) => {
      const event = {
        type: "claude-code-progress",
        payload: {
          type,
          ...payload,
          timestamp: Date.now(),
        }
      };
      
      safeWrite(event);
      
      // Also log to console for immediate visibility
      const timestamp = new Date().toLocaleTimeString();
      switch (type) {
        case 'starting':
          console.log(`🚀 [${timestamp}] Claude Code: Starting execution`);
          console.log(`   📝 Prompt: ${payload.prompt?.substring(0, 100)}${payload.prompt?.length > 100 ? '...' : ''}`);
          break;
        case 'thinking':
          console.log(`🤔 [${timestamp}] Claude Code: ${payload.message}`);
          break;
        case 'tool_use':
          console.log(`🔧 [${timestamp}] Claude Code: Using tool '${payload.toolName}'`);
          if (payload.toolInput && Object.keys(payload.toolInput).length > 0) {
            console.log(`   ⚙️  Input: ${JSON.stringify(payload.toolInput, null, 2).substring(0, 200)}${JSON.stringify(payload.toolInput).length > 200 ? '...' : ''}`);
          }
          break;
        case 'tool_result':
          console.log(`✅ [${timestamp}] Claude Code: Tool '${payload.toolName}' completed`);
          if (payload.success === false) {
            console.log(`   ❌ Error: ${payload.error}`);
          } else if (payload.result) {
            const resultStr = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result);
            console.log(`   📄 Result: ${resultStr.substring(0, 300)}${resultStr.length > 300 ? '...' : ''}`);
          }
          break;
        case 'response':
          console.log(`💬 [${timestamp}] Claude Code: ${payload.message}`);
          break;
        case 'turn_complete':
          console.log(`🔄 [${timestamp}] Claude Code: Turn ${payload.turnNumber} complete`);
          break;
        case 'session_complete':
          console.log(`✅ [${timestamp}] Claude Code: Session complete (${payload.turnsUsed} turns)`);
          break;
        case 'error':
          console.log(`❌ [${timestamp}] Claude Code: Error - ${payload.error}`);
          break;
      }
    };
    
    try {
      // Validate environment
      if (!process.env.ANTHROPIC_API_KEY) {
        const errorMsg = "ANTHROPIC_API_KEY environment variable is required for Claude Code tool. Please set it to your Anthropic API key.";
        console.log(`❌ [${new Date().toLocaleTimeString()}] Claude Code: ${errorMsg}`);
        emitProgress('error', { error: errorMsg });
        
        // Return structured error response instead of throwing
        return {
          result: `Error: ${errorMsg}`,
          metadata: {
            turnsUsed: 0,
            toolsCalled: [],
            hasErrors: true,
            executionTime: Date.now() - startTime,
            streamingEventsEmitted,
          },
        };
      }

      emitProgress('starting', { prompt });

      // Prepare Claude Code options
      const claudeCodeOptions: Options = {
        customSystemPrompt: options.customSystemPrompt,
        appendSystemPrompt: options.appendSystemPrompt,
        maxTurns: options.maxTurns || 20,
        allowedTools: options.allowedTools,
        permissionMode: options.permissionMode || "default",
        model: options.model,
        continue: options.continue,
        resume: options.resume,
      };

      let result = "";
      let turnsUsed = 0;
      let toolsCalled: string[] = [];
      let hasErrors = false;
      let sessionId: string | undefined;
      let currentTurn = 0;

      // Stream the query and collect results with detailed logging
      for await (const message of query({ 
        prompt, 
        options: claudeCodeOptions 
      })) {
        if (options.debug) {
          console.log("🔍 Raw Claude Code message:", JSON.stringify(message, null, 2));
        }

        // Handle different message types with detailed progress updates
        switch (message.type) {
          case "result":
            // Handle both success and error result types
            if (message.subtype === "success" && "result" in message) {
              result = message.result;
              emitProgress('session_complete', { 
                turnsUsed: message.num_turns,
                success: true,
                result: message.result 
              });
            } else {
              hasErrors = true;
              result = `Execution failed: ${message.subtype}`;
              emitProgress('error', { 
                error: `Execution failed: ${message.subtype}`,
                turnsUsed: message.num_turns 
              });
            }
            turnsUsed = message.num_turns;
            sessionId = message.session_id;
            break;
            
          case "assistant": {
            // Extract content from assistant message with detailed logging
            const assistantMessage = message.message;
            if (assistantMessage && Array.isArray(assistantMessage.content)) {
              for (const content of assistantMessage.content) {
                if (content.type === "text" && content.text) {
                  result += content.text;
                  emitProgress('response', { 
                    message: content.text,
                    turnNumber: currentTurn + 1 
                  });
                }
                if (content.type === "tool_use") {
                  const toolName = content.name;
                  const toolInput = content.input;
                  
                  if (toolName && !toolsCalled.includes(toolName)) {
                    toolsCalled.push(toolName);
                  }
                  
                  emitProgress('tool_use', {
                    toolName,
                    toolInput,
                    turnNumber: currentTurn + 1
                  });
                }
              }
            }
            sessionId = message.session_id;
            currentTurn++;
            emitProgress('turn_complete', { turnNumber: currentTurn });
            break;
          }
            
          case "user":
            // Track user messages
            sessionId = message.session_id;
            emitProgress('thinking', { 
              message: "Processing user input",
              turnNumber: currentTurn + 1 
            });
            break;
            
          case "system":
            // Track system information
            if (message.subtype === "init") {
              sessionId = message.session_id;
              if (message.tools) {
                const uniqueTools = new Set([...toolsCalled, ...message.tools]);
                toolsCalled = Array.from(uniqueTools);
                emitProgress('thinking', { 
                  message: `Initialized with ${message.tools.length} available tools: ${message.tools.join(', ')}` 
                });
              }
            }
            break;

            
          default:
            // Handle any other message types
            if (options.debug) {
              console.log("🔍 Unhandled Claude Code message type:", (message as { type?: string }).type);
              emitProgress('thinking', { 
                message: `Received ${(message as { type?: string }).type} message` 
              });
            }
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        result: result || "No result returned from Claude Code",
        metadata: {
          turnsUsed,
          toolsCalled,
          sessionId,
          hasErrors,
          executionTime,
          streamingEventsEmitted,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      emitProgress('error', { error: errorMsg, executionTime });
      
      // Handle specific Claude Code errors
      if (error instanceof Error) {
        if (error.message.includes("ANTHROPIC_API_KEY")) {
          throw new Error(
            "Authentication failed: Please ensure ANTHROPIC_API_KEY environment variable is set correctly."
          );
        }
        
        if (error.message.includes("rate limit") || error.message.includes("quota")) {
          throw new Error(
            "Rate limit or quota exceeded: Please check your Anthropic API usage and try again later."
          );
        }
      }

      // Return structured error response
      return {
        result: `Error executing Claude Code: ${errorMsg}`,
        metadata: {
          turnsUsed: 0,
          toolsCalled: [],
          hasErrors: true,
          executionTime,
          streamingEventsEmitted,
        },
      };
    }
  },
});