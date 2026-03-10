import { EventEmitter } from 'events';
import {
  MCPAgentIntegration,
  MCPTool,
  MCPToolResult,
  AgentMCPRequest,
} from './types.js';
import MCPServerRegistryImpl from './server-registry.js';

/**
 * AgentMCPIntegrationService
 * Provides a clean interface between AI agents and MCP servers
 * Handles failover, retries, and graceful degradation when MCP servers are unavailable
 */
export class AgentMCPIntegrationService extends EventEmitter {
  private registry: MCPServerRegistryImpl;
  private integrations: Map<string, MCPAgentIntegration> = new Map();

  constructor(registry?: MCPServerRegistryImpl) {
    super();
    this.registry = registry || new MCPServerRegistryImpl();
    
    // Listen to registry events
    this.registry.on('mcp:event', (event) => {
      this.emit('mcp:event', event);
    });
  }

  /**
   * Register an agent for MCP integration
   */
  public registerAgent(integration: MCPAgentIntegration): void {
    this.integrations.set(integration.agentType, integration);
    this.emit('agent:registered', integration);
  }

  /**
   * Execute an MCP tool with agent context
   * Provides failover and retry logic
   */
  public async executeToolForAgent(request: AgentMCPRequest): Promise<MCPToolResult> {
    const integration = this.integrations.get(request.agentId);
    if (!integration) {
      return {
        success: false,
        error: `Agent ${request.agentId} not registered for MCP integration`,
      };
    }

    // Check if the requested server is enabled for this agent
    if (!integration.enabledServers.includes(request.serverName)) {
      return {
        success: false,
        error: `Server ${request.serverName} not enabled for agent ${request.agentId}`,
      };
    }

    const maxRetries = request.retries || 2;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.registry.executeTool(
          request.serverName,
          request.toolName,
          request.parameters
        );

        return {
          success: true,
          result,
          metadata: {
            serverName: request.serverName,
            toolName: request.toolName,
            attempt,
            timestamp: new Date(),
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        
        // Try failover strategy if not the last attempt
        if (attempt < maxRetries) {
          const fallbackResult = await this.tryFailover(request, integration, attempt);
          if (fallbackResult) {
            return fallbackResult;
          }
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this.delay(delayMs);
        }
      }
    }

    // Handle failure based on failover strategy
    return this.handleFailure(request, integration, lastError);
  }

  /**
   * Get available tools for a specific agent
   */
  public getAvailableToolsForAgent(agentType: string): MCPTool[] {
    const integration = this.integrations.get(agentType);
    if (!integration) {
      return [];
    }

    // Return only tools from enabled servers that are currently healthy
    const availableTools: MCPTool[] = [];
    
    for (const serverName of integration.enabledServers) {
      const status = this.registry.getServerStatus(serverName);
      if (status?.running && status.healthy) {
        const serverTools = this.registry.getAvailableTools()
          .filter(tool => tool.server === serverName);
        availableTools.push(...serverTools);
      }
    }

    return availableTools;
  }

  /**
   * Check if MCP integration is available for an agent
   */
  public isAvailableForAgent(agentType: string): boolean {
    const integration = this.integrations.get(agentType);
    if (!integration) {
      return false;
    }

    // Check if at least one enabled server is healthy
    return integration.enabledServers.some(serverName => {
      const status = this.registry.getServerStatus(serverName);
      return status?.running && status.healthy;
    });
  }

  /**
   * Get MCP health summary for an agent
   */
  public getHealthSummaryForAgent(agentType: string): {
    available: boolean;
    healthyServers: string[];
    unhealthyServers: string[];
    disabledServers: string[];
  } {
    const integration = this.integrations.get(agentType);
    if (!integration) {
      return {
        available: false,
        healthyServers: [],
        unhealthyServers: [],
        disabledServers: [],
      };
    }

    const healthyServers: string[] = [];
    const unhealthyServers: string[] = [];
    const disabledServers: string[] = [];

    for (const serverName of integration.enabledServers) {
      const status = this.registry.getServerStatus(serverName);
      if (!status) {
        disabledServers.push(serverName);
      } else if (status.running && status.healthy) {
        healthyServers.push(serverName);
      } else {
        unhealthyServers.push(serverName);
      }
    }

    return {
      available: healthyServers.length > 0,
      healthyServers,
      unhealthyServers,
      disabledServers,
    };
  }

  /**
   * Start health monitoring for agent integrations
   */
  public startHealthMonitoring(): void {
    // Check each integration's health periodically
    setInterval(() => {
      for (const [agentType, _integration] of this.integrations) {
        const healthSummary = this.getHealthSummaryForAgent(agentType);
        
        this.emit('agent:health_check', {
          agentType,
          ...healthSummary,
          timestamp: new Date(),
        });

        // Emit warning if no healthy servers
        if (!healthSummary.available) {
          this.emit('agent:mcp_unavailable', {
            agentType,
            reason: 'No healthy MCP servers available',
            timestamp: new Date(),
          });
        }
      }
    }, 60000); // Default 1 minute health check interval
  }

  /**
   * Get the underlying registry for advanced operations
   */
  public getRegistry(): MCPServerRegistryImpl {
    return this.registry;
  }

  /**
   * Destroy the service and clean up resources
   */
  public async destroy(): Promise<void> {
    await this.registry.destroy();
    // Cleanup is handled by garbage collection
  }

  private async tryFailover(
    request: AgentMCPRequest,
    integration: MCPAgentIntegration,
    attempt: number
  ): Promise<MCPToolResult | null> {
    if (integration.failoverStrategy === 'disabled') {
      return null;
    }

    // Find alternative servers that have the same tool
    const alternativeServers = integration.enabledServers.filter(serverName => {
      if (serverName === request.serverName) return false;
      
      const status = this.registry.getServerStatus(serverName);
      if (!status?.running || !status.healthy) return false;
      
      // Check if server has the requested tool
      const serverTools = this.registry.getAvailableTools()
        .filter(tool => tool.server === serverName);
      return serverTools.some(tool => tool.name === request.toolName);
    });

    if (alternativeServers.length === 0) {
      return null;
    }

    // Try the first alternative server
    const fallbackServer = alternativeServers[0];
    
    try {
      const result = await this.registry.executeTool(
        fallbackServer,
        request.toolName,
        request.parameters
      );

      return {
        success: true,
        result,
        metadata: {
          serverName: fallbackServer,
          toolName: request.toolName,
          attempt,
          fallback: true,
          originalServer: request.serverName,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      // alternative failed, return null to continue with original retry logic
      return null;
    }
  }

  private handleFailure(
    request: AgentMCPRequest,
    integration: MCPAgentIntegration,
    error?: string
  ): MCPToolResult {
    if (integration.failoverStrategy === 'graceful') {
      // Return a graceful failure that won't break the agent
      return {
        success: false,
        error: `MCP tool execution failed: ${error || 'Unknown error'}`,
        metadata: {
          gracefulFailure: true,
          serverName: request.serverName,
          toolName: request.toolName,
          timestamp: new Date(),
        },
      };
    }

    // Strict failure - throw the error
    return {
      success: false,
      error: `MCP tool execution failed: ${error || 'Unknown error'}`,
      metadata: {
        strictFailure: true,
        serverName: request.serverName,
        toolName: request.toolName,
        timestamp: new Date(),
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      if (process.env.NODE_ENV === 'test') {
        resolve();
      } else {
        setTimeout(resolve, ms);
      }
    });
  }
}

export default AgentMCPIntegrationService;