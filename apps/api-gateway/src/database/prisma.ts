/**
 * Shared Prisma Client Singleton
 *
 * ENTERPRISE PATTERN: Single Prisma Client instance across the application
 * - Prevents connection pool exhaustion
 * - Ensures proper connection management
 * - Follows Prisma best practices
 *
 * Related: ROOT CAUSE - OAuth endpoint failures due to multiple Prisma instances
 * - oauth.routes.ts, dashboard.routes.ts, admin.routes.ts all created separate instances
 * - This exhausted the database connection pool
 * - Caused 500 Internal Server Error responses
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Global singleton instance of Prisma Client
 * Prevents multiple instances from being created
 */
let prisma: PrismaClient;

/**
 * Get or create the shared Prisma Client instance
 * @returns Shared Prisma Client instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    logger.info('✨ Creating shared Prisma Client singleton instance');

    prisma = new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });

    // Log warnings and errors
    prisma.$on('warn' as never, (e: any) => {
      logger.warn('Prisma warning', { message: e.message });
    });

    prisma.$on('error' as never, (e: any) => {
      logger.error('Prisma error', { message: e.message });
    });

    logger.info('✅ Shared Prisma Client singleton created');
  }

  return prisma;
}

/**
 * Disconnect Prisma Client (for graceful shutdown)
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    logger.info('Disconnecting Prisma Client');
    await prisma.$disconnect();
    logger.info('✅ Prisma Client disconnected');
  }
}

// Export the function to get the shared instance
export { prisma as default };
