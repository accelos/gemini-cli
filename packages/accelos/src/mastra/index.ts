import { Mastra, Agent } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { fileAnalyzerTool, webSearchTool, codeAnalysisTool, rcaLoaderTool, guardrailLoaderTool, guardrailCrudTool, reviewStorageTool, reviewLoaderTool, debugStoreTool, claudeCodeTool, claudeCodeStreamingTool } from '../tools/index.js';
import { codeReviewWorkflow, simpleCodeReviewWorkflow, reviewToPRStreamingWorkflow } from '../workflows/index.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import { GuardrailStore } from '../tools/shared-guardrail-store.js';
import * as dotenv from 'dotenv';
import { githubTools } from '../mcp/github-mcp-client.js';
import { productionReadinessPrompt } from '../prompts/production_readiness_prompt.js';
import { guardrailAgentPrompt } from '../prompts/guardrail_agent_prompt.js';
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { createStreamingSSEHandler } from '../api/streaming-sse.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

// Initialize guardrails at startup for Mastra
async function initializeGuardrails(): Promise<void> {
  try {
    console.log(`🔧 DEBUG: Mastra initializeGuardrails() started`);
    const guardrailStore = GuardrailStore.getInstance();
    const guardrailsFile = getCompatiblePaths(defaultConfig).guardrailsFile;
    
    console.log(`🛡️  Loading guardrails from: ${guardrailsFile}`);
    console.log(`🔧 DEBUG: Calling loadFromFile with autoSave=true`);
    const result = await guardrailStore.loadFromFile(guardrailsFile, true); // Enable auto-save
    
    console.log(`✅ Loaded ${result.loaded} guardrails with auto-save enabled`);
    console.log(`🔧 DEBUG: Mastra startup initialization completed`);
    if (result.errors.length > 0) {
      console.warn(`⚠️  Guardrail loading errors:`, result.errors);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.warn('   Mastra will continue without pre-loaded guardrails.');
  }
}

// Initialize guardrails (non-blocking)
initializeGuardrails().catch(error => {
  console.warn(`⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`);
});


const memory = new Memory({
  storage: new LibSQLStore({
    url: "file:../../memory.db",
  }),
});

// Create agents using the Agent class
const accelosGoogleAgent = new Agent({
  name: 'accelos-google',
  instructions: defaultConfig.systemPrompt,
  model: google('gemini-2.0-flash-exp'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
    rcaLoader: rcaLoaderTool,
    guardrailLoader: guardrailLoaderTool,
    guardrailCrud: guardrailCrudTool,
    reviewStorage: reviewStorageTool,
    reviewLoader: reviewLoaderTool,
    debugStore: debugStoreTool,
    claudeCode: claudeCodeTool,
  },
});

const accelosOpenAIAgent = new Agent({
  name: 'accelos-openai', 
  instructions: defaultConfig.systemPrompt,
  model: openai('gpt-4o'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
    rcaLoader: rcaLoaderTool,
    guardrailLoader: guardrailLoaderTool,
    guardrailCrud: guardrailCrudTool,
    claudeCode: claudeCodeTool,
  },
});

const accelosAnthropicAgent = new Agent({
  name: 'accelos-anthropic',
  instructions: defaultConfig.systemPrompt,
  model: anthropic('claude-3-7-sonnet-20250219'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
    rcaLoader: rcaLoaderTool,
    guardrailLoader: guardrailLoaderTool,
    guardrailCrud: guardrailCrudTool,
    claudeCode: claudeCodeTool,
  },
});

const productionReadinessAgent = new Agent({
    name: 'production-readiness-agent',
    instructions: productionReadinessPrompt,
    model: anthropic('claude-3-7-sonnet-20250219'),
    defaultGenerateOptions: {
      maxSteps: 500,
    },
    tools: 
    {
      guardrailCrudTool,
      reviewStorage: reviewStorageTool,
      ...githubTools,
    },
    memory,
  });

const guardrailAgent = new Agent({
  name: 'guardrail-agent',
  instructions: guardrailAgentPrompt,
  model: anthropic('claude-3-7-sonnet-20250219'),
  defaultGenerateOptions: {
    maxSteps: 500,
  },
  tools: {
    rcaLoader: rcaLoaderTool,
    guardrailCrud: guardrailCrudTool,
  },
  memory,
});

export const mastra = new Mastra({
  agents: {
    'accelos-google': accelosGoogleAgent,
    'accelos-openai': accelosOpenAIAgent,
    'accelos-anthropic': accelosAnthropicAgent,
    'guardrail-agent': guardrailAgent,
    'production-readiness-agent': productionReadinessAgent,
  },
  workflows: {
    'code-review-workflow': codeReviewWorkflow,
    'simple-code-review-workflow': simpleCodeReviewWorkflow,
    'review-to-pr-streaming-workflow': reviewToPRStreamingWorkflow,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    port: 4111,
    host: 'localhost',
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
    apiRoutes: [
      {
        path: "/api/streaming-sse",
        method: "GET",
        createHandler: createStreamingSSEHandler,
      },
      {
        path: "/streaming-test.html",
        method: "GET",
        createHandler: async () => {
          return async (c: any) => {
            try {
              // Try multiple possible locations for the HTML file
              const possiblePaths = [
                path.join(process.cwd(), 'src', 'streaming-test.html'),
                path.join(__dirname, '..', 'streaming-test.html'),
                path.join(__dirname, '..', '..', 'src', 'streaming-test.html'),
                path.resolve('src/streaming-test.html'),
              ];
              
              let htmlContent = null;
              let foundPath = null;
              
              for (const htmlPath of possiblePaths) {
                try {
                  if (fs.existsSync(htmlPath)) {
                    htmlContent = fs.readFileSync(htmlPath, 'utf8');
                    foundPath = htmlPath;
                    break;
                  }
                } catch (err) {
                  // Continue to next path
                  continue;
                }
              }
              
              if (!htmlContent) {
                // Debug: show what paths were tried
                return c.text(`Streaming test page not found. Tried paths:\n${possiblePaths.join('\n')}\nCurrent working directory: ${process.cwd()}`, 404);
              }
              
              // Use Hono context methods
              c.header('Content-Type', 'text/html');
              c.header('Cache-Control', 'no-cache');
              return c.body(htmlContent);
            } catch (error) {
              // Return 404 using Hono pattern with debug info
              return c.text(`Error loading streaming test page: ${error instanceof Error ? error.message : String(error)}`, 500);
            }
          };
        },
      }
    ],
  },
});