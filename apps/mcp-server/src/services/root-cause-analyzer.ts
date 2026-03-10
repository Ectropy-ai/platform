/**
 * Root Cause Analyzer Service
 * Combines build errors and dependency analysis to provide fix guidance
 */

import type { BuildError } from './build-analyzer.js';
import type { DependencyAnalysis } from './dependency-tracer.js';

export interface RootCause {
  category: 'module-resolution' | 'type-mismatch' | 'config-error' | 'build-order';
  description: string;
  evidence: string[]; // Supporting data points
  affectedFiles: string[];
  properFix: FixGuidance;
  workaroundSigns: string[]; // Red flags to avoid
}

export interface FixGuidance {
  description: string;
  steps: FixStep[];
  filesToModify: string[];
  validationCommand: string;
  estimatedTime: string;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface FixStep {
  order: number;
  action: string;
  command?: string;
  validation: string;
}

export class RootCauseAnalyzer {
  /**
   * Analyze build errors and dependency information to determine root cause
   */
  analyze(buildErrors: BuildError[], dependencyAnalysis: DependencyAnalysis): RootCause {
    // 1. Categorize primary issue
    const category = this.categorizeIssue(buildErrors, dependencyAnalysis);
    
    // 2. Collect evidence
    const evidence = this.collectEvidence(buildErrors, dependencyAnalysis);
    
    // 3. Identify affected files
    const affectedFiles = this.getAffectedFiles(buildErrors, dependencyAnalysis);
    
    // 4. Generate fix guidance based on category
    const properFix = this.generateFixGuidance(category, evidence, affectedFiles);
    
    // 5. Identify workaround signs to avoid
    const workaroundSigns = this.getWorkaroundSigns(category);

    // 6. Generate description
    const description = this.generateDescription(category, evidence);

    return {
      category,
      description,
      evidence,
      affectedFiles,
      properFix,
      workaroundSigns,
    };
  }

  /**
   * Categorize the primary issue
   */
  private categorizeIssue(
    buildErrors: BuildError[],
    dependencyAnalysis: DependencyAnalysis
  ): RootCause['category'] {
    // Check if there are missing dependencies
    if (dependencyAnalysis.importChain.missingDependencies.length > 0) {
      // If missing deps are module resolution errors
      const hasModuleErrors = buildErrors.some(
        (e) => e.category === 'module-resolution'
      );
      if (hasModuleErrors) {
        return 'module-resolution';
      }
    }

    // Check if there are blocking dependencies
    if (dependencyAnalysis.blockedBy.length > 0) {
      return 'build-order';
    }

    // Check for type errors
    const typeErrors = buildErrors.filter((e) => e.category === 'type-error');
    if (typeErrors.length > 0) {
      return 'type-mismatch';
    }

    // Check for config errors
    const configErrors = buildErrors.filter((e) => e.category === 'config');
    if (configErrors.length > 0) {
      return 'config-error';
    }

    // Default to module-resolution if module-resolution errors exist
    const moduleResolutionErrors = buildErrors.filter(
      (e) => e.category === 'module-resolution'
    );
    if (moduleResolutionErrors.length > 0) {
      return 'module-resolution';
    }

    // Fallback
    return 'type-mismatch';
  }

  /**
   * Collect evidence from errors and dependencies
   */
  private collectEvidence(
    buildErrors: BuildError[],
    dependencyAnalysis: DependencyAnalysis
  ): string[] {
    const evidence: string[] = [];

    // Add error messages
    buildErrors.forEach((error) => {
      evidence.push(`${error.code}: ${error.message}`);
    });

    // Add missing dependencies
    dependencyAnalysis.importChain.missingDependencies.forEach((dep) => {
      evidence.push(`Missing dependency: ${dep}`);
    });

    // Add circular dependencies
    dependencyAnalysis.importChain.circularDependencies.forEach((dep) => {
      evidence.push(`Circular dependency detected: ${dep}`);
    });

    // Add blocking dependencies
    dependencyAnalysis.blockedBy.forEach((dep) => {
      evidence.push(`Blocked by: ${dep}`);
    });

    return evidence;
  }

  /**
   * Get list of affected files
   */
  private getAffectedFiles(
    buildErrors: BuildError[],
    dependencyAnalysis: DependencyAnalysis
  ): string[] {
    const files = new Set<string>();

    // Add files from errors
    buildErrors.forEach((error) => {
      if (error.file) {
        files.add(error.file);
      }
    });

    // Add target file
    files.add(dependencyAnalysis.targetFile);

    return Array.from(files);
  }

  /**
   * Generate fix guidance based on category
   */
  private generateFixGuidance(
    category: RootCause['category'],
    evidence: string[],
    affectedFiles: string[]
  ): FixGuidance {
    switch (category) {
      case 'module-resolution':
        return this.generateModuleResolutionFix(evidence, affectedFiles);
      
      case 'build-order':
        return this.generateBuildOrderFix(evidence, affectedFiles);
      
      case 'type-mismatch':
        return this.generateTypeMismatchFix(evidence, affectedFiles);
      
      case 'config-error':
        return this.generateConfigErrorFix(evidence, affectedFiles);
      
      default:
        return this.generateDefaultFix(evidence, affectedFiles);
    }
  }

  /**
   * Generate fix guidance for module resolution issues
   */
  private generateModuleResolutionFix(
    evidence: string[],
    affectedFiles: string[]
  ): FixGuidance {
    const steps: FixStep[] = [];

    // Identify the missing module from evidence
    const missingModules = evidence
      .filter((e) => e.includes('Missing dependency') || e.includes('Cannot find module'))
      .map((e) => {
        const match = e.match(/[@\w/-]+/);
        return match ? match[0] : null;
      })
      .filter((m): m is string => m !== null);

    const primaryModule = missingModules[0] || '@ectropy/shared';

    steps.push({
      order: 1,
      action: `Verify that ${primaryModule} library builds successfully`,
      command: `pnpm nx build ${primaryModule.replace('@ectropy/', '')}`,
      validation: `Build completes without errors`,
    });

    steps.push({
      order: 2,
      action: 'Update tsconfig.base.json path mapping',
      command: `Check and fix paths configuration for ${primaryModule}`,
      validation: 'TypeScript resolves import correctly',
    });

    steps.push({
      order: 3,
      action: 'Rebuild the failing application',
      command: 'pnpm nx build <app-name>',
      validation: 'Build succeeds with zero errors',
    });

    return {
      description: `Fix path mapping for ${primaryModule} to point to built output`,
      steps,
      filesToModify: ['tsconfig.base.json'],
      validationCommand: 'pnpm nx build <app-name>',
      estimatedTime: '15 minutes',
      complexity: 'moderate',
    };
  }

  /**
   * Generate fix guidance for build order issues
   */
  private generateBuildOrderFix(
    evidence: string[],
    affectedFiles: string[]
  ): FixGuidance {
    const blockedByModules = evidence
      .filter((e) => e.includes('Blocked by'))
      .map((e) => e.replace('Blocked by: ', ''));

    const steps: FixStep[] = [];

    blockedByModules.forEach((module, index) => {
      steps.push({
        order: index + 1,
        action: `Build dependency: ${module}`,
        command: `pnpm nx build ${module.replace('@ectropy/', '')}`,
        validation: `${module} builds successfully`,
      });
    });

    steps.push({
      order: steps.length + 1,
      action: 'Rebuild the target application',
      command: 'pnpm nx build <app-name>',
      validation: 'Build succeeds with dependencies available',
    });

    return {
      description: 'Build dependencies in the correct order',
      steps,
      filesToModify: [],
      validationCommand: 'pnpm nx run-many --target=build --all',
      estimatedTime: '20 minutes',
      complexity: 'moderate',
    };
  }

  /**
   * Generate fix guidance for type mismatch issues
   */
  private generateTypeMismatchFix(
    evidence: string[],
    affectedFiles: string[]
  ): FixGuidance {
    return {
      description: 'Fix type mismatches by adding proper type annotations',
      steps: [
        {
          order: 1,
          action: 'Review type errors in affected files',
          validation: 'Identify which types are incompatible',
        },
        {
          order: 2,
          action: 'Add explicit type annotations or fix type usage',
          validation: 'Types align correctly',
        },
        {
          order: 3,
          action: 'Rebuild to verify fixes',
          command: 'pnpm nx build <app-name>',
          validation: 'No type errors remain',
        },
      ],
      filesToModify: affectedFiles,
      validationCommand: 'pnpm nx build <app-name>',
      estimatedTime: '30 minutes',
      complexity: 'moderate',
    };
  }

  /**
   * Generate fix guidance for config errors
   */
  private generateConfigErrorFix(
    evidence: string[],
    affectedFiles: string[]
  ): FixGuidance {
    return {
      description: 'Fix TypeScript configuration issues',
      steps: [
        {
          order: 1,
          action: 'Review tsconfig.json for invalid options',
          validation: 'Identify problematic compiler options',
        },
        {
          order: 2,
          action: 'Fix or remove invalid compiler options',
          validation: 'Configuration is valid',
        },
        {
          order: 3,
          action: 'Rebuild to verify configuration',
          command: 'pnpm nx build <app-name>',
          validation: 'Build succeeds with correct configuration',
        },
      ],
      filesToModify: ['tsconfig.json', 'tsconfig.base.json'],
      validationCommand: 'pnpm tsc --noEmit',
      estimatedTime: '10 minutes',
      complexity: 'simple',
    };
  }

  /**
   * Generate default fix guidance
   */
  private generateDefaultFix(
    evidence: string[],
    affectedFiles: string[]
  ): FixGuidance {
    return {
      description: 'Investigate build errors and apply appropriate fixes',
      steps: [
        {
          order: 1,
          action: 'Review build output for detailed error messages',
          command: 'pnpm nx build <app-name> --verbose',
          validation: 'Understand the nature of the errors',
        },
        {
          order: 2,
          action: 'Apply fixes based on error patterns',
          validation: 'Errors are resolved',
        },
        {
          order: 3,
          action: 'Rebuild to verify',
          command: 'pnpm nx build <app-name>',
          validation: 'Build succeeds',
        },
      ],
      filesToModify: affectedFiles,
      validationCommand: 'pnpm nx build <app-name>',
      estimatedTime: '30-60 minutes',
      complexity: 'complex',
    };
  }

  /**
   * Get workaround signs for a given category
   */
  private getWorkaroundSigns(category: RootCause['category']): string[] {
    const commonSigns = [
      'Commenting out imports',
      'Using "any" types to bypass errors',
      'Copying files instead of fixing paths',
    ];

    switch (category) {
      case 'module-resolution':
        return [
          ...commonSigns,
          'Changing import statements instead of path config',
          'Installing duplicate packages in multiple locations',
        ];
      
      case 'build-order':
        return [
          ...commonSigns,
          'Building projects manually in random order',
          'Skipping dependency builds',
        ];
      
      case 'type-mismatch':
        return [
          ...commonSigns,
          'Using type assertions (as any) excessively',
          'Disabling strict type checking',
        ];
      
      case 'config-error':
        return [
          ...commonSigns,
          'Removing valid compiler options',
          'Using overly permissive configurations',
        ];
      
      default:
        return commonSigns;
    }
  }

  /**
   * Generate a human-readable description
   */
  private generateDescription(
    category: RootCause['category'],
    evidence: string[]
  ): string {
    switch (category) {
      case 'module-resolution':
        return 'Cannot resolve module imports - path mapping issue';
      
      case 'build-order':
        return 'Dependencies not built in correct order';
      
      case 'type-mismatch':
        return 'Type incompatibility between declarations and usage';
      
      case 'config-error':
        return 'Invalid TypeScript compiler configuration';
      
      default:
        return 'Build failure requires investigation';
    }
  }
}
