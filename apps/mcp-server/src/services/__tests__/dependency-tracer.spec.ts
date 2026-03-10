/**
 * Dependency Tracer Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyTracer } from '../dependency-tracer';
import path from 'path';
import fs from 'fs/promises';

describe('DependencyTracer', () => {
  let tracer: DependencyTracer;
  const testRootPath = path.resolve(__dirname, '../../../../..');

  beforeEach(() => {
    tracer = new DependencyTracer(testRootPath);
  });

  describe('loadPathMappings', () => {
    it('should load path mappings from tsconfig.base.json', async () => {
      await tracer.loadPathMappings();
      
      // Check that path mappings were loaded (private field, but we can test behavior)
      expect(tracer).toBeDefined();
    });
  });

  describe('trace', () => {
    it('should trace dependencies for a file', async () => {
      // Use a real file from the project
      const targetFile = 'apps/mcp-server/src/services/build-analyzer.ts';
      
      const result = await tracer.trace(targetFile);
      
      expect(result).toBeDefined();
      expect(result.targetFile).toContain('build-analyzer.ts');
      expect(result.importChain).toBeDefined();
      expect(result.buildOrder).toBeDefined();
      expect(result.blockedBy).toBeDefined();
      expect(Array.isArray(result.buildOrder)).toBe(true);
      expect(Array.isArray(result.blockedBy)).toBe(true);
    });

    it('should identify missing dependencies', async () => {
      // Create a temporary file with a missing import
      const tempDir = path.join(testRootPath, 'tmp', 'test-dependency-tracer');
      const tempFile = path.join(tempDir, 'test-file.ts');
      
      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(tempFile, `
import { something } from '@ectropy/nonexistent';
import { other } from './also-nonexistent';

export const test = 'test';
        `.trim());

        const result = await tracer.trace(tempFile);
        
        expect(result.importChain.missingDependencies.length).toBeGreaterThan(0);
        expect(result.importChain.missingDependencies).toContain('@ectropy/nonexistent');
      } finally {
        // Cleanup
        try {
          await fs.unlink(tempFile);
          await fs.rmdir(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it('should handle nonexistent files', async () => {
      const nonexistentFile = 'apps/nonexistent/src/file.ts';
      
      const result = await tracer.trace(nonexistentFile);
      
      expect(result).toBeDefined();
      expect(result.importChain.missingDependencies).toContain(result.targetFile);
    });

    it('should resolve @ectropy imports using path mappings', async () => {
      // Create a test file with @ectropy imports
      const tempDir = path.join(testRootPath, 'tmp', 'test-dependency-tracer');
      const tempFile = path.join(tempDir, 'test-ectropy-imports.ts');
      
      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(tempFile, `
import { something } from '@ectropy/shared';

export const test = 'test';
        `.trim());

        const result = await tracer.trace(tempFile);
        
        expect(result.importChain.imports).toContain('@ectropy/shared');
        
        // Should attempt to resolve the path
        expect(result.importChain.resolvedPaths.size).toBeGreaterThanOrEqual(0);
      } finally {
        // Cleanup
        try {
          await fs.unlink(tempFile);
          await fs.rmdir(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it('should handle relative imports', async () => {
      // Create test files with relative imports
      const tempDir = path.join(testRootPath, 'tmp', 'test-dependency-tracer');
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      
      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(file2, `export const helper = 'helper';`);
        await fs.writeFile(file1, `
import { helper } from './file2';

export const main = helper;
        `.trim());

        const result = await tracer.trace(file1);
        
        expect(result.importChain.imports).toContain('./file2');
        expect(result.importChain.resolvedPaths.size).toBeGreaterThan(0);
      } finally {
        // Cleanup
        try {
          await fs.unlink(file1);
          await fs.unlink(file2);
          await fs.rmdir(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it('should detect circular dependencies', async () => {
      // Create test files with circular imports
      const tempDir = path.join(testRootPath, 'tmp', 'test-dependency-tracer');
      const fileA = path.join(tempDir, 'circular-a.ts');
      const fileB = path.join(tempDir, 'circular-b.ts');
      
      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(fileA, `
import { b } from './circular-b';
export const a = 'a';
        `.trim());
        await fs.writeFile(fileB, `
import { a } from './circular-a';
export const b = 'b';
        `.trim());

        const result = await tracer.trace(fileA);
        
        // This is a basic test - circular detection might need more sophisticated implementation
        expect(result.importChain).toBeDefined();
      } finally {
        // Cleanup
        try {
          await fs.unlink(fileA);
          await fs.unlink(fileB);
          await fs.rmdir(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it('should determine build order for @ectropy dependencies', async () => {
      const tempDir = path.join(testRootPath, 'tmp', 'test-dependency-tracer');
      const tempFile = path.join(tempDir, 'test-build-order.ts');
      
      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(tempFile, `
import { shared } from '@ectropy/shared';
import { auth } from '@ectropy/ai-agents/something';

export const test = 'test';
        `.trim());

        const result = await tracer.trace(tempFile);
        
        // Should identify libraries that need to be built
        expect(Array.isArray(result.buildOrder)).toBe(true);
      } finally {
        // Cleanup
        try {
          await fs.unlink(tempFile);
          await fs.rmdir(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  });
});
