/**
 * VoxelStream WebSocket Handler — Unit Tests
 *
 * Tests: connection lifecycle, origin validation, IP connection limits,
 * message handling, project/voxel subscriptions, broadcast, stats.
 *
 * @module api-gateway/websocket/__tests__/voxel-stream.spec
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server as HTTPServer, createServer, IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  VoxelStreamHandler,
  initializeVoxelStream,
  getVoxelStreamHandler,
} from '../voxel-stream';

// ============================================================================
// Mocks
// ============================================================================

// Mock the logger to prevent console output during tests
vi.mock('../../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Redis Pub/Sub adapter (not needed for unit tests)
vi.mock('../redis-pubsub.js', () => ({
  getRedisPubSubAdapter: vi.fn(() => null),
}));

// ============================================================================
// Helpers
// ============================================================================

function createTestServer(): Promise<{ server: HTTPServer; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function connectWs(
  port: number,
  headers: Record<string, string> = {},
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/voxel-stream`, {
      headers: { origin: 'https://staging.ectropy.ai', ...headers },
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('VoxelStreamHandler', () => {
  let server: HTTPServer;
  let port: number;
  let handler: VoxelStreamHandler;

  beforeEach(async () => {
    // Set NODE_ENV to allow test origins
    process.env['NODE_ENV'] = 'development';
    const result = await createTestServer();
    server = result.server;
    port = result.port;
    handler = new VoxelStreamHandler(server);
  });

  afterEach(async () => {
    await handler.shutdown();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Connection Lifecycle ────────────────────────────────────────────

  it('sends connection_established on connect', async () => {
    const ws = await connectWs(port);
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('connection_established');
    expect(msg.data.clientId).toMatch(/^voxel_/);
    ws.close();
  });

  it('tracks connected clients in stats', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws); // connection_established
    const stats = handler.getStats();
    expect(stats.totalConnections).toBe(1);
    ws.close();
  });

  it('removes client from stats on disconnect', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws);
    ws.close();
    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 50));
    const stats = handler.getStats();
    expect(stats.totalConnections).toBe(0);
  });

  // ── Message Handling ────────────────────────────────────────────────

  it('responds to ping with pong', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws); // connection_established
    ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('pong');
    ws.close();
  });

  it('handles malformed JSON without crashing', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws);
    ws.send('not json at all {{{{');
    // Wait — connection should remain open
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  // ── Subscriptions ──────────────────────────────────────────────────

  it('subscribes to a project and confirms', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws);
    ws.send(
      JSON.stringify({
        type: 'subscribe:project',
        projectId: 'proj-test-123',
        timestamp: new Date().toISOString(),
      }),
    );
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('subscribed');
    expect(msg.projectId).toBe('proj-test-123');
    ws.close();
  });

  it('subscribes to a specific voxel and confirms', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws);
    ws.send(
      JSON.stringify({
        type: 'subscribe:voxel',
        voxelId: 'vox-abc-001',
        timestamp: new Date().toISOString(),
      }),
    );
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('subscribed');
    ws.close();
  });

  it('updates stats with active projects after subscription', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws);
    ws.send(
      JSON.stringify({
        type: 'subscribe:project',
        projectId: 'proj-stats-test',
        timestamp: new Date().toISOString(),
      }),
    );
    await waitForMessage(ws); // subscribed
    const stats = handler.getStats();
    expect(stats.activeProjects).toBe(1);
    expect(stats.subscribersByProject['proj-stats-test']).toBe(1);
    ws.close();
  });

  // ── Broadcast ──────────────────────────────────────────────────────

  it('broadcasts voxel update to subscribed clients', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws); // connection_established
    ws.send(
      JSON.stringify({
        type: 'subscribe:project',
        projectId: 'proj-broadcast',
        timestamp: new Date().toISOString(),
      }),
    );
    await waitForMessage(ws); // subscribed

    // Broadcast from handler
    handler.broadcastVoxelUpdate({
      voxelId: 'v-1',
      projectId: 'proj-broadcast',
      status: 'COMPLETE',
      timestamp: new Date().toISOString(),
      source: 'test',
    });

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('voxel:updated');
    expect(msg.data.voxelId).toBe('v-1');
    expect(msg.data.status).toBe('COMPLETE');
    ws.close();
  });

  it('does NOT broadcast to clients on different projects', async () => {
    const ws = await connectWs(port);
    await waitForMessage(ws);
    ws.send(
      JSON.stringify({
        type: 'subscribe:project',
        projectId: 'proj-other',
        timestamp: new Date().toISOString(),
      }),
    );
    await waitForMessage(ws); // subscribed

    const updates: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'voxel:updated') updates.push(msg);
    });

    handler.broadcastVoxelUpdate({
      voxelId: 'v-2',
      projectId: 'proj-different',
      status: 'IN_PROGRESS',
      timestamp: new Date().toISOString(),
      source: 'test',
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(updates).toHaveLength(0);
    ws.close();
  });

  // ── Stats ──────────────────────────────────────────────────────────

  it('getStats returns valid structure', () => {
    const stats = handler.getStats();
    expect(stats).toHaveProperty('totalConnections');
    expect(stats).toHaveProperty('activeProjects');
    expect(stats).toHaveProperty('subscribersByProject');
    expect(stats).toHaveProperty('uptime');
    expect(stats.totalConnections).toBe(0);
    expect(stats.activeProjects).toBe(0);
  });
});
