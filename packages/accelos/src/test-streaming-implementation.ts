/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test script to verify streaming implementation between Production Readiness Agent and PR Creation Workflow
 */

import { mastra } from './mastra/index.js';

async function testStreamingImplementation() {
  console.log('🧪 Testing streaming implementation for Production Readiness Agent');
  
  try {
    // Get the production readiness agent
    const productionReadinessAgent = mastra.getAgent('production-readiness-agent');
    
    if (!productionReadinessAgent) {
      throw new Error('Production readiness agent not found');
    }
    
    // Test streaming with a mock review ID
    console.log('🚀 Starting streaming test with mock review ID...');
    
    const testQuery = 'Please use the prCreation tool to create a PR from review ID "sse-streaming-test-demo" with dryRun=true and autoCommit=false.';
    
    // Use the agent's streamVNext method to get real-time streaming
    const stream = await productionReadinessAgent.streamVNext(testQuery);
    
    console.log('📡 Agent stream started, monitoring for events...');
    
    // Track streaming events
    let eventCount = 0;
    const receivedEvents: any[] = [];
    
    // Consume the stream and track events
    for await (const chunk of stream) {
      eventCount++;
      receivedEvents.push(chunk);
      
      console.log(`🔄 Event ${eventCount}: ${chunk.type || 'unknown'} from ${chunk.from || 'agent'}`);
      
      // Log payload details if available
      if (chunk.payload) {
        const payloadSummary = typeof chunk.payload === 'string' ? chunk.payload.substring(0, 100) : JSON.stringify(chunk.payload, null, 2).substring(0, 200);
        console.log(`   📊 Payload: ${payloadSummary}${payloadSummary.length >= 100 ? '...' : ''}`);
      }
      
      // Limit logging for demo purposes
      if (eventCount > 50) {
        console.log('🛑 Stopping at 50 events for demo purposes...');
        break;
      }
    }
    
    // Get final results
    const finalStatus = await stream.status;
    const finalResult = await stream.result;
    const totalUsage = await stream.usage;
    
    console.log('\n📈 Streaming Test Results:');
    console.log(`   Status: ${finalStatus}`);
    console.log(`   Events received: ${eventCount}`);
    console.log(`   Total token usage:`, totalUsage);
    console.log(`   Final result available: ${finalResult ? 'Yes' : 'No'}`);
    
    // Analyze received events
    const workflowEvents = receivedEvents.filter(e => e.from && (e.from.includes('workflow') || e.from.includes('step')));
    console.log(`   Workflow-related events: ${workflowEvents.length}`);
    
    if (workflowEvents.length > 0) {
      console.log('   Event sources:');
      const eventSources = [...new Set(workflowEvents.map(e => e.from))];
      eventSources.forEach(source => {
        const count = workflowEvents.filter(e => e.from === source).length;
        console.log(`     - ${source}: ${count} events`);
      });
    }
    
    // Look for tool calls
    const toolEvents = receivedEvents.filter(e => e.type && e.type.includes('tool'));
    if (toolEvents.length > 0) {
      console.log(`   Tool execution events: ${toolEvents.length}`);
    }
    
    return {
      success: finalStatus === 'success',
      eventCount,
      workflowEvents: workflowEvents.length,
      toolEvents: toolEvents.length,
      eventSources: workflowEvents.map(e => e.from)
    };
    
  } catch (error) {
    console.error('❌ Streaming test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run the test if this file is executed directly
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  testStreamingImplementation()
    .then(result => {
      console.log('\n🏁 Test completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}

export { testStreamingImplementation };