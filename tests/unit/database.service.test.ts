/**
 * Unit Tests for Database Service
 */

import { DatabaseService } from '@ectropy/database';
import { DatabaseConfig } from '@ectropy/database';
import { vi } from 'vitest';
describe('DatabaseService', () => {
  let databaseService: DatabaseService;
  let mockConfig: DatabaseConfig;
  beforeEach(() => {
    mockConfig = {
      host: 'localhost',
      port: 5432,
      database: 'ectropy_test',
      username: 'test_user',
      password: 'test_password',
      ssl: false,
      maxConnections: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    };
    databaseService = new DatabaseService(mockConfig);
  });
  afterEach(async () => {
    if (databaseService) {
      await databaseService.disconnect();
    }
  describe('constructor', () => {
    it('should create DatabaseService instance with config', () => {
      expect(databaseService).toBeInstanceOf(DatabaseService);
      expect(databaseService.isHealthy()).toBe(false); // Not connected yet
    });
  describe('connect', () => {
    it('should establish database connection', async () => {
      // Mock successful connection
      const mockConnect = vi.fn().mockResolvedValue(undefined);
      const mockClient = {
        release: vi.fn(),
      };
      // Mock pool.connect
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        end: vi.fn(),
        totalCount: 1,
        idleCount: 0,
        waitingCount: 0,
      };

      // Replace pool with mock
      (databaseService as any).pool = mockPool;
      await databaseService.connect();
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const mockPool = {
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        totalCount: 0,
      await expect(databaseService.connect()).rejects.toThrow(
        'Connection failed'
      );
      expect(databaseService.isHealthy()).toBe(false);
  describe('query', () => {
    it('should execute query successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        command: 'SELECT',
        fields: [],
        query: vi.fn().mockResolvedValue(mockResult),
      const result = await databaseService.query(
        'SELECT * FROM users WHERE id = $1',
        [1]
      expect(mockPool.query).toHaveBeenCalledWith(
      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
      expect(result.rowCount).toBe(1);
    it('should handle query errors', async () => {
        query: vi.fn().mockRejectedValue(new Error('Query failed')),
      await expect(
        databaseService.query('SELECT * FROM users')
      ).rejects.toThrow('Query failed');
  describe('getMetrics', () => {
    it('should return connection pool metrics', () => {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 2,
      const metrics = databaseService.getMetrics();
      expect(metrics).toEqual({
        totalConnections: 5,
        idleConnections: 3,
      });
  describe('healthCheck', () => {
    it('should return true for healthy database', async () => {
        rows: [{ health_check: 1 }],
      const isHealthy = await databaseService.healthCheck();
      expect(isHealthy).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 as health_check');
    it('should return false for unhealthy database', async () => {
        query: vi.fn().mockRejectedValue(new Error('Health check failed')),
      expect(isHealthy).toBe(false);
});
