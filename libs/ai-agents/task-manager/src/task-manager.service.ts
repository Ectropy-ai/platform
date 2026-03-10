import { BaseAgent } from '../../shared/base-agent.js';
import {
  AgentMCPIntegrationService,
  MCPTool,
  MCPToolResult,
} from '../../shared/mcp-management/src/index.js';

interface AgentTask {
  id: string;
  agentType: 'compliance' | 'performance' | 'procurement';
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  inputData: any;
  createdAt: Date;
}

interface AgentMap {
  compliance: any;
  performance: any;
  procurement: any;
}

/**
 * AgentTaskManager
 * Manages the lifecycle and event routing for agent tasks.
 * Enterprise-compliant, event-driven, and fully type-safe.
 * Enhanced with MCP integration for GitHub and Nx workspace operations.
 */
export class AgentTaskManager extends BaseAgent {
  private mcpService?: AgentMCPIntegrationService;
  private agents?: AgentMap;

  constructor(
    db: any,
    templateService: any,
    config: any = {},
    mcpService?: AgentMCPIntegrationService,
    agents?: AgentMap
  ) {
    super(db, templateService, config);
    this.mcpService = mcpService;
    this.agents = agents;

    if (this.mcpService) {
      this.initializeMCPIntegration();
    }
  }

  /**
   * Returns the agent type identifier
   */
  getAgentType(): string {
    return 'task-manager';
  }

  /**
   * Initialize MCP integration for this agent
   */
  private initializeMCPIntegration(): void {
    if (!this.mcpService) return;

    // Register this agent for MCP integration
    this.mcpService.registerAgent({
      agentType: 'task-manager',
      enabledServers: ['github', 'nx'],
      availableTools: [],
      failoverStrategy: 'graceful',
      healthCheckInterval: 60000,
    });

    // Listen for MCP events
    this.mcpService.on('mcp:event', (event) => {
      this.emitEvent('mcp:event', {
        projectId: '',
        operation: 'mcp_event',
        metadata: event,
      });
    });
  }

  /**
   * Create a GitHub issue using MCP integration
   */
  public async createGitHubIssue(
    projectId: string,
    title: string,
    body: string,
    labels?: string[]
  ): Promise<any> {
    await this.validateProject(projectId);

    if (!this.mcpService) {
      throw this.createError(
        'createGitHubIssue',
        'MCP service not available',
        'MCP_NOT_AVAILABLE'
      );
    }

    try {
      const result = await this.mcpService.executeToolForAgent({
        agentId: 'task-manager',
        toolName: 'create_issue',
        serverName: 'github',
        parameters: {
          title,
          body,
          labels: labels || [],
        },
        timeout: 30000,
        retries: 2,
      });

      if (!result.success) {
        throw this.createError(
          'createGitHubIssue',
          `Failed to create GitHub issue: ${result.error}`,
          'GITHUB_API_ERROR'
        );
      }

      this.emitEvent('task:github_issue_created', {
        projectId,
        operation: 'createGitHubIssue',
        result: result.result,
        metadata: result.metadata,
      });

      return result.result;
    } catch (error) {
      throw this.handleError('createGitHubIssue', error);
    }
  }

  /**
   * Get Nx workspace project information using MCP
   */
  public async getNxProjectInfo(projectName: string): Promise<any> {
    if (!this.mcpService) {
      throw this.createError(
        'getNxProjectInfo',
        'MCP service not available',
        'MCP_NOT_AVAILABLE'
      );
    }

    try {
      const result = await this.mcpService.executeToolForAgent({
        agentId: 'task-manager',
        toolName: 'get_project_info',
        serverName: 'nx',
        parameters: {
          projectName,
        },
        timeout: 15000,
        retries: 1,
      });

      if (!result.success) {
        throw this.createError(
          'getNxProjectInfo',
          `Failed to get Nx project info: ${result.error}`,
          'NX_PROJECT_ERROR'
        );
      }

      return result.result;
    } catch (error) {
      throw this.handleError('getNxProjectInfo', error);
    }
  }

  /**
   * List available MCP tools for this agent
   */
  public getAvailableMCPTools(): MCPTool[] {
    if (!this.mcpService) {
      return [];
    }

    return this.mcpService.getAvailableToolsForAgent('task-manager');
  }

  /**
   * Check if MCP integration is available
   */
  public isMCPAvailable(): boolean {
    return this.mcpService?.isAvailableForAgent('task-manager') || false;
  }

  /**
   * Get MCP health status for this agent
   */
  public getMCPHealthStatus(): any {
    if (!this.mcpService) {
      return {
        available: false,
        reason: 'MCP service not initialized',
      };
    }

    return this.mcpService.getHealthSummaryForAgent('task-manager');
  }

  /**
   * Execute a custom MCP tool
   */
  public async executeMCPTool(
    serverName: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<MCPToolResult> {
    if (!this.mcpService) {
      return {
        success: false,
        error: 'MCP service not available',
      };
    }

    try {
      return await this.mcpService.executeToolForAgent({
        agentId: 'task-manager',
        toolName,
        serverName,
        parameters,
        timeout: 30000,
        retries: 2,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check for pending tasks and process them
   */
  public async checkTasks(): Promise<void> {
    try {
      const result = await this.db.query(
        'SELECT * FROM ai_agent_tasks WHERE status = $1 ORDER BY priority DESC, created_at ASC',
        ['pending']
      );

      for (const task of result.rows) {
        await this.runTask(task);
      }
    } catch (error) {
      this.emitEvent('agent:error', {
        projectId: '',
        operation: 'checkTasks',
        error: this.handleError('checkTasks', error),
      });
    }
  }

  /**
   * Run a specific task
   */
  public async runTask(task: AgentTask): Promise<void> {
    this.emitEvent('task:started', {
      projectId: task.projectId,
      operation: 'runTask',
      taskId: task.id,
    });

    try {
      const result = await this.getAgentExecution(task);

      // Update task status in database
      await this.db.query(
        'UPDATE ai_agent_tasks SET status = $1, completed_at = $2, result = $3 WHERE id = $4',
        ['completed', new Date(), JSON.stringify(result), task.id]
      );

      this.emitEvent('task:completed', {
        projectId: task.projectId,
        operation: 'runTask',
        taskId: task.id,
        result,
      });
    } catch (error) {
      // Update task status to failed
      await this.db.query(
        'UPDATE ai_agent_tasks SET status = $1, error = $2 WHERE id = $3',
        [
          'failed',
          error instanceof Error ? error.message : String(error),
          task.id,
        ]
      );

      const agentError = this.handleError('runTask', error);
      this.emitEvent('task:failed', {
        projectId: task.projectId,
        operation: 'runTask',
        taskId: task.id,
        error: agentError,
      });

      throw error;
    }
  }

  /**
   * Get agent execution based on task type
   */
  public async getAgentExecution(task: AgentTask): Promise<any> {
    if (!this.agents) {
      throw this.createError(
        'getAgentExecution',
        'No agents configured',
        'AGENTS_NOT_CONFIGURED'
      );
    }

    const agent = this.agents[task.agentType];
    if (!agent) {
      throw this.createError(
        'getAgentExecution',
        `Unknown agent type: ${task.agentType}`,
        'UNKNOWN_AGENT_TYPE'
      );
    }

    // Route to appropriate agent method based on task data
    if (task.inputData?.ifcPath) {
      return await agent.validateIfcModel(
        task.projectId,
        task.inputData.ifcPath
      );
    } else {
      return await agent.analyzeProject(task.projectId, task.inputData || {});
    }
  }

  // TODO: Implement additional task management functionality
  // Methods for task scheduling, execution, monitoring, etc.
}
