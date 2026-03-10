/**
 * Express.js Type Augmentation for @ectropy/database Package
 *
 * Purpose: Provide minimal Express type augmentations for package isolation during CI builds
 *
 * Pattern: Package-local type declarations enable independent compilation without external dependencies
 * - Local builds: TypeScript merges with canonical types from libs/shared/types/src/express.ts
 * - CI builds: Package compiles independently using these minimal type definitions
 *
 * NOTE: This file defines MINIMAL types required by tenant-resolution middleware only.
 * Full canonical types are in libs/shared/types/src/express.ts (root-level, not accessible during CI).
 *
 * Architecture: Enterprise monorepo pattern - packages must be self-contained for true isolation
 */

import type { PrismaClient as SharedPrismaClient } from '@prisma/client-shared';

/**
 * Minimal User type for database package
 * Must be structurally compatible with libs/shared/types/src/express.ts User interface
 */
export interface MinimalUser {
  id: string;
  email?: string;
  tenant_id?: string;
  [key: string]: any;
}

/**
 * Tenant Resolution Strategy (defined in tenant-resolution.ts)
 */
export type TenantResolutionStrategy =
  | 'HEADER'
  | 'JWT_CLAIM'
  | 'API_KEY'
  | 'SUBDOMAIN';

/**
 * Express Request augmentation for database package
 * Extends Express.Request with properties added by database middleware
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user information
       * Set by authentication middleware before database middleware
       * NOTE: Minimal type for package isolation - full type in libs/shared/types/src/express.ts
       */
      user?: MinimalUser;

      /**
       * Resolved tenant ID for the current request
       * Set by tenant resolution middleware
       */
      tenantId?: string;

      /**
       * Tenant-scoped database client with RLS enforcement
       * Set by tenant resolution middleware
       */
      tenantDb?: SharedPrismaClient;

      /**
       * Strategy used to resolve tenant (for debugging/logging)
       * Set by tenant resolution middleware
       */
      tenantResolutionStrategy?: TenantResolutionStrategy;
    }
  }
}

// Export to make this a module (required for global augmentation)
export {};
