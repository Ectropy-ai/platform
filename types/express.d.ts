// Enhanced Express types for enterprise applications
import 'express';
import { PermissionLevel } from '../apps/api-gateway/src/middleware/authorization.middleware';

declare global {
  namespace Express {
    interface User {
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
    }
  }
}

/**
 * Project data from database
 */
export interface ProjectData {
  id: string;
  owner_id: string;
  name: string;
}

/**
 * Project membership data from database
 * Matches canonical type in libs/shared/types/src/express.ts
 */
export interface ProjectMembership {
  project_id: string;
  user_id: string;
  role: string;
  permissions: string[];
  created_at: Date;
}

/**
 * Speckle stream data from database
 */
export interface SpeckleStreamData {
  id: string;
  construction_project_id: string;
  owner_id: string;
  project_name: string;
}

/**
 * Session user data structure
 */
export interface SessionUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  roles?: string[];
  is_platform_admin?: boolean;
  tenant_id?: string;
}

/**
 * Express session with user data
 */
export interface ExpressSession {
  user?: SessionUser;
}

declare module 'express-serve-static-core' {
  interface Request {
    sessionId?: string;
    requestId?: string;
    user?: Express.User;
    session?: ExpressSession;
    project?: ProjectData;
    projectMembership?: ProjectMembership;
    projectPermission?: PermissionLevel;
    stream?: SpeckleStreamData;
    demoSession?: {
      sessionId: string;
      analytics: {
        interactionCount: number;
        timeSpent: number;
      };
    };
  }
}
