/**
 * Root Cause Analyzer Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootCauseAnalyzer } from '../root-cause-analyzer';
import type { BuildError } from '../build-analyzer';
import type { DependencyAnalysis } from '../dependency-tracer';

describe('RootCauseAnalyzer', () => {
  let analyzer: RootCauseAnalyzer;

  beforeEach(() => {
    analyzer = new RootCauseAnalyzer();
  });

  describe('analyze', () => {
    it('should identify module resolution as root cause', () => {
      const buildErrors: BuildError[] = [
        {
          file: 'apps/auth/src/index.ts',
          line: 5,
          column: 23,
          code: 'TS2307',
          message: "Cannot find module '@ectropy/shared'",
          category: 'module-resolution',
          severity: 'error',
        },
      ];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/auth/src/index.ts',
        importChain: {
          file: 'apps/auth/src/index.ts',
          imports: ['@ectropy/shared'],
          resolvedPaths: new Map(),
          missingDependencies: ['@ectropy/shared'],
          circularDependencies: [],
        },
        buildOrder: [],
        blockedBy: [],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.category).toBe('module-resolution');
      expect(result.description).toContain('Cannot resolve module');
      expect(result.properFix.steps.length).toBeGreaterThan(0);
      expect(result.properFix.complexity).toBe('moderate');
      expect(result.workaroundSigns).toContain('Commenting out imports');
    });

    it('should identify build order as root cause', () => {
      const buildErrors: BuildError[] = [];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/api/src/index.ts',
        importChain: {
          file: 'apps/api/src/index.ts',
          imports: ['@ectropy/shared', '@ectropy/auth'],
          resolvedPaths: new Map(),
          missingDependencies: [],
          circularDependencies: [],
        },
        buildOrder: ['shared', 'auth'],
        blockedBy: ['@ectropy/shared', '@ectropy/auth'],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.category).toBe('build-order');
      expect(result.description).toContain('Dependencies not built');
      expect(result.properFix.steps.length).toBeGreaterThan(0);
      expect(result.evidence.some(e => e.includes('Blocked by'))).toBe(true);
    });

    it('should identify type mismatch as root cause', () => {
      const buildErrors: BuildError[] = [
        {
          file: 'apps/api/src/service.ts',
          line: 10,
          column: 5,
          code: 'TS2339',
          message: "Property 'username' does not exist on type 'User'",
          category: 'type-error',
          severity: 'error',
        },
        {
          file: 'apps/api/src/handler.ts',
          line: 15,
          column: 10,
          code: 'TS2322',
          message: "Type 'string' is not assignable to type 'number'",
          category: 'type-error',
          severity: 'error',
        },
      ];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/api/src/index.ts',
        importChain: {
          file: 'apps/api/src/index.ts',
          imports: [],
          resolvedPaths: new Map(),
          missingDependencies: [],
          circularDependencies: [],
        },
        buildOrder: [],
        blockedBy: [],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.category).toBe('type-mismatch');
      expect(result.description).toContain('Type incompatibility');
      expect(result.affectedFiles).toContain('apps/api/src/service.ts');
      expect(result.affectedFiles).toContain('apps/api/src/handler.ts');
    });

    it('should identify config error as root cause', () => {
      const buildErrors: BuildError[] = [
        {
          file: '',
          line: 0,
          column: 0,
          code: 'TS5023',
          message: "Unknown compiler option 'invalidOption'",
          category: 'config',
          severity: 'error',
        },
      ];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/api/src/index.ts',
        importChain: {
          file: 'apps/api/src/index.ts',
          imports: [],
          resolvedPaths: new Map(),
          missingDependencies: [],
          circularDependencies: [],
        },
        buildOrder: [],
        blockedBy: [],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.category).toBe('config-error');
      expect(result.description).toContain('configuration');
      expect(result.properFix.filesToModify).toContain('tsconfig.json');
      expect(result.properFix.complexity).toBe('simple');
    });

    it('should collect evidence from errors and dependencies', () => {
      const buildErrors: BuildError[] = [
        {
          file: 'apps/auth/src/index.ts',
          line: 5,
          column: 23,
          code: 'TS2307',
          message: "Cannot find module '@ectropy/shared'",
          category: 'module-resolution',
          severity: 'error',
        },
      ];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/auth/src/index.ts',
        importChain: {
          file: 'apps/auth/src/index.ts',
          imports: ['@ectropy/shared'],
          resolvedPaths: new Map(),
          missingDependencies: ['@ectropy/shared'],
          circularDependencies: ['@ectropy/circular'],
        },
        buildOrder: [],
        blockedBy: ['@ectropy/shared'],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.evidence).toContain("TS2307: Cannot find module '@ectropy/shared'");
      expect(result.evidence).toContain('Missing dependency: @ectropy/shared');
      expect(result.evidence).toContain('Circular dependency detected: @ectropy/circular');
      expect(result.evidence).toContain('Blocked by: @ectropy/shared');
    });

    it('should include workaround signs for module resolution', () => {
      const buildErrors: BuildError[] = [
        {
          file: 'apps/auth/src/index.ts',
          line: 5,
          column: 23,
          code: 'TS2307',
          message: "Cannot find module '@ectropy/shared'",
          category: 'module-resolution',
          severity: 'error',
        },
      ];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/auth/src/index.ts',
        importChain: {
          file: 'apps/auth/src/index.ts',
          imports: ['@ectropy/shared'],
          resolvedPaths: new Map(),
          missingDependencies: ['@ectropy/shared'],
          circularDependencies: [],
        },
        buildOrder: [],
        blockedBy: [],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.workaroundSigns).toContain('Commenting out imports');
      expect(result.workaroundSigns).toContain('Using "any" types to bypass errors');
      expect(result.workaroundSigns).toContain('Changing import statements instead of path config');
    });

    it('should generate fix guidance with validation commands', () => {
      const buildErrors: BuildError[] = [
        {
          file: 'apps/auth/src/index.ts',
          line: 5,
          column: 23,
          code: 'TS2307',
          message: "Cannot find module '@ectropy/shared'",
          category: 'module-resolution',
          severity: 'error',
        },
      ];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/auth/src/index.ts',
        importChain: {
          file: 'apps/auth/src/index.ts',
          imports: ['@ectropy/shared'],
          resolvedPaths: new Map(),
          missingDependencies: ['@ectropy/shared'],
          circularDependencies: [],
        },
        buildOrder: [],
        blockedBy: [],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.properFix.description).toBeTruthy();
      expect(result.properFix.steps.length).toBeGreaterThan(0);
      expect(result.properFix.validationCommand).toBeTruthy();
      expect(result.properFix.estimatedTime).toBeTruthy();
      
      // Verify steps have proper structure
      result.properFix.steps.forEach((step) => {
        expect(step.order).toBeGreaterThan(0);
        expect(step.action).toBeTruthy();
        expect(step.validation).toBeTruthy();
      });
    });

    it('should handle empty errors and dependencies', () => {
      const buildErrors: BuildError[] = [];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/test/src/index.ts',
        importChain: {
          file: 'apps/test/src/index.ts',
          imports: [],
          resolvedPaths: new Map(),
          missingDependencies: [],
          circularDependencies: [],
        },
        buildOrder: [],
        blockedBy: [],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.properFix).toBeDefined();
      expect(result.workaroundSigns).toBeDefined();
    });

    it('should generate build order fix with multiple dependencies', () => {
      const buildErrors: BuildError[] = [];

      const depAnalysis: DependencyAnalysis = {
        targetFile: 'apps/api/src/index.ts',
        importChain: {
          file: 'apps/api/src/index.ts',
          imports: ['@ectropy/shared', '@ectropy/auth', '@ectropy/utils'],
          resolvedPaths: new Map(),
          missingDependencies: [],
          circularDependencies: [],
        },
        buildOrder: ['shared', 'utils', 'auth'],
        blockedBy: ['@ectropy/shared', '@ectropy/auth', '@ectropy/utils'],
      };

      const result = analyzer.analyze(buildErrors, depAnalysis);

      expect(result.category).toBe('build-order');
      expect(result.properFix.steps.length).toBe(4); // 3 deps + 1 final rebuild
      expect(result.properFix.steps[0].action).toContain('@ectropy/shared');
      expect(result.properFix.steps[1].action).toContain('@ectropy/auth');
      expect(result.properFix.steps[2].action).toContain('@ectropy/utils');
    });
  });
});
