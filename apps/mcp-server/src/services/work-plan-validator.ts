/**
 * Work Plan Validator Service
 * Evaluates AI agent work plans BEFORE implementation begins
 * Guides AI agents to follow ways of working proactively
 */

import { RoadmapService } from './roadmap-service.js';

export interface WorkPlan {
  taskDescription: string;
  proposedApproach: string;
  filesImpacted: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  requiresTests: boolean;
  requiresDocumentation: boolean;
}

export interface ValidationResult {
  approved: boolean;
  score: number; // 0-100
  concerns: Concern[];
  suggestions: string[];
  requiredChecks: string[];
  recommendation: 'proceed' | 'revise' | 'reject';
  approvedAt?: string; // ISO timestamp if approved
}

export interface Concern {
  category:
    | 'scope'
    | 'approach'
    | 'documentation'
    | 'testing'
    | 'strategy'
    | 'roadmap';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export class WorkPlanValidator {
  // AI_AGENT_PROTOCOL.md is critical operational documentation for MCP-guided development.
  // Unlike troubleshooting guides, this is foundational workflow documentation that
  // should be versioned with the codebase, similar to CONTRIBUTING.md.
  private readonly allowedDocsPattern =
    /^(README\.md|CURRENT_TRUTH\.md|AI_AGENT_PROTOCOL\.md|CHANGELOG\.md|CONTRIBUTING\.md|LICENSE\.md)$/i;
  private roadmapService: RoadmapService;

  constructor() {
    this.roadmapService = new RoadmapService();
  }

  /**
   * Main validation method
   */
  validate(plan: WorkPlan): ValidationResult {
    const concerns: Concern[] = [];

    // Run all validation checks
    concerns.push(...this.validateScope(plan));
    concerns.push(...this.validateApproach(plan));
    concerns.push(...this.validateTesting(plan));
    concerns.push(...this.validateDocumentation(plan));
    concerns.push(...this.validateStrategy(plan));
    concerns.push(...this.validateRoadmapAlignment(plan));

    // Calculate score and recommendation
    const score = this.calculateScore(concerns);
    const recommendation = this.generateRecommendation(score, concerns);
    const suggestions = this.generateSuggestions(concerns);
    const requiredChecks = this.generateRequiredChecks(plan);
    const approved = recommendation === 'proceed';

    return {
      approved,
      score,
      concerns,
      suggestions,
      requiredChecks,
      recommendation,
      approvedAt: approved ? new Date().toISOString() : undefined,
    };
  }

  /**
   * Validate scope: Check file count limits, detect documentation mixing
   */
  validateScope(plan: WorkPlan): Concern[] {
    const concerns: Concern[] = [];

    // Check file count limit
    if (plan.filesImpacted.length > 10) {
      concerns.push({
        category: 'scope',
        severity: 'high',
        description: `Too many files impacted (${plan.filesImpacted.length}), scope may be too broad`,
        suggestion: 'Break down into smaller, focused tasks',
      });
    }

    // Detect mixed concerns (code + documentation)
    const hasCodeFiles = plan.filesImpacted.some(
      (f) =>
        f.endsWith('.ts') ||
        f.endsWith('.js') ||
        f.endsWith('.tsx') ||
        f.endsWith('.jsx')
    );
    const hasDocFiles = plan.filesImpacted.some((f) => f.endsWith('.md'));

    if (hasCodeFiles && hasDocFiles) {
      concerns.push({
        category: 'scope',
        severity: 'medium',
        description:
          'Mixed concerns: both code and documentation files in same task',
        suggestion: 'Separate code changes from documentation updates',
      });
    }

    // Detect new documentation files
    const newDocFiles = plan.filesImpacted.filter(
      (f) =>
        f.endsWith('.md') &&
        !this.allowedDocsPattern.test(f.split('/').pop() || '')
    );

    if (newDocFiles.length > 0) {
      concerns.push({
        category: 'scope',
        severity: 'critical',
        description: `Creating new documentation files: ${newDocFiles.join(', ')}`,
        suggestion: 'Add documentation inline in CURRENT_TRUTH.md instead',
      });
    }

    return concerns;
  }

  /**
   * Validate approach: Scan for workaround/shortcut phrases
   */
  validateApproach(plan: WorkPlan): Concern[] {
    const concerns: Concern[] = [];
    const approach = plan.proposedApproach.toLowerCase();

    // Detect workaround language
    const workaroundPatterns = [
      { pattern: /quick\s+fix/i, label: '"quick fix"' },
      { pattern: /temporary/i, label: '"temporary"' },
      { pattern: /workaround/i, label: '"workaround"' },
      { pattern: /hack\b/i, label: '"hack"' },
      { pattern: /fix.*later/i, label: '"fix later"' },
      { pattern: /will.*proper/i, label: '"will do proper"' },
      { pattern: /\btemp\b/i, label: '"temp"' },
    ];

    for (const { pattern, label } of workaroundPatterns) {
      if (pattern.test(approach)) {
        concerns.push({
          category: 'approach',
          severity: 'critical',
          description: `Workaround detected: ${label} in approach description`,
          suggestion:
            'Implement a proper root cause solution instead of a workaround',
        });
      }
    }

    // Detect shortcut phrases
    const shortcutPatterns = [
      { pattern: /skip\s+tests?/i, label: '"skip tests"' },
      { pattern: /add\s+.+?\s+later/i, label: '"add later"' },
      { pattern: /TODO/i, label: '"TODO"' },
      { pattern: /@ts-ignore/i, label: '"@ts-ignore"' },
      { pattern: /eslint-disable/i, label: '"eslint-disable"' },
    ];

    for (const { pattern, label } of shortcutPatterns) {
      if (pattern.test(approach)) {
        concerns.push({
          category: 'approach',
          severity: 'high',
          description: `Shortcut detected: ${label} in approach description`,
          suggestion:
            'Complete the work properly instead of deferring or bypassing',
        });
      }
    }

    return concerns;
  }

  /**
   * Validate testing: Ensure tests planned, not deferred
   */
  validateTesting(plan: WorkPlan): Concern[] {
    const concerns: Concern[] = [];

    // Check if tests are required but not planned
    const hasCodeFiles = plan.filesImpacted.some(
      (f) =>
        f.endsWith('.ts') ||
        f.endsWith('.js') ||
        f.endsWith('.tsx') ||
        f.endsWith('.jsx')
    );

    if (hasCodeFiles && !plan.requiresTests) {
      concerns.push({
        category: 'testing',
        severity: 'high',
        description: 'Code changes planned without tests',
        suggestion: 'Add tests to verify the changes work correctly',
      });
    }

    // Check for deferred testing language
    const approach = plan.proposedApproach.toLowerCase();
    const deferredTestPatterns = [
      /add\s+tests?\s+later/i,
      /tests?\s+in\s+follow-?up/i,
      /skip\s+tests?/i,
      /without\s+tests?/i,
    ];

    for (const pattern of deferredTestPatterns) {
      if (pattern.test(approach)) {
        concerns.push({
          category: 'testing',
          severity: 'critical',
          description: 'Tests mentioned as deferred or skipped',
          suggestion: 'Write tests as part of this task, not later',
        });
      }
    }

    // Check for test-first approach mention for new features
    if (plan.estimatedComplexity !== 'simple' && plan.requiresTests) {
      const hasTestFirstMention = /test[s\-\s]*first/i.test(
        plan.proposedApproach
      );
      if (!hasTestFirstMention) {
        concerns.push({
          category: 'testing',
          severity: 'low',
          description: 'Complex feature without test-first approach mentioned',
          suggestion: 'Consider writing tests first for new features',
        });
      }
    }

    return concerns;
  }

  /**
   * Validate documentation: Enforce inline-only policy
   */
  validateDocumentation(plan: WorkPlan): Concern[] {
    const concerns: Concern[] = [];

    // Check for new .md file creation
    const newDocFiles = plan.filesImpacted.filter(
      (f) =>
        f.endsWith('.md') &&
        !this.allowedDocsPattern.test(f.split('/').pop() || '')
    );

    if (newDocFiles.length > 0) {
      concerns.push({
        category: 'documentation',
        severity: 'critical',
        description: `New documentation files violate inline policy: ${newDocFiles.join(', ')}`,
        suggestion:
          'Add documentation inline in CURRENT_TRUTH.md instead of creating new files',
      });
    }

    // Check for inline comments mention for complex logic
    if (plan.estimatedComplexity === 'complex' && plan.requiresDocumentation) {
      const hasInlineMention = /inline\s+comment/i.test(plan.proposedApproach);
      if (!hasInlineMention) {
        concerns.push({
          category: 'documentation',
          severity: 'low',
          description:
            'Complex logic requires documentation but inline comments not mentioned',
          suggestion: 'Add WHY comments inline in code for complex logic',
        });
      }
    }

    // Check for CURRENT_TRUTH.md update for platform changes
    const hasPlatformFiles = plan.filesImpacted.some(
      (f) =>
        f.includes('config') || f.includes('main.ts') || f.includes('server.ts')
    );

    if (hasPlatformFiles && plan.requiresDocumentation) {
      const hasTruthUpdate = plan.filesImpacted.some((f) =>
        f.includes('CURRENT_TRUTH.md')
      );
      if (!hasTruthUpdate) {
        concerns.push({
          category: 'documentation',
          severity: 'medium',
          description: 'Platform changes should update CURRENT_TRUTH.md',
          suggestion: 'Include CURRENT_TRUTH.md in files impacted',
        });
      }
    }

    return concerns;
  }

  /**
   * Validate strategy: Check evidence-based, sequential approach
   */
  validateStrategy(plan: WorkPlan): Concern[] {
    const concerns: Concern[] = [];
    const approach = plan.proposedApproach;

    // Check for evidence-based verification
    const evidencePatterns = [
      /verify/i,
      /test\s+with/i,
      /curl/i,
      /command\s+output/i,
      /console/i,
      /check\s+that/i,
    ];

    const hasEvidenceMention = evidencePatterns.some((p) => p.test(approach));
    if (!hasEvidenceMention) {
      concerns.push({
        category: 'strategy',
        severity: 'medium',
        description: 'No verification steps mentioned in approach',
        suggestion:
          'Specify how you will verify the changes work (e.g., curl commands, test outputs)',
      });
    }

    // Check for sequential validation
    const sequentialPatterns = [
      /step\s+\d+/i,
      /first.*then/i,
      /after.*validate/i,
      /\d+\./,
    ];

    const hasSequentialMention = sequentialPatterns.some((p) =>
      p.test(approach)
    );
    if (!hasSequentialMention && plan.estimatedComplexity !== 'simple') {
      concerns.push({
        category: 'strategy',
        severity: 'medium',
        description: 'No sequential steps mentioned for non-simple task',
        suggestion:
          'Break down approach into sequential steps with validation between steps',
      });
    }

    // Check for MCP-first approach
    const mcpPatterns = [
      /mcp.*health/i,
      /localhost:3001/i,
      /curl.*health/i,
      /query.*mcp/i,
    ];

    const hasMCPMention = mcpPatterns.some((p) => p.test(approach));
    if (!hasMCPMention) {
      concerns.push({
        category: 'strategy',
        severity: 'low',
        description: 'MCP health check not mentioned in approach',
        suggestion: 'Start by querying MCP health: curl localhost:3001/health',
      });
    }

    return concerns;
  }

  /**
   * Validate roadmap alignment: Check if work aligns with current roadmap phase
   */
  validateRoadmapAlignment(plan: WorkPlan): Concern[] {
    const concerns: Concern[] = [];

    try {
      const alignment = this.roadmapService.checkAlignment(plan);

      // Skip validation if no active phase is defined (test environment)
      // This prevents penalizing work plans in environments without active roadmaps
      if (alignment.currentPhase.name === 'Unknown') {
        // No active phase defined - skip roadmap validation
        // This is expected in test environments and development scenarios
        return concerns;
      }

      if (!alignment.aligned) {
        if (!alignment.workPlanMatchesPhase) {
          concerns.push({
            category: 'roadmap',
            severity: 'high',
            description: `Work does not align with current phase: ${alignment.currentPhase.name}`,
            suggestion: `Current phase deliverables: ${alignment.currentPhase.deliverables
              .filter((d) => d.status !== 'complete')
              .map((d) => d.name)
              .join(', ')}`,
          });
        }

        if (alignment.blockers.length > 0) {
          concerns.push({
            category: 'roadmap',
            severity: 'critical',
            description: `Phase blocked: ${alignment.blockers.join(', ')}`,
            suggestion: 'Resolve blockers before proceeding with this phase',
          });
        }
      }
    } catch (error) {
      // If roadmap service fails, add low severity concern but don't block
      concerns.push({
        category: 'roadmap',
        severity: 'low',
        description: 'Unable to check roadmap alignment',
        suggestion: 'Roadmap service may be unavailable, proceed with caution',
      });
    }

    return concerns;
  }

  /**
   * Calculate score based on concerns (100 - deductions)
   */
  calculateScore(concerns: Concern[]): number {
    let score = 100;

    for (const concern of concerns) {
      switch (concern.severity) {
        case 'critical':
          score -= 40;
          break;
        case 'high':
          score -= 25;
          break;
        case 'medium':
          score -= 15;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Generate recommendation based on score and concerns
   */
  generateRecommendation(
    score: number,
    concerns: Concern[]
  ): 'proceed' | 'revise' | 'reject' {
    const hasCritical = concerns.some((c) => c.severity === 'critical');

    if (hasCritical || score < 40) {
      return 'reject';
    }

    if (score < 70) {
      return 'revise';
    }

    return 'proceed';
  }

  /**
   * Generate actionable suggestions from concerns
   */
  generateSuggestions(concerns: Concern[]): string[] {
    return concerns.map((c) => c.suggestion);
  }

  /**
   * Generate required validation checks for the work plan
   */
  generateRequiredChecks(plan: WorkPlan): string[] {
    const checks: string[] = [];

    // Always require MCP health check
    checks.push('Query MCP health: curl localhost:3001/health');

    // Require build verification for code changes
    const hasCodeFiles = plan.filesImpacted.some(
      (f) =>
        f.endsWith('.ts') ||
        f.endsWith('.js') ||
        f.endsWith('.tsx') ||
        f.endsWith('.jsx')
    );

    if (hasCodeFiles) {
      checks.push('Build the project: pnpm nx build <project>');
    }

    // Require test verification if tests are planned
    if (plan.requiresTests) {
      checks.push('Run tests: pnpm nx test <project>');
    }

    // Require documentation verification
    if (plan.requiresDocumentation) {
      checks.push('Verify documentation inline in CURRENT_TRUTH.md');
    }

    return checks;
  }
}
