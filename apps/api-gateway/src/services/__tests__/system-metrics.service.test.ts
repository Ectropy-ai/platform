/**
 * System Metrics Service Unit Tests
 *
 * Comprehensive tests for real-time system health monitoring
 *
 * Test Coverage:
 * - CPU metrics calculation
 * - Memory metrics (heap and system)
 * - Disk metrics with fallback
 * - Network metrics from Prometheus
 * - System status aggregation
 * - Service health checks
 *
 * @module services/__tests__/system-metrics.service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock os module
const mockCpus = vi.fn();
const mockLoadavg = vi.fn();
const mockTotalmem = vi.fn();
const mockFreemem = vi.fn();

vi.mock('os', () => ({
  cpus: () => mockCpus(),
  loadavg: () => mockLoadavg(),
  totalmem: () => mockTotalmem(),
  freemem: () => mockFreemem(),
}));

// Mock prom-client
const mockGetMetricsAsJSON = vi.fn();
vi.mock('prom-client', () => ({
  register: {
    getMetricsAsJSON: () => mockGetMetricsAsJSON(),
  },
  Counter: vi.fn(),
  Histogram: vi.fn(),
}));

// Mock child_process for disk metrics
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

// Mock logger
vi.mock('../../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  getCpuMetrics,
  getMemoryMetrics,
  getDiskMetrics,
  getNetworkMetrics,
  getSystemMetrics,
  getSystemStatus,
} from '../system-metrics.service';

describe('SystemMetricsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default CPU mock
    mockCpus.mockReturnValue([
      {
        model: 'Intel(R) Core(TM) i7-9750H',
        times: { user: 1000, nice: 0, sys: 500, idle: 8500, irq: 0 },
      },
      {
        model: 'Intel(R) Core(TM) i7-9750H',
        times: { user: 900, nice: 0, sys: 400, idle: 8700, irq: 0 },
      },
    ]);

    // Default load average mock
    mockLoadavg.mockReturnValue([1.5, 1.2, 0.9]);

    // Default memory mocks (8GB total, 4GB free)
    mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
    mockFreemem.mockReturnValue(4 * 1024 * 1024 * 1024);

    // Default Prometheus mock (empty metrics)
    mockGetMetricsAsJSON.mockResolvedValue([]);
  });

  // ===========================================================================
  // getCpuMetrics Tests
  // ===========================================================================
  describe('getCpuMetrics', () => {
    it('should return CPU metrics with correct structure', () => {
      const result = getCpuMetrics();

      expect(result).toHaveProperty('usage_percent');
      expect(result).toHaveProperty('cores');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('load_average');
      expect(result.load_average).toHaveProperty('1m');
      expect(result.load_average).toHaveProperty('5m');
      expect(result.load_average).toHaveProperty('15m');
    });

    it('should return correct number of cores', () => {
      mockCpus.mockReturnValue([
        { model: 'CPU', times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
        { model: 'CPU', times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
        { model: 'CPU', times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
        { model: 'CPU', times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
      ]);

      const result = getCpuMetrics();

      expect(result.cores).toBe(4);
    });

    it('should return CPU model from first core', () => {
      const result = getCpuMetrics();

      expect(result.model).toBe('Intel(R) Core(TM) i7-9750H');
    });

    it('should handle missing CPU model gracefully', () => {
      mockCpus.mockReturnValue([]);

      const result = getCpuMetrics();

      expect(result.model).toBe('Unknown');
    });

    it('should return load averages rounded to 2 decimal places', () => {
      mockLoadavg.mockReturnValue([1.5678, 1.2345, 0.9876]);

      const result = getCpuMetrics();

      expect(result.load_average['1m']).toBe(1.57);
      expect(result.load_average['5m']).toBe(1.23);
      expect(result.load_average['15m']).toBe(0.99);
    });

    it('should return usage_percent as a number', () => {
      const result = getCpuMetrics();

      expect(typeof result.usage_percent).toBe('number');
      expect(result.usage_percent).toBeGreaterThanOrEqual(0);
      expect(result.usage_percent).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // getMemoryMetrics Tests
  // ===========================================================================
  describe('getMemoryMetrics', () => {
    it('should return memory metrics with correct structure', () => {
      const result = getMemoryMetrics();

      expect(result).toHaveProperty('used_mb');
      expect(result).toHaveProperty('total_mb');
      expect(result).toHaveProperty('free_mb');
      expect(result).toHaveProperty('usage_percent');
      expect(result).toHaveProperty('heap');
      expect(result).toHaveProperty('system');
    });

    it('should return heap metrics', () => {
      const result = getMemoryMetrics();

      expect(result.heap).toHaveProperty('used_mb');
      expect(result.heap).toHaveProperty('total_mb');
      expect(result.heap).toHaveProperty('external_mb');
    });

    it('should return system memory metrics', () => {
      const result = getMemoryMetrics();

      expect(result.system).toHaveProperty('total_mb');
      expect(result.system).toHaveProperty('free_mb');
      expect(result.system).toHaveProperty('usage_percent');
    });

    it('should calculate system memory usage percentage correctly', () => {
      // 8GB total, 4GB free = 50% usage
      mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
      mockFreemem.mockReturnValue(4 * 1024 * 1024 * 1024);

      const result = getMemoryMetrics();

      expect(result.system.usage_percent).toBe(50);
    });

    it('should convert bytes to megabytes correctly', () => {
      // 8GB = 8192 MB
      mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);

      const result = getMemoryMetrics();

      expect(result.system.total_mb).toBe(8192);
    });

    it('should return all values as numbers', () => {
      const result = getMemoryMetrics();

      expect(typeof result.used_mb).toBe('number');
      expect(typeof result.total_mb).toBe('number');
      expect(typeof result.free_mb).toBe('number');
      expect(typeof result.usage_percent).toBe('number');
    });
  });

  // ===========================================================================
  // getDiskMetrics Tests
  // ===========================================================================
  describe('getDiskMetrics', () => {
    it('should return disk metrics with correct structure', async () => {
      mockExecSync.mockReturnValue(
        'Filesystem     1K-blocks      Used Available Use% Mounted on\n' +
        '/dev/sda1      104857600  52428800  52428800  50% /'
      );

      const result = await getDiskMetrics();

      expect(result).toHaveProperty('total_gb');
      expect(result).toHaveProperty('used_gb');
      expect(result).toHaveProperty('free_gb');
      expect(result).toHaveProperty('usage_percent');
    });

    it('should parse df command output correctly', async () => {
      // 100GB total, 50GB used, 50GB free
      mockExecSync.mockReturnValue(
        'Filesystem     1K-blocks      Used Available Use% Mounted on\n' +
        '/dev/sda1      104857600  52428800  52428800  50% /'
      );

      const result = await getDiskMetrics();

      expect(result.total_gb).toBe(100);
      expect(result.used_gb).toBe(50);
      expect(result.free_gb).toBe(50);
      expect(result.usage_percent).toBe(50);
    });

    it('should fallback to estimates when df command fails', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('df not found');
      });

      const result = await getDiskMetrics();

      // Should return estimated values
      expect(result.total_gb).toBeGreaterThan(0);
      expect(result.usage_percent).toBe(30);
    });

    it('should return fallback values on complete failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await getDiskMetrics();

      expect(result).toBeDefined();
      expect(typeof result.total_gb).toBe('number');
    });
  });

  // ===========================================================================
  // getNetworkMetrics Tests
  // ===========================================================================
  describe('getNetworkMetrics', () => {
    it('should return network metrics with correct structure', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([]);

      const result = await getNetworkMetrics();

      expect(result).toHaveProperty('requests_total');
      expect(result).toHaveProperty('requests_per_minute');
      expect(result).toHaveProperty('avg_response_time_ms');
      expect(result).toHaveProperty('error_rate_percent');
    });

    it('should count total requests from http_requests_total metric', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([
        {
          name: 'http_requests_total',
          values: [
            { value: 100, labels: { status: '200' } },
            { value: 50, labels: { status: '201' } },
            { value: 10, labels: { status: '404' } },
          ],
        },
      ]);

      const result = await getNetworkMetrics();

      expect(result.requests_total).toBe(160);
    });

    it('should calculate error rate from 4xx and 5xx status codes', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([
        {
          name: 'http_requests_total',
          values: [
            { value: 90, labels: { status: '200' } },
            { value: 5, labels: { status: '404' } },
            { value: 5, labels: { status: '500' } },
          ],
        },
      ]);

      const result = await getNetworkMetrics();

      // 10/100 = 10% error rate
      expect(result.error_rate_percent).toBe(10);
    });

    it('should return zero metrics when Prometheus is empty', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([]);

      const result = await getNetworkMetrics();

      expect(result.requests_total).toBe(0);
      expect(result.requests_per_minute).toBe(0);
      expect(result.avg_response_time_ms).toBe(0);
      expect(result.error_rate_percent).toBe(0);
    });

    it('should handle Prometheus errors gracefully', async () => {
      mockGetMetricsAsJSON.mockRejectedValue(new Error('Prometheus unavailable'));

      const result = await getNetworkMetrics();

      expect(result.requests_total).toBe(0);
    });
  });

  // ===========================================================================
  // getSystemMetrics Tests
  // ===========================================================================
  describe('getSystemMetrics', () => {
    it('should return aggregated system metrics', async () => {
      mockExecSync.mockReturnValue(
        'Filesystem     1K-blocks      Used Available Use% Mounted on\n' +
        '/dev/sda1      104857600  52428800  52428800  50% /'
      );

      const result = await getSystemMetrics();

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime_seconds');
      expect(result).toHaveProperty('cpu');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('disk');
      expect(result).toHaveProperty('network');
    });

    it('should return ISO timestamp', async () => {
      const result = await getSystemMetrics();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return uptime as positive integer', async () => {
      const result = await getSystemMetrics();

      expect(result.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.uptime_seconds)).toBe(true);
    });
  });

  // ===========================================================================
  // getSystemStatus Tests
  // ===========================================================================
  describe('getSystemStatus', () => {
    it('should return system status with correct structure', async () => {
      const result = await getSystemStatus();

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('overall_status');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('services');
      expect(result).toHaveProperty('resources');
    });

    it('should return services health information', async () => {
      const result = await getSystemStatus();

      expect(result.services).toHaveProperty('api_gateway');
      expect(result.services).toHaveProperty('database');
      expect(result.services).toHaveProperty('redis');
    });

    it('should return healthy API gateway status', async () => {
      const result = await getSystemStatus();

      expect(result.services.api_gateway.status).toBe('healthy');
    });

    it('should return unhealthy database status when no pool provided', async () => {
      const result = await getSystemStatus();

      expect(result.services.database.status).toBe('unhealthy');
    });

    it('should return healthy database status with valid pool', async () => {
      const mockPool = {
        totalCount: 5,
        options: { max: 20 },
      };

      const result = await getSystemStatus(mockPool);

      expect(result.services.database.status).toBe('healthy');
      expect(result.services.database.connections).toBe(5);
      expect(result.services.database.max_connections).toBe(20);
    });

    it('should return unhealthy Redis status when no client provided', async () => {
      const result = await getSystemStatus();

      expect(result.services.redis.status).toBe('unhealthy');
    });

    it('should return healthy Redis status with valid client', async () => {
      const mockRedis = {
        info: vi.fn()
          .mockResolvedValueOnce('used_memory_human:128M')
          .mockResolvedValueOnce('connected_clients:10'),
      };

      const result = await getSystemStatus(undefined, mockRedis);

      expect(result.services.redis.status).toBe('healthy');
      expect(result.services.redis.memory_usage).toBe('128M');
      expect(result.services.redis.connected_clients).toBe(10);
    });

    it('should return degraded overall status when one service is unhealthy', async () => {
      // Provide healthy db but no redis (redis will be unhealthy)
      const mockPool = { totalCount: 5, options: { max: 20 } };
      const result = await getSystemStatus(mockPool);

      expect(result.overall_status).toBe('degraded');
    });

    it('should return unhealthy overall status when all services are unhealthy', async () => {
      // No db, no redis - both unhealthy
      const result = await getSystemStatus();

      expect(result.overall_status).toBe('unhealthy');
    });

    it('should return healthy overall status when all services healthy', async () => {
      const mockPool = { totalCount: 5, options: { max: 20 } };
      const mockRedis = {
        info: vi.fn()
          .mockResolvedValueOnce('used_memory_human:128M')
          .mockResolvedValueOnce('connected_clients:10'),
      };

      const result = await getSystemStatus(mockPool, mockRedis);

      expect(result.overall_status).toBe('healthy');
    });

    it('should return resource usage information', async () => {
      const result = await getSystemStatus();

      expect(result.resources.memory).toHaveProperty('used');
      expect(result.resources.memory).toHaveProperty('total');
      expect(result.resources.memory).toHaveProperty('percentage');
      expect(result.resources.cpu).toHaveProperty('usage');
      expect(result.resources.cpu).toHaveProperty('load_average');
    });

    it('should format CPU usage as percentage string', async () => {
      const result = await getSystemStatus();

      expect(result.resources.cpu.usage).toMatch(/^\d+(\.\d+)?%$/);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe('Edge Cases', () => {
    it('should handle zero CPU cores gracefully', () => {
      mockCpus.mockReturnValue([]);

      const result = getCpuMetrics();

      expect(result.cores).toBe(0);
      expect(result.model).toBe('Unknown');
    });

    it('should handle very high load average', () => {
      mockLoadavg.mockReturnValue([100.0, 50.0, 25.0]);

      const result = getCpuMetrics();

      expect(result.load_average['1m']).toBe(100);
    });

    it('should handle very low memory', () => {
      mockTotalmem.mockReturnValue(1024 * 1024); // 1MB
      mockFreemem.mockReturnValue(512 * 1024); // 512KB

      const result = getMemoryMetrics();

      expect(result.system.total_mb).toBe(1);
      expect(result.system.usage_percent).toBe(50);
    });

    it('should handle Redis info parsing errors', async () => {
      const mockRedis = {
        info: vi.fn().mockResolvedValue('invalid info format'),
      };

      const result = await getSystemStatus(undefined, mockRedis);

      expect(result.services.redis.status).toBe('healthy');
      expect(result.services.redis.memory_usage).toBe('unknown');
    });

    it('should handle Redis connection errors', async () => {
      const mockRedis = {
        info: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const result = await getSystemStatus(undefined, mockRedis);

      expect(result.services.redis.status).toBe('unhealthy');
    });
  });
});
