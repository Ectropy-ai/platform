/// <reference types="node" />

import { 
  MCPServerConfigUnion, 
  GitHubMCPConfig, 
  NxMCPConfig, 
  FigmaMCPConfig 
} from './types.js';
import { cwd } from 'process';

/**
 * Default MCP Server Configurations for Ectropy Platform
 * These configurations can be overridden via environment variables
 */

export const createGitHubMCPConfig = (): GitHubMCPConfig => ({
  name: 'github',
  type: 'github',
  enabled: !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
  command: 'npx',
  args: ['@modelcontextprotocol/server-github'],
  port: 3846,
  personalAccessToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
  repoOwner: process.env.GITHUB_REPO_OWNER || 'luhtech',
  repoName: process.env.GITHUB_REPO_NAME || 'Ectropy',
  healthCheckPath: '/health',
  timeout: 30000,
  retries: 3,
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
  },
});

export const createNxMCPConfig = (): NxMCPConfig => ({
  name: 'nx',
  type: 'nx',
  enabled: true, // Always enabled for Nx workspace
  command: 'npx',
  args: ['nx-mcp-server'],
  port: 3847,
  workspaceRoot: cwd(),
  enableProjectDetails: true,
  enableTaskExecution: process.env.NODE_ENV !== 'production', // Safe in dev only
  healthCheckPath: '/health',
  timeout: 30000,
  retries: 3,
});

export const createFigmaMCPConfig = (): FigmaMCPConfig => ({
  name: 'figma',
  type: 'figma',
  enabled: !!process.env.FIGMA_API_KEY,
  command: 'figma-mcp-server',
  args: ['--port', '3845'],
  port: 3845,
  apiKey: process.env.FIGMA_API_KEY || '',
  teamId: process.env.FIGMA_TEAM_ID,
  enableDesignTokens: true,
  healthCheckPath: '/health',
  timeout: 30000,
  retries: 3,
  env: {
    FIGMA_API_KEY: process.env.FIGMA_API_KEY || '',
  },
});

/**
 * Get all default MCP server configurations
 */
export const getDefaultMCPConfigs = (): MCPServerConfigUnion[] => {
  return [
    createGitHubMCPConfig(),
    createNxMCPConfig(),
    createFigmaMCPConfig(),
  ].filter(config => config.enabled);
};

/**
 * Environment validation for MCP servers
 */
export const validateMCPEnvironment = (): {
  valid: boolean;
  missing: string[];
  warnings: string[];
} => {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required for GitHub MCP
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    missing.push('GITHUB_PERSONAL_ACCESS_TOKEN');
  }

  // Optional but recommended
  if (!process.env.FIGMA_API_KEY) {
    warnings.push('FIGMA_API_KEY not set - Figma integration will be disabled');
  }

  if (!process.env.GITHUB_REPO_OWNER) {
    warnings.push('GITHUB_REPO_OWNER not set - using default "luhtech"');
  }

  if (!process.env.GITHUB_REPO_NAME) {
    warnings.push('GITHUB_REPO_NAME not set - using default "Ectropy"');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
};

/**
 * Default agent integration configurations
 */
export const getDefaultAgentIntegrations = () => ({
  'task-manager': {
    agentType: 'task-manager',
    enabledServers: ['github', 'nx'],
    availableTools: [],
    failoverStrategy: 'graceful' as const,
    healthCheckInterval: 60000,
  },
  
  'compliance': {
    agentType: 'compliance',
    enabledServers: ['github', 'nx'],
    availableTools: [],
    failoverStrategy: 'graceful' as const,
    healthCheckInterval: 60000,
  },
  
  'performance': {
    agentType: 'performance',
    enabledServers: ['github', 'nx'],
    availableTools: [],
    failoverStrategy: 'graceful' as const,
    healthCheckInterval: 60000,
  },
  
  'procurement': {
    agentType: 'procurement',
    enabledServers: ['figma', 'github'],
    availableTools: [],
    failoverStrategy: 'graceful' as const,
    healthCheckInterval: 60000,
  },
});