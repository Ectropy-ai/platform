/**
 * ================================================
 * ENTERPRISE AUTHORIZATION MIDDLEWARE
 * ================================================
 * Purpose: Enforce project ownership and role-based access control
 * Security Standards: OWASP Top 10 - A01:2021 Broken Access Control
 * Author: Claude (Enterprise Integration)
 * Date: 2025-11-14
 * ================================================
 */

import { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { pool as defaultPool } from '../database/connection';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// ENTERPRISE: Import centralized types - no local interface declarations
import type {
  User,
  ProjectData,
  ProjectMembership,
  SpeckleStreamData,
} from '@ectropy/shared/types';
import { PermissionLevel } from '@ectropy/shared/types';

/**
 * Authorization database pool — injectable for DatabaseManager unification
 *
 * PRODUCTION READINESS FIX (2026-03-01): Dependency injection pattern
 * ROOT CAUSE: Authorization middleware hardcoded pool import, preventing
 * migration to Phase 4 DatabaseManager. This module-level variable defaults
 * to the legacy pool but can be overridden at startup via setAuthPool().
 *
 * Migration path:
 *   Phase 1 (now): DI pattern — setAuthPool() available, defaults to legacy pool
 *   Phase 2 (future): Wire DatabaseManager shared-trials client at bootstrap
 */
let authPool: Pool = defaultPool;

/**
 * Set the database pool used by authorization middleware.
 * Call at application startup to unify with DatabaseManager.
 *
 * @param pool - PostgreSQL pool instance (from connection.ts or DatabaseManager)
 */
export function setAuthPool(pool: Pool): void {
  authPool = pool;
  logger.info('Authorization middleware pool updated', {
    poolTotalCount: pool.totalCount,
    poolIdleCount: pool.idleCount,
  });
}

/**
 * User roles in Ectropy platform
 * Matches Prisma schema: schema.prisma UserRole enum
 */
export enum UserRole {
  OWNER = 'owner',
  ARCHITECT = 'architect',
  CONTRACTOR = 'contractor',
  ENGINEER = 'engineer',
  CONSULTANT = 'consultant',
  INSPECTOR = 'inspector',
  SITE_MANAGER = 'site_manager',
  ADMIN = 'admin',
}

/**
 * Permission levels re-exported from centralized types
 */
export { PermissionLevel };

/**
 * Authorization event details for audit logging
 */
export interface AuthorizationEventDetails {
  [key: string]: unknown;
}

/**
 * Check if user is authenticated
 * Also extracts user from session if req.user is not already set
 * Returns 401 if not authenticated
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ENTERPRISE FIX (2025-12-22): Passport.js stores user in req.user via deserializeUser
  // The user is populated by Passport session middleware automatically
  // We should rely on req.user, not manually extract from session

  // Check if user is authenticated (Passport sets req.user via deserializeUser)
  const user = req.user;

  // Final check: must have authenticated user
  if (!user || !user.id) {
    // Log for debugging (helps diagnose auth issues in production)
    logger.debug('🚫 [AUTH] Authentication required', {
      path: req.path,
      method: req.method,
      hasSession: !!req.session,
      hasPassportUser: !!(req.session as any)?.passport?.user,
      headers: {
        cookie: req.headers.cookie ? 'present' : 'missing',
        origin: req.headers.origin,
      },
    });

    res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
    });
    return;
  }

  next();
}

/**
 * Check if user has required role(s)
 * Returns 403 if user doesn't have any of the required roles
 *
 * @param allowedRoles - Array of roles that can access this resource
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // ENTERPRISE FIX (2025-12-22): Rely on Passport's req.user, not manual session extraction
    const user = req.user;

    if (!user || !user.id) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource',
      });
      return;
    }

    // Check if user has any of the allowed roles
    const hasRole = allowedRoles.some((role) => user?.roles?.includes(role));

    if (!hasRole) {
      logger.debug('🚫 [AUTH] Insufficient permissions', {
        path: req.path,
        method: req.method,
        userId: user.id,
        userRoles: user.roles || [],
        requiredRoles: allowedRoles,
      });

      res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        requiredRoles: allowedRoles,
        userRoles: user?.roles || [],
      });
      return;
    }

    next();
  };
}

/**
 * Check if user has access to a specific project
 * Validates:
 * 1. Project exists
 * 2. User is project owner OR member with sufficient permission level
 *
 * ENTERPRISE FIX: Enum default parameter values cause webpack bundling issues
 * Solution: Use string literal union type, map to enum inside function body
 * @param permissionLevel - Minimum permission level required (defaults to 'READ')
 */
export function requireProjectAccess(
  permissionLevel?: 'READ' | 'WRITE' | 'ADMIN'
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // ENTERPRISE FIX: Use string literals instead of enum to avoid webpack bundling issues
    // Issue: localhost-architecture-fixes.json - PermissionLevel enum undefined in bundled code
    const level = permissionLevel || 'READ';
    // Use string values directly instead of enum (which may be undefined in webpack bundle)
    const enumLevel = level; // 'READ' | 'WRITE' | 'ADMIN'

    // ENTERPRISE FIX (2025-12-22): Rely on Passport's req.user, not manual session extraction
    const user = req.user;
    const projectId = req.params.projectId;

    if (!user || !user.id) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource',
      });
      return;
    }

    if (!projectId) {
      res.status(400).json({
        error: 'Missing project ID',
        message: 'Project ID is required in the URL',
      });
      return;
    }

    try {
      // Check if project exists and get all required fields
      // ENTERPRISE FIX: Removed "location" column - doesn't exist in projects table (Prisma schema)
      const projectQuery = await authPool.query(
        `SELECT id, owner_id, name, description, status, created_at, updated_at
         FROM projects WHERE id = $1`,
        [projectId]
      );

      if (projectQuery.rows.length === 0) {
        res.status(404).json({
          error: 'Project not found',
          message: `Project with ID ${projectId} does not exist`,
        });
        return;
      }

      const projectRow = projectQuery.rows[0];
      const projectData: ProjectData = {
        id: projectRow.id,
        name: projectRow.name,
        description: projectRow.description,
        status: projectRow.status,
        created_at: projectRow.created_at,
        updated_at: projectRow.updated_at,
      };

      // Check if user is project owner (owners have full access)
      if (projectRow.owner_id === user.id) {
        req.project = projectData;
        req.projectPermission = 'ADMIN'; // ENTERPRISE FIX: Use string literal instead of enum
        next();
        return;
      }

      // Check if user is project member with sufficient permissions
      // Canonical table: project_roles (Prisma @@map("project_roles"))
      const memberQuery = await authPool.query(
        `SELECT project_id, user_id, role, permissions, is_active, assigned_at
         FROM project_roles
         WHERE project_id = $1 AND user_id = $2 AND is_active = true`,
        [projectId, user.id]
      );

      if (memberQuery.rows.length === 0) {
        res.status(403).json({
          error: 'Access denied',
          message: `You do not have access to project: ${projectData.name}`,
          projectId,
        });
        return;
      }

      const memberRow = memberQuery.rows[0];
      const membership: ProjectMembership = {
        project_id: memberRow.project_id,
        user_id: memberRow.user_id,
        role: memberRow.role,
        permissions: memberRow.permissions || [],
        created_at: memberRow.assigned_at,
      };
      // Derive permission level from permissions array (project_roles stores string[])
      const permissionLevelStr = permissionsArrayToLevel(
        memberRow.permissions
      );

      // Validate permission level
      const hasPermission = validatePermissionLevel(
        permissionLevelStr,
        enumLevel
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires ${enumLevel} access, but you only have ${permissionLevelStr} access`,
          required: enumLevel,
          actual: permissionLevelStr,
        });
        return;
      }

      // Attach project and membership info to request
      req.project = projectData;
      req.projectMembership = membership;
      req.projectPermission = permissionLevelStr;

      next();
    } catch (error) {
      logger.error('Project authorization check failed:', error);
      res.status(500).json({
        error: 'Authorization check failed',
        message: 'Could not verify project access',
      });
    }
  };
}

/**
 * Derive permission level from project_roles permissions array.
 * Matches project.service.ts: owners get ['admin','read','write','delete','manage_members']
 */
function permissionsArrayToLevel(permissions: string[]): 'READ' | 'WRITE' | 'ADMIN' {
  if (!permissions || permissions.length === 0) return 'READ';
  if (permissions.includes('admin')) return 'ADMIN';
  if (permissions.includes('write')) return 'WRITE';
  return 'READ';
}

/**
 * Validate if user's permission level meets requirement
 *
 * Permission hierarchy: ADMIN > WRITE > READ
 */
function validatePermissionLevel(
  userLevel: string,
  requiredLevel: string // ENTERPRISE FIX: Use string instead of PermissionLevel enum
): boolean {
  // ENTERPRISE FIX: Use hardcoded string literals to avoid webpack bundling issues
  // Issue: localhost-architecture-fixes.json - PermissionLevel enum undefined in bundled code
  const hierarchy: Record<string, number> = {
    'READ': 1,
    'WRITE': 2,
    'ADMIN': 3,
  };

  const userLevelValue = hierarchy[userLevel] || 0;
  const requiredLevelValue = hierarchy[requiredLevel] || 0;

  return userLevelValue >= requiredLevelValue;
}

/**
 * Check if user owns a specific Speckle stream
 * Validates through speckle_streams table
 */
export function requireStreamAccess() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // ENTERPRISE FIX (2025-12-22): Rely on Passport's req.user, not manual session extraction
    const user = req.user;
    const streamId = req.params.streamId;

    if (!user || !user.id) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource',
      });
      return;
    }

    if (!streamId) {
      res.status(400).json({
        error: 'Missing stream ID',
        message: 'Stream ID is required in the URL',
      });
      return;
    }

    try {
      // Get Speckle stream with project information
      const streamQuery = await authPool.query(
        `SELECT
          ss.stream_id as id,
          ss.name,
          ss.description,
          ss.is_public as "isPublic",
          ss.created_at as "createdAt",
          ss.updated_at as "updatedAt",
          ss.construction_project_id,
          p.owner_id,
          p.name as project_name
         FROM speckle_streams ss
         JOIN projects p ON p.id = ss.construction_project_id
         WHERE ss.stream_id = $1`,
        [streamId]
      );

      if (streamQuery.rows.length === 0) {
        res.status(404).json({
          error: 'Stream not found',
          message: `Speckle stream with ID ${streamId} does not exist`,
        });
        return;
      }

      const row = streamQuery.rows[0];
      const streamData: SpeckleStreamData = {
        id: row.id,
        name: row.name,
        description: row.description,
        isPublic: row.isPublic,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      // Check if user is project owner
      if (row.owner_id === user.id) {
        req.stream = streamData;
        next();
        return;
      }

      // Check if user is project member (only need to verify membership exists)
      const memberQuery = await authPool.query(
        `SELECT 1 FROM project_roles
         WHERE project_id = $1 AND user_id = $2 AND is_active = true`,
        [row.construction_project_id, user.id]
      );

      if (memberQuery.rows.length === 0) {
        res.status(403).json({
          error: 'Access denied',
          message: `You do not have access to this stream's project: ${row.project_name}`,
        });
        return;
      }

      req.stream = streamData;
      next();
    } catch (error) {
      logger.error('Stream authorization check failed:', error);
      res.status(500).json({
        error: 'Authorization check failed',
        message: 'Could not verify stream access',
      });
    }
  };
}

/**
 * Admin-only middleware
 * Only platform administrators can access
 */
export function requireAdmin() {
  return requireRole([UserRole.ADMIN]);
}

/**
 * Audit log helper
 * Log authorization events for security monitoring
 */
export function logAuthorizationEvent(
  user: User | undefined,
  action: string,
  resource: string,
  granted: boolean,
  details?: AuthorizationEventDetails
): void {
  const event = {
    timestamp: new Date().toISOString(),
    userId: user?.id || 'anonymous',
    action,
    resource,
    granted,
    details,
  };

  // TODO: Send to centralized logging system (e.g., CloudWatch, Datadog)
  logger.info('Authorization event:', event);
}

// Export all middleware functions
export default {
  requireAuth,
  requireRole,
  requireProjectAccess,
  requireStreamAccess,
  requireAdmin,
  logAuthorizationEvent,
  setAuthPool,
  UserRole,
  PermissionLevel,
};
