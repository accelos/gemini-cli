#!/usr/bin/env node

/**
 * Simple JavaScript test to verify @anthropic-ai/claude-code bundling
 * This avoids TypeScript compilation issues
 */

import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenv.config();

async function testClaudeCodeIntegration() {
  try {
    console.log('🧪 Testing @anthropic-ai/claude-code integration...');
    
    // Try to import Claude Code
    const claudeCodeModule = await import('@anthropic-ai/claude-code');
    
    console.log('✅ Successfully imported @anthropic-ai/claude-code');
    console.log('📦 Module keys:', Object.keys(claudeCodeModule));
    console.log('📦 Module type:', typeof claudeCodeModule);
    
    // Check if default export exists
    if (claudeCodeModule.default) {
      console.log('✅ Default export available:', typeof claudeCodeModule.default);
    }
    
    // List all exports
    for (const [key, value] of Object.entries(claudeCodeModule)) {
      console.log(`   ${key}: ${typeof value}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to import @anthropic-ai/claude-code:', error.message);
    
    // Check package existence
    try {
      const nodeModulesPath = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code');
      
      if (existsSync(nodeModulesPath)) {
        console.log('📁 Claude Code package found in node_modules');
        const packageJsonPath = join(nodeModulesPath, 'package.json');
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
          console.log('📋 Package version:', packageJson.version);
          console.log('📋 Main entry:', packageJson.main);
          console.log('📋 Exports:', packageJson.exports);
          console.log('📋 Type:', packageJson.type);
        }
      } else {
        console.log('❌ Claude Code package not found in node_modules');
      }
    } catch (fsError) {
      console.log('🔍 Could not check filesystem:', fsError.message);
    }
  }
}

async function main() {
  console.log('🚀 Starting Claude Code Bundle Test...');
  console.log('📍 Node.js version:', process.version);
  console.log('📍 Working directory:', process.cwd());
  console.log('📍 Environment: bundled =', typeof __webpack_require__ !== 'undefined' || typeof require !== 'undefined' && require.main !== module);
  
  await testClaudeCodeIntegration();
  
  console.log('✅ Bundle test completed');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

main().catch((error) => {
  console.error('❌ Bundle test failed:', error);
  process.exit(1);
});