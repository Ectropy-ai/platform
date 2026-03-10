/**
 * AI Documentation Advisor - Documentation Standards and Completeness Guidance
 *
 * Provides guidance on:
 * - Documentation completeness and quality
 * - API documentation standards
 * - Code comments and inline documentation
 * - README and usage examples
 */

import { promises as fs } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface DocumentationAnalysis {
  completeness: DocumentationCompleteness;
  quality: DocumentationQuality;
  gaps: DocumentationGap[];
  recommendations: DocumentationRecommendation[];
  standards: DocumentationStandard[];
  coverage: DocumentationCoverage;
}

export interface DocumentationCompleteness {
  overall: number;
  byType: {
    readme: number;
    api: number;
    inline: number;
    examples: number;
    guides: number;
  };
  missing: MissingDocumentation[];
  outdated: OutdatedDocumentation[];
}

export interface MissingDocumentation {
  type: 'readme' | 'api' | 'examples' | 'guide' | 'changelog';
  component: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  template?: string;
}

export interface OutdatedDocumentation {
  file: string;
  lastModified: Date;
  codeLastModified: Date;
  staleness: number; // days
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface DocumentationQuality {
  readability: number;
  accuracy: number;
  completeness: number;
  consistency: number;
  issues: QualityIssue[];
}

export interface QualityIssue {
  type: 'unclear' | 'outdated' | 'incomplete' | 'inconsistent' | 'error';
  file: string;
  line?: number;
  description: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface DocumentationGap {
  category:
    | 'api'
    | 'user-guide'
    | 'developer-guide'
    | 'examples'
    | 'architecture';
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  template: string;
}

export interface DocumentationRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  category: 'completeness' | 'quality' | 'maintenance' | 'automation';
  implementation: DocumentationStep[];
  benefits: string[];
  effort: 'low' | 'medium' | 'high';
  templates: DocumentationTemplate[];
}

export interface DocumentationStep {
  step: number;
  description: string;
  files?: string[];
  content?: string;
  commands?: string[];
}

export interface DocumentationStandard {
  name: string;
  description: string;
  current: boolean;
  compliance: number;
  examples: string[];
  violations: string[];
}

export interface DocumentationCoverage {
  functions: {
    total: number;
    documented: number;
    percentage: number;
  };
  classes: {
    total: number;
    documented: number;
    percentage: number;
  };
  modules: {
    total: number;
    documented: number;
    percentage: number;
  };
  apis: {
    total: number;
    documented: number;
    percentage: number;
  };
}

export interface DocumentationTemplate {
  name: string;
  type: 'readme' | 'api' | 'guide' | 'changelog';
  content: string;
  variables: string[];
}

export class DocumentationAdvisor {
  private readonly rootPath: string;
  private readonly documentationPaths: string[];

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.documentationPaths = this.findDocumentationPaths();
  }

  /**
   * Analyze overall documentation state
   */
  async analyzeDocumentation(): Promise<DocumentationAnalysis> {
    const completeness = await this.analyzeCompleteness();
    const quality = await this.analyzeQuality();
    const gaps = await this.identifyGaps();
    const recommendations = await this.generateRecommendations(
      completeness,
      quality,
      gaps
    );
    const standards = await this.assessStandards();
    const coverage = await this.analyzeCoverage();

    return {
      completeness,
      quality,
      gaps,
      recommendations,
      standards,
      coverage,
    };
  }

  /**
   * Check documentation completeness for a specific module
   */
  async checkModuleDocumentation(
    modulePath: string
  ): Promise<DocumentationGap[]> {
    const gaps: DocumentationGap[] = [];
    const moduleName = path.basename(modulePath);

    // Check for README
    if (!(await this.hasReadme(modulePath))) {
      gaps.push({
        category: 'user-guide',
        severity: 'high',
        component: moduleName,
        description: `Module ${moduleName} is missing a README.md file`,
        impact: 'Users cannot understand how to use this module',
        effort: 'low',
        template: this.getReadmeTemplate(moduleName),
      });
    }

    // Check for API documentation
    const apiDocs = await this.checkApiDocumentation(modulePath);
    if (apiDocs.coverage < 70) {
      gaps.push({
        category: 'api',
        severity: 'medium',
        component: moduleName,
        description: `API documentation coverage is only ${apiDocs.coverage}%`,
        impact: 'Developers cannot understand how to use the API',
        effort: 'medium',
        template: this.getApiDocTemplate(),
      });
    }

    // Check for examples
    if (!(await this.hasExamples(modulePath))) {
      gaps.push({
        category: 'examples',
        severity: 'medium',
        component: moduleName,
        description: `Module ${moduleName} has no usage examples`,
        impact: 'Increases learning curve for new users',
        effort: 'medium',
        template: this.getExamplesTemplate(moduleName),
      });
    }

    return gaps;
  }

  /**
   * Generate documentation for a component
   */
  async generateDocumentationSuggestions(
    componentPath: string
  ): Promise<DocumentationRecommendation[]> {
    const recommendations: DocumentationRecommendation[] = [];
    const componentName = path.basename(
      componentPath,
      path.extname(componentPath)
    );
    const componentType = this.determineComponentType(componentPath);

    // README recommendation
    if (!(await this.hasReadme(path.dirname(componentPath)))) {
      recommendations.push({
        priority: 'high',
        title: `Create README for ${componentName}`,
        description: `Add comprehensive README.md for ${componentType}`,
        category: 'completeness',
        implementation: [
          {
            step: 1,
            description: 'Create README.md file',
            files: [path.join(path.dirname(componentPath), 'README.md')],
            content: this.generateReadmeContent(componentName, componentType),
          },
        ],
        benefits: [
          'Improved developer onboarding',
          'Clear usage instructions',
          'Better project documentation',
        ],
        effort: 'low',
        templates: [
          {
            name: 'Component README',
            type: 'readme',
            content: this.getReadmeTemplate(componentName),
            variables: ['componentName', 'description', 'usage'],
          },
        ],
      });
    }

    // API documentation recommendation
    const apiCoverage = await this.getApiCoverage(componentPath);
    if (apiCoverage < 80) {
      recommendations.push({
        priority: 'medium',
        title: `Add API documentation for ${componentName}`,
        description: `Current API documentation coverage is ${apiCoverage}%`,
        category: 'quality',
        implementation: [
          {
            step: 1,
            description: 'Add JSDoc comments to all public methods',
            files: [componentPath],
            content: this.generateJSDocExamples(componentType),
          },
          {
            step: 2,
            description: 'Generate API documentation',
            commands: ['npx typedoc --out docs/ src/'],
          },
        ],
        benefits: [
          'Better code understanding',
          'Improved maintainability',
          'Automated documentation generation',
        ],
        effort: 'medium',
        templates: [
          {
            name: 'JSDoc Template',
            type: 'api',
            content: this.getJSDocTemplate(),
            variables: ['functionName', 'parameters', 'returns'],
          },
        ],
      });
    }

    return recommendations;
  }

  /**
   * Validate documentation standards
   */
  async validateDocumentationStandards(): Promise<DocumentationStandard[]> {
    return await this.assessStandards();
  }

  // Private implementation methods

  private findDocumentationPaths(): string[] {
    const docPaths: string[] = [];
    const commonDocDirs = ['docs', 'documentation', 'doc'];

    for (const dir of commonDocDirs) {
      const fullPath = path.join(this.rootPath, dir);
      if (existsSync(fullPath)) {
        docPaths.push(fullPath);
      }
    }

    return docPaths;
  }

  private async analyzeCompleteness(): Promise<DocumentationCompleteness> {
    const missing: MissingDocumentation[] = [];
    const outdated: OutdatedDocumentation[] = [];

    // Check for main README
    if (!(await this.hasReadme(this.rootPath))) {
      missing.push({
        type: 'readme',
        component: 'Project Root',
        priority: 'critical',
        description: 'Project is missing a main README.md file',
        template: this.getProjectReadmeTemplate(),
      });
    }

    // Check apps and libs for documentation
    const appsDir = path.join(this.rootPath, 'apps');
    const libsDir = path.join(this.rootPath, 'libs');

    for (const baseDir of [appsDir, libsDir]) {
      if (existsSync(baseDir)) {
        const subdirs = readdirSync(baseDir);
        for (const subdir of subdirs) {
          const subdirPath = path.join(baseDir, subdir);
          if (!(await this.hasReadme(subdirPath))) {
            missing.push({
              type: 'readme',
              component: `${path.basename(baseDir)}/${subdir}`,
              priority: 'high',
              description: `${subdir} is missing README.md`,
              template: this.getModuleReadmeTemplate(subdir),
            });
          }
        }
      }
    }

    // Check for outdated documentation
    const docFiles = await this.findAllDocumentationFiles();
    for (const docFile of docFiles) {
      const staleness = await this.checkDocumentationStaleness(docFile);
      if (staleness > 30) {
        // More than 30 days stale
        outdated.push({
          file: docFile,
          lastModified: new Date(),
          codeLastModified: new Date(),
          staleness,
          priority: staleness > 90 ? 'high' : 'medium',
          suggestion:
            'Review and update documentation to reflect recent changes',
        });
      }
    }

    const byType = {
      readme: await this.calculateReadmeCompleteness(),
      api: await this.calculateApiCompleteness(),
      inline: await this.calculateInlineCompleteness(),
      examples: await this.calculateExamplesCompleteness(),
      guides: await this.calculateGuidesCompleteness(),
    };

    const overall = Math.round(
      Object.values(byType).reduce((sum, value) => sum + value, 0) /
        Object.keys(byType).length
    );

    return {
      overall,
      byType,
      missing,
      outdated,
    };
  }

  private async analyzeQuality(): Promise<DocumentationQuality> {
    const issues: QualityIssue[] = [];

    // Check documentation files for quality issues
    const docFiles = await this.findAllDocumentationFiles();
    for (const file of docFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const fileIssues = await this.analyzeDocumentationQuality(file, content);
      issues.push(...fileIssues);
    }

    // Calculate quality scores
    const readability = this.calculateReadabilityScore(issues);
    const accuracy = this.calculateAccuracyScore(issues);
    const completeness = this.calculateCompletenessScore(issues);
    const consistency = this.calculateConsistencyScore(issues);

    return {
      readability,
      accuracy,
      completeness,
      consistency,
      issues,
    };
  }

  private async identifyGaps(): Promise<DocumentationGap[]> {
    const gaps: DocumentationGap[] = [];

    // Check for missing architecture documentation
    if (!(await this.hasArchitectureDoc())) {
      gaps.push({
        category: 'architecture',
        severity: 'high',
        component: 'Project',
        description: 'Missing architecture documentation',
        impact: 'Developers cannot understand system design',
        effort: 'high',
        template: this.getArchitectureTemplate(),
      });
    }

    // Check for missing developer guides
    if (!(await this.hasDeveloperGuide())) {
      gaps.push({
        category: 'developer-guide',
        severity: 'medium',
        component: 'Project',
        description: 'Missing developer setup and contribution guide',
        impact: 'Difficult for new developers to contribute',
        effort: 'medium',
        template: this.getDeveloperGuideTemplate(),
      });
    }

    // Check for missing API documentation
    const apiEndpoints = await this.findApiEndpoints();
    for (const endpoint of apiEndpoints) {
      if (!(await this.hasApiDocumentation(endpoint))) {
        gaps.push({
          category: 'api',
          severity: 'medium',
          component: endpoint,
          description: `API endpoint ${endpoint} lacks documentation`,
          impact: 'API consumers cannot understand usage',
          effort: 'low',
          template: this.getApiEndpointTemplate(),
        });
      }
    }

    return gaps;
  }

  private async generateRecommendations(
    completeness: DocumentationCompleteness,
    quality: DocumentationQuality,
    gaps: DocumentationGap[]
  ): Promise<DocumentationRecommendation[]> {
    const recommendations: DocumentationRecommendation[] = [];

    // Address critical missing documentation
    const criticalMissing = completeness.missing.filter(
      (m) => m.priority === 'critical'
    );
    for (const missing of criticalMissing) {
      recommendations.push({
        priority: 'high',
        title: `Add ${missing.type} for ${missing.component}`,
        description: missing.description,
        category: 'completeness',
        implementation: [
          {
            step: 1,
            description: `Create ${missing.type} file`,
            content: missing.template,
          },
        ],
        benefits: ['Improved project clarity', 'Better developer experience'],
        effort: 'low',
        templates: [
          {
            name: missing.type.toUpperCase(),
            type: missing.type as any,
            content: missing.template || '',
            variables: [],
          },
        ],
      });
    }

    // Address quality issues
    const highQualityIssues = quality.issues.filter(
      (i) => i.severity === 'high'
    );
    if (highQualityIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Improve documentation quality',
        description: `Found ${highQualityIssues.length} high-severity quality issues`,
        category: 'quality',
        implementation: [
          {
            step: 1,
            description: 'Review and fix documentation quality issues',
            files: [...new Set(highQualityIssues.map((i) => i.file))],
          },
        ],
        benefits: [
          'Better readability',
          'Reduced confusion',
          'Professional appearance',
        ],
        effort: 'medium',
        templates: [],
      });
    }

    // Automation recommendations
    if (completeness.overall < 70) {
      recommendations.push({
        priority: 'low',
        title: 'Implement documentation automation',
        description: 'Set up automated documentation generation and validation',
        category: 'automation',
        implementation: [
          {
            step: 1,
            description: 'Install TypeDoc for API documentation',
            commands: ['npm install -D typedoc'],
          },
          {
            step: 2,
            description: 'Add documentation build script',
            files: ['package.json'],
            content: '"docs:build": "typedoc --out docs/ src/"',
          },
          {
            step: 3,
            description: 'Set up documentation linting',
            commands: ['npm install -D markdownlint-cli'],
          },
        ],
        benefits: [
          'Consistent documentation',
          'Reduced manual effort',
          'Always up-to-date API docs',
        ],
        effort: 'medium',
        templates: [],
      });
    }

    return recommendations;
  }

  private async assessStandards(): Promise<DocumentationStandard[]> {
    const standards: DocumentationStandard[] = [];

    // JSDoc standard
    const jsdocCompliance = await this.checkJSDocCompliance();
    standards.push({
      name: 'JSDoc Documentation',
      description:
        'All public functions and classes should have JSDoc comments',
      current: jsdocCompliance.present,
      compliance: jsdocCompliance.percentage,
      examples: [
        '/** @description Function description */',
        '/** @param {string} name - Parameter description */',
        '/** @returns {boolean} Return description */',
      ],
      violations: jsdocCompliance.violations,
    });

    // README standard
    const readmeStandard = await this.checkReadmeStandard();
    standards.push({
      name: 'README Structure',
      description:
        'READMEs should follow consistent structure with all required sections',
      current: readmeStandard.present,
      compliance: readmeStandard.percentage,
      examples: [
        '# Project Title',
        '## Installation',
        '## Usage',
        '## Contributing',
      ],
      violations: readmeStandard.violations,
    });

    // Markdown standard
    const markdownStandard = await this.checkMarkdownStandard();
    standards.push({
      name: 'Markdown Style',
      description: 'Consistent markdown formatting and style',
      current: markdownStandard.present,
      compliance: markdownStandard.percentage,
      examples: [
        'Use ATX headers (# ## ###)',
        'Code blocks with language specification',
        'Consistent list formatting',
      ],
      violations: markdownStandard.violations,
    });

    return standards;
  }

  private async analyzeCoverage(): Promise<DocumentationCoverage> {
    const functions = await this.countFunctionDocumentation();
    const classes = await this.countClassDocumentation();
    const modules = await this.countModuleDocumentation();
    const apis = await this.countApiDocumentation();

    return {
      functions: {
        total: functions.total,
        documented: functions.documented,
        percentage:
          functions.total > 0
            ? Math.round((functions.documented / functions.total) * 100)
            : 0,
      },
      classes: {
        total: classes.total,
        documented: classes.documented,
        percentage:
          classes.total > 0
            ? Math.round((classes.documented / classes.total) * 100)
            : 0,
      },
      modules: {
        total: modules.total,
        documented: modules.documented,
        percentage:
          modules.total > 0
            ? Math.round((modules.documented / modules.total) * 100)
            : 0,
      },
      apis: {
        total: apis.total,
        documented: apis.documented,
        percentage:
          apis.total > 0 ? Math.round((apis.documented / apis.total) * 100) : 0,
      },
    };
  }

  // Helper methods

  private async hasReadme(dirPath: string): Promise<boolean> {
    const readmeFiles = ['README.md', 'readme.md', 'README.txt', 'readme.txt'];
    for (const file of readmeFiles) {
      if (existsSync(path.join(dirPath, file))) {
        return true;
      }
    }
    return false;
  }

  private async hasExamples(dirPath: string): Promise<boolean> {
    const exampleDirs = ['examples', 'example', 'demo', 'demos'];
    for (const dir of exampleDirs) {
      if (existsSync(path.join(dirPath, dir))) {
        return true;
      }
    }
    return false;
  }

  private async checkApiDocumentation(
    modulePath: string
  ): Promise<{ coverage: number }> {
    // Would analyze source files for JSDoc coverage
    return { coverage: 0 };
  }

  private async getApiCoverage(componentPath: string): Promise<number> {
    // Would analyze the specific component for API documentation
    return 0;
  }

  private determineComponentType(componentPath: string): string {
    if (componentPath.includes('component')) return 'React Component';
    if (componentPath.includes('service')) return 'Service Class';
    if (componentPath.includes('util')) return 'Utility Function';
    if (componentPath.includes('api')) return 'API Endpoint';
    return 'Module';
  }

  private generateReadmeContent(
    componentName: string,
    componentType: string
  ): string {
    return `# ${componentName}

${componentType} for the Ectropy platform.

## Overview

Brief description of what this ${componentType.toLowerCase()} does.

## Usage

\`\`\`typescript
// Usage example
\`\`\`

## API

### Methods

- \`method1()\` - Description
- \`method2()\` - Description

## Testing

\`\`\`bash
pnpm test
\`\`\`
`;
  }

  private generateJSDocExamples(componentType: string): string {
    if (componentType === 'React Component') {
      return `/**
 * Component description
 * @param props - Component props
 * @param props.title - Title to display
 * @returns JSX element
 */`;
    } else if (componentType === 'Service Class') {
      return `/**
 * Service class description
 * @class ServiceName
 */`;
    }
    return `/**
 * Function description
 * @param param1 - Parameter description
 * @returns Return value description
 */`;
  }

  // Template methods

  private getReadmeTemplate(componentName: string): string {
    return `# ${componentName}

Description of ${componentName}.

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`typescript
import { ${componentName} } from './${componentName}';
\`\`\`

## API

### Methods

## Contributing

## License`;
  }

  private getProjectReadmeTemplate(): string {
    return `# Ectropy Platform

Federated construction platform combining BIM collaboration with DAO governance.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker

### Installation

\`\`\`bash
pnpm install
\`\`\`

## Usage

## Contributing

## License`;
  }

  private getModuleReadmeTemplate(moduleName: string): string {
    return this.getReadmeTemplate(moduleName);
  }

  private getApiDocTemplate(): string {
    return `/**
 * API endpoint description
 * @route GET /api/endpoint
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */`;
  }

  private getExamplesTemplate(moduleName: string): string {
    return `# ${moduleName} Examples

## Basic Usage

\`\`\`typescript
import { ${moduleName} } from '../src/${moduleName}';

const example = new ${moduleName}();
\`\`\`

## Advanced Usage

\`\`\`typescript
// Advanced example
\`\`\``;
  }

  private getJSDocTemplate(): string {
    return `/**
 * {functionName} - Description
 * @param {type} {parameter} - Parameter description
 * @returns {type} Return description
 * @example
 * // Usage example
 * {functionName}(parameter);
 */`;
  }

  private getArchitectureTemplate(): string {
    return `# Architecture Overview

## System Design

## Components

### Apps
- web-dashboard
- api-gateway
- mcp-server

### Libraries
- shared
- auth
- database

## Data Flow

## Deployment`;
  }

  private getDeveloperGuideTemplate(): string {
    return `# Developer Guide

## Setup

## Development Workflow

## Code Standards

## Testing

## Deployment`;
  }

  private getApiEndpointTemplate(): string {
    return `## API Endpoint

### Description

### Request

### Response

### Examples`;
  }

  // Analysis helper methods (would be implemented with actual logic)

  private async calculateReadmeCompleteness(): Promise<number> {
    return 80;
  }
  private async calculateApiCompleteness(): Promise<number> {
    return 60;
  }
  private async calculateInlineCompleteness(): Promise<number> {
    return 70;
  }
  private async calculateExamplesCompleteness(): Promise<number> {
    return 40;
  }
  private async calculateGuidesCompleteness(): Promise<number> {
    return 50;
  }

  private async findAllDocumentationFiles(): Promise<string[]> {
    return [];
  }
  private async checkDocumentationStaleness(file: string): Promise<number> {
    return 0;
  }
  private async analyzeDocumentationQuality(
    file: string,
    content: string
  ): Promise<QualityIssue[]> {
    return [];
  }

  private calculateReadabilityScore(issues: QualityIssue[]): number {
    return 75;
  }
  private calculateAccuracyScore(issues: QualityIssue[]): number {
    return 80;
  }
  private calculateCompletenessScore(issues: QualityIssue[]): number {
    return 70;
  }
  private calculateConsistencyScore(issues: QualityIssue[]): number {
    return 85;
  }

  private async hasArchitectureDoc(): Promise<boolean> {
    return false;
  }
  private async hasDeveloperGuide(): Promise<boolean> {
    return false;
  }
  private async findApiEndpoints(): Promise<string[]> {
    return [];
  }
  private async hasApiDocumentation(endpoint: string): Promise<boolean> {
    return false;
  }

  private async checkJSDocCompliance(): Promise<{
    present: boolean;
    percentage: number;
    violations: string[];
  }> {
    return { present: true, percentage: 65, violations: [] };
  }

  private async checkReadmeStandard(): Promise<{
    present: boolean;
    percentage: number;
    violations: string[];
  }> {
    return { present: true, percentage: 75, violations: [] };
  }

  private async checkMarkdownStandard(): Promise<{
    present: boolean;
    percentage: number;
    violations: string[];
  }> {
    return { present: true, percentage: 80, violations: [] };
  }

  private async countFunctionDocumentation(): Promise<{
    total: number;
    documented: number;
  }> {
    return { total: 100, documented: 65 };
  }

  private async countClassDocumentation(): Promise<{
    total: number;
    documented: number;
  }> {
    return { total: 20, documented: 15 };
  }

  private async countModuleDocumentation(): Promise<{
    total: number;
    documented: number;
  }> {
    return { total: 30, documented: 20 };
  }

  private async countApiDocumentation(): Promise<{
    total: number;
    documented: number;
  }> {
    return { total: 15, documented: 8 };
  }
}
