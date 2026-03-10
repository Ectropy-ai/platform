/**
 * Documentation Analyzer Service
 * Detects and reports documentation policy violations
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface DocumentationAnalysis {
  totalMarkdownFiles: number;
  allowedFiles: string[]; // README.md, CURRENT_TRUTH.md, etc.
  violationFiles: string[]; // TROUBLESHOOTING.md, FIX_README.md, etc.
  recommendations: string[];
  score: number;
}

export class DocumentationAnalyzer {
  private readonly allowedFilenames = [
    'README.md',
    'CURRENT_TRUTH.md',
    'AI_AGENT_PROTOCOL.md', // Critical operational documentation for MCP-guided development
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'LICENSE.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
  ];

  private readonly violationPatterns = [
    /TROUBLESHOOTING/i,
    /FIX.*README/i,
    /HOW.*TO/i,
    /GUIDE/i,
    /QUICK.*START/i,
    /SETUP/i,
    /INSTALL/i,
  ];

  /**
   * Analyze repository for documentation violations
   */
  analyze(repoPath: string): DocumentationAnalysis {
    const markdownFiles = this.findMarkdownFiles(repoPath);
    const allowedFiles: string[] = [];
    const violationFiles: string[] = [];

    for (const file of markdownFiles) {
      const filename = file.split(/[/\\]/).pop() || '';

      if (this.isAllowed(filename)) {
        allowedFiles.push(file);
      } else if (this.isViolation(file)) {
        violationFiles.push(file);
      } else {
        // Files that don't match allowed or violation patterns are flagged
        violationFiles.push(file);
      }
    }

    const recommendations = this.generateRecommendations(violationFiles);
    const score = this.calculateScore(
      markdownFiles.length,
      violationFiles.length
    );

    return {
      totalMarkdownFiles: markdownFiles.length,
      allowedFiles,
      violationFiles,
      recommendations,
      score,
    };
  }

  /**
   * Recursively find all markdown files in repository
   */
  private findMarkdownFiles(dirPath: string, files: string[] = []): string[] {
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);

        // Skip common ignore directories
        if (this.shouldIgnoreDirectory(entry)) {
          continue;
        }

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            this.findMarkdownFiles(fullPath, files);
          } else if (stat.isFile() && entry.endsWith('.md')) {
            // Store relative path from repo root
            const relativePath = fullPath
              .replace(dirPath, '')
              .replace(/^[/\\]/, '');
            files.push(relativePath);
          }
        } catch (error) {
          // Skip files/dirs we can't access
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return files;
  }

  /**
   * Check if directory should be ignored
   */
  private shouldIgnoreDirectory(dirname: string): boolean {
    const ignoreDirs = [
      'node_modules',
      '.git',
      '.nx',
      'dist',
      'build',
      'coverage',
      '.next',
      'tmp',
      '.cache',
      'archive',
    ];

    return ignoreDirs.includes(dirname);
  }

  /**
   * Check if filename is in allowed list
   */
  private isAllowed(filename: string): boolean {
    return this.allowedFilenames.some(
      (allowed) => filename.toLowerCase() === allowed.toLowerCase()
    );
  }

  /**
   * Check if file path matches violation patterns
   */
  private isViolation(filepath: string): boolean {
    return this.violationPatterns.some((pattern) => pattern.test(filepath));
  }

  /**
   * Generate recommendations for violations
   */
  private generateRecommendations(violations: string[]): string[] {
    const recommendations: string[] = [];

    if (violations.length === 0) {
      recommendations.push('✅ No documentation violations detected');
      recommendations.push('All documentation follows inline policy');
      return recommendations;
    }

    recommendations.push(
      `⚠️  Found ${violations.length} documentation violation(s)`
    );
    recommendations.push('');
    recommendations.push(
      'Policy: Use inline documentation in CURRENT_TRUTH.md instead of separate files'
    );
    recommendations.push('');
    recommendations.push('Actions to take:');
    recommendations.push('1. Review content of violation files');
    recommendations.push('2. Add relevant content to CURRENT_TRUTH.md');
    recommendations.push('3. Remove violation files with: git rm <file>');
    recommendations.push('4. Commit changes');
    recommendations.push('');
    recommendations.push('Violation files to remove:');

    for (const file of violations) {
      recommendations.push(`  - ${file}`);
    }

    return recommendations;
  }

  /**
   * Calculate documentation health score (0-100)
   */
  private calculateScore(total: number, violations: number): number {
    if (total === 0) {
      return 100;
    }

    // Deduct points based on violation ratio
    const violationRatio = violations / total;
    const score = Math.max(0, 100 - Math.round(violationRatio * 200));

    return score;
  }
}
