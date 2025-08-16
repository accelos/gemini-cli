/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTool } from '@mastra/core';
import { z } from 'zod';
import { reviewToPRStreamingWorkflow } from '../workflows/review-to-pr-streaming-workflow.js';

/**
 * PR Creation Workflow Tool
 * 
 * This tool wraps the review-to-pr-streaming-workflow to make it available
 * as a tool for the production-readiness-agent, enabling users to request
 * PR creation through natural language.
 */
export const prCreationWorkflowTool = createTool({
  id: 'create-pr-from-review',
  description: 'Create a pull request to address action items from a production review assessment. Analyzes review findings, generates code fixes using Claude Code, and creates a GitHub PR.',
  inputSchema: z.object({
    reviewAssessmentId: z.string().describe('ID of the review assessment to process (e.g., "REVIEW-2025-01-13-sample")'),
    dryRun: z.boolean().default(false).describe('Whether to run in dry-run mode (analysis only, no file changes or PR creation)'),
    autoCommit: z.boolean().default(true).describe('Whether to automatically commit changes to a new branch'),
    createPR: z.boolean().default(true).describe('Whether to create a GitHub pull request'),
    categories: z.array(z.enum(['security', 'performance', 'testing', 'configuration'])).optional()
      .describe('Specific categories of findings to address (if not specified, processes all findings)'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
      .describe('Minimum severity level to process (if not specified, processes all severities)'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('Whether the workflow completed successfully'),
    reviewAssessmentId: z.string().describe('ID of the processed review assessment'),
    summary: z.object({
      phase: z.string().describe('Final phase reached (e.g., "complete", "failed")'),
      claudeCodeExecutions: z.number().describe('Number of Claude Code analysis executions'),
      totalExecutionTime: z.number().describe('Total execution time in milliseconds'),
      fixesProposed: z.number().describe('Number of fixes proposed'),
      branchCreated: z.string().optional().describe('Name of the branch created'),
      prUrl: z.string().optional().describe('URL of the created pull request'),
    }),
    analysisResults: z.string().optional().describe('Detailed analysis results from Claude Code'),
    errors: z.array(z.string()).optional().describe('Any errors that occurred during execution'),
    message: z.string().describe('Human-readable summary of the operation'),
  }),
  execute: async ({ context, runtimeContext, writer }) => {
    const { 
      reviewAssessmentId, 
      dryRun, 
      autoCommit, 
      createPR, 
      categories, 
      severity 
    } = context;

    console.log(`🚀 Starting PR creation workflow for review: ${reviewAssessmentId}`);
    console.log(`   Settings: dryRun=${dryRun}, autoCommit=${autoCommit}, createPR=${createPR}`);
    
    if (categories) {
      console.log(`   Categories filter: ${categories.join(', ')}`);
    }
    if (severity) {
      console.log(`   Minimum severity: ${severity}`);
    }

    const startTime = Date.now();

    try {
      // Create and execute the workflow with streaming
      const workflowRun = await reviewToPRStreamingWorkflow.createRunAsync();
      
      // Use streamVNext to get streaming output and pipe it to the agent writer
      const stream = await workflowRun.streamVNext({
        inputData: {
          reviewAssessmentId,
          dryRun,
          autoCommit,
          createPR,
        }
      });

      // If writer is available, pipe the workflow stream to it
      if (writer) {
        console.log(`🔄 Piping workflow stream to agent writer`);
        try {
          await stream.pipeTo(writer);
        } catch (streamError) {
          // Handle stream lock errors gracefully
          if (streamError instanceof Error && streamError.message.includes('WritableStream is locked')) {
            console.warn(`⚠️  Stream writer is locked, falling back to manual consumption`);
            // Consume the stream manually without piping
            for await (const chunk of stream) {
              console.log(`📊 Workflow progress: ${chunk.type} from ${chunk.from || 'workflow'}`);
            }
          } else {
            // Re-throw other stream errors
            throw streamError;
          }
        }
      } else {
        console.log(`ℹ️  No writer available, running workflow without streaming to agent`);
        // Consume the stream without piping
        for await (const chunk of stream) {
          // Process chunks but don't forward them anywhere
          console.log(`📊 Workflow progress: ${chunk.type} from ${chunk.from}`);
        }
      }

      // Get the final result after stream completion
      const streamStatus = await stream.status;
      const streamResult = await stream.result;

      const executionTime = Date.now() - startTime;

      // Check if workflow completed successfully
      if (streamStatus === 'success' && streamResult) {
        const workflowResult = streamResult;
        
        // Extract summary information
        const summary = {
          phase: workflowResult.summary?.phase || 'completed',
          claudeCodeExecutions: workflowResult.summary?.claudeCodeExecutions || 1,
          totalExecutionTime: workflowResult.summary?.totalExecutionTime || executionTime,
          fixesProposed: 0, // Will be populated from analysis results
          branchCreated: undefined as string | undefined,
          prUrl: undefined as string | undefined,
        };

        // Generate human-readable message
        let message = `PR creation workflow completed for review ${reviewAssessmentId}`;
        
        if (dryRun) {
          message = `Dry run analysis completed for review ${reviewAssessmentId}`;
        } else if (workflowResult.summary?.phase === 'complete') {
          message = `Successfully created PR for review ${reviewAssessmentId}`;
          if (summary.prUrl) {
            message += ` - PR available at ${summary.prUrl}`;
          }
        }

        return {
          success: true,
          reviewAssessmentId,
          summary,
          analysisResults: undefined, // Could extract from workflow result if needed
          message,
        };
      } else {
        // Workflow failed or was suspended
        const errorMessage = streamStatus === 'failed' 
          ? 'Workflow execution failed'
          : `Workflow ended with status: ${streamStatus}`;

        return {
          success: false,
          reviewAssessmentId,
          summary: {
            phase: 'failed',
            claudeCodeExecutions: 0,
            totalExecutionTime: executionTime,
            fixesProposed: 0,
          },
          errors: [errorMessage],
          message: `PR creation failed for review ${reviewAssessmentId}: ${errorMessage}`,
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ PR creation workflow failed:`, error);

      return {
        success: false,
        reviewAssessmentId,
        summary: {
          phase: 'error',
          claudeCodeExecutions: 0,
          totalExecutionTime: executionTime,
          fixesProposed: 0,
        },
        errors: [errorMessage],
        message: `PR creation failed for review ${reviewAssessmentId}: ${errorMessage}`,
      };
    }
  },
});