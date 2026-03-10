/// <reference types="node" />

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import {
  MCPServerConfig,
  MCPServerStatus,
  MCPTool,
  MCPHealthCheckResult,
  MCPEvent,
  MCPEventType,
} from './types.js';

/**
 * MCPServerRegistry
 * Manages lifecycle of MCP servers for the Ectropy platform
 * Provides enterprise-grade server management with health monitoring
 */
export class MCPServerRegistry extends EventEmitter {
  private servers: Map<string, MCPServerConfig> = new Map();
  private status: Map<string, MCPServerStatus> = new Map();
  private processes: Map<string, any> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private config: { healthCheckIntervalMs?: number } = {}) {
    super();
    this.startHealthChecking();
  }

  /**
   * Register an MCP server configuration
   */
  public registerServer(config: MCPServerConfig): void {
    this.servers.set(config.name, config);
    this.status.set(config.name, {
      name: config.name,
      running: false,
      healthy: false,
      errorCount: 0,
    });

    this.emitEvent('server:registered', config.name, {
      config: config,
    });
  }

  /**
   * Start a specific MCP server
   */
  public async startServer(serverName: string): Promise<boolean> {
    const config = this.servers.get(serverName);
    if (!config) {
      throw new Error(`Server ${serverName} not found in registry`);
    }

    if (!config.enabled) {
      return false;
    }

    const status = this.status.get(serverName)!;
    if (status.running) {
      return true;
    }

    try {
      return await this.executeServerStart(config);
    } catch (error) {
      this.handleServerError(serverName, error);
      return false;
    }
  }

  /**
   * Stop a specific MCP server
   */
  public async stopServer(serverName: string): Promise<boolean> {
    const process = this.processes.get(serverName);
    const status = this.status.get(serverName);

    if (!process || !status?.running) {
      return true;
    }

    try {
      // Graceful shutdown
      process.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);

      await this.waitForProcessExit(process);
      
      this.processes.delete(serverName);
      this.updateServerStatus(serverName, {
        running: false,
        healthy: false,
        pid: undefined,
      });

      this.emitEvent('server:stopped', serverName);
      return true;
    } catch (error) {
      this.handleServerError(serverName, error);
      return false;
    }
  }

  /**
   * Get server status
   */
  public getServerStatus(serverName: string): MCPServerStatus | undefined {
    return this.status.get(serverName);
  }

  /**
   * Get all server statuses
   */
  public getAllServerStatuses(): MCPServerStatus[] {
    return Array.from(this.status.values());
  }

  /**
   * Get available tools from all running servers
   */
  public getAvailableTools(): MCPTool[] {
    const allTools: MCPTool[] = [];
    for (const toolList of this.tools.values()) {
      allTools.push(...toolList);
    }
    return allTools;
  }

  /**
   * Execute a tool on a specific server
   */
  public async executeTool(
    serverName: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    const status = this.status.get(serverName);
    if (!status?.running || !status.healthy) {
      throw new Error(`Server ${serverName} is not available`);
    }

    const config = this.servers.get(serverName);
    if (!config) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      // For now, we'll implement a basic HTTP call
      // In a full implementation, this would use the MCP protocol
      const endpoint = config.endpoint || `http://localhost:${config.port}`;
      
      // Create an AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);
      
      const response = await fetch(`${endpoint}/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        },
        body: JSON.stringify(parameters),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Tool execution failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      this.emitEvent('tool:executed', serverName, {
        toolName,
        parameters,
        result,
      });

      return result;
    } catch (error) {
      this.emitEvent('tool:error', serverName, {
        toolName,
        parameters,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Perform health check on a server
   */
  public async performHealthCheck(serverName: string): Promise<MCPHealthCheckResult> {
    const config = this.servers.get(serverName);
    const status = this.status.get(serverName);

    if (!config || !status?.running) {
      return {
        serverName,
        healthy: false,
        responseTime: 0,
        error: 'Server not running',
      };
    }

    const startTime = Date.now();
    try {
      const endpoint = config.endpoint || `http://localhost:${config.port}`;
      const healthPath = config.healthCheckPath || '/health';
      
      // Create an AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 5000);
      
      const response = await fetch(`${endpoint}${healthPath}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const healthy = response.ok;

      this.updateServerStatus(serverName, {
        healthy,
        lastHealthCheck: new Date(),
      });

      return {
        serverName,
        healthy,
        responseTime,
        details: healthy ? await response.json().catch(() => ({})) as Record<string, any> : undefined,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.updateServerStatus(serverName, {
        healthy: false,
        lastHealthCheck: new Date(),
        errorCount: status.errorCount + 1,
        lastError: error instanceof Error ? error.message : String(error),
      });

      return {
        serverName,
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start all enabled servers
   */
  public async startAllServers(): Promise<boolean[]> {
    const startPromises = Array.from(this.servers.keys())
      .filter(name => this.servers.get(name)?.enabled)
      .map(name => this.startServer(name));

    return Promise.all(startPromises);
  }

  /**
   * Stop all running servers
   */
  public async stopAllServers(): Promise<boolean[]> {
    const stopPromises = Array.from(this.processes.keys())
      .map(name => this.stopServer(name));

    return Promise.all(stopPromises);
  }

  /**
   * Destroy the registry and clean up resources
   */
  public async destroy(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    await this.stopAllServers();
    // Cleanup is handled by garbage collection
  }

  private async executeServerStart(config: MCPServerConfig): Promise<boolean> {
    if (!config.command) {
      throw new Error(`No command specified for server ${config.name}`);
    }

    const args = config.args || [];
    const env = { ...process.env, ...config.env };

    const childProcess = spawn(config.command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Handle process events
    childProcess.on('error', (error: any) => {
      this.handleServerError(config.name, error);
    });

    childProcess.on('exit', (code: any) => {
      this.updateServerStatus(config.name, {
        running: false,
        healthy: false,
        pid: undefined,
      });
      
      if (code !== 0) {
        this.emitEvent('server:error', config.name, {
          exitCode: code,
        });
      } else {
        this.emitEvent('server:stopped', config.name);
      }
    });

    this.processes.set(config.name, childProcess);
    this.updateServerStatus(config.name, {
      running: true,
      pid: childProcess.pid,
      startTime: new Date(),
    });

    this.emitEvent('server:started', config.name, {
      pid: childProcess.pid,
    });

    return true;
  }

  private updateServerStatus(
    serverName: string,
    updates: Partial<MCPServerStatus>
  ): void {
    const current = this.status.get(serverName);
    if (current) {
      this.status.set(serverName, { ...current, ...updates });
    }
  }

  private handleServerError(serverName: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    this.updateServerStatus(serverName, {
      errorCount: (this.status.get(serverName)?.errorCount || 0) + 1,
      lastError: errorMessage,
    });

    this.emitEvent('server:error', serverName, {
      error: errorMessage,
    });
  }

  private emitEvent(
    type: MCPEventType,
    serverName: string,
    details?: Record<string, any>
  ): void {
    const event: MCPEvent = {
      type,
      serverName,
      timestamp: new Date(),
      details,
    };
    this.emit('mcp:event', event);
  }

  private startHealthChecking(): void {
    const intervalMs = this.config.healthCheckIntervalMs || 30000; // 30 seconds

    this.healthCheckInterval = setInterval(async () => {
      const runningServers = Array.from(this.status.entries())
        .filter(([, status]) => status.running)
        .map(([name]) => name);

      for (const serverName of runningServers) {
        try {
          await this.performHealthCheck(serverName);
        } catch (error) {
          // Health check errors are already handled in performHealthCheck
        }
      }
    }, intervalMs);
  }

  private waitForProcessExit(process: any): Promise<void> {
    return new Promise((resolve) => {
      process.on('exit', () => resolve());
      process.on('error', () => resolve());
    });
  }
}

export default MCPServerRegistry;