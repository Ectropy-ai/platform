/**
 * Express.js Type Augmentation for Ectropy Platform
 *
 * ENTERPRISE: Centralized type definitions for Express Request/Response/Session augmentation
 * This file extends Express interfaces to include custom properties used throughout the platform
 * for authentication, authorization, sessions, project context, and Speckle integration.
 *
 * USAGE: Import this module in any file that uses Express types:
 * import '@ectropy/shared/types/express';
 *
 * INTEGRATION: Automatically imported by libs/shared/types/src/index.ts
 */

import type { Session as ExpressSession, SessionData } from 'express-session';

/**
 * User interface for Express augmentation
 * NOTE: This references the User type exported from index.ts
 * No need to import/re-export here to avoid circular dependency
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: string;
  roles?: string[];
  is_platform_admin?: boolean;
  tenant_id?: string;
  createdAt: Date;
  updatedAt: Date;
  name?: string;
  permissions?: string[];
  provider?: string;
  organization?: string;
  expiresAt?: string;
  twoFactorEnabled?: boolean;
}

/**
 * Demo user roles for interactive demo environment
 */
type DemoUserRole = 'viewer' | 'tester' | 'admin';

/**
 * Platform stakeholder roles - matches api.types.ts
 * NOTE: DAO governance uses a separate DAOStakeholderRole type in dao-templates.ts
 */
type StakeholderRole =
  | 'architect'
  | 'engineer'
  | 'contractor'
  | 'owner'
  | 'admin'
  | 'viewer'
  | 'project_manager';

/**
 * Project data attached to Request by authorization middleware
 */
export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  status: string;
  location?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Project membership data attached to Request
 */
export interface ProjectMembership {
  project_id: string;
  user_id: string;
  role: StakeholderRole;
  permissions: string[];
  created_at: Date;
}

/**
 * Permission levels for project access
 * ENTERPRISE FIX: Import from separate file to prevent circular dependencies
 * See libs/shared/types/src/permission-level.ts for enum definition
 */
import {
  PermissionLevel,
  type PermissionLevelString,
} from './permission-level.js';
export { PermissionLevel, type PermissionLevelString };

/**
 * Speckle stream data attached to Request
 */
export interface SpeckleStreamData {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    /**
     * Express Request interface augmentation
     * Extends Express Request with all platform-specific properties
     */
    interface Request {
      /**
       * Authenticated user information
       * Set by authentication middleware after successful login
       */
      user?: User;

      /**
       * User permissions for the current request
       * Set by authorization middleware based on user roles and context
       */
      permissions?: string[];

      /**
       * Session identifier for tracking user sessions
       * Used for analytics, audit logging, and session management
       */
      sessionId?: string;

      /**
       * Request correlation ID for distributed tracing
       * Helps track requests across microservices
       */
      requestId?: string;

      /**
       * Project context data
       * Set by authorization middleware when accessing project-scoped endpoints
       */
      project?: ProjectData;

      /**
       * Project membership information
       * Set by authorization middleware to include user's role and permissions in project
       */
      projectMembership?: ProjectMembership;

      /**
       * User's permission level in the current project
       * Derived from projectMembership by authorization middleware
       * ENTERPRISE FIX: Use string union instead of enum to avoid webpack bundling issues
       */
      projectPermission?: 'READ' | 'WRITE' | 'ADMIN';

      /**
       * Speckle stream data
       * Set by authorization middleware when accessing Speckle stream endpoints
       */
      stream?: SpeckleStreamData;

      /**
       * Sanitized filename for file uploads
       * Set by OWASP security middleware after filename validation
       */
      sanitizedFilename?: string;

      /**
       * Demo session data for interactive demo environment
       * Used specifically for the demo tenant functionality
       */
      demoSession?: {
        id: string;
        sessionId: string;
        userId?: string;
        userRole: DemoUserRole;
        stakeholderRole: StakeholderRole;
        startTime: Date;
        lastActivity: Date;
        expiresAt: Date;
        ipAddress: string;
        userAgent: string;
        currentTourStep?: string;
        tourProgress: {
          architect?: number;
          engineer?: number;
          contractor?: number;
          owner?: number;
        };
        analytics: {
          pageViews: number;
          timeSpent: number;
          interactionCount: number;
          featuresUsed: string[];
        };
        preferences: {
          theme: 'light' | 'dark';
          language: string;
          showTutorials: boolean;
        };
      };
    }
  }
}

// This is a module augmentation file, so we need to export something
// to make TypeScript recognize it as a module
export {};
