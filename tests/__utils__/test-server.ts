/**
 * Test Server Utilities
 *
 * Utilities for managing test server lifecycle in integration tests.
 * Provides helpers for starting, stopping, and resetting the API server.
 */

import { Server } from 'http';

export interface TestServer {
  app: any;
  server: Server;
  baseURL: string;
  port: number;
}

let activeTestServer: TestServer | null = null;

/**
 * Create and start a test server
 *
 * @param options - Server configuration options
 * @returns Test server instance
 *
 * @example
 * beforeAll(async () => {
 *   testServer = await createTestServer();
 * });
 */
export async function createTestServer(
  options: {
    port?: number;
    env?: 'test' | 'development';
  } = {}
): Promise<TestServer> {
  const port = options.port || 0; // 0 = random available port
  const env = options.env || 'test';

  // Set test environment
  process.env.NODE_ENV = env;

  // Import app (this will be project-specific)
  // Example: import { createApp } from '@/apps/api-gateway/src/main';
  // const app = await createApp();

  // For now, this is a placeholder that should be customized per project
  throw new Error(
    'createTestServer must be customized with your application entry point'
  );

  // Example implementation:
  // const server = app.listen(port);
  // const actualPort = server.address().port;
  //
  // activeTestServer = {
  //   app,
  //   server,
  //   baseURL: `http://localhost:${actualPort}`,
  //   port: actualPort,
  // };
  //
  // console.log(`✅ [SERVER] Test server started on port ${actualPort}`);
  // return activeTestServer;
}

/**
 * Stop and cleanup test server
 *
 * @example
 * afterAll(async () => {
 *   await stopTestServer();
 * });
 */
export async function stopTestServer(): Promise<void> {
  if (!activeTestServer) {
    return;
  }

  return new Promise((resolve, reject) => {
    activeTestServer!.server.close((err) => {
      if (err) {
        console.error('❌ [SERVER] Error stopping test server:', err);
        reject(err);
      } else {
        console.log('✅ [SERVER] Test server stopped');
        activeTestServer = null;
        resolve();
      }
    });
  });
}

/**
 * Get active test server
 *
 * @returns Active test server instance
 * @throws Error if server is not running
 */
export function getTestServer(): TestServer {
  if (!activeTestServer) {
    throw new Error('Test server not started. Call createTestServer() first.');
  }
  return activeTestServer;
}

/**
 * Wait for server to be ready
 *
 * Polls the health endpoint until server is responsive
 *
 * @param options - Configuration options
 * @returns Promise that resolves when server is ready
 *
 * @example
 * await createTestServer();
 * await waitForServerReady({ healthPath: '/api/health' });
 */
export async function waitForServerReady(
  options: {
    healthPath?: string;
    timeout?: number;
    interval?: number;
  } = {}
): Promise<void> {
  const {
    healthPath = '/health',
    timeout = 30000,
    interval = 100,
  } = options;

  const server = getTestServer();
  const healthURL = `${server.baseURL}${healthPath}`;
  const startTime = Date.now();

  while (true) {
    try {
      const response = await fetch(healthURL);
      if (response.ok) {
        console.log('✅ [SERVER] Server is ready');
        return;
      }
    } catch (error) {
      // Server not ready yet
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`Server did not become ready within ${timeout}ms`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Reset server state between tests
 *
 * Useful for clearing in-memory caches, resetting mocks, etc.
 *
 * @example
 * afterEach(async () => {
 *   await resetTestServer();
 * });
 */
export async function resetTestServer(): Promise<void> {
  // Implementation depends on your application
  // Example: Clear Redis cache, reset in-memory state, etc.
  console.log('ℹ️  [SERVER] Resetting test server state...');

  // TODO: Customize this based on your application needs
  // Example:
  // const server = getTestServer();
  // await server.app.redis.flushdb();
  // await server.app.cache.clear();

  console.log('✅ [SERVER] Test server state reset');
}
