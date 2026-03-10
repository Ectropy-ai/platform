/**
 * Adapter Startup
 *
 * Initializes and registers all context adapters with the
 * ContextRegistry at server startup. Called once from main.ts.
 *
 * Currently registers:
 * - PlatformContextAdapter (reads .roadmap/ JSON)
 *
 * Future:
 * - ConstructionContextAdapter (reads Prisma DB)
 *
 * @module adapters/startup
 * @version 1.0.0
 */

import { ContextRegistry } from './context-registry.js';
import { PlatformContextAdapter } from './platform/platform-context.adapter.js';

/**
 * Initialize and register all context adapters.
 *
 * @returns Summary of registered adapters
 * @throws If a required adapter fails to initialize
 */
export async function initializeAdapters(): Promise<{
  registered: string[];
  failed: string[];
}> {
  const registry = ContextRegistry.getInstance();
  const registered: string[] = [];
  const failed: string[] = [];

  // Register Platform Context Adapter
  try {
    const platformAdapter = new PlatformContextAdapter({
      domainId: 'platform',
      enableCache: true,
      cacheTTL: 300_000, // 5 minutes
    });

    await registry.register(platformAdapter);
    registered.push('platform');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to register platform adapter: ${message}`);
    failed.push('platform');
  }

  return { registered, failed };
}
