#!/usr/bin/env node

/**
 * Production entry point for Accelos AI Agent
 * This file is used for building standalone bundles and binaries
 */

import { AccelosAgent } from './agent.js';
import { AccelosConfig } from './config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main production function
 */
async function main() {
  try {
    // Default production configuration
    const config: AccelosConfig = {
      llmProvider: (process.env.LLM_PROVIDER as any) || 'anthropic',
      model: process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || '',
      systemPrompt: process.env.SYSTEM_PROMPT || `You are Accelos, an AI agent specialized in code review, analysis, and software engineering tasks. 
You have access to advanced tools including Claude Code integration, web search, file analysis, and code quality assessment.
Always provide detailed, actionable feedback and suggestions.`,
      maxTokens: parseInt(process.env.MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.1'),
      dataDirectory: process.env.DATA_DIRECTORY || './data',
    };

    // Validate configuration
    if (!config.apiKey) {
      console.error('❌ Error: No API key found. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY');
      process.exit(1);
    }

    // Initialize the Accelos agent
    console.log('🚀 Starting Accelos AI Agent...');
    const agent = new AccelosAgent(config);
    
    // Display configuration info
    console.log(`✅ Accelos initialized with ${config.llmProvider} (${config.model})`);
    console.log(`📁 Data directory: ${config.dataDirectory}`);
    
    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('Usage: accelos-server <command> [options]');
      console.log('Commands:');
      console.log('  chat <message>     - Chat with Accelos');
      console.log('  analyze <filepath> - Analyze a file');
      console.log('  search <query>     - Search the web');
      console.log('  config             - Show current configuration');
      process.exit(0);
    }

    const command = args[0];
    
    switch (command) {
      case 'chat':
        if (args.length < 2) {
          console.error('❌ Error: Please provide a message for chat');
          process.exit(1);
        }
        const message = args.slice(1).join(' ');
        console.log('💬 Processing your request...');
        const response = await agent.chat(message);
        console.log('\n🤖 Accelos:', response);
        break;
        
      case 'analyze':
        if (args.length < 2) {
          console.error('❌ Error: Please provide a file path to analyze');
          process.exit(1);
        }
        const filePath = args[1];
        const analysisType = (args[2] as 'content' | 'structure' | 'security' | 'all') || 'all';
        console.log(`🔍 Analyzing file: ${filePath}...`);
        const analysis = await agent.analyzeFile(filePath, analysisType);
        console.log('\n📊 Analysis Result:', analysis);
        break;
        
      case 'search':
        if (args.length < 2) {
          console.error('❌ Error: Please provide a search query');
          process.exit(1);
        }
        const query = args.slice(1).join(' ');
        const maxResults = args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1]) : 5;
        console.log(`🔎 Searching for: ${query}...`);
        const searchResults = await agent.searchWeb(query, maxResults);
        console.log('\n🌐 Search Results:', searchResults);
        break;
        
      case 'config':
        console.log('\n⚙️  Current Configuration:');
        const currentConfig = agent.getConfig();
        console.log(`   LLM Provider: ${currentConfig.llmProvider}`);
        console.log(`   Model: ${currentConfig.model}`);
        console.log(`   Max Tokens: ${currentConfig.maxTokens}`);
        console.log(`   Temperature: ${currentConfig.temperature}`);
        console.log(`   Data Directory: ${currentConfig.dataDirectory}`);
        
        const stats = agent.getGuardrailStats();
        console.log(`   Guardrails: ${stats.count} loaded`);
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Available commands: chat, analyze, search, config');
        process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Accelos...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Accelos...');
  process.exit(0);
});

// Start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Failed to start Accelos:', error);
    process.exit(1);
  });
}

export { main };