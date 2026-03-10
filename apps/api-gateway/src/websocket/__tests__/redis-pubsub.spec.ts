/**
 * Redis Pub/Sub Adapter Integration Tests
 *
 * Tests for the horizontal WebSocket scaling adapter that distributes
 * messages across multiple API Gateway instances via Redis Pub/Sub.
 *
 * @module api-gateway/websocket/__tests__/redis-pubsub.spec
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  RedisPubSubAdapter,
  createRedisPubSubAdapter,
  type RedisPubSubConfig,
  type RedisPubSubMessage,
  type VoxelUpdateEvent,
  type ActivityEvent,
} from '../redis-pubsub';

// ============================================================================
// Mocks
// ============================================================================

/**
 * Create a mock Redis client for testing
 */
function createMockRedis(): Partial<Redis> & {
  _handlers: Map<string, Function>;
  _triggerMessage: (channel: string, message: string) => void;
} {
  const handlers = new Map<string, Function>();
  const subscriptions = new Set<string>();

  return {
    _handlers: handlers,
    _triggerMessage: (channel: string, message: string) => {
      const handler = handlers.get('message');
      if (handler) {
        handler(channel, message);
      }
    },
    status: 'ready',
    on: vi.fn((event: string, callback: Function) => {
      handlers.set(event, callback);
      if (event === 'connect') {
        // Immediately trigger connect
        setTimeout(() => callback(), 0);
      }
      return this;
    }),
    subscribe: vi.fn(async (...channels: string[]) => {
      channels.forEach(ch => subscriptions.add(ch));
      const handler = handlers.get('subscribe');
      if (handler) {
        channels.forEach(ch => handler(ch, subscriptions.size));
      }
      return subscriptions.size;
    }),
    unsubscribe: vi.fn(async (...channels: string[]) => {
      channels.forEach(ch => subscriptions.delete(ch));
      const handler = handlers.get('unsubscribe');
      if (handler) {
        channels.forEach(ch => handler(ch, subscriptions.size));
      }
      return subscriptions.size;
    }),
    publish: vi.fn(async (_channel: string, _message: string) => {
      return 1;
    }),
    duplicate: vi.fn(() => createMockRedis()),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('RedisPubSubAdapter', () => {
  let adapter: RedisPubSubAdapter;
  let mockPublisher: ReturnType<typeof createMockRedis>;
  let mockSubscriber: ReturnType<typeof createMockRedis>;
  let receivedMessages: Array<{ channel: string; message: RedisPubSubMessage }>;

  beforeEach(() => {
    mockPublisher = createMockRedis();
    mockSubscriber = createMockRedis();
    receivedMessages = [];

    adapter = createRedisPubSubAdapter({
      publisher: mockPublisher as unknown as Redis,
      subscriber: mockSubscriber as unknown as Redis,
      instanceId: 'test-instance-1',
      onMessage: (channel, message) => {
        receivedMessages.push({ channel, message });
      },
      verbose: false,
    });
  });

  afterEach(() => {
    adapter.shutdown();
  });

  describe('initialization', () => {
    it('should create adapter with correct instance ID', () => {
      const stats = adapter.getStats();
      expect(stats.instanceId).toBe('test-instance-1');
    });

    it('should subscribe to global channel on init', () => {
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('voxel:broadcast:all');
    });

    it('should report connected status when subscriber is ready', () => {
      expect(adapter.isAdapterConnected()).toBe(true);
    });
  });

  describe('project subscriptions', () => {
    it('should subscribe to project update and activity channels', async () => {
      await adapter.subscribeToProject('proj-123');

      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('voxel:project:proj-123:updates');
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('voxel:project:proj-123:activity');
    });

    it('should unsubscribe from project channels', async () => {
      await adapter.subscribeToProject('proj-123');
      await adapter.unsubscribeFromProject('proj-123');

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('voxel:project:proj-123:updates');
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('voxel:project:proj-123:activity');
    });
  });

  describe('publishing', () => {
    it('should publish voxel update to correct channel', async () => {
      const update: VoxelUpdateEvent = {
        voxelId: 'VOX-001',
        projectId: 'proj-123',
        status: 'IN_PROGRESS',
        previousStatus: 'PLANNED',
        timestamp: new Date().toISOString(),
        source: 'API',
      };

      const result = await adapter.publishVoxelUpdate(update);

      expect(result).toBe(true);
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'voxel:project:proj-123:updates',
        expect.stringContaining('"type":"voxel:updated"')
      );
    });

    it('should publish batch update with correct type', async () => {
      const updates: VoxelUpdateEvent[] = [
        { voxelId: 'VOX-001', projectId: 'proj-123', status: 'COMPLETE', timestamp: '' },
        { voxelId: 'VOX-002', projectId: 'proj-123', status: 'COMPLETE', timestamp: '' },
      ];

      await adapter.publishBatchUpdate('proj-123', updates);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'voxel:project:proj-123:updates',
        expect.stringContaining('"type":"voxel:batch_updated"')
      );
    });

    it('should publish activity event to activity channel', async () => {
      const activity: ActivityEvent = {
        id: 'act-001',
        projectId: 'proj-123',
        type: 'status_change',
        title: 'Test Activity',
        timestamp: new Date().toISOString(),
      };

      await adapter.publishActivity(activity);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'voxel:project:proj-123:activity',
        expect.stringContaining('"type":"activity:new"')
      );
    });
  });

  describe('message handling', () => {
    it('should call onMessage for messages from other instances', () => {
      const message: RedisPubSubMessage = {
        type: 'voxel:updated',
        instanceId: 'other-instance',
        timestamp: new Date().toISOString(),
        payload: { voxelId: 'VOX-001', projectId: 'proj-123', status: 'COMPLETE' },
      };

      mockSubscriber._triggerMessage(
        'voxel:project:proj-123:updates',
        JSON.stringify(message)
      );

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].channel).toBe('voxel:project:proj-123:updates');
      expect(receivedMessages[0].message.type).toBe('voxel:updated');
    });

    it('should skip messages from same instance (no echo)', () => {
      const message: RedisPubSubMessage = {
        type: 'voxel:updated',
        instanceId: 'test-instance-1', // Same as adapter
        timestamp: new Date().toISOString(),
        payload: { voxelId: 'VOX-001' },
      };

      mockSubscriber._triggerMessage(
        'voxel:project:proj-123:updates',
        JSON.stringify(message)
      );

      expect(receivedMessages).toHaveLength(0);
    });

    it('should handle malformed messages gracefully', () => {
      mockSubscriber._triggerMessage('voxel:project:proj-123:updates', 'not-json');

      expect(receivedMessages).toHaveLength(0);
      // Should not throw
    });
  });

  describe('statistics', () => {
    it('should track message counts', async () => {
      await adapter.publishVoxelUpdate({
        voxelId: 'VOX-001',
        projectId: 'proj-123',
        status: 'COMPLETE',
        timestamp: '',
      });

      const stats = adapter.getStats();
      expect(stats.messagesPublished).toBe(1);
    });

    it('should track subscribed channels', async () => {
      await adapter.subscribeToProject('proj-123');

      const stats = adapter.getStats();
      expect(stats.subscribedChannels).toBeGreaterThanOrEqual(2);
    });
  });

  describe('shutdown', () => {
    it('should unsubscribe from all channels on shutdown', async () => {
      await adapter.subscribeToProject('proj-123');
      await adapter.shutdown();

      expect(adapter.isAdapterConnected()).toBe(false);
    });
  });
});

describe('RedisPubSubAdapter - Integration Scenarios', () => {
  it('should support cross-instance voxel update broadcast', async () => {
    // Simulate two API gateway instances
    const instance1Messages: RedisPubSubMessage[] = [];
    const instance2Messages: RedisPubSubMessage[] = [];

    const mockRedis1Pub = createMockRedis();
    const mockRedis1Sub = createMockRedis();
    const mockRedis2Pub = createMockRedis();
    const mockRedis2Sub = createMockRedis();

    const adapter1 = createRedisPubSubAdapter({
      publisher: mockRedis1Pub as unknown as Redis,
      subscriber: mockRedis1Sub as unknown as Redis,
      instanceId: 'gateway-1',
      onMessage: (_ch, msg) => instance1Messages.push(msg),
    });

    const adapter2 = createRedisPubSubAdapter({
      publisher: mockRedis2Pub as unknown as Redis,
      subscriber: mockRedis2Sub as unknown as Redis,
      instanceId: 'gateway-2',
      onMessage: (_ch, msg) => instance2Messages.push(msg),
    });

    // Instance 1 publishes an update
    await adapter1.publishVoxelUpdate({
      voxelId: 'VOX-001',
      projectId: 'proj-123',
      status: 'COMPLETE',
      timestamp: new Date().toISOString(),
    });

    // Simulate Redis routing the message to instance 2's subscriber
    const publishedMessage = (mockRedis1Pub.publish as ReturnType<typeof vi.fn>).mock.calls[0][1];
    mockRedis2Sub._triggerMessage('voxel:project:proj-123:updates', publishedMessage);

    // Instance 2 should receive the message
    expect(instance2Messages).toHaveLength(1);
    expect(instance2Messages[0].type).toBe('voxel:updated');

    // Cleanup
    adapter1.shutdown();
    adapter2.shutdown();
  });
});
