/**
 * Unit tests for Agent Health Response Format
 * Tests that the /api/mcp/health endpoint returns properly flattened agent status
 */

import { describe, it, expect } from 'vitest';
import { getAgentStatus } from '../index.js';

describe('Agent Health Response Format', () => {
  it('should return flattened agent health structure', () => {
    const healthStatus = getAgentStatus();

    // Verify top-level structure
    expect(healthStatus).toHaveProperty('agentCount');
    expect(healthStatus).toHaveProperty('agents');
    expect(healthStatus).toHaveProperty('systemHealth');
    expect(healthStatus).toHaveProperty('performance');
    expect(healthStatus).toHaveProperty('lastUpdated');

    // Verify agent count
    expect(healthStatus.agentCount).toBe(5);
    expect(healthStatus.agents).toHaveLength(5);

    // Verify each agent has flattened structure
    healthStatus.agents.forEach((agent) => {
      // Agent should have these fields at the top level
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('type');
      expect(agent).toHaveProperty('status');
      expect(agent).toHaveProperty('uptime');
      expect(agent).toHaveProperty('lastActivity');
      expect(agent).toHaveProperty('version');
      expect(agent).toHaveProperty('capabilities');

      // Status should be a simple string, not an object
      expect(typeof agent.status).toBe('string');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(agent.status);

      // Verify no nested status object
      expect(agent.status).not.toBeInstanceOf(Object);
      expect(typeof agent.status).not.toBe('object');

      // Verify other fields have correct types
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.type).toBe('string');
      expect(typeof agent.uptime).toBe('number');
      expect(typeof agent.lastActivity).toBe('number');
      expect(typeof agent.version).toBe('string');
      expect(Array.isArray(agent.capabilities)).toBe(true);
    });
  });

  it('should have no duplicate fields in agent structure', () => {
    const healthStatus = getAgentStatus();

    healthStatus.agents.forEach((agent) => {
      // Agent name should only appear once at top level
      const keys = Object.keys(agent);
      expect(keys.filter((k) => k === 'name').length).toBe(1);
      expect(keys.filter((k) => k === 'status').length).toBe(1);

      // Status should not have nested properties
      const statusValue = agent.status;
      if (typeof statusValue === 'object' && statusValue !== null) {
        fail('Status should be a string, not an object');
      }
    });
  });

  it('should properly calculate system health metrics', () => {
    const healthStatus = getAgentStatus();

    // Verify system health structure
    expect(healthStatus.systemHealth).toHaveProperty('overallStatus');
    expect(healthStatus.systemHealth).toHaveProperty('healthyAgents');
    expect(healthStatus.systemHealth).toHaveProperty('degradedAgents');
    expect(healthStatus.systemHealth).toHaveProperty('unhealthyAgents');

    // Verify counts add up to total agents
    const {
      healthyAgents,
      degradedAgents,
      unhealthyAgents,
    } = healthStatus.systemHealth;
    expect(healthyAgents + degradedAgents + unhealthyAgents).toBe(
      healthStatus.agentCount
    );

    // Verify overall status is one of the expected values
    expect(['healthy', 'degraded', 'unhealthy']).toContain(
      healthStatus.systemHealth.overallStatus
    );
  });

  it('should support jq-style parsing of agent status', () => {
    const healthStatus = getAgentStatus();

    // Simulate jq '.agents[].status' - should return strings
    const statuses = healthStatus.agents.map((agent) => agent.status);

    statuses.forEach((status) => {
      expect(typeof status).toBe('string');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(status);
    });

    // Simulate jq '.agents[] | {name, status}' - should work cleanly
    const nameStatusPairs = healthStatus.agents.map((agent) => ({
      name: agent.name,
      status: agent.status,
    }));

    nameStatusPairs.forEach((pair) => {
      expect(typeof pair.name).toBe('string');
      expect(typeof pair.status).toBe('string');
    });
  });

  it('should include all required agent types', () => {
    const healthStatus = getAgentStatus();

    const requiredTypes = ['cost', 'schedule', 'compliance', 'quality', 'document'];
    const presentTypes = healthStatus.agents.map((agent) => agent.type);

    requiredTypes.forEach((requiredType) => {
      expect(presentTypes).toContain(requiredType);
    });
  });

  it('should return valid timestamps for all agents', () => {
    const healthStatus = getAgentStatus();
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const oneYearFuture = now + 365 * 24 * 60 * 60 * 1000;

    healthStatus.agents.forEach((agent) => {
      // Timestamp should be within reasonable range (not in far past or future)
      expect(agent.lastActivity).toBeGreaterThan(oneYearAgo);
      expect(agent.lastActivity).toBeLessThan(oneYearFuture);

      // Timestamp should be recent (within last hour for newly started agents)
      expect(agent.lastActivity).toBeGreaterThan(now - 60 * 60 * 1000);
      expect(agent.lastActivity).toBeLessThanOrEqual(now);

      // Timestamp should be 13 digits (milliseconds since epoch)
      expect(agent.lastActivity.toString()).toHaveLength(13);

      // Should be able to convert to valid date
      const date = new Date(agent.lastActivity);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });

  it('should have lastActivity consistent with uptime', () => {
    const healthStatus = getAgentStatus();

    healthStatus.agents.forEach((agent) => {
      // Uptime should be positive
      expect(agent.uptime).toBeGreaterThan(0);

      // lastActivity timestamp should be within agent's lifetime
      // (agent started at (now - uptime), so lastActivity should be >= that)
      const now = Date.now();
      const agentStartTime = now - agent.uptime;
      
      expect(agent.lastActivity).toBeGreaterThanOrEqual(agentStartTime - 1000); // 1s tolerance
      expect(agent.lastActivity).toBeLessThanOrEqual(now);
    });
  });
});
