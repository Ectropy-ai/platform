import { describe, it, expect } from 'vitest';

/**
 * Simple test to validate Jest configuration
 */
describe('Speckle Integration', () => {
  it('should be defined', () => {
    expect(true).toBeTruthy();
  });

  it('should perform basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });
});
