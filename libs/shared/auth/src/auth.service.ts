/**
 * Service for user authentication and JWT management.
 * Handles login, token issuance and session validation.
 */
import * as bcrypt from 'bcryptjs';
import type { Redis } from 'ioredis';
import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface UserContext {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export class AuthService {
  constructor(
    private db: Pool,
    private redis: Redis,
    private jwtSecret: string = process.env['JWT_SECRET'] || '',
    private jwtExpiresIn: string = process.env['JWT_EXPIRES_IN'] || '15m',
    private refreshExpiresIn: string = process.env[
      'REFRESH_TOKEN_EXPIRES_IN'
    ] || '7d'
  ) {
    // Validate JWT secret is provided
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required for authentication service');
    }
  }
  /**
   * Authenticate user and create session
   * Leverages your existing users table and row-level security
   */
  async login(credentials: LoginCredentials): Promise<TokenPair> {
    const { email, password } = credentials;
    // Use your existing database structure
    const userQuery =
      "SELECT u.id, u.email, u.password_hash, u.is_active, u.full_name, u.role, u.company, u.created_at, ARRAY_AGG(JSON_BUILD_OBJECT('project_id', pr.project_id, 'role_name', pr.role_name, 'permissions', pr.permissions, 'element_types', pr.element_types, 'zones', pr.zones, 'role_weight', pr.role_weight)) FILTER (WHERE pr.id IS NOT NULL) as project_roles FROM users u LEFT JOIN project_roles pr ON u.id = pr.user_id AND pr.is_active = true WHERE u.email = $1 AND u.is_active = true GROUP BY u.id, u.email, u.password_hash, u.is_active, u.full_name, u.role, u.company, u.created_at";
    const result = await this.db.query(userQuery, [email]);
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }
    const user = result.rows[0];
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Create session in your existing user_sessions table
    const sessionId = uuidv4();
    const sessionQuery =
      "INSERT INTO user_sessions (id, user_id, session_token, expires_at, created_at, last_accessed) VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW(), NOW()) RETURNING id";
    await this.db.query(sessionQuery, [sessionId, user.id, sessionId]);
    // Generate tokens with role claims
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      roles: this.extractRoles(user.project_roles),
      permissions: this.extractPermissions(user.project_roles),
      sessionId,
    };
    return this.generateTokenPair(userContext);
  }

  /**
   * Validate JWT token and return user context
   * Integrates with your existing session management
   */
  async validateToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      // Check if session is still active in your database
      const sessionQuery =
        'SELECT us.*, u.email, u.is_active as user_active FROM user_sessions us JOIN users u ON us.user_id = u.id WHERE us.id = $1 AND us.expires_at > NOW() AND u.is_active = true';
      const sessionResult = await this.db.query(sessionQuery, [
        decoded.sessionId,
      ]);
      if (sessionResult.rows.length === 0) {
        throw new Error('Session expired or invalid');
      }
      // Get fresh permissions (they might have changed)
      const userContext = await this.getUserContext(decoded.userId);
      userContext.sessionId = decoded.sessionId;
      // Cache user context in Redis for performance
      await (this.redis as any).setex(
        'user_context:' + decoded.sessionId,
        300, // 5 minutes
        JSON.stringify(userContext)
      );
      return userContext;
    } catch (_error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Check if user has access to specific construction element
   * Uses your sophisticated check_element_access function
   */
  async checkElementAccess(
    userId: string,
    elementId: string,
    operation: 'read' | 'write' | 'admin' = 'read'
  ): Promise<boolean> {
    try {
      // Use your existing access control function
      const accessQuery =
        'SELECT check_element_access($1::uuid, $2::uuid, $3::text) as has_access';
      const accessResult = await this.db.query(accessQuery, [
        userId,
        elementId,
        operation,
      ]);
      return accessResult.rows[0]?.has_access || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Refresh token using existing session
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      // Validate session is still active
      const sessionQuery =
        'SELECT user_id FROM user_sessions WHERE id = $1 AND expires_at > NOW()';
      const result = await this.db.query(sessionQuery, [decoded.sessionId]);
      if (result.rows.length === 0) {
        throw new Error('Session expired');
      }
      const userContext = await this.getUserContext(result.rows[0].user_id);
      return this.generateTokenPair(userContext);
    } catch (_error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Logout and invalidate session
   */
  async logout(sessionId: string): Promise<void> {
    try {
      const logoutQuery = 'DELETE FROM user_sessions WHERE id = $1';
      await this.db.query(logoutQuery, [sessionId]);
      // Remove from Redis cache
      await (this.redis as any).del('user_context:' + sessionId);
    } catch (error) {
      throw error;
    }
  }

  // Private helper methods
  private async generateTokenPair(
    userContext: UserContext
  ): Promise<TokenPair> {
    const accessTokenPayload = {
      userId: userContext.id,
      email: userContext.email,
      roles: userContext.roles,
      sessionId: userContext.sessionId,
      type: 'access',
    };

    const refreshTokenPayload = {
      userId: userContext.id,
      sessionId: userContext.sessionId,
      type: 'refresh',
    };

    const accessToken = jwt.sign(
      accessTokenPayload,
      this.jwtSecret,
      {
        expiresIn: this.jwtExpiresIn || '15m',
        issuer: 'federated-construction-platform',
        audience: 'api-gateway',
      } as SignOptions
    );

    const refreshToken = jwt.sign(
      refreshTokenPayload,
      this.jwtSecret,
      {
        expiresIn: this.refreshExpiresIn || '7d',
        issuer: 'federated-construction-platform',
        audience: 'api-gateway',
      } as SignOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiration(this.jwtExpiresIn),
    };
  }

  private async getUserContext(userId: string): Promise<UserContext> {
    // Check Redis cache first
    const cached = await (this.redis as any).get('user_context:' + userId);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get fresh data from database
    const userQuery =
      "SELECT u.id, u.email, u.full_name, u.role, u.company, JSON_AGG(JSON_BUILD_OBJECT('role_name', pr.role_name, 'permissions', pr.permissions)) as project_roles FROM users u LEFT JOIN project_roles pr ON u.id = pr.user_id WHERE u.id = $1 AND u.is_active = true GROUP BY u.id, u.email, u.full_name, u.role, u.company";

    const result = await this.db.query(userQuery, [userId]);
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const userData = result.rows[0];
    return {
      id: userData.id,
      email: userData.email,
      roles: this.extractRoles(userData.project_roles),
      permissions: this.extractPermissions(userData.project_roles),
      sessionId: '', // Will be set by calling function
    };
  }

  private extractRoles(projectRoles: any[]): string[] {
    const roles = new Set<string>();
    if (projectRoles && Array.isArray(projectRoles)) {
      projectRoles.forEach((pr) => {
        if (pr?.role_name) {
          roles.add(pr.role_name);
        }
      });
    }
    return Array.from(roles);
  }

  private extractPermissions(projectRoles: any[]): string[] {
    const permissions = new Set<string>();
    if (projectRoles && Array.isArray(projectRoles)) {
      projectRoles.forEach((pr) => {
        if (pr?.permissions && typeof pr.permissions === 'object') {
          Object.keys(pr.permissions).forEach((key) => {
            if (pr.permissions[key] === true) {
              permissions.add(key);
            }
          });
        }
      });
    }
    return Array.from(permissions);
  }
  private parseExpiration(expiresIn: string): number {
    // Convert string like '15m' to seconds
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900; // 15 minutes default
    }
  }
}
