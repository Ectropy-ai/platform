/**
 * Enhanced MCP Agent Service with Database Integration
 * Provides database-backed agent state management and performance optimization
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { mcpDatabaseManager, type DatabaseConnection, type PoolClient, type RedisClient } from '../../../apps/mcp-server/src/database/connection.js';

// Type definitions for compatibility
interface MCPTool {
  name: string;
  description?: string;
  parameters?: any;
}

interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: any;
}

interface AgentMCPIntegrationService extends EventEmitter {
  registerAgent(config: any): void;
  executeToolForAgent(request: any): Promise<MCPToolResult>;
}

export interface AgentState {
  agentId: string;
  agentType: string;
  status: 'idle' | 'busy' | 'error' | 'maintenance';
  currentTask?: string;
  lastActivity: Date;
  metadata?: Record<string, any>;
}

export interface AgentPerformanceMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  lastOperationTime: Date;
}

export interface CachedResult {
  key: string;
  value: any;
  expiresAt: Date;
  hits: number;
}

/**
 * Database-backed agent service for production MCP operations
 */
export class EnhancedAgentService extends EventEmitter {
  private mcpService?: AgentMCPIntegrationService;
  private databaseConnection?: DatabaseConnection;
  private performanceMetrics: Map<string, AgentPerformanceMetrics> = new Map();
  private cacheKeyPrefix = 'mcp:agent:';
  private agentId: string;

  constructor(
    agentId: string,
    config: any = {},
    mcpService?: AgentMCPIntegrationService
  ) {
    super();
    this.agentId = agentId;
    this.mcpService = mcpService;
    this.initializeDatabase();
    this.initializeMCPIntegration();
  }

  /**
   * Initialize database connection for agent operations
   */
  private async initializeDatabase(): Promise<void> {
    try {
      this.databaseConnection = await mcpDatabaseManager.connect();
      
      // Initialize agent state table if needed
      await this.ensureAgentTables();
      
    } catch (error) {
    }
  }

  /**
   * Ensure required database tables exist
   */
  private async ensureAgentTables(): Promise<void> {
    if (!this.databaseConnection) return;

    await mcpDatabaseManager.transaction(async (client: PoolClient) => {
      // Agent state table
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_states (
          agent_id VARCHAR(255) PRIMARY KEY,
          agent_type VARCHAR(100) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'idle',
          current_task TEXT,
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Agent performance metrics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_performance (
          agent_id VARCHAR(255) PRIMARY KEY,
          total_operations INTEGER DEFAULT 0,
          successful_operations INTEGER DEFAULT 0,
          failed_operations INTEGER DEFAULT 0,
          total_response_time_ms BIGINT DEFAULT 0,
          last_operation_time TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_agent_states_type_status 
        ON agent_states(agent_type, status)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_agent_states_last_activity 
        ON agent_states(last_activity)
      `);
    });
  }

  /**
   * Initialize MCP integration with performance tracking
   */
  private initializeMCPIntegration(): void {
    if (!this.mcpService) return;

    // Register this agent for MCP integration
    this.mcpService.registerAgent({
      agentType: this.getAgentType(),
      enabledServers: ['github', 'nx', 'semantic_search'],
      availableTools: [
        'create_issue',
        'get_project_info',
        'semantic_search',
        'document_analysis',
        'code_analysis'
      ],
      failoverStrategy: 'graceful',
      healthCheckInterval: 60000,
    });

    // Listen for MCP events and track performance
    this.mcpService.on('mcp:event', (event) => {
      this.trackEvent('mcp_event', event);
    });
  }

  /**
   * Get agent type identifier
   */
  getAgentType(): string {
    return 'enhanced-agent';
  }

  /**
   * Update agent state in database
   */
  public async updateAgentState(
    agentId: string,
    status: AgentState['status'],
    currentTask?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.databaseConnection) {
      return;
    }

    try {
      await mcpDatabaseManager.transaction(async (client: PoolClient) => {
        await client.query(`
          INSERT INTO agent_states (agent_id, agent_type, status, current_task, metadata, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (agent_id) 
          DO UPDATE SET 
            status = EXCLUDED.status,
            current_task = EXCLUDED.current_task,
            metadata = EXCLUDED.metadata,
            last_activity = NOW(),
            updated_at = NOW()
        `, [agentId, this.getAgentType(), status, currentTask, JSON.stringify(metadata || {})]);
      });

      this.emit('agent:state_updated', {
        agentId,
        status,
        currentTask,
        metadata,
      });

    } catch (error) {
    }
  }

  /**
   * Get agent state from database
   */
  public async getAgentState(agentId: string): Promise<AgentState | null> {
    if (!this.databaseConnection) {
      return null;
    }

    try {
      return await mcpDatabaseManager.transaction(async (client: PoolClient) => {
        const result = await client.query(`
          SELECT agent_id, agent_type, status, current_task, last_activity, metadata
          FROM agent_states 
          WHERE agent_id = $1
        `, [agentId]);

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          agentId: row.agent_id,
          agentType: row.agent_type,
          status: row.status,
          currentTask: row.current_task,
          lastActivity: row.last_activity,
          metadata: row.metadata,
        };
      });

    } catch (error) {
      return null;
    }
  }

  /**
   * Execute MCP tool with performance tracking and caching
   */
  public async executeToolWithOptimization(
    toolName: string,
    parameters: any,
    options: {
      useCache?: boolean;
      cacheTtl?: number;
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<MCPToolResult> {
    const startTime = Date.now();
    const agentId = this.getAgentType();
    
    // Update agent state to busy
    await this.updateAgentState(agentId, 'busy', `executing:${toolName}`);

    try {
      // Check cache first if enabled
      if (options.useCache) {
        const cacheKey = this.generateCacheKey(toolName, parameters);
        const cachedResult = await this.getCachedResult(cacheKey);
        if (cachedResult) {
          await this.updateAgentState(agentId, 'idle');
          await this.recordPerformanceMetric(agentId, true, Date.now() - startTime);
          return {
            success: true,
            result: cachedResult.value,
            metadata: { cached: true, cacheHits: cachedResult.hits },
          };
        }
      }

      // Execute the tool
      const result = await this.mcpService!.executeToolForAgent({
        agentId,
        toolName,
        serverName: this.determineServerForTool(toolName),
        parameters,
        timeout: options.timeout || 30000,
        retries: options.retries || 2,
      });

      // Cache successful results if enabled
      if (result.success && options.useCache) {
        const cacheKey = this.generateCacheKey(toolName, parameters);
        await this.setCachedResult(cacheKey, result.result, options.cacheTtl || 300);
      }

      // Update state and metrics
      await this.updateAgentState(agentId, 'idle');
      await this.recordPerformanceMetric(agentId, result.success, Date.now() - startTime);

      return result;

    } catch (error) {
      await this.updateAgentState(agentId, 'error', `error:${toolName}`);
      await this.recordPerformanceMetric(agentId, false, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Cache management with Redis
   */
  private async getCachedResult(key: string): Promise<CachedResult | null> {
    if (!this.databaseConnection) return null;

    try {
      return await mcpDatabaseManager.redisOperation(async (client: RedisClient) => {
        return new Promise<CachedResult | null>((resolve, reject) => {
          client.hgetall(this.cacheKeyPrefix + key, (err, result) => {
            if (err) {
              reject(err);
              return;
            }

            if (!result || !result.value) {
              resolve(null);
              return;
            }

            const cached: CachedResult = {
              key,
              value: JSON.parse(result.value),
              expiresAt: new Date(result.expiresAt),
              hits: parseInt(result.hits || '0', 10),
            };

            // Check if expired
            if (cached.expiresAt < new Date()) {
              resolve(null);
              return;
            }

            // Increment hit counter
            client.hincrby(this.cacheKeyPrefix + key, 'hits', 1);
            resolve(cached);
          });
        });
      });
    } catch (error) {
      return null;
    }
  }

  private async setCachedResult(key: string, value: any, ttlSeconds: number): Promise<void> {
    if (!this.databaseConnection) return;

    try {
      await mcpDatabaseManager.redisOperation(async (client: RedisClient) => {
        return new Promise<void>((resolve, reject) => {
          const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
          const cacheData = {
            value: JSON.stringify(value),
            expiresAt: expiresAt.toISOString(),
            hits: '0',
          };

          client.hmset(this.cacheKeyPrefix + key, cacheData, (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Set TTL
            client.expire(this.cacheKeyPrefix + key, ttlSeconds, (expireErr) => {
              if (expireErr) {
              }
              resolve();
            });
          });
        });
      });
    } catch (error) {
    }
  }

  /**
   * Record performance metrics
   */
  private async recordPerformanceMetric(
    agentId: string,
    success: boolean,
    responseTimeMs: number
  ): Promise<void> {
    if (!this.databaseConnection) {
      // Store in memory as fallback
      const current = this.performanceMetrics.get(agentId) || {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageResponseTime: 0,
        lastOperationTime: new Date(),
      };

      current.totalOperations++;
      if (success) {
        current.successfulOperations++;
      } else {
        current.failedOperations++;
      }
      
      current.averageResponseTime = 
        (current.averageResponseTime * (current.totalOperations - 1) + responseTimeMs) / 
        current.totalOperations;
      current.lastOperationTime = new Date();

      this.performanceMetrics.set(agentId, current);
      return;
    }

    try {
      await mcpDatabaseManager.transaction(async (client: PoolClient) => {
        await client.query(`
          INSERT INTO agent_performance (
            agent_id, total_operations, successful_operations, failed_operations,
            total_response_time_ms, last_operation_time, updated_at
          )
          VALUES ($1, 1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (agent_id)
          DO UPDATE SET
            total_operations = agent_performance.total_operations + 1,
            successful_operations = agent_performance.successful_operations + $2,
            failed_operations = agent_performance.failed_operations + $3,
            total_response_time_ms = agent_performance.total_response_time_ms + $4,
            last_operation_time = NOW(),
            updated_at = NOW()
        `, [agentId, success ? 1 : 0, success ? 0 : 1, responseTimeMs]);
      });
    } catch (error) {
    }
  }

  /**
   * Get agent performance metrics
   */
  public async getPerformanceMetrics(agentId: string): Promise<AgentPerformanceMetrics | null> {
    if (!this.databaseConnection) {
      return this.performanceMetrics.get(agentId) || null;
    }

    try {
      return await mcpDatabaseManager.transaction(async (client: PoolClient) => {
        const result = await client.query(`
          SELECT 
            total_operations,
            successful_operations,
            failed_operations,
            CASE 
              WHEN total_operations > 0 
              THEN total_response_time_ms::float / total_operations 
              ELSE 0 
            END as average_response_time,
            last_operation_time
          FROM agent_performance 
          WHERE agent_id = $1
        `, [agentId]);

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          totalOperations: row.total_operations,
          successfulOperations: row.successful_operations,
          failedOperations: row.failed_operations,
          averageResponseTime: row.average_response_time,
          lastOperationTime: row.last_operation_time,
        };
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Utility methods
   */
  private generateCacheKey(toolName: string, parameters: any): string {
    const paramHash = createHash('md5')
      .update(JSON.stringify(parameters))
      .digest('hex');
    return `${toolName}:${paramHash}`;
  }

  private determineServerForTool(toolName: string): string {
    const toolServerMap: Record<string, string> = {
      'create_issue': 'github',
      'get_project_info': 'nx',
      'semantic_search': 'semantic_search',
      'document_analysis': 'semantic_search',
      'code_analysis': 'semantic_search',
    };
    return toolServerMap[toolName] || 'github';
  }

  private trackEvent(eventType: string, data: any): void {
    this.emit('agent:performance_event', {
      eventType,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    if (this.databaseConnection) {
      await this.databaseConnection.close();
    }
  }
}