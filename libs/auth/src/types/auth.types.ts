/**
 * Authentication and authorization type definitions
 */

import { User } from '@ectropy/shared/types';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string; // JWT expiration (e.g., '1h', '24h', '7d')
  refreshTokenExpiresIn: string; // Refresh token expiration
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}
export interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  error?: string;
  requiresTwoFactor?: boolean;
  lockoutUntil?: Date;
}
export interface SessionData {
  userId: string;
  sessionId: string;
  email: string;
  roles: string[];
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
}

export interface UserAuth extends User {
  passwordHash: string;
  salt: string;
  lastLogin?: Date;
  loginAttempts: number;
  lockoutUntil?: Date;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
}

export interface AuthContext {
  user: User;
  roles: Role[];
  permissions: Permission[];
  isAuthenticated: boolean;
}
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;
  historyLength: number;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  token: string;
  backupCode?: string;
}
