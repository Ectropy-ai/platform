/**
 * Local types for auth library
 * Temporary solution to avoid cross-library import issues during build
 */

import type { Request } from 'express';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string; // Primary role from StakeholderRole enum (matches Prisma schema & shared types)
  isActive: boolean;
  roles?: string[]; // All assigned roles for multi-role support
  createdAt: Date;
  updatedAt: Date;
  name?: string; // Additional property for compatibility
  permissions?: string[]; // Additional property for compatibility
}

export interface UserRole {
  userId: string;
  projectId: string;
  role: string;
  permissions: string[];
}

export interface UserSession {
  sessionToken: 'REDACTED';
  expiresAt: Date;
}

export interface AuthContext {
  user: User;
  roles: UserRole[];
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  auth?: AuthContext;
}
