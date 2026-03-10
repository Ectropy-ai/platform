/**
 * Strategy Alignment Checker Service
 * Scores AI suggestions against established ways of working
 */

export interface StrategyCheck {
  isRootCauseFix: boolean; // Not treating symptoms
  avoidsWorkarounds: boolean; // No temporary solutions
  followsSequentialApproach: boolean; // Validates each step
  usesInlineDocumentation: boolean; // No separate .md files
  evidenceBased: boolean; // Specifies verification
  queriesMCPFirst: boolean; // Checks MCP health
  maintainsTests: boolean; // Tests written/updated
  score: number; // 0-100
  alignment: 'excellent' | 'good' | 'needs-improvement' | 'misaligned';
  violations: string[];
  recommendations: string[];
  timestamp: string;
}

export interface StrategyInput {
  approach: string;
  validationSteps: string[];
}

export class StrategyChecker {
  /**
   * Main check method
   */
  check(input: StrategyInput): StrategyCheck {
    const violations: string[] = [];
    const recommendations: string[] = [];
    
    // Run all checks
    const isRootCauseFix = this.checkRootCause(input.approach, violations, recommendations);
    const avoidsWorkarounds = this.checkWorkarounds(input.approach, violations, recommendations);
    const followsSequentialApproach = this.checkSequential(input.approach, violations, recommendations);
    const usesInlineDocumentation = this.checkDocumentation(input.approach, violations, recommendations);
    const evidenceBased = this.checkEvidence(input.validationSteps, violations, recommendations);
    const queriesMCPFirst = this.checkMCPFirst(input.approach, violations, recommendations);
    const maintainsTests = this.checkTests(input.approach, violations, recommendations);
    
    // Calculate score based on checks
    const score = this.calculateScore({
      isRootCauseFix,
      avoidsWorkarounds,
      followsSequentialApproach,
      usesInlineDocumentation,
      evidenceBased,
      queriesMCPFirst,
      maintainsTests,
    });
    
    // Determine alignment level based on score
    const alignment = this.determineAlignment(score);
    
    return {
      isRootCauseFix,
      avoidsWorkarounds,
      followsSequentialApproach,
      usesInlineDocumentation,
      evidenceBased,
      queriesMCPFirst,
      maintainsTests,
      score,
      alignment,
      violations,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Check if approach addresses root cause vs symptom
   */
  checkRootCause(approach: string, violations: string[], recommendations: string[]): boolean {
    const approachLower = approach.toLowerCase();
    
    // Red flags indicating symptom treatment
    const symptomPatterns = [
      /bypass/i,
      /disable/i,
      /ignore/i,
      /suppress/i,
      /hide/i,
      /comment.*out/i,
    ];
    
    const hasSymptomTreatment = symptomPatterns.some(p => p.test(approachLower));
    
    // Green flags indicating root cause fix
    const rootCausePatterns = [
      /fix\s+(?:the\s+)?root\s+cause/i,
      /resolve\s+(?:the\s+)?underlying/i,
      /implement\s+proper/i,
      /correct\s+(?:the\s+)?issue/i,
    ];
    
    const hasRootCauseMention = rootCausePatterns.some(p => p.test(approach));
    
    if (hasSymptomTreatment) {
      violations.push('Approach appears to treat symptoms rather than root cause');
      recommendations.push('Identify and fix the underlying root cause instead of bypassing/disabling');
      return false;
    }
    
    if (!hasRootCauseMention && approach.length > 50) {
      // Long approach without explicit root cause mention
      recommendations.push('Explicitly mention addressing the root cause');
    }
    
    return !hasSymptomTreatment;
  }
  
  /**
   * Check for temporary/workaround language
   */
  checkWorkarounds(approach: string, violations: string[], recommendations: string[]): boolean {
    const workaroundPatterns = [
      /quick\s+fix/i,
      /temporary/i,
      /workaround/i,
      /hack\b/i,
      /fix.*later/i,
      /\btemp\b/i,
      /for\s+now/i,
    ];
    
    for (const pattern of workaroundPatterns) {
      if (pattern.test(approach)) {
        violations.push(`Temporary solution detected: ${pattern.source}`);
        recommendations.push('Implement a permanent solution instead of a workaround');
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check for sequential validation approach
   */
  checkSequential(approach: string, violations: string[], recommendations: string[]): boolean {
    // Look for step indicators
    const sequentialIndicators = [
      /step\s+\d+/i,
      /\d+\.\s/,
      /first.*then/i,
      /after.*validate/i,
      /then.*verify/i,
    ];
    
    const hasSequentialStructure = sequentialIndicators.some(p => p.test(approach));
    
    // Look for validation keywords
    const validationKeywords = [
      /validate/i,
      /verify/i,
      /check\s+that/i,
      /ensure/i,
      /confirm/i,
    ];
    
    const hasValidation = validationKeywords.some(p => p.test(approach));
    
    if (!hasSequentialStructure && approach.length > 100) {
      violations.push('Complex approach without sequential steps');
      recommendations.push('Break down into numbered steps with validation between each');
      return false;
    }
    
    if (!hasValidation) {
      recommendations.push('Add validation/verification steps between major changes');
    }
    
    return hasSequentialStructure || approach.length <= 100;
  }
  
  /**
   * Check for inline documentation approach
   */
  checkDocumentation(approach: string, violations: string[], recommendations: string[]): boolean {
    const newDocPatterns = [
      /create\s+.*\.md/i,
      /new\s+.*\.md/i,
      /add\s+.*guide/i,
      /write\s+.*documentation/i,
    ];
    
    const inlinePatterns = [
      /inline\s+comment/i,
      /add\s+comment/i,
      /update\s+current[_\s]truth/i,
    ];
    
    const createsNewDocs = newDocPatterns.some(p => p.test(approach));
    const mentionsInline = inlinePatterns.some(p => p.test(approach));
    
    if (createsNewDocs && !mentionsInline) {
      violations.push('Creating new documentation files instead of inline comments');
      recommendations.push('Add documentation inline in code or update CURRENT_TRUTH.md');
      return false;
    }
    
    return !createsNewDocs;
  }
  
  /**
   * Check for evidence-based verification
   */
  checkEvidence(validationSteps: string[], violations: string[], recommendations: string[]): boolean {
    if (!validationSteps || validationSteps.length === 0) {
      violations.push('No validation steps provided');
      recommendations.push('Specify how you will verify the changes work (curl commands, test outputs, etc.)');
      return false;
    }
    
    // Look for concrete evidence
    const evidencePatterns = [
      /curl/i,
      /test/i,
      /build/i,
      /output/i,
      /response/i,
      /status/i,
    ];
    
    const hasConcreteEvidence = validationSteps.some(step => 
      evidencePatterns.some(p => p.test(step))
    );
    
    if (!hasConcreteEvidence) {
      violations.push('Validation steps lack concrete verification methods');
      recommendations.push('Include specific commands (curl, test runs) that produce verifiable output');
      return false;
    }
    
    return true;
  }
  
  /**
   * Check for MCP-first approach
   */
  checkMCPFirst(approach: string, violations: string[], recommendations: string[]): boolean {
    const mcpPatterns = [
      /mcp.*health/i,
      /localhost:3001/i,
      /curl.*health/i,
      /query.*mcp/i,
      /check.*mcp/i,
    ];
    
    const mentionsMCP = mcpPatterns.some(p => p.test(approach));
    
    if (!mentionsMCP) {
      recommendations.push('Start by querying MCP health: curl localhost:3001/health');
      return false;
    }
    
    return true;
  }
  
  /**
   * Check for test coverage
   */
  checkTests(approach: string, violations: string[], recommendations: string[]): boolean {
    const skipTestPatterns = [
      /skip\s+test/i,
      /without\s+test/i,
      /no\s+test/i,
      /test.*later/i,
    ];
    
    const testPatterns = [
      /write\s+test/i,
      /add\s+test/i,
      /test.*first/i,
      /with\s+test/i,
      /include\s+test/i,
    ];
    
    const skipsTests = skipTestPatterns.some(p => p.test(approach));
    const includesTests = testPatterns.some(p => p.test(approach));
    
    if (skipsTests) {
      violations.push('Tests are being skipped or deferred');
      recommendations.push('Write tests as part of the implementation, not later');
      return false;
    }
    
    // Check if approach mentions code changes
    const codeChangePatterns = [
      /implement/i,
      /add\s+feature/i,
      /fix\s+bug/i,
      /refactor/i,
    ];
    
    const hasCodeChanges = codeChangePatterns.some(p => p.test(approach));
    
    if (hasCodeChanges && !includesTests) {
      recommendations.push('Add tests to verify code changes work correctly');
    }
    
    return !skipsTests;
  }
  
  /**
   * Calculate weighted score (0-100)
   */
  calculateScore(checks: {
    isRootCauseFix: boolean;
    avoidsWorkarounds: boolean;
    followsSequentialApproach: boolean;
    usesInlineDocumentation: boolean;
    evidenceBased: boolean;
    queriesMCPFirst: boolean;
    maintainsTests: boolean;
  }): number {
    let score = 0;
    
    // Weighted scoring
    if (checks.isRootCauseFix) {score += 20;} // Root cause fix
    if (checks.avoidsWorkarounds) {score += 20;} // No workarounds
    if (checks.followsSequentialApproach) {score += 15;} // Sequential validation
    if (checks.usesInlineDocumentation) {score += 15;} // Inline documentation
    if (checks.evidenceBased) {score += 15;} // Evidence-based
    if (checks.queriesMCPFirst) {score += 10;} // MCP-first
    if (checks.maintainsTests) {score += 5;} // Test coverage
    
    return score;
  }
  
  /**
   * Determine alignment level based on score
   */
  determineAlignment(score: number): 'excellent' | 'good' | 'needs-improvement' | 'misaligned' {
    if (score >= 90) {return 'excellent';}
    if (score >= 70) {return 'good';}
    if (score >= 50) {return 'needs-improvement';}
    return 'misaligned';
  }
}
