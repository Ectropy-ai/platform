/**
 * Permission Level Enum
 *
 * ENTERPRISE PATTERN: Separate enum from module augmentation to prevent circular dependencies
 *
 * Used for authorization middleware to validate user access levels to projects
 *
 * SECURITY: Type-safe permission checking prevents privilege escalation
 *
 * USAGE:
 * import { PermissionLevel } from '@ectropy/shared/types';
 * requireProjectAccess(PermissionLevel.WRITE)
 */

/**
 * Permission levels for project access
 * ENTERPRISE: Enum allows use as both type and runtime value
 *
 * Hierarchy:
 * - READ: View-only access to project data
 * - WRITE: Can modify project data and resources
 * - ADMIN: Full control including member management
 */
export enum PermissionLevel {
  READ = 'READ',
  WRITE = 'WRITE',
  ADMIN = 'ADMIN',
}

/**
 * Type-safe string literal union for cases where enum can't be used
 * (e.g., webpack bundling issues in browser environments)
 */
export type PermissionLevelString = 'READ' | 'WRITE' | 'ADMIN';
