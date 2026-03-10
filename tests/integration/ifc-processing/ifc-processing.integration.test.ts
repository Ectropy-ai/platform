/**
 * Enterprise Integration Tests - ifc-processing
 * Target: Test complete integration workflows with external dependencies
 */

import { TestEnvironment } from '../../helpers/test-environment';
import { IfcProcessingService } from '@ectropy/ifc-processing';

describe('ifc-processing Integration Tests', () => {
  let testEnv: TestEnvironment;
  let service: IfcProcessingService;

  beforeAll(async () => {
    testEnv = await TestEnvironment.setup();
    service = new IfcProcessingService(testEnv.getConfig());
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.resetDatabase();
  });

  describe('Database Integration', () => {
    it('should persist and retrieve data correctly', async () => {
      const testData = {
        id: 'test-id',
        name: 'Test Entity',
        createdAt: new Date()
      };

      await service.create(testData);
      const retrieved = await service.findById(testData.id);

      expect(retrieved).toEqual(expect.objectContaining(testData));
    });

    it('should handle database transactions correctly', async () => {
      const transaction = await testEnv.getDatabase().transaction();
      
      try {
        await service.createInTransaction(transaction, { name: 'Test 1' });
        await service.createInTransaction(transaction, { name: 'Test 2' });
        
        await transaction.commit();
        
        const count = await service.count();
        expect(count).toBe(2);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    });
  });

  describe('External Service Integration', () => {
    it('should integrate with Redis cache correctly', async () => {
      const cacheKey = 'test-key';
      const cacheValue = { data: 'test-value' };

      await service.setCacheValue(cacheKey, cacheValue);
      const retrieved = await service.getCacheValue(cacheKey);

      expect(retrieved).toEqual(cacheValue);
    });

    it('should handle external service failures gracefully', async () => {
      // Simulate external service failure
      testEnv.simulateServiceFailure('redis');

      // Service should continue to function
      const result = await service.performOperationWithCache('test');
      expect(result).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from database connection failures', async () => {
      // Simulate database disconnection
      await testEnv.simulateDatabaseFailure();

      // Wait for reconnection
      await testEnv.waitForDatabaseRecovery();

      // Service should continue to function
      const result = await service.findAll();
      expect(result).toBeDefined();
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high concurrency correctly', async () => {
      const operations = Array(50).fill(null).map((_, i) =>
        service.create({ name: `Concurrent Test ${i}` })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(50);
      
      const count = await service.count();
      expect(count).toBe(50);
    });
  });
});
