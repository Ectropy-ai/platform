/**
 * Build Analyzer Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BuildAnalyzer} from '../build-analyzer';

describe('BuildAnalyzer', () => {
  let analyzer: BuildAnalyzer;

  beforeEach(() => {
    analyzer = new BuildAnalyzer();
  });

  describe('parse', () => {
    it('should parse TS2307 module resolution errors', () => {
      const output = `
apps/auth/src/index.ts(5,23): error TS2307: Cannot find module '@ectropy/shared' or its corresponding type declarations.
      `.trim();
      
      const result = analyzer.parse(output, 'auth');
      
      expect(result.app).toBe('auth');
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('TS2307');
      expect(result.errors[0].category).toBe('module-resolution');
      expect(result.errors[0].severity).toBe('error');
      expect(result.errors[0].file).toBe('apps/auth/src/index.ts');
      expect(result.errors[0].line).toBe(5);
      expect(result.errors[0].column).toBe(23);
    });

    it('should parse TS2339 type errors', () => {
      const output = `
apps/api/src/handlers.ts(12,15): error TS2339: Property 'foo' does not exist on type 'Request'.
      `.trim();
      
      const result = analyzer.parse(output, 'api');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('TS2339');
      expect(result.errors[0].category).toBe('type-error');
      expect(result.errors[0].message).toContain('does not exist');
    });

    it('should parse multiple errors', () => {
      const output = `
apps/auth/src/index.ts(5,23): error TS2307: Cannot find module '@ectropy/shared'.
apps/auth/src/service.ts(10,5): error TS2339: Property 'username' does not exist on type 'User'.
apps/auth/src/config.ts(3,1): error TS2322: Type 'string' is not assignable to type 'number'.
      `.trim();
      
      const result = analyzer.parse(output, 'auth');
      
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0].category).toBe('module-resolution');
      expect(result.errors[1].category).toBe('type-error');
      expect(result.errors[2].category).toBe('type-error');
    });

    it('should parse alternative error format with colons', () => {
      const output = `
libs/shared/src/utils.ts:42:10 - error TS2304: Cannot find name 'process'.
      `.trim();
      
      const result = analyzer.parse(output, 'shared');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].file).toBe('libs/shared/src/utils.ts');
      expect(result.errors[0].line).toBe(42);
      expect(result.errors[0].column).toBe(10);
      expect(result.errors[0].code).toBe('TS2304');
    });

    it('should categorize config errors', () => {
      const output = `
error TS5023: Unknown compiler option 'invalidOption'.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].category).toBe('config');
    });

    it('should categorize syntax errors', () => {
      const output = `
apps/test/src/main.ts(10,5): error TS1005: ';' expected.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].category).toBe('syntax');
    });

    it('should handle warnings', () => {
      const output = `
apps/test/src/main.ts(10,5): warning TS6133: 'unused' is declared but its value is never read.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBe('warning');
      expect(result.success).toBe(true); // Warnings don't make build fail
    });

    it('should return success true when no errors', () => {
      const output = `
Build completed successfully!
No errors found.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should include timestamp and duration', () => {
      const output = `
apps/test/src/main.ts(10,5): error TS2307: Cannot find module 'test'.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should handle empty output', () => {
      const result = analyzer.parse('', 'test');
      
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle TS2322 type assignment errors', () => {
      const output = `
apps/test/src/main.ts(15,10): error TS2322: Type 'string' is not assignable to type 'number'.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('TS2322');
      expect(result.errors[0].category).toBe('type-error');
    });

    it('should handle TS2345 argument type errors', () => {
      const output = `
apps/test/src/main.ts(20,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
      `.trim();
      
      const result = analyzer.parse(output, 'test');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('TS2345');
      expect(result.errors[0].category).toBe('type-error');
    });
  });
});
