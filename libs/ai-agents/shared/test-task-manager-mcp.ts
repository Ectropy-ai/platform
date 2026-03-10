/// <reference types="node" />

import { AgentTaskManager } from '../task-manager/src/task-manager.service';
import {
  MCPServerRegistry,
  AgentMCPIntegrationService,
  getDefaultMCPConfigs,
} from '../shared/mcp-management/src';
import { cwd } from 'process';

/**
 * Test Task Manager Agent with MCP Integration
 * Demonstrates how agents use MCP servers for enhanced functionality
 */
async function testTaskManagerWithMCP() {

  try {
    // Create mock database and template service
    const mockDb = {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      }),
      end: async () => {},
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };

    const mockTemplateService = {
      getActiveTemplate: async () => null,
      validateProjectAccess: async () => true,
    };

    // Set up MCP infrastructure
    const registry = new MCPServerRegistry();
    const agentService = new AgentMCPIntegrationService(registry);

    // Register only the Nx server config (since it's running)
    const nxConfig = {
      name: 'nx',
      type: 'nx' as const,
      enabled: true,
      command: 'node',
      args: ['/tmp/nx-mcp-placeholder.js'],
      port: 3847,
      workspaceRoot: cwd(),
      enableProjectDetails: true,
      enableTaskExecution: false,
      healthCheckPath: '/health',
      timeout: 30000,
      retries: 3,
    };

    registry.registerServer(nxConfig);

    // Create Task Manager agent with MCP support
    const taskManager = new AgentTaskManager(
      mockDb,
      mockTemplateService,
      {},
      agentService
    );

    // Test 1: Check MCP availability
    const isAvailable = taskManager.isMCPAvailable();

    // Test 2: Get MCP health status
    const healthStatus = taskManager.getMCPHealthStatus();
    console.log(
      `✅ Healthy servers: ${healthStatus.healthyServers?.join(', ') || 'none'}`
    );
    console.log(
      `⚠️  Unhealthy servers: ${healthStatus.unhealthyServers?.join(', ') || 'none'}`
    );

    // Test 3: List available MCP tools
    const tools = taskManager.getAvailableMCPTools();

    // Test 4: Try to get Nx project info (this will fail gracefully since our placeholder doesn't implement the exact tool)
    try {
      const projectInfo = await taskManager.getNxProjectInfo('api-gateway');
    } catch (error) {
      console.log(
        "⚠️  Expected failure - placeholder server doesn't implement exact MCP protocol"
      );
    }

    // Test 5: Test custom MCP tool execution
    const customResult = await taskManager.executeMCPTool(
      'nx',
      'health_check',
      {}
    );
    console.log(
      `✅ Custom tool result: ${customResult.success ? 'success' : 'failed'}`
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
testTaskManagerWithMCP()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    process.exit(1);
  });
// }

export { testTaskManagerWithMCP };
