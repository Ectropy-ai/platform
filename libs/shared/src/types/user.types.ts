/**
 * User-related types for the Ectropy platform
 *
 * NOTE: Base User interface is exported from libs/shared/src/types/index.ts
 * This file contains supplementary user-related types only
 */

import type { User } from './index.js';

export interface UserProfile extends User {
  avatar?: string;
  bio?: string;
  company?: string;
  phone?: string;
}

export interface UserPermission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: UserPermission[];
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface UserCreateRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roles?: string[];
}

export interface UserUpdateRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  roles?: string[];
  isActive?: boolean;
}
