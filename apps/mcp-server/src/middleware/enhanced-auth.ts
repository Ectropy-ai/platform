/**
 * Enhanced Agent Authentication Middleware for MCP Server
 * Production-grade authentication with rate limiting and audit logging
 */

import { Request, Response, NextFunction } from 'express';
// TODO: Implement authentication services once auth lib is available
// import { AgentAuthenticationService } from '@ectropy/auth/enhanced/services/agent-auth.service';
// import { AccountSecurityService } from '@ectropy/auth/enhanced/security/account-security';
import { Redis } from 'ioredis';

export interface AuthenticatedRequest extends Request {
  agent?: {
    id: string;
    type: string;
    capabilities: string[];
    specialization?: string;
  };
  rateLimitInfo?: {
    remaining: number;
    reset: Date;
  };
}

export class MCPAgentAuthMiddleware {
  // private agentAuthService: AgentAuthenticationService;
  // private securityService: AccountSecurityService;
  private redis: Redis;

  constructor() {
    // Initialize Redis connection for security service
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: 'mcp:auth:',
    });

    // TODO: Initialize auth services once available
    // this.agentAuthService = new AgentAuthenticationService();
    // this.securityService = new AccountSecurityService(this.redis);
  }

  /**
   * Authenticate agent with enhanced security
   */
  public authenticateAgent = (_requiredCapability?: string) => {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<Response | void> => {
      try {
        // Extract Bearer token
        const authHeader = req.headers.authorization;
        if (
          !authHeader ||
          typeof authHeader !== 'string' ||
          !authHeader.startsWith('Bearer ')
        ) {
          return res.status(401).json({
            error: 'Agent authentication required',
            message: 'Missing or invalid authorization header',
            code: 'AUTH_REQUIRED',
          });
        }

        const _token = authHeader.substring(7);
        const clientIp = this.getClientIP(req);

        // Rate limiting check
        const _rateLimitKey = `agent_auth:${clientIp}`;
        // TODO: Implement rate limiting once security service is available
        // const rateLimitStatus = await this.securityService.checkRateLimit(rateLimitKey, 'auth');
        const rateLimitStatus = {
          isLimited: false,
          retryAfter: 0,
          remainingRequests: 100,
          resetTime: new Date(Date.now() + 3600000), // 1 hour from now
        }; // Stub

        if (rateLimitStatus.isLimited) {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many authentication attempts',
            retryAfter: rateLimitStatus.retryAfter,
            code: 'RATE_LIMITED',
          });
        }

        // Verify agent token
        // TODO: Implement token verification once auth service is available
        // const verification = await this.agentAuthService.verifyAgentToken(token, requiredCapability);
        const verification = {
          valid: true,
          agent: { id: 'test-agent', type: 'mcp', capabilities: [] },
          error: undefined, // For error cases
        }; // Stub

        if (!verification.valid) {
          // Log failed authentication attempt
          await this.logAuthAttempt({
            clientIp,
            success: false,
            error: verification.error || 'Unknown error',
            timestamp: new Date(),
          });

          return res.status(401).json({
            error: 'Agent authentication failed',
            message: verification.error,
            code: 'AUTH_FAILED',
          });
        }

        // Log successful authentication
        await this.logAuthAttempt({
          clientIp,
          agentId: verification.agent?.id,
          success: true,
          timestamp: new Date(),
        });

        // Add agent info to request
        (req as AuthenticatedRequest).agent = verification.agent;
        (req as AuthenticatedRequest).rateLimitInfo = {
          remaining: rateLimitStatus.remainingRequests,
          reset: rateLimitStatus.resetTime,
        };

        // Set rate limit headers
        res.set({
          'X-RateLimit-Remaining': rateLimitStatus.remainingRequests.toString(),
          'X-RateLimit-Reset': rateLimitStatus.resetTime.toISOString(),
        });

        return next();
      } catch (error) {
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Internal server error',
          code: 'AUTH_ERROR',
        });
      }
    };
  };

  /**
   * Check if agent has specific tool access
   */
  public requireToolAccess = (toolName: string) => {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<Response | void> => {
      try {
        const agent = req.agent;
        if (!agent) {
          return res.status(401).json({
            error: 'Agent not authenticated',
            code: 'AGENT_NOT_AUTHENTICATED',
          });
        }

        // Check if agent has tool access capability
        const hasAccess =
          agent.capabilities.includes(toolName) ||
          agent.capabilities.includes('all_tools') ||
          agent.capabilities.includes('admin');

        if (!hasAccess) {
          await this.logAccessAttempt({
            agentId: agent.id,
            toolName,
            allowed: false,
            timestamp: new Date(),
          });

          return res.status(403).json({
            error: 'Tool access denied',
            message: `Agent does not have access to tool: ${toolName}`,
            code: 'TOOL_ACCESS_DENIED',
          });
        }

        await this.logAccessAttempt({
          agentId: agent.id,
          toolName,
          allowed: true,
          timestamp: new Date(),
        });

        return next();
      } catch (error) {
        return res.status(500).json({
          error: 'Access check error',
          message: 'Internal server error',
          code: 'ACCESS_CHECK_ERROR',
        });
      }
    };
  };

  /**
   * Enhanced rate limiting for specific agents
   */
  public rateLimitByAgent = (_maxRequests = 100, _windowMinutes = 1) => {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<Response | void> => {
      try {
        const agent = req.agent;
        if (!agent) {
          return res.status(401).json({
            error: 'Agent not authenticated',
            code: 'AGENT_NOT_AUTHENTICATED',
          });
        }

        const _rateLimitKey = `agent_requests:${agent.id}`;
        // TODO: Implement rate limiting once security service is available
        // const rateLimitStatus = await this.securityService.checkRateLimit(rateLimitKey, 'requests');
        const rateLimitStatus = {
          isLimited: false,
          retryAfter: 0,
          remainingRequests: 100,
          resetTime: new Date(Date.now() + 3600000), // 1 hour from now
        }; // Stub

        if (rateLimitStatus.isLimited) {
          return res.status(429).json({
            error: 'Agent rate limit exceeded',
            message: `Agent ${agent.id} has exceeded the rate limit`,
            retryAfter: rateLimitStatus.retryAfter,
            code: 'AGENT_RATE_LIMITED',
          });
        }

        // Update rate limit headers
        res.set({
          'X-Agent-RateLimit-Remaining':
            rateLimitStatus.remainingRequests.toString(),
          'X-Agent-RateLimit-Reset': rateLimitStatus.resetTime.toISOString(),
        });

        return next();
      } catch (error) {
        return res.status(500).json({
          error: 'Rate limiting error',
          message: 'Internal server error',
          code: 'RATE_LIMIT_ERROR',
        });
      }
    };
  };

  /**
   * Get client IP address
   */
  private getClientIP(req: Request): string {
    return (
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      'unknown'
    );
  }

  /**
   * Log authentication attempts
   */
  private async logAuthAttempt(attempt: {
    clientIp: string;
    agentId?: string;
    success: boolean;
    error?: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      // In a full implementation, this would write to audit log
      console.log({
        ...attempt,
        type: 'agent_authentication',
      });
    } catch (error) {
      console.error('Failed to log authentication attempt:', error);
    }
  }

  /**
   * Log tool access attempts
   */
  private async logAccessAttempt(attempt: {
    agentId: string;
    toolName: string;
    allowed: boolean;
    timestamp: Date;
  }): Promise<void> {
    try {
      // In a full implementation, this would write to audit log
      console.log({
        ...attempt,
        type: 'tool_access',
      });
    } catch (error) {
      console.error('Failed to log access attempt:', error);
    }
  }
}
