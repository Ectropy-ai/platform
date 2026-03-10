import { describe, it, expect } from '@jest/globals';
import { IFCProcessor } from '../processor';

describe('IFC Package Smoke Test', () => {
  it('should pass basic assertion', () => {
    expect(true).toBe(true);
  });

  it('should import IFCProcessor', () => {
    expect(IFCProcessor).toBeDefined();
  });
});
