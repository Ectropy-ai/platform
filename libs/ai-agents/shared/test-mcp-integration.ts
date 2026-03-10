import {
  MCPServerRegistry,
  AgentMCPIntegrationService,
  getDefaultMCPConfigs,
} from '../shared/mcp-management/src';

/**
 * Basic test for MCP functionality
 * This validates that our MCP integration works correctly
 */
async function testMCPIntegration() {

  try {
    // Test 1: Create registry and load configurations
    const registry = new MCPServerRegistry();
    const configs = getDefaultMCPConfigs();


    // Register all configurations
    for (const config of configs) {
      registry.registerServer(config);
    }

    // Test 2: Create agent integration service
    const agentService = new AgentMCPIntegrationService(registry);

    // Register a test agent
    agentService.registerAgent({
      agentType: 'test-agent',
      enabledServers: ['nx'],
      availableTools: [],
      failoverStrategy: 'graceful',
      healthCheckInterval: 60000,
    });


    // Test 3: Check server statuses
    const statuses = registry.getAllServerStatuses();
    for (const status of statuses) {
      console.log(
        `📋 ${status.name}: running=${status.running}, healthy=${status.healthy}`
      );
    }

    // Test 4: Check agent health
    const healthSummary = agentService.getHealthSummaryForAgent('test-agent');
    console.log(
      `✅ Healthy servers: ${healthSummary.healthyServers.join(', ') || 'none'}`
    );
    console.log(
      `⚠️  Unhealthy servers: ${healthSummary.unhealthyServers.join(', ') || 'none'}`
    );

    // Cleanup
    await agentService.destroy();

    return true;
  } catch (error) {
    return false;
  }
}

// Run the test if this file is executed directly
// TODO: Fix import.meta usage for CommonJS - temporarily disabled
// if (import.meta.url === `file://${process.argv[1]}`) {
testMCPIntegration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    process.exit(1);
  });
// }

export { testMCPIntegration };
