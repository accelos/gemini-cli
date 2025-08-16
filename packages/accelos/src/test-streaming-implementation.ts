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
    
    const testQuery = 'Create a PR for review sse-streaming-test-demo with dry run enabled';
    
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
      
      // Log specific workflow events
      if (chunk.payload && chunk.payload.type) {
        console.log(`   📊 Workflow event: ${chunk.payload.type} - ${chunk.payload.status || 'no status'}`);
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
    const workflowEvents = receivedEvents.filter(e => e.payload && e.payload.type);
    console.log(`   Workflow streaming events: ${workflowEvents.length}`);
    
    if (workflowEvents.length > 0) {
      console.log('   Event types received:');
      const eventTypes = [...new Set(workflowEvents.map(e => e.payload.type))];
      eventTypes.forEach(type => {
        const count = workflowEvents.filter(e => e.payload.type === type).length;
        console.log(`     - ${type}: ${count} events`);
      });
    }
    
    return {
      success: finalStatus === 'success',
      eventCount,
      workflowEvents: workflowEvents.length,
      eventTypes: workflowEvents.map(e => e.payload.type)
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