/**
 * Enhanced Agent Authentication Service
 * Manages JWT authentication specifically for AI agents in the multi-agent system
 */


import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { EnhancedJWTAuthService } from './jwt-auth.service.js';
export interface AgentInfo {
  id: string;
  type: string;
  specialization?: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'maintenance';
  lastSeen: Date;
  version: string;
  endpoint: string;
}
export interface AgentRegistration {
  agentType: string;
  agentId: string;
  specialization?: string;
  capabilities: string[];
  endpoint: string;
  version: string;
}
export class AgentAuthenticationService extends EnhancedJWTAuthService {
  private agents: Map<string, AgentInfo> = new Map();
  private agentTokens: Map<string, string> = new Map(); // agentId -> token
  /**
   * Register a new agent in the system
   */
  public async registerAgent(registration: AgentRegistration): Promise<{
    success: boolean;
    agentToken?: string;
    error?: string;
  }> {
    try {
      const {
        agentType,
        agentId,
        specialization,
        capabilities,
        endpoint,
        version,
      } = registration;
      // Validate agent registration
      if (!agentType || !agentId || !capabilities.length || !endpoint) {
        return {
          success: false,
          error: 'Missing required registration fields',
        };
      }
      // Generate unique agent credentials
      const agentInfo: AgentInfo = {
        id: agentId,
        type: agentType,
        status: 'active',
        lastSeen: new Date(),
        capabilities,
        version,
        endpoint,
        ...(specialization ? { specialization } : {}),
      };
      // Generate agent-specific JWT token with extended expiry
      const agentToken = this.generateAgentToken(
        agentId,
        agentType,
        capabilities
      );
      // Store agent info
      this.agents.set(agentId, agentInfo);
      this.agentTokens.set(agentId, agentToken);
      return {
        success: true,
        agentToken,
      };
    } catch (error) {
      // Sanitize error to prevent information leakage
      return { success: false, error: 'Registration failed' };
    }
  }

  private generateAgentToken(
    agentId: string,
    agentType: string,
    capabilities: string[]
  ): string {
    const payload = {
      sub: agentId,
      role: 'agent',
      agentType,
      capabilities,
      iat: Math.floor(Date.now() / 1000),
      type: 'agent_access',
      jti: crypto.randomBytes(16).toString('hex'),
    };
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: '24h', // Longer expiry for agents
      issuer: 'ectropy-platform',
      audience: 'ectropy-agents',
      algorithm: 'HS256',
    });
  }

  public async verifyAgentToken(
    token: string,
    requiredCapability?: string
  ): Promise<{ valid: boolean; agent?: AgentInfo; error?: string }> {
    try {
      const decoded = jwt.verify(
        token,
        this.JWT_SECRET
      ) as any;
      // Verify token type
      if (decoded.type !== 'agent_access') {
        return { valid: false, error: 'Invalid token type for agent' };
      }
      // Get agent info
      const agent = this.agents.get(decoded.sub);
      if (!agent) {
        return { valid: false, error: 'Agent not found or deregistered' };
      }
      // Check if agent is active
      if (agent.status !== 'active') {
        return { valid: false, error: 'Agent is not active' };
      }
      // Check capability if required
      if (
        requiredCapability &&
        !decoded.capabilities.includes(requiredCapability)
      ) {
        return { valid: false, error: 'Agent lacks required capability' };
      }
      // Update last seen
      agent.lastSeen = new Date();
      return { valid: true, agent };
    } catch (error) {
      // Sanitize error to prevent sensitive information leakage
      return { valid: false, error: 'Token verification failed' };
    }
  }
  /** Middleware for agent authentication */
  public authenticateAgent(requiredCapability?: string) {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<Response | void> => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Agent authentication required',
            message: 'No token provided',
          });
        }
        const token = authHeader.substring(7);
        const verification = await this.verifyAgentToken(
          token,
          requiredCapability
        );
        if (!verification.valid) {
          return res.status(401).json({
            error: 'Agent authentication failed',
            message: verification.error,
          });
        }
        // Add agent info to request
        (req as any).agent = verification.agent;
        return next();
      } catch (error) {
        // Sanitize error to prevent sensitive information leakage
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Internal server error',
        });
      }
    };
  }
  public getRegisteredAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  public getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  public updateAgentStatus(
    agentId: string,
    status: 'active' | 'inactive' | 'maintenance'
  ): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      return true;
    }
    return false;
  }

  public deregisterAgent(agentId: string): boolean {
    const removed = this.agents.delete(agentId);
    this.agentTokens.delete(agentId);
    if (removed) {
    }
    return removed;
  }

  public cleanupInactiveAgents(timeoutMinutes: number = 10): void {
    const timeout = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.lastSeen < timeout) {
        this.deregisterAgent(agentId);
      }
    }
  }

  public getAgentsByType(agentType: string): AgentInfo[] {
    return (Array.from(this.agents.values()) as AgentInfo[]).filter(
      (agent: AgentInfo) => agent.type === agentType
    );
  }

  public getAgentsByCapability(capability: string): AgentInfo[] {
    return (Array.from(this.agents.values()) as AgentInfo[]).filter((agent: AgentInfo) =>
      agent.capabilities.includes(capability)
    );
  }

  public async performAgentHealthCheck(): Promise<{
    healthy: AgentInfo[];
    unhealthy: AgentInfo[];
  }> {
    const healthy: AgentInfo[] = [];
    const unhealthy: AgentInfo[] = [];
    for (const agent of this.agents.values()) {
      // Simple health check via HTTP with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${agent.endpoint}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          agent.status = 'active';
          agent.lastSeen = new Date();
          healthy.push(agent);
        } else {
          agent.status = 'inactive';
          unhealthy.push(agent);
        }
      } catch {
        agent.status = 'inactive';
        unhealthy.push(agent);
      }
    }
    return { healthy, unhealthy };
  }
}
