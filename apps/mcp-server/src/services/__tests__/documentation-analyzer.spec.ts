/**
 * Documentation Analyzer Test Suite
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentationAnalyzer } from '../documentation-analyzer';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('DocumentationAnalyzer', () => {
  let analyzer: DocumentationAnalyzer;
  let testDir: string;

  beforeEach(() => {
    analyzer = new DocumentationAnalyzer();
    testDir = join(process.cwd(), 'tmp', `test-docs-${ Date.now()}`);
    
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('analyze', () => {
    it('should detect allowed documentation files', () => {
      // Create allowed files
      writeFileSync(join(testDir, 'README.md'), '# Project');
      writeFileSync(join(testDir, 'CURRENT_TRUTH.md'), '# Truth');
      writeFileSync(join(testDir, 'CHANGELOG.md'), '# Changes');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.allowedFiles.length).toBe(3);
      expect(result.violationFiles.length).toBe(0);
      expect(result.score).toBe(100);
      expect(result.recommendations[0]).toContain('No documentation violations');
    });

    it('should detect TROUBLESHOOTING.md as violation', () => {
      writeFileSync(join(testDir, 'README.md'), '# Project');
      writeFileSync(join(testDir, 'TROUBLESHOOTING.md'), '# Troubleshooting');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.violationFiles.length).toBe(1);
      expect(result.violationFiles[0]).toContain('TROUBLESHOOTING.md');
      expect(result.score).toBeLessThan(100);
    });

    it('should detect FIX_README.md as violation', () => {
      writeFileSync(join(testDir, 'FIX_README.md'), '# Fix Instructions');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.violationFiles.length).toBe(1);
      expect(result.violationFiles[0]).toContain('FIX_README.md');
    });

    it('should detect HOW_TO.md as violation', () => {
      writeFileSync(join(testDir, 'HOW_TO_SETUP.md'), '# Setup Guide');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.violationFiles.length).toBe(1);
      expect(result.violationFiles[0]).toContain('HOW_TO_SETUP.md');
    });

    it('should detect GUIDE.md as violation', () => {
      writeFileSync(join(testDir, 'DEVELOPER_GUIDE.md'), '# Guide');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.violationFiles.length).toBe(1);
      expect(result.violationFiles[0]).toContain('GUIDE.md');
    });

    it('should allow CONTRIBUTING.md', () => {
      writeFileSync(join(testDir, 'CONTRIBUTING.md'), '# Contributing');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.allowedFiles.length).toBe(1);
      expect(result.violationFiles.length).toBe(0);
    });

    it('should allow LICENSE.md', () => {
      writeFileSync(join(testDir, 'LICENSE.md'), '# License');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.allowedFiles.length).toBe(1);
      expect(result.violationFiles.length).toBe(0);
    });

    it('should calculate score based on violation ratio', () => {
      // 1 allowed, 1 violation = 50% violations
      writeFileSync(join(testDir, 'README.md'), '# Project');
      writeFileSync(join(testDir, 'TROUBLESHOOTING.md'), '# Troubleshooting');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.totalMarkdownFiles).toBe(2);
      expect(result.violationFiles.length).toBe(1);
      // 1/2 = 0.5 ratio, score = 100 - (0.5 * 200) = 0
      expect(result.score).toBe(0);
    });

    it('should handle nested directories', () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      
      writeFileSync(join(testDir, 'README.md'), '# Project');
      writeFileSync(join(docsDir, 'TROUBLESHOOTING.md'), '# Troubleshooting');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.totalMarkdownFiles).toBe(2);
      expect(result.violationFiles.length).toBe(1);
    });

    it('should ignore node_modules directory', () => {
      const nodeModules = join(testDir, 'node_modules');
      mkdirSync(nodeModules, { recursive: true });
      
      writeFileSync(join(testDir, 'README.md'), '# Project');
      writeFileSync(join(nodeModules, 'package.md'), '# Package');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.totalMarkdownFiles).toBe(1);
      expect(result.allowedFiles.length).toBe(1);
    });

    it('should ignore .git directory', () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      
      writeFileSync(join(testDir, 'README.md'), '# Project');
      writeFileSync(join(gitDir, 'config.md'), '# Config');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.totalMarkdownFiles).toBe(1);
    });

    it('should generate recommendations for violations', () => {
      writeFileSync(join(testDir, 'TROUBLESHOOTING.md'), '# Troubleshooting');
      writeFileSync(join(testDir, 'SETUP.md'), '# Setup');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.includes('violation'))).toBe(true);
      expect(result.recommendations.some(r => r.includes('TROUBLESHOOTING.md'))).toBe(true);
    });

    it('should return perfect score for no markdown files', () => {
      const result = analyzer.analyze(testDir);
      
      expect(result.totalMarkdownFiles).toBe(0);
      expect(result.score).toBe(100);
    });

    it('should handle multiple violations', () => {
      writeFileSync(join(testDir, 'TROUBLESHOOTING.md'), '# Troubleshooting');
      writeFileSync(join(testDir, 'FIX_README.md'), '# Fix');
      writeFileSync(join(testDir, 'QUICK_START.md'), '# Quick Start');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.violationFiles.length).toBe(3);
      expect(result.score).toBe(0); // 3/3 = 100% violations
    });

    it('should treat unmatched files as violations', () => {
      // Random markdown file that's not in allowed list
      writeFileSync(join(testDir, 'RANDOM_DOC.md'), '# Random');
      
      const result = analyzer.analyze(testDir);
      
      expect(result.violationFiles.length).toBe(1);
      expect(result.violationFiles[0]).toContain('RANDOM_DOC.md');
    });
  });
});
