/**
 * Test suite for BaseAgent functionality
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { BaseAgent } from './base-agent.js';
import {
  TemplateService,
  TemplateData,
  AgentConfig,
  BaseAgentResult,
} from './types.js';

// Mock template service
const mockTemplateService: TemplateService = {
  getActiveTemplate: vi.fn().mockResolvedValue({
    templateId: 't1',
    name: 'Test Template',
    version: '1.0.0',
    projectId: 'p1',
    isActive: true,
    metadata: {},
  } as TemplateData),
  validateProjectAccess: vi.fn().mockResolvedValue(true),
};
const mockTemplateServiceNoAccess: TemplateService = {
  getActiveTemplate: vi.fn().mockResolvedValue(null),
  validateProjectAccess: vi.fn().mockResolvedValue(false),
};
const mockDb = {} as any;
// Concrete implementation for testing
class TestAgent extends BaseAgent {
  protected getAgentType(): string {
    return 'test-agent';
  }
  async testOperation(projectId: string): Promise<BaseAgentResult> {
    return this.executeWithRetry('testOperation', async () => {
      await this.validateProject(projectId);
      return this.createBaseResult(projectId, true);
    });
  }
  async testFailingOperation(projectId: string): Promise<BaseAgentResult> {
    return this.executeWithRetry(
      'testFailingOperation',
      async () => {
        throw new Error('Test error');
      },
      2
    ); // Only 2 retries for faster testing
  }
}
describe('BaseAgent', () => {
  let agent: TestAgent;
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-configure mocks after clearing
    (
      mockTemplateService.validateProjectAccess as ReturnType<typeof vi.fn>
    ).mockResolvedValue(true);
    (
      mockTemplateService.getActiveTemplate as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      templateId: 't1',
      name: 'Test Template',
      version: '1.0.0',
      projectId: 'p1',
      isActive: true,
      metadata: {},
    } as TemplateData);
    agent = new TestAgent(mockDb, mockTemplateService);
  });
  describe('Configuration', () => {
    it('should use default configuration values', () => {
      expect((agent as any).config.pollIntervalMs).toBe(5000);
      expect((agent as any).config.maxRetries).toBe(3);
      expect((agent as any).config.timeout).toBe(30000);
      expect((agent as any).config.enableEventEmission).toBe(true);
    });
    it('should allow configuration overrides', () => {
      const config: AgentConfig = {
        pollIntervalMs: 10000,
        maxRetries: 5,
        timeout: 60000,
        enableEventEmission: false,
      };
      const customAgent = new TestAgent(mockDb, mockTemplateService, config);
      expect((customAgent as any).config.pollIntervalMs).toBe(10000);
      expect((customAgent as any).config.maxRetries).toBe(5);
      expect((customAgent as any).config.timeout).toBe(60000);
      expect((customAgent as any).config.enableEventEmission).toBe(false);
    });
  });
  describe('Error Handling', () => {
    it('should create standardized errors', () => {
      const error = (agent as any).createError(
        'testOperation',
        'Test error message',
        'TEST_ERROR',
        { testData: 'value' }
      );
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.agentType).toBe('test-agent');
      expect(error.operation).toBe('testOperation');
      expect(error.details).toEqual({ testData: 'value' });
    });
    it('should handle errors consistently', () => {
      const originalError = new Error('Original error');
      const handledError = (agent as any).handleError(
        'testOperation',
        originalError
      );
      expect(handledError.code).toBe('OPERATION_FAILED');
      expect(handledError.agentType).toBe('test-agent');
      expect(handledError.operation).toBe('testOperation');
      expect(handledError.message).toBe('Original error');
    });
    it('should handle non-Error types', () => {
      const handledError = (agent as any).handleError(
        'testOperation',
        'string error'
      );
      expect(handledError.code).toBe('UNKNOWN_ERROR');
      expect(handledError.message).toBe('string error');
    });
  });
  describe('Event Emission', () => {
    it('should emit events with agent metadata', () => {
      const eventHandler = vi.fn();
      agent.on('test-event', eventHandler);
      (agent as any).emitEvent('test-event', {
        projectId: 'p1',
        operation: 'testOperation',
        metadata: { testData: 'value' },
      });
      expect(eventHandler).toHaveBeenCalledWith({
        agentType: 'test-agent',
        projectId: 'p1',
        operation: 'testOperation',
        metadata: { testData: 'value' },
      });
    });
    it('should not emit events when disabled', () => {
      const eventHandler = vi.fn();
      const disabledAgent = new TestAgent(mockDb, mockTemplateService, {
        enableEventEmission: false,
      });
      disabledAgent.on('test-event', eventHandler);
      (disabledAgent as any).emitEvent('test-event', {
        projectId: 'p1',
        operation: 'testOperation',
        metadata: { testData: 'value' },
      });
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });
  describe('Project Validation', () => {
    it('should validate project access successfully', async () => {
      await expect((agent as any).validateProject('p1')).resolves.not.toThrow();
      expect(mockTemplateService.validateProjectAccess).toHaveBeenCalledWith(
        'p1'
      );
    });
    it('should throw error when access is denied', async () => {
      const noAccessAgent = new TestAgent(mockDb, mockTemplateServiceNoAccess);
      await expect(
        (noAccessAgent as any).validateProject('p1')
      ).rejects.toMatchObject({
        code: 'ACCESS_DENIED',
        operation: 'validateProject',
      });
    });
  });
  describe('Result Creation', () => {
    it('should create base result with standard fields', () => {
      const result = (agent as any).createBaseResult('p1', true);
      expect(result.projectId).toBe('p1');
      expect(result.success).toBe(true);
      expect(result.agentType).toBe('test-agent');
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
  describe('Retry Logic', () => {
    it('should execute operation successfully on first try', async () => {
      const result = await agent.testOperation('p1');
      expect(result.projectId).toBe('p1');
      expect(result.success).toBe(true);
    });
    it('should retry operations that fail', async () => {
      let attempts = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return Promise.resolve('success');
      });
      const result = await (agent as any).executeWithRetry(
        'testRetry',
        mockOperation,
        3
      );
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
    it('should throw error after max retries exceeded', async () => {
      await expect(agent.testFailingOperation('p1')).rejects.toMatchObject({
        code: 'OPERATION_FAILED',
        operation: 'testFailingOperation',
      });
    });
  });
  describe('Agent Type', () => {
    it('should return correct agent type', () => {
      expect((agent as any).getAgentType()).toBe('test-agent');
    });
  });
});
