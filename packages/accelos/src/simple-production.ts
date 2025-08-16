#!/usr/bin/env node

/**
 * Simple production entry point to test @anthropic-ai/claude-code bundling
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import and test Claude Code functionality
async function testClaudeCodeIntegration() {
  try {
    console.log('🧪 Testing @anthropic-ai/claude-code integration...');
    
    // Dynamic import to handle potential issues
    const { claudeCode } = await import('@anthropic-ai/claude-code');
    
    console.log('✅ Successfully imported @anthropic-ai/claude-code');
    console.log('📦 Claude Code available:', typeof claudeCode);
    
    // Test basic functionality if possible
    if (typeof claudeCode === 'function') {
      console.log('🔧 Claude Code is callable');
    } else if (typeof claudeCode === 'object') {
      console.log('🔧 Claude Code object keys:', Object.keys(claudeCode));
    }
    
  } catch (error) {
    console.error('❌ Failed to import @anthropic-ai/claude-code:', error instanceof Error ? error.message : 'Unknown error');
    
    // Try to detect if it's a bundling issue
    try {
      const fs = await import('fs');
      const path = await import('path');
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code');
      
      if (fs.existsSync(nodeModulesPath)) {
        console.log('📁 Claude Code package found in node_modules');
        const packageJsonPath = path.join(nodeModulesPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          console.log('📋 Package version:', packageJson.version);
          console.log('📋 Main entry:', packageJson.main || packageJson.exports);
        }
      } else {
        console.log('❌ Claude Code package not found in node_modules');
      }
    } catch (fsError) {
      console.log('🔍 Could not check filesystem for debugging');
    }
  }
}

async function main() {
  console.log('🚀 Starting Simple Production Test...');
  console.log('📍 Node.js version:', process.version);
  console.log('📍 Working directory:', process.cwd());
  
  await testClaudeCodeIntegration();
  
  console.log('✅ Production test completed');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Production test failed:', error);
    process.exit(1);
  });
}

export { main };