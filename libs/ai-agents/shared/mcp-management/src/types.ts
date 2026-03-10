// MCP Server Types for Ectropy Platform Integration
// Provides type safety for Model Context Protocol server management

export interface MCPServerConfig {
  name: string;
  type: 'github' | 'nx' | 'figma' | 'custom';
  enabled: boolean;
  endpoint?: string;
  port?: number;
  apiKey?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  healthCheckPath?: string;
  timeout?: number;
  retries?: number;
}

export interface MCPServerStatus {
  name: string;
  running: boolean;
  healthy: boolean;
  pid?: number;
  startTime?: Date;
  lastHealthCheck?: Date;
  errorCount: number;
  lastError?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  server: string;
  schema: Record<string, any>;
}

export interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MCPAgentIntegration {
  agentType: string;
  enabledServers: string[];
  availableTools: MCPTool[];
  failoverStrategy: 'graceful' | 'strict' | 'disabled';
  healthCheckInterval: number;
}

export interface MCPServerRegistry {
  servers: Map<string, MCPServerConfig>;
  status: Map<string, MCPServerStatus>;
  tools: Map<string, MCPTool[]>;
}

// GitHub MCP Server specific types
export interface GitHubMCPConfig extends MCPServerConfig {
  type: 'github';
  repoOwner?: string;
  repoName?: string;
  personalAccessToken: string;
}

// Nx MCP Server specific types  
export interface NxMCPConfig extends MCPServerConfig {
  type: 'nx';
  workspaceRoot: string;
  enableProjectDetails: boolean;
  enableTaskExecution: boolean;
}

// Figma MCP Server specific types
export interface FigmaMCPConfig extends MCPServerConfig {
  type: 'figma';
  apiKey: string;
  teamId?: string;
  enableDesignTokens: boolean;
}

export type MCPServerConfigUnion = GitHubMCPConfig | NxMCPConfig | FigmaMCPConfig | MCPServerConfig;

// Agent MCP Tool Request
export interface AgentMCPRequest {
  agentId: string;
  toolName: string;
  serverName: string;
  parameters: Record<string, any>;
  timeout?: number;
  retries?: number;
}

// MCP Health Check Result
export interface MCPHealthCheckResult {
  serverName: string;
  healthy: boolean;
  responseTime: number;
  details?: Record<string, any>;
  error?: string;
}

// MCP Service Events
export type MCPEventType = 
  | 'server:registered'
  | 'server:started'
  | 'server:stopped' 
  | 'server:error'
  | 'server:health_check'
  | 'tool:executed'
  | 'tool:error';

export interface MCPEvent {
  type: MCPEventType;
  serverName: string;
  timestamp: Date;
  details?: Record<string, any>;
  error?: string;
}