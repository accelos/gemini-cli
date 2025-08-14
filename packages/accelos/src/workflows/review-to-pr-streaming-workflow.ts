/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { claudeCodeStreamingTool } from "../tools/claude-code-streaming.js";

/**
 * Streaming workflow that demonstrates real-time progress from Claude Code operations
 */

const reviewToPRStreamingInputSchema = z.object({
  reviewAssessmentId: z.string().describe("ID of the review assessment to process"),
  dryRun: z.boolean().default(true).describe("Whether to run in dry-run mode (no actual changes)"),
  autoCommit: z.boolean().default(false).describe("Whether to automatically commit changes"),
  createPR: z.boolean().default(false).describe("Whether to create a pull request"),
});

const reviewToPRStreamingOutputSchema = z.object({
  success: z.boolean().describe("Whether the workflow completed successfully"),
  reviewAssessmentId: z.string().describe("ID of the processed review assessment"),
  summary: z.object({
    phase: z.string().describe("Final phase reached"),
    claudeCodeExecutions: z.number().describe("Number of Claude Code executions"),
    totalExecutionTime: z.number().describe("Total execution time in milliseconds"),
    streamingEventsEmitted: z.number().describe("Total streaming events emitted"),
  }),
  errors: z.array(z.string()).optional().describe("Any errors that occurred"),
});

// Step 1: Load and analyze the review assessment
const loadReviewStep = createStep({
  id: "load-review",
  inputSchema: reviewToPRStreamingInputSchema,
  outputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
    }),
    success: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    console.log("🔍 DEBUG loadReviewStep inputData:", JSON.stringify(inputData, null, 2));
    
    const { reviewAssessmentId, dryRun, autoCommit, createPR } = inputData;
    
    console.log(`🔄 [${new Date().toLocaleTimeString()}] Loading review assessment data for ${reviewAssessmentId}`);

    // Simulate loading review data
    await new Promise(resolve => setTimeout(resolve, 500));

    const reviewData = {
      id: reviewAssessmentId,
      type: "code-quality",
      score: 75,
      issues: [
        "Missing error handling in API endpoints",
        "Potential memory leak in data processing",
        "Insufficient input validation",
      ],
    };

    console.log(`✅ [${new Date().toLocaleTimeString()}] Loaded review: ${reviewData.type} (Score: ${reviewData.score}/100) with ${reviewData.issues.length} issues`);

    return {
      reviewAssessmentId,
      dryRun,
      autoCommit,
      createPR,
      reviewData,
      success: true,
    };
  },
});

// Step 2: Use Claude Code to analyze and create fixes
const claudeCodeAnalysisStep = createStep({
  id: "claude-code-analysis",
  inputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
    }),
    success: z.boolean(),
  }),
  outputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
    }),
    analysisResult: z.string(),
    fixesProposed: z.array(z.string()),
    executionTime: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { reviewData, dryRun, reviewAssessmentId, autoCommit, createPR } = inputData;
    
    console.log(`🚀 [${new Date().toLocaleTimeString()}] Starting Claude Code analysis of review findings for ${reviewData.id}`);

    const startTime = Date.now();

    // Create a comprehensive prompt for Claude Code
    const prompt = `You are analyzing a code review with the following findings. Please provide specific recommendations and implementation guidance.

Review ID: ${reviewData.id}
Review Type: ${reviewData.type}  
Current Score: ${reviewData.score}/100

Issues to Address:
${reviewData.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

TASK: For each issue above, provide:
1. A brief explanation of the problem
2. A specific code pattern or implementation approach to fix it
3. Expected impact on code quality

Focus on providing practical guidance rather than exploring the entire codebase. Work within the current directory structure.

${dryRun ? "This is a DRY RUN - provide recommendations only, do not modify files." : ""}`;

    try {
      // Use the streaming Claude Code tool
      const claudeResult = await claudeCodeStreamingTool.execute({
        context: {
          prompt,
          options: {
            debug: true,
            maxTurns: 200,
            permissionMode: "acceptEdits",
          },
        },
        runtimeContext: runtimeContext || {},
      });

      const executionTime = Date.now() - startTime;


      // Safely extract metadata with defaults
      const metadata = claudeResult?.metadata || { turnsUsed: 0, toolsCalled: [], hasErrors: true };
      const turnsUsed = metadata.turnsUsed || 0;
      const toolsCalled = metadata.toolsCalled || [];
      const hasErrors = metadata.hasErrors !== false; // Default to true if undefined

      console.log(`✅ [${new Date().toLocaleTimeString()}] Claude Code analysis completed in ${executionTime}ms (${turnsUsed} turns, tools: ${toolsCalled.join(', ') || 'none'})`);

      // Extract fixes from the result (simplified)
      const fixesProposed = reviewData.issues.map((issue, i) => 
        `Fix for "${issue}": Proposed improvement ${i + 1}`
      );

      return {
        reviewAssessmentId,
        dryRun,
        autoCommit,
        createPR,
        reviewData,
        analysisResult: claudeResult?.result || "Claude Code execution failed",
        fixesProposed,
        executionTime,
        success: !hasErrors && Boolean(claudeResult?.result),
      };
    } catch (error) {
      console.log(`❌ [${new Date().toLocaleTimeString()}] Claude Code analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        reviewAssessmentId,
        dryRun,
        autoCommit,
        createPR,
        reviewData,
        analysisResult: `Error: ${error instanceof Error ? error.message : String(error)}`,
        fixesProposed: [],
        executionTime: Date.now() - startTime,
        success: false,
      };
    }
  },
});

// Step 3: Finalize and report
const finalizeStep = createStep({
  id: "finalize",
  inputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
    }),
    analysisResult: z.string(),
    fixesProposed: z.array(z.string()),
    executionTime: z.number(),
    success: z.boolean(),
  }),
  outputSchema: reviewToPRStreamingOutputSchema,
  execute: async ({ inputData }) => {
    const { reviewData, fixesProposed, executionTime, dryRun, autoCommit, createPR, reviewAssessmentId } = inputData;
    
    console.log(`🏁 [${new Date().toLocaleTimeString()}] Finalizing workflow results for review ${reviewData.id}`);

    // Simulate branch creation if not dry run
    let branchName: string | undefined;
    let commitHash: string | undefined;
    let prUrl: string | undefined;

    if (!dryRun) {
      branchName = `fix/review-${reviewData.id}-${Date.now()}`;
      console.log(`🌱 [${new Date().toLocaleTimeString()}] Creating branch: ${branchName}`);
      
      if (autoCommit) {
        commitHash = `commit_${Math.random().toString(36).substring(7)}`;
        console.log(`💾 [${new Date().toLocaleTimeString()}] Committing fixes: ${commitHash}`);
      }
      
      if (createPR) {
        prUrl = `https://github.com/example/repo/pull/${Math.floor(Math.random() * 1000)}`;
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Creating pull request: ${prUrl}`);
      }
    }

    console.log(`✅ [${new Date().toLocaleTimeString()}] Workflow completed successfully! Review: ${reviewData.type}, Score: ${reviewData.score}/100, Fixes: ${fixesProposed.length}, Branch: ${branchName || 'N/A'}, PR: ${prUrl || 'N/A'}`);

    return {
      success: true,
      reviewAssessmentId,
      summary: {
        phase: "complete",
        claudeCodeExecutions: 1,
        totalExecutionTime: executionTime,
        streamingEventsEmitted: 0,
      },
    };
  },
});

// Create the streaming workflow using Mastra's workflow syntax
export const reviewToPRStreamingWorkflow = createWorkflow({
  id: "review-to-pr-streaming-workflow",
  description: "Streaming workflow that demonstrates real-time progress from Claude Code operations",
  inputSchema: reviewToPRStreamingInputSchema,
  outputSchema: reviewToPRStreamingOutputSchema,
})
.then(loadReviewStep)
.then(claudeCodeAnalysisStep)
.then(finalizeStep)
.commit();