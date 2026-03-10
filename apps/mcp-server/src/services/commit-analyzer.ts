/**
 * Commit Analyzer Service
 * Detects anti-patterns in git diffs to prevent code quality issues
 */

export interface CommitAnalysis {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  patterns: PatternDetection;
  violations: Violation[];
  score: number; // 0-100
  recommendation: 'approve' | 'review' | 'reject';
}

export interface PatternDetection {
  hasWorkarounds: boolean; // "quick fix", "temporary", "hack"
  hasShortcuts: boolean; // @ts-ignore, eslint-disable, skip tests
  hasTODOs: boolean; // TODO, FIXME comments
  hasCommentedCode: boolean; // Commented code blocks
  createsNewDocs: boolean; // New .md files (policy violation)
  hasHardcodedSecrets: boolean; // Passwords, API keys
  hasConsoleLogging: boolean; // console.log statements
  usesAnyType: boolean; // TypeScript 'any'
}

export interface Violation {
  category: 'anti-pattern' | 'ways-of-working' | 'security' | 'quality';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file: string;
  evidence: string;
  suggestion: string;
}

interface DiffFile {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  additions: string[];
  deletions: string[];
}

export class CommitAnalyzer {
  // AI_AGENT_PROTOCOL.md is critical operational documentation for MCP-guided development
  private readonly allowedDocsPattern = /^(README\.md|CURRENT_TRUTH\.md|AI_AGENT_PROTOCOL\.md|CHANGELOG\.md|CONTRIBUTING\.md|LICENSE\.md)$/i;
  
  /**
   * Main analysis method - parses diff and detects all patterns
   */
  analyze(diff: string): CommitAnalysis {
    const files = this.parseDiff(diff);
    const patterns = this.detectPatterns(files);
    const violations = this.generateViolations(patterns, files);
    const score = this.calculateScore(violations);
    const recommendation = this.generateRecommendation(violations, score);
    
    const linesAdded = files.reduce((sum, f) => sum + f.additions.length, 0);
    const linesRemoved = files.reduce((sum, f) => sum + f.deletions.length, 0);
    
    return {
      filesChanged: files.length,
      linesAdded,
      linesRemoved,
      patterns,
      violations,
      score,
      recommendation,
    };
  }
  
  /**
   * Parse unified diff format into structured DiffFile[]
   */
  parseDiff(diff: string): DiffFile[] {
    const files: DiffFile[] = [];
    const lines = diff.split('\n');
    
    let currentFile: DiffFile | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match file header: diff --git a/path b/path
      if (line.startsWith('diff --git')) {
        // Save previous file if exists
        if (currentFile) {
          files.push(currentFile);
        }
        
        // Extract file path (use b/ path as it's the new version)
        const pathMatch = line.match(/b\/(.+)$/);
        const path = pathMatch ? pathMatch[1] : 'unknown';
        
        currentFile = {
          path,
          type: 'modified',
          additions: [],
          deletions: [],
        };
      }
      
      // Detect new file
      if (line.startsWith('new file mode')) {
        if (currentFile) {
          currentFile.type = 'added';
        }
      }
      
      // Detect deleted file
      if (line.startsWith('deleted file mode')) {
        if (currentFile) {
          currentFile.type = 'deleted';
        }
      }
      
      // Capture additions
      if (line.startsWith('+') && !line.startsWith('+++')) {
        if (currentFile) {
          currentFile.additions.push(line.substring(1));
        }
      }
      
      // Capture deletions
      if (line.startsWith('-') && !line.startsWith('---')) {
        if (currentFile) {
          currentFile.deletions.push(line.substring(1));
        }
      }
    }
    
    // Don't forget the last file
    if (currentFile) {
      files.push(currentFile);
    }
    
    return files;
  }
  
  /**
   * Scan code changes for all anti-pattern categories
   */
  detectPatterns(files: DiffFile[]): PatternDetection {
    return {
      hasWorkarounds: this.detectWorkarounds(files),
      hasShortcuts: this.detectShortcuts(files),
      hasTODOs: this.detectTODOs(files),
      hasCommentedCode: this.detectCommentedCode(files),
      createsNewDocs: this.detectNewDocs(files),
      hasHardcodedSecrets: this.detectSecrets(files),
      hasConsoleLogging: this.detectConsoleLogging(files),
      usesAnyType: this.detectAnyTypes(files),
    };
  }
  
  /**
   * Detect workaround phrases in code changes
   */
  private detectWorkarounds(files: DiffFile[]): boolean {
    const workaroundPatterns = [
      /quick\s+fix/i,
      /temporary/i,
      /workaround/i,
      /hack\b/i,
      /fix.*later/i,
      /will.*proper/i,
      /\bTEMP\b/,
      /\bFIXME\b/,
    ];
    
    return files.some(file =>
      file.additions.some(line =>
        workaroundPatterns.some(pattern => pattern.test(line))
      )
    );
  }
  
  /**
   * Detect shortcut patterns (type suppressions, lint disables)
   */
  private detectShortcuts(files: DiffFile[]): boolean {
    const shortcutPatterns = [
      /@ts-ignore/,
      /@ts-nocheck/,
      /eslint-disable/,
      /skip.*test/i,
      /disable.*lint/i,
    ];
    
    return files.some(file =>
      file.additions.some(line =>
        shortcutPatterns.some(pattern => pattern.test(line))
      )
    );
  }
  
  /**
   * Detect TODO/FIXME comments
   */
  private detectTODOs(files: DiffFile[]): boolean {
    const todoPattern = /\b(TODO|FIXME)\b/;
    
    return files.some(file =>
      file.additions.some(line => todoPattern.test(line))
    );
  }
  
  /**
   * Detect commented out code blocks
   */
  private detectCommentedCode(files: DiffFile[]): boolean {
    const commentedCodePatterns = [
      /^\s*\/\/\s*(function|const|let|var|class|interface|export|import)\s+\w+/,
      /^\s*\/\/\s*\{/,
      /^\s*\/\/\s*(if|for|while|switch)\s*\(/,
    ];
    
    return files.some(file =>
      file.additions.some(line =>
        commentedCodePatterns.some(pattern => pattern.test(line))
      )
    );
  }
  
  /**
   * Detect new documentation files (policy violation)
   */
  private detectNewDocs(files: DiffFile[]): boolean {
    const violationPatterns = [
      /TROUBLESHOOTING/i,
      /FIX.*README/i,
      /QUICK.*FIX/i,
    ];
    
    return files.some(file => {
      if (file.type !== 'added') {return false;}
      if (!file.path.endsWith('.md')) {return false;}
      
      // Check if it's an allowed doc
      const filename = file.path.split('/').pop() || '';
      if (this.allowedDocsPattern.test(filename)) {return false;}
      
      // Check for violation patterns in filename
      return violationPatterns.some(pattern => pattern.test(file.path));
    });
  }
  
  /**
   * Detect hardcoded secrets (passwords, API keys)
   */
  private detectSecrets(files: DiffFile[]): boolean {
    const secretPatterns = [
      /password\s*=\s*['"][^'"]{8,}['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]{16,}['"]/i,
    ];
    
    // Exclude test files and fixtures
    const isTestFile = (path: string) => 
      /\.(test|spec|mock|fixture)\.(ts|js|tsx|jsx)$/i.test(path) ||
      path.includes('__tests__') ||
      path.includes('test-data') ||
      path.includes('fixtures');
    
    return files.some(file => {
      if (isTestFile(file.path)) {return false;}
      
      return file.additions.some(line =>
        secretPatterns.some(pattern => pattern.test(line))
      );
    });
  }
  
  /**
   * Detect console.log statements
   */
  private detectConsoleLogging(files: DiffFile[]): boolean {
    const consolePattern = /console\.(log|debug|info|warn|error)\s*\(/;
    
    // Exclude main.ts and other allowed files
    const isAllowedFile = (path: string) =>
      path.endsWith('main.ts') ||
      path.endsWith('main.js') ||
      path.includes('logger');
    
    return files.some(file => {
      if (isAllowedFile(file.path)) {return false;}
      
      return file.additions.some(line => consolePattern.test(line));
    });
  }
  
  /**
   * Detect TypeScript 'any' type usage
   */
  private detectAnyTypes(files: DiffFile[]): boolean {
    const anyTypePatterns = [
      /:\s*any\b/,
      /as\s+any\b/,
      /<any>/,
      /Array<any>/,
    ];
    
    return files.some(file =>
      file.additions.some(line =>
        anyTypePatterns.some(pattern => pattern.test(line))
      )
    );
  }
  
  /**
   * Generate violations from detected patterns
   */
  private generateViolations(patterns: PatternDetection, files: DiffFile[]): Violation[] {
    const violations: Violation[] = [];
    
    if (patterns.hasShortcuts) {
      violations.push({
        category: 'quality',
        severity: 'critical',
        description: 'Code contains shortcuts that bypass type checking or linting',
        file: this.findFileWithPattern(files, /@ts-ignore|@ts-nocheck|eslint-disable/),
        evidence: this.findEvidence(files, /@ts-ignore|@ts-nocheck|eslint-disable/),
        suggestion: 'Fix the underlying type or lint errors instead of suppressing them',
      });
    }
    
    if (patterns.hasHardcodedSecrets) {
      violations.push({
        category: 'security',
        severity: 'critical',
        description: 'Potential hardcoded secrets detected',
        file: this.findFileWithPattern(files, /password|api[_-]?key|secret/i),
        evidence: this.findEvidence(files, /password|api[_-]?key|secret/i),
        suggestion: 'Use environment variables or a secrets management system',
      });
    }
    
    if (patterns.createsNewDocs) {
      violations.push({
        category: 'ways-of-working',
        severity: 'critical',
        description: 'New documentation file violates inline documentation policy',
        file: this.findNewDocFile(files),
        evidence: 'New .md file created',
        suggestion: 'Add documentation inline in CURRENT_TRUTH.md instead',
      });
    }
    
    if (patterns.hasWorkarounds) {
      violations.push({
        category: 'anti-pattern',
        severity: 'high',
        description: 'Code contains workaround or temporary fix indicators',
        file: this.findFileWithPattern(files, /quick\s+fix|temporary|workaround|hack/i),
        evidence: this.findEvidence(files, /quick\s+fix|temporary|workaround|hack/i),
        suggestion: 'Implement a proper solution instead of a workaround',
      });
    }
    
    if (patterns.hasTODOs) {
      violations.push({
        category: 'quality',
        severity: 'medium',
        description: 'Code contains TODO or FIXME comments',
        file: this.findFileWithPattern(files, /\b(TODO|FIXME)\b/),
        evidence: this.findEvidence(files, /\b(TODO|FIXME)\b/),
        suggestion: 'Complete the work or create a tracked issue instead',
      });
    }
    
    if (patterns.hasConsoleLogging) {
      violations.push({
        category: 'quality',
        severity: 'medium',
        description: 'Code contains console logging statements',
        file: this.findFileWithPattern(files, /console\.(log|debug|info)/),
        evidence: this.findEvidence(files, /console\.(log|debug|info)/),
        suggestion: 'Use proper logging framework or remove debug statements',
      });
    }
    
    if (patterns.usesAnyType) {
      violations.push({
        category: 'quality',
        severity: 'low',
        description: 'Code uses TypeScript "any" type',
        file: this.findFileWithPattern(files, /:\s*any\b|as\s+any/),
        evidence: this.findEvidence(files, /:\s*any\b|as\s+any/),
        suggestion: 'Use specific types or unknown instead of any',
      });
    }
    
    if (patterns.hasCommentedCode) {
      violations.push({
        category: 'quality',
        severity: 'low',
        description: 'Code contains commented out code blocks',
        file: this.findFileWithPattern(files, /^\s*\/\/\s*(function|const|let|var|class)/),
        evidence: this.findEvidence(files, /^\s*\/\/\s*(function|const|let|var|class)/),
        suggestion: 'Remove commented code - use version control instead',
      });
    }
    
    return violations;
  }
  
  /**
   * Helper: Find file containing a pattern
   */
  private findFileWithPattern(files: DiffFile[], pattern: RegExp): string {
    const file = files.find(f =>
      f.additions.some(line => pattern.test(line))
    );
    return file ? file.path : 'unknown';
  }
  
  /**
   * Helper: Find evidence line matching pattern
   */
  private findEvidence(files: DiffFile[], pattern: RegExp): string {
    for (const file of files) {
      for (const line of file.additions) {
        if (pattern.test(line)) {
          return line.trim().substring(0, 100);
        }
      }
    }
    return 'Pattern detected';
  }
  
  /**
   * Helper: Find new documentation file
   */
  private findNewDocFile(files: DiffFile[]): string {
    const newDoc = files.find(f => f.type === 'added' && f.path.endsWith('.md'));
    return newDoc ? newDoc.path : 'unknown';
  }
  
  /**
   * Calculate score based on violations (100 - deductions)
   */
  private calculateScore(violations: Violation[]): number {
    let score = 100;
    
    for (const violation of violations) {
      switch (violation.severity) {
        case 'critical':
          score -= 30;
          break;
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }
    
    return Math.max(0, score);
  }
  
  /**
   * Generate recommendation based on violations and score
   */
  private generateRecommendation(
    violations: Violation[],
    score: number
  ): 'approve' | 'review' | 'reject' {
    // Reject if any critical violations
    const hasCritical = violations.some(v => v.severity === 'critical');
    if (hasCritical) {return 'reject';}
    
    // Reject if score too low
    if (score < 50) {return 'reject';}
    
    // Review if score moderate
    if (score < 80) {return 'review';}
    
    // Approve if score high
    return 'approve';
  }
}
