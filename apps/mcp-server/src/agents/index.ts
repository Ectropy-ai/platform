/**
 * MCP Agents Registry
 * Central registry for all specialized construction agents as specified in roadmap Task 3.1
 */

import { CostEstimationAgent } from './cost-estimation.js';
import { ScheduleOptimizationAgent } from './schedule-optimization.js';
import { ComplianceCheckAgent } from './compliance-check.js';
import { QualityAssuranceAgent } from './quality-assurance.js';
import { DocumentProcessingAgent } from './document-processing.js';
import type { BaseAgent, AgentStatus } from './base-agent.js';

// Agent registry - exactly as specified in the roadmap
export const agents = {
  cost: new CostEstimationAgent(),
  schedule: new ScheduleOptimizationAgent(),
  compliance: new ComplianceCheckAgent(),
  quality: new QualityAssuranceAgent(),
  document: new DocumentProcessingAgent(),
};

// Agent type definitions
export type AgentType = keyof typeof agents;

export interface AgentRegistryStatus {
  agentCount: number;
  agents: Array<{
    name: string;
    type: AgentType;
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    lastActivity: number;
    version: string;
    capabilities: string[];
  }>;
  systemHealth: {
    overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    healthyAgents: number;
    degradedAgents: number;
    unhealthyAgents: number;
  };
  performance: {
    totalRequestsProcessed: number;
    averageResponseTime: number;
    totalUptime: number;
  };
  lastUpdated: string;
}

/**
 * Health check endpoint implementation per roadmap specification
 * Returns status of all 5 specialized agents
 */
export const getAgentStatus = (): AgentRegistryStatus => {
  const agentStatuses = Object.entries(agents).map(([type, agent]) => {
    const agentStatus = agent.getStatus();
    return {
      name: agent.getName(),
      type: type as AgentType,
      status: agentStatus.status,
      uptime: agentStatus.uptime,
      lastActivity: agentStatus.lastActivity,
      version: agentStatus.version,
      capabilities: agent.getCapabilities(),
    };
  });

  // Calculate system health metrics
  const healthyAgents = agentStatuses.filter(
    (a) => a.status === 'healthy'
  ).length;
  const degradedAgents = agentStatuses.filter(
    (a) => a.status === 'degraded'
  ).length;
  const unhealthyAgents = agentStatuses.filter(
    (a) => a.status === 'unhealthy'
  ).length;

  // Determine overall system health
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (unhealthyAgents > 0) {
    overallStatus = 'unhealthy';
  } else if (degradedAgents > 0) {
    overallStatus = 'degraded';
  }

  // Calculate performance metrics
  const totalRequestsProcessed = Object.values(agents).reduce(
    (sum, agent) => sum + agent.getMetrics().requestsProcessed,
    0
  );

  const averageResponseTime =
    Object.values(agents).reduce(
      (sum, agent) => sum + agent.getMetrics().averageResponseTime,
      0
    ) / Object.keys(agents).length;

  const totalUptime = Math.min(
    ...Object.values(agents).map((agent) => agent.getUptime())
  );

  return {
    agentCount: Object.keys(agents).length,
    agents: agentStatuses,
    systemHealth: {
      overallStatus,
      healthyAgents,
      degradedAgents,
      unhealthyAgents,
    },
    performance: {
      totalRequestsProcessed,
      averageResponseTime: Math.round(averageResponseTime),
      totalUptime,
    },
    lastUpdated: new Date().toISOString(),
  };
};

/**
 * Get specific agent by type
 */
export const getAgent = (type: AgentType): BaseAgent | undefined => {
  return agents[type];
};

/**
 * Get all agent types
 */
export const getAgentTypes = (): AgentType[] => {
  return Object.keys(agents) as AgentType[];
};

/**
 * Check if agent exists
 */
export const hasAgent = (type: AgentType): boolean => {
  return type in agents;
};

/**
 * Initialize all agents
 */
export const initializeAgents = async (): Promise<void> => {
  console.log(
    '🤖 Initializing MCP Agent Framework with 5 specialized agents...'
  );

  const initPromises = Object.entries(agents).map(async ([type, agent]) => {
    try {
      await agent.initialize();
      console.log(
        `✅ Agent '${type}' (${agent.getName()}) initialized successfully`
      );
    } catch (error) {
      throw error;
    }
  });

  await Promise.all(initPromises);

  Object.entries(agents).forEach(([type, agent]) => {
    console.log(
      `   • ${agent.getName()} (${type}): ${agent.getCapabilities().length} capabilities`
    );
  });
};

/**
 * Cleanup all agents
 */
export const cleanupAgents = async (): Promise<void> => {

  const cleanupPromises = Object.entries(agents).map(async ([_type, agent]) => {
    try {
      await agent.cleanup();
    } catch (error) {
    }
  });

  await Promise.all(cleanupPromises);
};

/**
 * Process request with specific agent
 */
export const processWithAgent = async (
  type: AgentType,
  input: any
): Promise<any> => {
  const agent = getAgent(type);
  if (!agent) {
    throw new Error(`Agent type '${type}' not found`);
  }

  try {
    return await agent.process(input);
  } catch (error) {
    throw error;
  }
};

/**
 * Get comprehensive agent metrics
 */
export const getAgentMetrics = (): Record<AgentType, any> => {
  const metrics: Record<string, any> = {};

  Object.entries(agents).forEach(([type, agent]) => {
    metrics[type] = {
      status: agent.getStatus(),
      metrics: agent.getMetrics(),
      uptime: agent.getUptime(),
      lastActivity: agent.getLastActivity(),
    };
  });

  return metrics;
};

/**
 * Validate agent framework health per roadmap requirements
 */
export const validateAgentFramework = (): {
  isValid: boolean;
  requiredAgents: string[];
  presentAgents: string[];
  missingAgents: string[];
  healthyAgents: string[];
  issues: string[];
} => {
  const requiredAgents = [
    'cost',
    'schedule',
    'compliance',
    'quality',
    'document',
  ];
  const presentAgents = Object.keys(agents);
  const missingAgents = requiredAgents.filter(
    (req) => !presentAgents.includes(req)
  );

  const healthyAgents = Object.entries(agents)
    .filter(([, agent]) => agent.getStatus().status === 'healthy')
    .map(([type]) => type);

  const issues: string[] = [];

  if (missingAgents.length > 0) {
    issues.push(`Missing required agents: ${missingAgents.join(', ')}`);
  }

  if (healthyAgents.length < requiredAgents.length) {
    const unhealthyAgents = requiredAgents.filter(
      (req) => !healthyAgents.includes(req)
    );
    issues.push(`Unhealthy agents detected: ${unhealthyAgents.join(', ')}`);
  }

  const isValid =
    missingAgents.length === 0 &&
    healthyAgents.length === requiredAgents.length;

  return {
    isValid,
    requiredAgents,
    presentAgents,
    missingAgents,
    healthyAgents,
    issues,
  };
};

// Export individual agents for direct access if needed
export {
  CostEstimationAgent,
  ScheduleOptimizationAgent,
  ComplianceCheckAgent,
  QualityAssuranceAgent,
  DocumentProcessingAgent,
};

// Export types
export type { BaseAgent, AgentStatus } from './base-agent.js';
