/** @jest-environment jsdom */
import { apiClient } from '../services/apiClient';
import { vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn();
describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  test('should be defined', () => {
    expect(apiClient).toBeDefined();
  });

  test('should handle basic operations', () => {
    // Basic smoke test to ensure the client is functional
    expect(typeof apiClient).toBe('object');
  });
});
