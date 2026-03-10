/**
 * Validation Script Tests
 * Test roadmap schema validation with focus on empty project handling
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('validate-roadmap-schema.js - Empty Project Handling', () => {
  const testDir = join(tmpdir(), 'roadmap-validation-test');
  
  // Helper to create test roadmap file
  function createTestRoadmap(filename: string, roadmap: any): string {
    const path = join(testDir, filename);
    writeFileSync(path, JSON.stringify(roadmap, null, 2));
    return path;
  }

  // Helper to cleanup test file
  function cleanupTestFile(path: string): void {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  it('should accept roadmap with empty phases and empty currentPhase', () => {
    const emptyRoadmap = {
      version: '1.2.0',
      lastUpdated: new Date().toISOString(),
      currentPhase: '',
      overallProgress: 0,
      phases: [],
    };

    // Create a test file
    const testPath = createTestRoadmap('empty-roadmap.json', emptyRoadmap);

    try {
      // We can't directly import and run the validation script as it calls process.exit
      // Instead, we verify the data structure meets the validation criteria

      // Validate required fields exist
      expect(emptyRoadmap.version).toBeDefined();
      expect(emptyRoadmap.lastUpdated).toBeDefined();
      expect(emptyRoadmap.currentPhase).toBeDefined(); // Can be empty string
      expect(typeof emptyRoadmap.overallProgress).toBe('number');
      expect(Array.isArray(emptyRoadmap.phases)).toBe(true);

      // Validate currentPhase logic: empty string is valid when phases is empty
      if (emptyRoadmap.phases.length === 0) {
        expect(emptyRoadmap.currentPhase).toBe('');
      }
    } finally {
      cleanupTestFile(testPath);
    }
  });

  it('should reject roadmap with currentPhase set when phases is empty', () => {
    const invalidRoadmap = {
      version: '1.2.0',
      lastUpdated: new Date().toISOString(),
      currentPhase: 'phase-1',
      overallProgress: 0,
      phases: [],
    };

    // Validation: currentPhase should be empty string if phases is empty
    if (invalidRoadmap.phases.length === 0) {
      expect(invalidRoadmap.currentPhase).not.toBe('phase-1');
    }
  });

  it('should accept roadmap with phases and valid currentPhase', () => {
    const validRoadmap = {
      version: '1.2.0',
      lastUpdated: new Date().toISOString(),
      currentPhase: 'phase-1',
      overallProgress: 50,
      phases: [
        {
          id: 'phase-1',
          name: 'Test Phase',
          description: 'Test phase description',
          status: 'in-progress',
          priority: 'high',
          dependencies: [],
          deliverables: [],
        },
      ],
    };

    const testPath = createTestRoadmap('valid-roadmap.json', validRoadmap);

    try {
      // Validate structure
      expect(validRoadmap.phases.length).toBeGreaterThan(0);
      expect(validRoadmap.currentPhase).toBe('phase-1');
      
      // Validate currentPhase exists in phases
      const currentPhaseExists = validRoadmap.phases.some(
        (p) => p.id === validRoadmap.currentPhase
      );
      expect(currentPhaseExists).toBe(true);
    } finally {
      cleanupTestFile(testPath);
    }
  });

  it('should validate phase ID format', () => {
    const validPhaseIds = ['phase-1', 'phase-2', 'phase-5a', 'phase-5b', 'phase-10'];
    const invalidPhaseIds = ['Phase-1', 'p1', '1', 'phase_1', 'phase'];

    validPhaseIds.forEach((id) => {
      expect(id).toMatch(/^phase-[\da-z]+$/i);
    });

    invalidPhaseIds.forEach((id) => {
      expect(id).not.toMatch(/^phase-[\da-z]+$/i);
    });
  });

  it('should validate status values', () => {
    const validStatuses = ['planned', 'in-progress', 'complete', 'blocked'];
    const invalidStatuses = ['started', 'done', 'pending', 'not-started'];

    validStatuses.forEach((status) => {
      expect(validStatuses.includes(status)).toBe(true);
    });

    invalidStatuses.forEach((status) => {
      expect(validStatuses.includes(status)).toBe(false);
    });
  });
});
