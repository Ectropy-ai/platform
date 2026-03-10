/**
 * Main Authentication Service
 */

import bcrypt from 'bcryptjs';
import { JWTService } from './jwt.service.js';
import { SessionService } from './session.service.js';
import { DatabaseClient, CacheClient } from './interfaces.js';
import {
  AuthConfig,
  LoginCredentials,
  LoginResult,
  TokenPair,
  UserAuth,
  AuthContext,
  JWTPayload,
  SessionData,
} from '../types/auth.types.js';
import { User } from '@ectropy/shared/types';
import { logger } from '@ectropy/shared/utils';
export class AuthService {
  private db: DatabaseClient;
  private jwtService: JWTService;
  private sessionService: SessionService;
  private config: AuthConfig;
  constructor(db: DatabaseClient, cache: CacheClient, config: AuthConfig) {
    this.db = db;
    this.jwtService = new JWTService(config);
    this.sessionService = new SessionService(cache, config);
    this.config = config;
  }
  public async login(
    credentials: LoginCredentials,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    try {
      const { email, password, rememberMe } = credentials;
      // Get user from database
      const userResult = await this.db.query<UserAuth>(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email]
      );
      if (userResult.rows.length === 0) {
        logger.warn('Login attempt with non-existent email', { email });
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }
      const user = userResult.rows[0];
      if (!user) {
        logger.warn('Unexpected: user not found after successful query', {
          email,
        });
        return { success: false, error: 'Invalid credentials' };
      }
      // Check if account is locked
      if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        logger.warn('Login attempt on locked account', {
          userId: user.id,
          lockoutUntil: user.lockoutUntil,
          error: 'Account temporarily locked',
        });
        return { success: false, error: 'Account temporarily locked' };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        await this.handleFailedLogin(user.id);
        logger.warn('Failed login attempt - invalid password', {
          userId: user.id,
          email,
        });
        return { success: false, error: 'Invalid credentials' };
      }

      // Check if 2FA is required
      if (user.twoFactorEnabled) {
        logger.info('2FA required for login', { userId: user.id, email });
        return {
          success: false,
          requiresTwoFactor: true,
          error: 'Two-factor authentication required',
        };
      }

      // Successful login
      await this.handleSuccessfulLogin(user.id);
      // Create session
      const sessionId = await this.sessionService.createSession(
        user.id,
        user.email,
        user.roles || [],
        ipAddress,
        userAgent
      );

      // Generate tokens
      const tokenPair = this.jwtService.generateTokenPair({
        userId: user.id,
        email: user.email,
        roles: user.roles || [],
        sessionId,
      });
      // Convert UserAuth to User for response
      const userResponse: User = {
        id: user.id,
        email: user.email,
        role: user.roles?.[0] ?? 'USER', // Primary role (first role or default)
        roles: user.roles,
        permissions: [],
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      logger.info('User logged in successfully', {
        email,
      });
      return {
        success: true,
        user: userResponse,
        tokens: tokenPair,
      };
    } catch (error) {
      logger.error('Login error', {
        email: credentials.email,
        error: error as Error,
      });
      return {
        success: false,
        error: 'Login failed',
      };
    }
  }

  public async logout(
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const destroyed = await this.sessionService.destroySession(sessionId);
      if (destroyed) {
        logger.info('User logged out successfully', { sessionId });
        return { success: true };
      }
      logger.warn('Logout attempt with invalid session', { sessionId });
      return { success: false, error: 'Invalid session' };
    } catch (error) {
      logger.error('Logout error', {
        sessionId,
        error: error as Error,
      });
      return { success: false, error: 'Logout failed' };
    }
  }

  public async validateToken(token: string): Promise<{
    valid: boolean;
    payload?: JWTPayload;
    session?: SessionData;
    error?: string;
  }> {
    if (!token) {
      return { valid: false, error: 'Token is required' };
    }
    try {
      const payload = await this.jwtService.verifyToken(token);
      const session = await this.sessionService.getSession(payload.sessionId);
      if (!session) {
        return { valid: false, error: 'Session not found or expired' };
      }
      return { valid: true, payload, session };
    } catch (error) {
      logger.warn('Token validation failed', { error: error as Error });
      return { valid: false, error: (error as Error).message };
    }
  }

  public async refreshToken(
    refreshToken: string
  ): Promise<{ success: boolean; tokens?: TokenPair; error?: string }> {
    try {
      const { userId, sessionId } =
        this.jwtService.verifyRefreshToken(refreshToken);

      const sessionData = await this.sessionService.getSession(sessionId);
      if (!sessionData || sessionData.userId !== userId) {
        logger.warn('Refresh token attempt with invalid session', {
          userId,
          sessionId,
        });
        return { success: false, error: 'Invalid session' };
      }

      await this.sessionService.updateSession(sessionId, {
        lastActivity: new Date(),
      });

      const newTokens = this.jwtService.generateTokenPair({
        userId: sessionData.userId,
        email: sessionData.email,
        roles: sessionData.roles,
        sessionId: sessionData.sessionId,
      });

      logger.debug('Tokens refreshed successfully', { userId });
      return { success: true, tokens: newTokens };
    } catch (error) {
      logger.error('Token refresh error', { error: error as Error });
      return { success: false, error: 'Invalid refresh token' };
    }
  }

  public refreshTokens(
    refreshToken: string
  ): Promise<{ success: boolean; tokens?: TokenPair; error?: string }> {
    return this.refreshToken(refreshToken);
  }

  public async validateSession(sessionId: string): Promise<AuthContext | null> {
    try {
      // First validate the session
      const sessionData = await this.sessionService.getSession(sessionId);
      if (!sessionData) {
        return null;
      }

      // Get updated user data - note database returns snake_case fields
      const userResult = await this.db.query<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(
        'SELECT id, email, first_name, last_name, is_active, created_at, updated_at FROM users WHERE id = $1 AND is_active = true',
        [sessionData.userId]
      );

      if (userResult.rows.length === 0) {
        // User no longer exists or is inactive
        await this.sessionService.destroySession(sessionId);
        return null;
      }

      const user = userResult.rows[0];

      // Get user roles and permissions
      const rolesResult = await this.db.query(
        `SELECT r.name, r.permissions 
         FROM user_roles ur 
         JOIN roles r ON ur.role_id = r.id 
         WHERE ur.user_id = $1`,
        [user.id]
      );
      const roles = rolesResult.rows;
      const permissions = roles.flatMap((role) => role.permissions || []);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: sessionData.roles?.[0] ?? 'USER', // Primary role (first role or default)
          firstName: user.first_name,
          lastName: user.last_name,
          isActive: user.is_active,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          roles: sessionData.roles,
          permissions,
        },
        roles,
        permissions,
        isAuthenticated: true,
      };
    } catch (error) {
      logger.error('Session validation error', {
        error: error as Error,
        sessionId,
      });
      return null;
    }
  }

  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    try {
      // Get user
      const userResult = await this.db.query<UserAuth>(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        logger.warn('User not found during password change', { userId });
        return false;
      }

      const user = userResult.rows[0];

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        currentPassword,
        user.passwordHash
      );

      if (!isValidPassword) {
        logger.warn('Password change attempt with invalid current password', {
          userId,
        });
        return false;
      }

      // Hash new password
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await this.db.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId]
      );

      // Destroy all user sessions to force re-login
      await this.sessionService.destroyAllUserSessions(userId);

      logger.info('Password changed successfully', { userId });
      return true;
    } catch (error) {
      logger.error('Password change error', {
        error: error as Error,
        userId,
      });
      return false;
    }
  }
  public async createUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roles?: string[];
  }): Promise<User | null> {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        roles = ['user'],
      } = userData;

      // Check if user already exists
      const existingUser = await this.db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        logger.warn('Attempt to create user with existing email', { email });
        return null;
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const result = await this.db.query<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO users (email, password_hash, first_name, last_name, roles, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, email, first_name, last_name, is_active, created_at, updated_at`,
        [email, passwordHash, firstName, lastName, JSON.stringify(roles)]
      );

      const user = result.rows[0];
      if (!user) {
        throw new Error('Failed to create user');
      }

      logger.info('User created successfully', {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      });

      return {
        id: user.id,
        email: user.email,
        role: roles?.[0] ?? 'USER', // Primary role (first role or default)
        roles: roles,
        permissions: [],
        firstName: user.first_name,
        lastName: user.last_name,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      };
    } catch (error) {
      logger.error('User creation error', {
        email: userData.email,
        error: error as Error,
      });
      return null;
    }
  }

  private async handleSuccessfulLogin(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET login_attempts = 0, lockout_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  }

  private async handleFailedLogin(userId: string): Promise<void> {
    try {
      const result = await this.db.query<{ login_attempts: number }>(
        'UPDATE users SET login_attempts = login_attempts + 1 WHERE id = $1 RETURNING login_attempts',
        [userId]
      );

      const loginAttempts = result.rows[0]?.login_attempts || 0;
      if (loginAttempts >= this.config.maxLoginAttempts) {
        const lockoutUntil = new Date(
          Date.now() + this.config.lockoutDuration * 1000
        );
        await this.db.query(
          'UPDATE users SET lockout_until = $1 WHERE id = $2',
          [lockoutUntil, userId]
        );
        logger.warn('Account locked due to too many failed attempts', {
          userId,
          loginAttempts,
          lockoutUntil,
        });
      }
    } catch (error) {
      logger.error('Failed to handle failed login', {
        userId,
        error: error as Error,
      });
    }
  }
}
