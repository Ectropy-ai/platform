/**
 * AI Testing Advisor - Testing Strategy and Pattern Guidance
 *
 * Provides guidance on:
 * - Testing strategies and best practices
 * - Test coverage analysis and improvement
 * - Testing framework recommendations
 * - Test structure and organization
 */

import { promises as fs } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface TestingAnalysis {
  coverage: CoverageAnalysis;
  strategies: TestingStrategy[];
  gaps: TestingGap[];
  recommendations: TestingRecommendation[];
  patterns: TestPattern[];
  frameworks: FrameworkAssessment[];
}

export interface CoverageAnalysis {
  overall: number;
  byType: {
    unit: number;
    integration: number;
    e2e: number;
  };
  byFile: FileCoverage[];
  critical: CriticalCoverage[];
  trends: CoverageTrend[];
}

export interface FileCoverage {
  file: string;
  lines: number;
  functions: number;
  branches: number;
  statements: number;
  uncovered: UncoveredSection[];
}

export interface UncoveredSection {
  type: 'function' | 'branch' | 'statement';
  location: { line: number; column: number };
  description: string;
  complexity: number;
  priority: 'high' | 'medium' | 'low';
}

export interface CriticalCoverage {
  component: string;
  coverage: number;
  importance: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  recommendation: string;
}

export interface CoverageTrend {
  date: string;
  coverage: number;
  change: number;
}

export interface TestingStrategy {
  name: string;
  description: string;
  applicability: string[];
  current: {
    implemented: boolean;
    coverage: number;
    quality: number;
  };
  recommendations: string[];
  examples: TestExample[];
}

export interface TestExample {
  scenario: string;
  code: string;
  framework: string;
  category: 'unit' | 'integration' | 'e2e';
}

export interface TestingGap {
  type:
    | 'missing_tests'
    | 'poor_coverage'
    | 'outdated_tests'
    | 'slow_tests'
    | 'flaky_tests';
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface TestingRecommendation {
  category: 'strategy' | 'coverage' | 'performance' | 'maintenance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  implementation: TestImplementationStep[];
  benefits: string[];
  effort: 'low' | 'medium' | 'high';
  frameworks: string[];
}

export interface TestImplementationStep {
  step: number;
  description: string;
  code?: string;
  files?: string[];
  commands?: string[];
}

export interface TestPattern {
  name: string;
  description: string;
  category: 'structure' | 'mocking' | 'assertion' | 'setup';
  present: boolean;
  quality: number;
  examples: string[];
  improvements: string[];
}

export interface FrameworkAssessment {
  name: string;
  type: 'unit' | 'integration' | 'e2e';
  current: boolean;
  recommended: boolean;
  score: number;
  pros: string[];
  cons: string[];
  migration?: {
    effort: 'low' | 'medium' | 'high';
    steps: string[];
  };
}

export class TestingAdvisor {
  private readonly rootPath: string;
  private readonly testDirectories: string[];

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.testDirectories = this.findTestDirectories();
  }

  /**
   * Analyze current testing state
   */
  async analyzeTestingStrategy(): Promise<TestingAnalysis> {
    const coverage = await this.analyzeCoverage();
    const strategies = await this.assessTestingStrategies();
    const gaps = await this.identifyTestingGaps();
    const recommendations = await this.generateTestingRecommendations(
      coverage,
      gaps
    );
    const patterns = await this.analyzeTestPatterns();
    const frameworks = await this.assessFrameworks();

    return {
      coverage,
      strategies,
      gaps,
      recommendations,
      patterns,
      frameworks,
    };
  }

  /**
   * Generate test guidance for a specific component
   */
  async generateTestGuidance(componentPath: string): Promise<TestingStrategy> {
    const componentType = this.determineComponentType(componentPath);
    const existingTests = await this.findExistingTests(componentPath);
    const coverage = await this.getComponentCoverage(componentPath);

    const strategies = this.getStrategiesForComponent(componentType);
    const examples = this.generateTestExamples(componentPath, componentType);

    return {
      name: `Testing Strategy for ${path.basename(componentPath)}`,
      description: `Comprehensive testing approach for ${componentType} component`,
      applicability: [componentType],
      current: {
        implemented: existingTests.length > 0,
        coverage: coverage.overall,
        quality: this.assessTestQuality(existingTests),
      },
      recommendations: this.generateComponentRecommendations(
        componentPath,
        componentType,
        coverage
      ),
      examples,
    };
  }

  /**
   * Recommend testing improvements
   */
  async recommendTestingImprovements(): Promise<TestingRecommendation[]> {
    const analysis = await this.analyzeTestingStrategy();
    const recommendations: TestingRecommendation[] = [];

    // Coverage improvements
    if (analysis.coverage.overall < 80) {
      recommendations.push({
        category: 'coverage',
        priority: 'high',
        title: 'Improve test coverage',
        description: `Current coverage is ${analysis.coverage.overall}%, target is 80%+`,
        implementation: [
          {
            step: 1,
            description: 'Identify uncovered critical paths',
            commands: ['pnpm test --coverage --coverageReporters=text-lcov'],
          },
          {
            step: 2,
            description: 'Write tests for high-priority uncovered code',
            files: ['Focus on business logic and error handling'],
          },
        ],
        benefits: [
          'Reduced bugs',
          'Increased confidence in deployments',
          'Better refactoring safety',
        ],
        effort: 'medium',
        frameworks: ['Jest', 'React Testing Library'],
      });
    }

    // E2E testing improvements
    if (analysis.coverage.byType.e2e < 50) {
      recommendations.push({
        category: 'strategy',
        priority: 'medium',
        title: 'Implement comprehensive E2E testing',
        description: 'Add end-to-end tests for critical user workflows',
        implementation: [
          {
            step: 1,
            description: 'Set up Playwright for E2E testing',
            commands: [
              'pnpm add -D @playwright/test',
              'npx playwright install',
            ],
          },
          {
            step: 2,
            description: 'Create tests for main user journeys',
            files: ['e2e/login.spec.ts', 'e2e/dashboard.spec.ts'],
          },
        ],
        benefits: [
          'Catch integration issues',
          'Validate user experience',
          'Prevent regressions',
        ],
        effort: 'medium',
        frameworks: ['Playwright'],
      });
    }

    // Performance testing
    recommendations.push({
      category: 'performance',
      priority: 'low',
      title: 'Add performance testing',
      description: 'Monitor and test application performance',
      implementation: [
        {
          step: 1,
          description: 'Add performance benchmarks to critical components',
          code: `
describe('Performance tests', () => {
  it('should render dashboard under 100ms', async () => {
    const start = performance.now();
    render(<Dashboard />);
    const end = performance.now();
    expect(end - start).toBeLessThan(100);
  });
});`,
        },
      ],
      benefits: [
        'Performance regression prevention',
        'User experience monitoring',
      ],
      effort: 'low',
      frameworks: ['Jest', 'React Testing Library'],
    });

    return recommendations;
  }

  /**
   * Analyze test patterns and suggest improvements
   */
  async analyzeTestStructure(): Promise<TestPattern[]> {
    return await this.analyzeTestPatterns();
  }

  // Private implementation methods

  private findTestDirectories(): string[] {
    const commonTestDirs = [
      '__tests__',
      'test',
      'tests',
      'spec',
      'e2e',
      'e2e-tests',
    ];

    const testDirs: string[] = [];

    // Check root level
    for (const dir of commonTestDirs) {
      const fullPath = path.join(this.rootPath, dir);
      if (existsSync(fullPath)) {
        testDirs.push(fullPath);
      }
    }

    // Check in apps and libs
    const appsDir = path.join(this.rootPath, 'apps');
    const libsDir = path.join(this.rootPath, 'libs');

    for (const baseDir of [appsDir, libsDir]) {
      if (existsSync(baseDir)) {
        const subdirs = readdirSync(baseDir);
        for (const subdir of subdirs) {
          for (const testDir of commonTestDirs) {
            const fullPath = path.join(baseDir, subdir, testDir);
            if (existsSync(fullPath)) {
              testDirs.push(fullPath);
            }
          }
        }
      }
    }

    return testDirs;
  }

  private async analyzeCoverage(): Promise<CoverageAnalysis> {
    let overall = 0;
    const byType = { unit: 0, integration: 0, e2e: 0 };
    const byFile: FileCoverage[] = [];
    const critical: CriticalCoverage[] = [];
    const trends: CoverageTrend[] = [];

    // Try to read coverage reports
    const coverageDir = path.join(this.rootPath, 'coverage');
    if (existsSync(coverageDir)) {
      try {
        const coverageJson = path.join(coverageDir, 'coverage-summary.json');
        if (existsSync(coverageJson)) {
          const coverageData = JSON.parse(
            await fs.readFile(coverageJson, 'utf-8')
          );
          overall = coverageData.total?.lines?.pct || 0;

          // Parse individual file coverage
          for (const [file, data] of Object.entries(coverageData)) {
            if (file !== 'total' && typeof data === 'object' && data !== null) {
              const fileData = data as any;
              byFile.push({
                file,
                lines: fileData.lines?.pct || 0,
                functions: fileData.functions?.pct || 0,
                branches: fileData.branches?.pct || 0,
                statements: fileData.statements?.pct || 0,
                uncovered: [], // Would parse uncovered lines
              });
            }
          }
        }
      } catch (error) {
      }
    }

    // Identify critical components with low coverage
    for (const file of byFile) {
      if (file.lines < 70 && this.isCriticalFile(file.file)) {
        critical.push({
          component: file.file,
          coverage: file.lines,
          importance: 'critical',
          reason: 'Core business logic with low test coverage',
          recommendation: 'Add comprehensive unit tests',
        });
      }
    }

    return {
      overall,
      byType,
      byFile,
      critical,
      trends,
    };
  }

  private async assessTestingStrategies(): Promise<TestingStrategy[]> {
    const strategies: TestingStrategy[] = [];

    // Unit Testing Strategy
    const unitTests = await this.countTestsByType('unit');
    strategies.push({
      name: 'Unit Testing',
      description: 'Testing individual components and functions in isolation',
      applicability: ['components', 'utilities', 'services'],
      current: {
        implemented: unitTests > 0,
        coverage: 75, // Would calculate from actual data
        quality: this.assessUnitTestQuality(),
      },
      recommendations: [
        'Test all public methods and edge cases',
        'Use proper mocking for dependencies',
        'Follow AAA pattern (Arrange, Act, Assert)',
      ],
      examples: [
        {
          scenario: 'Testing a React component',
          code: `
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });
});`,
          framework: 'Jest + React Testing Library',
          category: 'unit',
        },
      ],
    });

    // Integration Testing Strategy
    const integrationTests = await this.countTestsByType('integration');
    strategies.push({
      name: 'Integration Testing',
      description:
        'Testing interactions between multiple components or services',
      applicability: [
        'api-endpoints',
        'database-operations',
        'component-interactions',
      ],
      current: {
        implemented: integrationTests > 0,
        coverage: 45,
        quality: this.assessIntegrationTestQuality(),
      },
      recommendations: [
        'Test API endpoints with real database',
        'Test component interactions and data flow',
        'Use test containers for external dependencies',
      ],
      examples: [
        {
          scenario: 'Testing API endpoint',
          code: `
import request from 'supertest';
import { app } from '../app';

describe('POST /api/projects', () => {
  it('creates a new project', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'Test Project' })
      .expect(201);
    
    expect(response.body.name).toBe('Test Project');
  });
});`,
          framework: 'Jest + Supertest',
          category: 'integration',
        },
      ],
    });

    // E2E Testing Strategy
    const e2eTests = await this.countTestsByType('e2e');
    strategies.push({
      name: 'End-to-End Testing',
      description: 'Testing complete user workflows from UI to database',
      applicability: ['user-workflows', 'critical-paths', 'business-processes'],
      current: {
        implemented: e2eTests > 0,
        coverage: 30,
        quality: this.assessE2ETestQuality(),
      },
      recommendations: [
        'Focus on critical user journeys',
        'Test across different browsers and devices',
        'Include accessibility testing',
      ],
      examples: [
        {
          scenario: 'Testing user login workflow',
          code: `
import { test, expect } from '@playwright/test';

test('user can login and access dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid=email]', 'user@example.com');
  await page.fill('[data-testid=password]', 'password');
  await page.click('[data-testid=login-button]');
  
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('Welcome')).toBeVisible();
});`,
          framework: 'Playwright',
          category: 'e2e',
        },
      ],
    });

    return strategies;
  }

  private async identifyTestingGaps(): Promise<TestingGap[]> {
    const gaps: TestingGap[] = [];

    // Check for missing tests in critical areas
    const criticalFiles = await this.findCriticalFiles();
    for (const file of criticalFiles) {
      const hasTests = await this.hasTestsForFile(file);
      if (!hasTests) {
        gaps.push({
          type: 'missing_tests',
          severity: 'critical',
          component: file,
          description: `Critical file ${path.basename(file)} has no tests`,
          impact: 'High risk of undetected bugs in core functionality',
          effort: 'medium',
          recommendation:
            'Create comprehensive unit tests for all public methods',
        });
      }
    }

    // Check for slow tests
    const slowTests = await this.findSlowTests();
    for (const test of slowTests) {
      gaps.push({
        type: 'slow_tests',
        severity: 'medium',
        component: test.file,
        description: `Test ${test.name} takes ${test.duration}ms`,
        impact: 'Slows down development feedback loop',
        effort: 'low',
        recommendation: 'Optimize test setup or use better mocking',
      });
    }

    return gaps;
  }

  private async generateTestingRecommendations(
    coverage: CoverageAnalysis,
    gaps: TestingGap[]
  ): Promise<TestingRecommendation[]> {
    const recommendations: TestingRecommendation[] = [];

    // Address critical gaps first
    const criticalGaps = gaps.filter((g) => g.severity === 'critical');
    for (const gap of criticalGaps) {
      recommendations.push({
        category: 'coverage',
        priority: 'high',
        title: `Address ${gap.type.replace('_', ' ')} in ${gap.component}`,
        description: gap.description,
        implementation: [
          {
            step: 1,
            description: gap.recommendation,
            files: [gap.component],
          },
        ],
        benefits: ['Reduced risk', 'Better code quality'],
        effort: gap.effort,
        frameworks: this.getApplicableFrameworks(gap.component),
      });
    }

    return recommendations;
  }

  private async analyzeTestPatterns(): Promise<TestPattern[]> {
    const patterns: TestPattern[] = [];

    // AAA Pattern (Arrange, Act, Assert)
    const aaaPattern = await this.detectAAAPattern();
    patterns.push({
      name: 'AAA Pattern',
      description: 'Arrange, Act, Assert test structure',
      category: 'structure',
      present: aaaPattern.present,
      quality: aaaPattern.quality,
      examples: aaaPattern.examples,
      improvements: aaaPattern.present
        ? ['Ensure consistent spacing between AAA sections']
        : ['Adopt AAA pattern for better test readability'],
    });

    // Proper Mocking
    const mockingPattern = await this.detectMockingPatterns();
    patterns.push({
      name: 'Proper Mocking',
      description: 'Effective use of mocks and stubs',
      category: 'mocking',
      present: mockingPattern.present,
      quality: mockingPattern.quality,
      examples: mockingPattern.examples,
      improvements: mockingPattern.improvements,
    });

    // Page Object Model (for E2E)
    const pomPattern = await this.detectPageObjectModel();
    patterns.push({
      name: 'Page Object Model',
      description: 'Encapsulating page interactions in objects',
      category: 'structure',
      present: pomPattern.present,
      quality: pomPattern.quality,
      examples: pomPattern.examples,
      improvements: pomPattern.improvements,
    });

    return patterns;
  }

  private async assessFrameworks(): Promise<FrameworkAssessment[]> {
    const frameworks: FrameworkAssessment[] = [];

    // Jest assessment
    const hasJest = await this.isFrameworkPresent('jest');
    frameworks.push({
      name: 'Jest',
      type: 'unit',
      current: hasJest,
      recommended: true,
      score: hasJest ? 85 : 0,
      pros: ['Great snapshot testing', 'Built-in mocking', 'Good performance'],
      cons: ['Can be slow for large test suites'],
      migration: hasJest
        ? undefined
        : {
            effort: 'low',
            steps: [
              'Install Jest',
              'Create jest.config.js',
              'Convert existing tests',
            ],
          },
    });

    // Playwright assessment
    const hasPlaywright = await this.isFrameworkPresent('@playwright/test');
    frameworks.push({
      name: 'Playwright',
      type: 'e2e',
      current: hasPlaywright,
      recommended: true,
      score: hasPlaywright ? 90 : 0,
      pros: ['Cross-browser testing', 'Auto-wait', 'Rich debugging'],
      cons: ['Larger learning curve'],
      migration: hasPlaywright
        ? undefined
        : {
            effort: 'medium',
            steps: [
              'Install Playwright',
              'Configure browsers',
              'Create first E2E test',
            ],
          },
    });

    return frameworks;
  }

  // Helper methods

  private determineComponentType(componentPath: string): string {
    if (
      componentPath.includes('components') ||
      componentPath.includes('pages')
    ) {
      return 'react-component';
    } else if (
      componentPath.includes('routes') ||
      componentPath.includes('api')
    ) {
      return 'api-endpoint';
    } else if (
      componentPath.includes('utils') ||
      componentPath.includes('helpers')
    ) {
      return 'utility-function';
    } else if (componentPath.includes('services')) {
      return 'service-class';
    }
    return 'unknown';
  }

  private async findExistingTests(componentPath: string): Promise<string[]> {
    const testFiles: string[] = [];
    const testPatterns = [
      componentPath.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
      componentPath.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1'),
      componentPath
        .replace(/src\//, '__tests__/')
        .replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
    ];

    for (const pattern of testPatterns) {
      if (existsSync(pattern)) {
        testFiles.push(pattern);
      }
    }

    return testFiles;
  }

  private async getComponentCoverage(
    componentPath: string
  ): Promise<{ overall: number }> {
    // Would parse coverage data for specific component
    return { overall: 0 };
  }

  private getStrategiesForComponent(componentType: string): string[] {
    const strategyMap: Record<string, string[]> = {
      'react-component': [
        'Unit testing with React Testing Library',
        'Snapshot testing',
      ],
      'api-endpoint': [
        'Integration testing with Supertest',
        'Error handling tests',
      ],
      'utility-function': ['Unit testing with Jest', 'Edge case testing'],
      'service-class': ['Unit testing with mocks', 'Integration testing'],
    };

    return strategyMap[componentType] || ['Unit testing'];
  }

  private generateTestExamples(
    componentPath: string,
    componentType: string
  ): TestExample[] {
    const examples: TestExample[] = [];

    if (componentType === 'react-component') {
      examples.push({
        scenario: 'Component rendering',
        code: `
import { render, screen } from '@testing-library/react';
import { ${path.basename(componentPath, path.extname(componentPath))} } from './${path.basename(componentPath, path.extname(componentPath))}';

describe('${path.basename(componentPath, path.extname(componentPath))}', () => {
  it('renders correctly', () => {
    render(<${path.basename(componentPath, path.extname(componentPath))} />);
    // Add specific assertions based on component
  });
});`,
        framework: 'Jest + React Testing Library',
        category: 'unit',
      });
    }

    return examples;
  }

  private generateComponentRecommendations(
    componentPath: string,
    componentType: string,
    coverage: { overall: number }
  ): string[] {
    const recommendations: string[] = [];

    if (coverage.overall < 80) {
      recommendations.push(
        `Increase test coverage to at least 80% (currently ${coverage.overall}%)`
      );
    }

    if (componentType === 'react-component') {
      recommendations.push('Test all props and state changes');
      recommendations.push(
        'Test user interactions with fireEvent or userEvent'
      );
    } else if (componentType === 'api-endpoint') {
      recommendations.push('Test all HTTP methods and status codes');
      recommendations.push('Test authentication and authorization');
    }

    return recommendations;
  }

  private assessTestQuality(existingTests: string[]): number {
    // Would analyze test files for quality indicators
    return existingTests.length > 0 ? 75 : 0;
  }

  private async countTestsByType(
    type: 'unit' | 'integration' | 'e2e'
  ): Promise<number> {
    // Would count test files by analyzing their content or location
    return 0;
  }

  private assessUnitTestQuality(): number {
    // Would analyze unit test patterns and quality
    return 75;
  }

  private assessIntegrationTestQuality(): number {
    return 60;
  }

  private assessE2ETestQuality(): number {
    return 50;
  }

  private isCriticalFile(filePath: string): boolean {
    const criticalPatterns = [
      'auth',
      'login',
      'payment',
      'api',
      'service',
      'core',
    ];

    return criticalPatterns.some((pattern) =>
      filePath.toLowerCase().includes(pattern)
    );
  }

  private async findCriticalFiles(): Promise<string[]> {
    // Would scan codebase for files matching critical patterns
    return [];
  }

  private async hasTestsForFile(filePath: string): Promise<boolean> {
    const tests = await this.findExistingTests(filePath);
    return tests.length > 0;
  }

  private async findSlowTests(): Promise<
    Array<{ file: string; name: string; duration: number }>
  > {
    // Would analyze test execution times
    return [];
  }

  private getApplicableFrameworks(componentPath: string): string[] {
    if (componentPath.includes('component')) {
      return ['Jest', 'React Testing Library'];
    } else if (componentPath.includes('api')) {
      return ['Jest', 'Supertest'];
    }
    return ['Jest'];
  }

  private async detectAAAPattern(): Promise<{
    present: boolean;
    quality: number;
    examples: string[];
  }> {
    // Would analyze test files for AAA pattern usage
    return {
      present: true,
      quality: 80,
      examples: [
        'Arrange: Set up test data',
        'Act: Call the function',
        'Assert: Verify results',
      ],
    };
  }

  private async detectMockingPatterns(): Promise<{
    present: boolean;
    quality: number;
    examples: string[];
    improvements: string[];
  }> {
    return {
      present: true,
      quality: 70,
      examples: ['jest.fn()', 'jest.spyOn()', 'mock modules'],
      improvements: ['Use more specific mocks', 'Reset mocks between tests'],
    };
  }

  private async detectPageObjectModel(): Promise<{
    present: boolean;
    quality: number;
    examples: string[];
    improvements: string[];
  }> {
    return {
      present: false,
      quality: 0,
      examples: [],
      improvements: [
        'Implement Page Object Model for E2E tests',
        'Encapsulate page interactions',
      ],
    };
  }

  private async isFrameworkPresent(frameworkName: string): Promise<boolean> {
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(this.rootPath, 'package.json'), 'utf-8')
      );
      return !!(
        packageJson.dependencies?.[frameworkName] ||
        packageJson.devDependencies?.[frameworkName]
      );
    } catch {
      return false;
    }
  }
}
