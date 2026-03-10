/**
 * AI Architecture Advisor - Codebase Structure and Design Guidance
 *
 * Provides guidance on:
 * - Architecture patterns and best practices
 * - Module organization and dependencies
 * - Code structure improvements
 * - Design pattern recommendations
 */

import { promises as fs } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface ArchitectureAnalysis {
  structure: ProjectStructure;
  patterns: ArchitecturePattern[];
  dependencies: DependencyGraph;
  violations: ArchitectureViolation[];
  recommendations: ArchitectureRecommendation[];
}

export interface ProjectStructure {
  apps: ProjectApp[];
  libs: ProjectLib[];
  dependencies: ModuleDependency[];
  cyclicDependencies: string[];
}

export interface ProjectApp {
  name: string;
  path: string;
  type: 'react' | 'node' | 'express' | 'native';
  dependencies: string[];
  size: {
    files: number;
    lines: number;
  };
}

export interface ProjectLib {
  name: string;
  path: string;
  type: 'shared' | 'feature' | 'utility';
  exports: string[];
  dependents: string[];
}

export interface ArchitecturePattern {
  name: string;
  description: string;
  present: boolean;
  confidence: number;
  examples: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  clusters: DependencyCluster[];
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'app' | 'lib' | 'external';
  size: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  weight: number;
  type: 'imports' | 'calls' | 'extends';
}

export interface DependencyCluster {
  name: string;
  nodes: string[];
  cohesion: number;
  coupling: number;
}

export interface ArchitectureViolation {
  type:
    | 'circular_dependency'
    | 'tight_coupling'
    | 'god_class'
    | 'feature_envy'
    | 'inappropriate_intimacy';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  location: string;
  impact: string;
  suggestedFix: string;
}

export interface ArchitectureRecommendation {
  category: 'structure' | 'patterns' | 'dependencies' | 'performance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  implementation: ImplementationStep[];
  benefits: string[];
  effort: 'low' | 'medium' | 'high';
}

export interface ImplementationStep {
  step: number;
  description: string;
  commands?: string[];
  files?: string[];
}

export class ArchitectureAdvisor {
  private readonly rootPath: string;
  private readonly nxWorkspace: boolean;

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.nxWorkspace = this.isNxWorkspace();
  }

  /**
   * Analyze the overall architecture of the codebase
   */
  async analyzeArchitecture(): Promise<ArchitectureAnalysis> {
    const structure = await this.analyzeProjectStructure();
    const patterns = await this.detectArchitecturePatterns();
    const dependencies = await this.analyzeDependencies();
    const violations = await this.detectViolations(structure, dependencies);
    const recommendations = await this.generateRecommendations(
      structure,
      patterns,
      violations
    );

    return {
      structure,
      patterns,
      dependencies,
      violations,
      recommendations,
    };
  }

  /**
   * Provide specific guidance for component architecture
   */
  async provideComponentGuidance(
    componentPath: string
  ): Promise<ArchitectureRecommendation[]> {
    const recommendations: ArchitectureRecommendation[] = [];

    // Analyze component location and purpose
    if (componentPath.includes('apps/web-dashboard')) {
      recommendations.push(
        ...(await this.analyzeReactComponentArchitecture(componentPath))
      );
    } else if (
      componentPath.includes('apps/api-gateway') ||
      componentPath.includes('apps/mcp-server')
    ) {
      recommendations.push(
        ...(await this.analyzeNodeServiceArchitecture(componentPath))
      );
    } else if (componentPath.includes('libs/')) {
      recommendations.push(
        ...(await this.analyzeLibraryArchitecture(componentPath))
      );
    }

    return recommendations;
  }

  /**
   * Suggest refactoring opportunities
   */
  async suggestRefactoring(): Promise<ArchitectureRecommendation[]> {
    const recommendations: ArchitectureRecommendation[] = [];
    const structure = await this.analyzeProjectStructure();

    // Look for large files that could be split
    const largeFiles = await this.findLargeFiles();
    for (const file of largeFiles) {
      recommendations.push({
        category: 'structure',
        priority: 'medium',
        title: `Refactor large file: ${path.basename(file.path)}`,
        description: `File has ${file.lines} lines and could benefit from being split into smaller modules`,
        implementation: [
          {
            step: 1,
            description: 'Identify logical boundaries within the file',
            files: [file.path],
          },
          {
            step: 2,
            description: 'Extract related functions into separate modules',
            commands: ['Create new files for each logical group'],
          },
          {
            step: 3,
            description: 'Update imports and exports',
            commands: ['Update import statements in dependent files'],
          },
        ],
        benefits: [
          'Improved maintainability',
          'Better testability',
          'Clearer separation of concerns',
        ],
        effort: 'medium',
      });
    }

    // Look for duplicated code
    const duplications = await this.findCodeDuplication();
    for (const duplication of duplications) {
      recommendations.push({
        category: 'structure',
        priority: 'high',
        title: `Extract common functionality from ${duplication.files.length} files`,
        description: `Similar code found in multiple files: ${duplication.pattern}`,
        implementation: [
          {
            step: 1,
            description: 'Create shared utility or component',
            files: [`libs/shared/src/utils/${duplication.suggestedName}.ts`],
          },
          {
            step: 2,
            description: 'Replace duplicated code with shared implementation',
            files: duplication.files,
          },
        ],
        benefits: [
          'Reduced code duplication',
          'Single source of truth',
          'Easier maintenance',
        ],
        effort: 'low',
      });
    }

    return recommendations;
  }

  /**
   * Analyze module dependencies and suggest improvements
   */
  async optimizeDependencies(): Promise<ArchitectureRecommendation[]> {
    const recommendations: ArchitectureRecommendation[] = [];
    const dependencies = await this.analyzeDependencies();

    // Find circular dependencies
    for (const cycle of dependencies.clusters.filter((c) =>
      this.isCyclicCluster(c)
    )) {
      recommendations.push({
        category: 'dependencies',
        priority: 'high',
        title: `Resolve circular dependency in ${cycle.name}`,
        description: `Circular dependency detected between: ${cycle.nodes.join(' <-> ')}`,
        implementation: [
          {
            step: 1,
            description: 'Identify the dependency causing the cycle',
            files: cycle.nodes.map((node) => this.getNodePath(node)),
          },
          {
            step: 2,
            description: 'Extract shared functionality to a common module',
            commands: ['Create new shared module in libs/'],
          },
          {
            step: 3,
            description: 'Update imports to use the shared module',
            commands: ['Update import statements in all affected files'],
          },
        ],
        benefits: [
          'Eliminates circular dependencies',
          'Improves build performance',
          'Better code organization',
        ],
        effort: 'medium',
      });
    }

    // Find highly coupled modules
    const tightlyCoupled = dependencies.clusters.filter(
      (c) => c.coupling > 0.8
    );
    for (const cluster of tightlyCoupled) {
      recommendations.push({
        category: 'dependencies',
        priority: 'medium',
        title: `Reduce coupling in ${cluster.name}`,
        description: `High coupling detected (${(cluster.coupling * 100).toFixed(1)}%)`,
        implementation: [
          {
            step: 1,
            description: 'Analyze interdependencies between modules',
            files: cluster.nodes.map((node) => this.getNodePath(node)),
          },
          {
            step: 2,
            description: 'Introduce interfaces to decouple modules',
            commands: ['Create interface definitions'],
          },
          {
            step: 3,
            description: 'Use dependency injection where appropriate',
            commands: ['Implement DI patterns'],
          },
        ],
        benefits: [
          'Improved modularity',
          'Better testability',
          'Easier to modify individual modules',
        ],
        effort: 'high',
      });
    }

    return recommendations;
  }

  // Private implementation methods

  private async analyzeProjectStructure(): Promise<ProjectStructure> {
    const apps = await this.findApps();
    const libs = await this.findLibs();
    const dependencies = await this.analyzeDependencyStructure();
    const cyclicDependencies = await this.findCyclicDependencies();

    return {
      apps,
      libs,
      dependencies,
      cyclicDependencies,
    };
  }

  private async findApps(): Promise<ProjectApp[]> {
    const apps: ProjectApp[] = [];
    const appsDir = path.join(this.rootPath, 'apps');

    if (await this.directoryExists(appsDir)) {
      const appDirectories = await fs.readdir(appsDir);

      for (const appDir of appDirectories) {
        if (appDir.startsWith('.')) continue;

        const appPath = path.join(appsDir, appDir);
        const appStats = await this.analyzeAppStructure(appPath);

        apps.push({
          name: appDir,
          path: appPath,
          type: this.detectAppType(appPath),
          dependencies: appStats.dependencies,
          size: appStats.size,
        });
      }
    }

    return apps;
  }

  private async findLibs(): Promise<ProjectLib[]> {
    const libs: ProjectLib[] = [];
    const libsDir = path.join(this.rootPath, 'libs');

    if (await this.directoryExists(libsDir)) {
      const libDirectories = await fs.readdir(libsDir);

      for (const libDir of libDirectories) {
        if (libDir.startsWith('.')) continue;

        const libPath = path.join(libsDir, libDir);
        const libStats = await this.analyzeLibStructure(libPath);

        libs.push({
          name: libDir,
          path: libPath,
          type: this.detectLibType(libPath),
          exports: libStats.exports,
          dependents: libStats.dependents,
        });
      }
    }

    return libs;
  }

  private async detectArchitecturePatterns(): Promise<ArchitecturePattern[]> {
    const patterns: ArchitecturePattern[] = [];

    // Check for Nx monorepo pattern
    if (this.nxWorkspace) {
      patterns.push({
        name: 'Nx Monorepo',
        description:
          'Uses Nx for monorepo management with apps and libs separation',
        present: true,
        confidence: 1.0,
        examples: ['nx.json', 'apps/', 'libs/'],
      });
    }

    // Check for Clean Architecture
    const hasCleanArch = await this.detectCleanArchitecture();
    patterns.push({
      name: 'Clean Architecture',
      description: 'Separation of concerns with clear dependency direction',
      present: hasCleanArch.present,
      confidence: hasCleanArch.confidence,
      examples: hasCleanArch.examples,
    });

    // Check for Feature-based organization
    const hasFeatureOrg = await this.detectFeatureOrganization();
    patterns.push({
      name: 'Feature-based Organization',
      description:
        'Code organized by business features rather than technical layers',
      present: hasFeatureOrg.present,
      confidence: hasFeatureOrg.confidence,
      examples: hasFeatureOrg.examples,
    });

    // Check for Domain-Driven Design
    const hasDDD = await this.detectDomainDrivenDesign();
    patterns.push({
      name: 'Domain-Driven Design',
      description: 'Code organized around business domains',
      present: hasDDD.present,
      confidence: hasDDD.confidence,
      examples: hasDDD.examples,
    });

    return patterns;
  }

  private async analyzeDependencies(): Promise<DependencyGraph> {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];

    // Create nodes for apps and libs
    const structure = await this.analyzeProjectStructure();

    for (const app of structure.apps) {
      nodes.push({
        id: app.name,
        name: app.name,
        type: 'app',
        size: app.size.lines,
      });
    }

    for (const lib of structure.libs) {
      nodes.push({
        id: lib.name,
        name: lib.name,
        type: 'lib',
        size: lib.dependents.length,
      });
    }

    // Create edges based on imports
    for (const dep of structure.dependencies) {
      edges.push({
        source: dep.from,
        target: dep.to,
        weight: dep.strength,
        type: dep.type as any,
      });
    }

    // Cluster related modules
    const clusters = await this.calculateClusters(nodes, edges);

    return {
      nodes,
      edges,
      clusters,
    };
  }

  private async detectViolations(
    structure: ProjectStructure,
    dependencies: DependencyGraph
  ): Promise<ArchitectureViolation[]> {
    const violations: ArchitectureViolation[] = [];

    // Check for circular dependencies
    for (const cycle of structure.cyclicDependencies) {
      violations.push({
        type: 'circular_dependency',
        severity: 'critical',
        description: `Circular dependency detected: ${cycle}`,
        location: cycle,
        impact: 'Prevents proper module loading and testing',
        suggestedFix: 'Extract shared functionality to a common module',
      });
    }

    // Check for tight coupling
    const tightlyCoupled = dependencies.clusters.filter(
      (c) => c.coupling > 0.8
    );
    for (const cluster of tightlyCoupled) {
      violations.push({
        type: 'tight_coupling',
        severity: 'major',
        description: `High coupling detected in ${cluster.name}`,
        location: cluster.nodes.join(', '),
        impact: 'Makes modules difficult to test and modify independently',
        suggestedFix: 'Introduce interfaces and dependency injection',
      });
    }

    // Check for large files (God classes)
    const largeFiles = await this.findLargeFiles();
    for (const file of largeFiles.filter((f) => f.lines > 500)) {
      violations.push({
        type: 'god_class',
        severity: 'major',
        description: `Large file detected: ${path.basename(file.path)} (${file.lines} lines)`,
        location: file.path,
        impact: 'Difficult to maintain and understand',
        suggestedFix: 'Split into smaller, focused modules',
      });
    }

    return violations;
  }

  private async generateRecommendations(
    structure: ProjectStructure,
    patterns: ArchitecturePattern[],
    violations: ArchitectureViolation[]
  ): Promise<ArchitectureRecommendation[]> {
    const recommendations: ArchitectureRecommendation[] = [];

    // Address critical violations first
    const criticalViolations = violations.filter(
      (v) => v.severity === 'critical'
    );
    for (const violation of criticalViolations) {
      recommendations.push(this.createRecommendationFromViolation(violation));
    }

    // Suggest architecture improvements
    if (
      !patterns.find((p) => p.name === 'Feature-based Organization')?.present
    ) {
      recommendations.push({
        category: 'structure',
        priority: 'medium',
        title: 'Implement feature-based organization',
        description:
          'Organize code by business features for better maintainability',
        implementation: [
          {
            step: 1,
            description: 'Identify business features in your application',
            files: ['apps/web-dashboard/src/'],
          },
          {
            step: 2,
            description:
              'Create feature directories with components, hooks, and utils',
            commands: [
              'mkdir -p src/features/{feature-name}/{components,hooks,utils}',
            ],
          },
          {
            step: 3,
            description:
              'Move related files to their respective feature directories',
            commands: ['Move components and related files'],
          },
        ],
        benefits: [
          'Better code organization',
          'Easier to find related code',
          'Facilitates team collaboration',
        ],
        effort: 'medium',
      });
    }

    return recommendations;
  }

  private isNxWorkspace(): boolean {
    return existsSync(path.join(this.rootPath, 'nx.json'));
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private detectAppType(appPath: string): ProjectApp['type'] {
    if (existsSync(path.join(appPath, 'src', 'main.tsx'))) {
      return 'react';
    } else if (existsSync(path.join(appPath, 'src', 'main.ts'))) {
      return 'node';
    } else if (existsSync(path.join(appPath, 'app.json'))) {
      return 'native';
    }
    return 'node';
  }

  private detectLibType(libPath: string): ProjectLib['type'] {
    if (libPath.includes('shared')) return 'shared';
    if (libPath.includes('feature')) return 'feature';
    return 'utility';
  }

  private async analyzeAppStructure(appPath: string): Promise<{
    dependencies: string[];
    size: { files: number; lines: number };
  }> {
    // Simplified analysis
    return {
      dependencies: [], // Would parse package.json and imports
      size: { files: 0, lines: 0 }, // Would count actual files and lines
    };
  }

  private async analyzeLibStructure(
    libPath: string
  ): Promise<{ exports: string[]; dependents: string[] }> {
    // Simplified analysis
    return {
      exports: [], // Would parse index.ts exports
      dependents: [], // Would find files that import from this lib
    };
  }

  private async analyzeDependencyStructure(): Promise<ModuleDependency[]> {
    // Would analyze import statements across the codebase
    return [];
  }

  private async findCyclicDependencies(): Promise<string[]> {
    // Would use dependency graph analysis to find cycles
    return [];
  }

  private async detectCleanArchitecture(): Promise<{
    present: boolean;
    confidence: number;
    examples: string[];
  }> {
    // Check for typical Clean Architecture structure
    const indicators = [
      'src/domain/',
      'src/infrastructure/',
      'src/application/',
      'src/adapters/',
    ];

    let found = 0;
    const examples: string[] = [];

    for (const indicator of indicators) {
      if (existsSync(path.join(this.rootPath, indicator))) {
        found++;
        examples.push(indicator);
      }
    }

    return {
      present: found > 0,
      confidence: found / indicators.length,
      examples,
    };
  }

  private async detectFeatureOrganization(): Promise<{
    present: boolean;
    confidence: number;
    examples: string[];
  }> {
    // Check for feature-based organization
    const webDashboardSrc = path.join(this.rootPath, 'apps/web-dashboard/src');
    if (existsSync(webDashboardSrc)) {
      const dirs = readdirSync(webDashboardSrc);
      const featureDirs = dirs.filter(
        (dir) =>
          dir !== 'components' &&
          dir !== 'pages' &&
          dir !== 'utils' &&
          !dir.startsWith('.')
      );

      return {
        present: featureDirs.length > 0,
        confidence: featureDirs.length / (dirs.length || 1),
        examples: featureDirs.map((dir) => `apps/web-dashboard/src/${dir}`),
      };
    }

    return { present: false, confidence: 0, examples: [] };
  }

  private async detectDomainDrivenDesign(): Promise<{
    present: boolean;
    confidence: number;
    examples: string[];
  }> {
    // Check for DDD patterns
    const indicators = [
      'domain',
      'entities',
      'repositories',
      'services',
      'value-objects',
    ];

    const found: string[] = [];

    // Search in libs directory
    const libsDir = path.join(this.rootPath, 'libs');
    if (existsSync(libsDir)) {
      const libs = readdirSync(libsDir);
      for (const lib of libs) {
        if (indicators.some((indicator) => lib.includes(indicator))) {
          found.push(`libs/${lib}`);
        }
      }
    }

    return {
      present: found.length > 0,
      confidence: found.length / indicators.length,
      examples: found,
    };
  }

  private async calculateClusters(
    nodes: DependencyNode[],
    edges: DependencyEdge[]
  ): Promise<DependencyCluster[]> {
    // Simplified clustering - would use actual graph analysis algorithms
    return [
      {
        name: 'main-cluster',
        nodes: nodes.map((n) => n.id),
        cohesion: 0.7,
        coupling: 0.3,
      },
    ];
  }

  private async findLargeFiles(): Promise<
    Array<{ path: string; lines: number }>
  > {
    // Would recursively scan files and count lines
    return [];
  }

  private async findCodeDuplication(): Promise<
    Array<{ pattern: string; files: string[]; suggestedName: string }>
  > {
    // Would use AST analysis to find similar code patterns
    return [];
  }

  private isCyclicCluster(cluster: DependencyCluster): boolean {
    // Would check if cluster contains cycles
    return false;
  }

  private getNodePath(nodeId: string): string {
    // Would map node ID to actual file path
    return `libs/${nodeId}`;
  }

  private async analyzeReactComponentArchitecture(
    componentPath: string
  ): Promise<ArchitectureRecommendation[]> {
    return [
      {
        category: 'patterns',
        priority: 'medium',
        title: 'Implement React best practices',
        description: 'Ensure React components follow best practices',
        implementation: [
          {
            step: 1,
            description: 'Separate container and presentation components',
            files: [componentPath],
          },
          {
            step: 2,
            description: 'Use custom hooks for business logic',
            commands: ['Create hooks/ directory'],
          },
        ],
        benefits: ['Better testability', 'Reusable logic'],
        effort: 'low',
      },
    ];
  }

  private async analyzeNodeServiceArchitecture(
    componentPath: string
  ): Promise<ArchitectureRecommendation[]> {
    return [
      {
        category: 'patterns',
        priority: 'high',
        title: 'Implement layered architecture',
        description: 'Separate routes, services, and data access layers',
        implementation: [
          {
            step: 1,
            description:
              'Create routes/, services/, and repositories/ directories',
            commands: ['mkdir -p {routes,services,repositories}'],
          },
        ],
        benefits: ['Clear separation of concerns', 'Better testability'],
        effort: 'medium',
      },
    ];
  }

  private async analyzeLibraryArchitecture(
    componentPath: string
  ): Promise<ArchitectureRecommendation[]> {
    return [
      {
        category: 'structure',
        priority: 'medium',
        title: 'Ensure proper library boundaries',
        description:
          'Library should have clear public API and hide implementation details',
        implementation: [
          {
            step: 1,
            description: 'Review index.ts exports',
            files: [path.join(componentPath, 'index.ts')],
          },
        ],
        benefits: ['Clean API', 'Better encapsulation'],
        effort: 'low',
      },
    ];
  }

  private createRecommendationFromViolation(
    violation: ArchitectureViolation
  ): ArchitectureRecommendation {
    return {
      category: 'dependencies',
      priority: violation.severity === 'critical' ? 'high' : 'medium',
      title: `Fix ${violation.type.replace('_', ' ')}`,
      description: violation.description,
      implementation: [
        {
          step: 1,
          description: violation.suggestedFix,
          files: [violation.location],
        },
      ],
      benefits: ['Resolves architecture violation'],
      effort: 'medium',
    };
  }
}

// Supporting interfaces
interface ModuleDependency {
  from: string;
  to: string;
  type: 'import' | 'require' | 'dynamic';
  strength: number;
}
