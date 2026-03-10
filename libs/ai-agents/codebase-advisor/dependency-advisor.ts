/**
 * AI Dependency Advisor - Package and Version Management Guidance
 *
 * Provides guidance on:
 * - Dependency selection and recommendations
 * - Version management and compatibility
 * - Security vulnerability assessment
 * - Bundle size optimization
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface DependencyAnalysis {
  current: PackageInfo[];
  vulnerabilities: SecurityVulnerability[];
  outdated: OutdatedPackage[];
  recommendations: DependencyRecommendation[];
  bundleSize: BundleSizeAnalysis;
  conflicts: DependencyConflict[];
}

export interface PackageInfo {
  name: string;
  version: string;
  type: 'dependencies' | 'devDependencies' | 'peerDependencies';
  description: string;
  license: string;
  size: {
    installed: string;
    bundled?: string;
  };
  dependencies: string[];
  usageCount: number;
  lastUsed?: Date;
}

export interface SecurityVulnerability {
  package: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  description: string;
  vulnerable_versions: string;
  patched_versions: string;
  recommendation: string;
  cwe?: string[];
}

export interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: 'major' | 'minor' | 'patch';
  breaking: boolean;
  effort: 'low' | 'medium' | 'high';
  benefits: string[];
}

export interface DependencyRecommendation {
  type: 'add' | 'remove' | 'update' | 'replace';
  package: string;
  version?: string;
  reason: string;
  alternative?: string;
  impact: 'positive' | 'neutral' | 'negative';
  effort: 'low' | 'medium' | 'high';
  commands: string[];
}

export interface BundleSizeAnalysis {
  total: string;
  byPackage: PackageSizeInfo[];
  suggestions: BundleOptimization[];
  treeshaking: TreeshakingInfo;
}

export interface PackageSizeInfo {
  name: string;
  size: string;
  percentage: number;
  gzipped: string;
  essential: boolean;
}

export interface BundleOptimization {
  type: 'replace' | 'remove' | 'split' | 'lazy-load';
  description: string;
  package?: string;
  alternative?: string;
  savings: string;
  implementation: string[];
}

export interface TreeshakingInfo {
  enabled: boolean;
  effectiveness: number;
  issues: string[];
  recommendations: string[];
}

export interface DependencyConflict {
  packages: string[];
  versions: string[];
  reason: string;
  resolution: string;
  priority: 'high' | 'medium' | 'low';
}

export class DependencyAdvisor {
  private readonly rootPath: string;
  private readonly packageManager: 'npm' | 'yarn' | 'pnpm';

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.packageManager = this.detectPackageManager();
  }

  /**
   * Analyze all dependencies in the project
   */
  async analyzeDependencies(): Promise<DependencyAnalysis> {
    const current = await this.getCurrentPackages();
    const vulnerabilities = await this.checkVulnerabilities();
    const outdated = await this.findOutdatedPackages();
    const recommendations = await this.generateRecommendations(
      current,
      vulnerabilities,
      outdated
    );
    const bundleSize = await this.analyzeBundleSize();
    const conflicts = await this.detectConflicts();

    return {
      current,
      vulnerabilities,
      outdated,
      recommendations,
      bundleSize,
      conflicts,
    };
  }

  /**
   * Recommend packages for specific requirements
   */
  async recommendPackagesForRequirement(
    requirement: string
  ): Promise<DependencyRecommendation[]> {
    const recommendations: DependencyRecommendation[] = [];
    const normalizedReq = requirement.toLowerCase();

    // Common requirement patterns
    const patterns = this.getRequirementPatterns();

    for (const [pattern, packages] of patterns) {
      if (normalizedReq.includes(pattern)) {
        for (const pkg of packages) {
          const existing = await this.isPackageInstalled(pkg.name);
          if (!existing) {
            recommendations.push({
              type: 'add',
              package: pkg.name,
              version: pkg.version,
              reason: pkg.reason,
              impact: 'positive',
              effort: 'low',
              commands: [
                `${this.packageManager} ${this.packageManager === 'npm' ? 'install' : 'add'} ${pkg.name}${pkg.dev ? ' --save-dev' : ''}`,
              ],
            });
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Check for security vulnerabilities
   */
  async auditSecurity(): Promise<SecurityVulnerability[]> {
    return await this.checkVulnerabilities();
  }

  /**
   * Suggest dependency updates
   */
  async suggestUpdates(): Promise<DependencyRecommendation[]> {
    const outdated = await this.findOutdatedPackages();
    const recommendations: DependencyRecommendation[] = [];

    for (const pkg of outdated) {
      let updateType: DependencyRecommendation['type'] = 'update';
      let effort: DependencyRecommendation['effort'] = 'low';

      if (pkg.type === 'major' && pkg.breaking) {
        effort = 'high';
      } else if (pkg.type === 'minor') {
        effort = 'medium';
      }

      recommendations.push({
        type: updateType,
        package: pkg.name,
        version: pkg.latest,
        reason: `Update from ${pkg.current} to ${pkg.latest}. Benefits: ${pkg.benefits.join(', ')}`,
        impact: 'positive',
        effort,
        commands: [
          `${this.packageManager} ${this.packageManager === 'npm' ? 'install' : 'add'} ${pkg.name}@${pkg.latest}`,
        ],
      });
    }

    return recommendations;
  }

  /**
   * Optimize bundle size
   */
  async optimizeBundleSize(): Promise<BundleOptimization[]> {
    const bundleAnalysis = await this.analyzeBundleSize();
    return bundleAnalysis.suggestions;
  }

  /**
   * Clean up unused dependencies
   */
  async findUnusedDependencies(): Promise<DependencyRecommendation[]> {
    const unused = await this.detectUnusedPackages();
    const recommendations: DependencyRecommendation[] = [];

    for (const pkg of unused) {
      recommendations.push({
        type: 'remove',
        package: pkg,
        reason: 'Package is installed but not used in the codebase',
        impact: 'positive',
        effort: 'low',
        commands: [
          `${this.packageManager} ${this.packageManager === 'npm' ? 'uninstall' : 'remove'} ${pkg}`,
        ],
      });
    }

    return recommendations;
  }

  // Private implementation methods

  private detectPackageManager(): 'npm' | 'yarn' | 'pnpm' {
    if (existsSync(path.join(this.rootPath, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    } else if (
      existsSync(path.join(this.rootPath, 'yarn.lock'))
    ) {
      return 'yarn';
    }
    return 'npm';
  }

  private async getCurrentPackages(): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];
    const packageJsonPath = path.join(this.rootPath, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return packages;
    }

    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    // Process dependencies
    const deps = {
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      peerDependencies: packageJson.peerDependencies || {},
    };

    for (const [type, depList] of Object.entries(deps)) {
      for (const [name, version] of Object.entries(
        depList as Record<string, string>
      )) {
        const packageInfo = await this.getPackageInfo(
          name,
          version,
          type as any
        );
        packages.push(packageInfo);
      }
    }

    return packages;
  }

  private async getPackageInfo(
    name: string,
    version: string,
    type: PackageInfo['type']
  ): Promise<PackageInfo> {
    // Get package details from node_modules or registry
    const nodeModulesPath = path.join(
      this.rootPath,
      'node_modules',
      name,
      'package.json'
    );
    let description = '';
    let license = '';
    let dependencies: string[] = [];

    if (existsSync(nodeModulesPath)) {
      try {
        const pkgJson = JSON.parse(await fs.readFile(nodeModulesPath, 'utf-8'));
        description = pkgJson.description || '';
        license = pkgJson.license || '';
        dependencies = Object.keys(pkgJson.dependencies || {});
      } catch {
        // Ignore errors
      }
    }

    const usageCount = await this.countPackageUsage(name);

    return {
      name,
      version,
      type,
      description,
      license,
      size: {
        installed: await this.getInstalledSize(name),
        bundled: undefined, // Would need bundler analysis
      },
      dependencies,
      usageCount,
      lastUsed: undefined, // Would need usage tracking
    };
  }

  private async checkVulnerabilities(): Promise<SecurityVulnerability[]> {
    try {
      // Run audit command
      const auditCommand =
        this.packageManager === 'npm'
          ? 'npm audit --json'
          : `${this.packageManager} audit --json`;
      const result = execSync(auditCommand, {
        cwd: this.rootPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      const auditData = JSON.parse(result);
      return this.parseAuditResults(auditData);
    } catch (error) {
      // Audit might fail if no vulnerabilities or command not available
      return [];
    }
  }

  private parseAuditResults(auditData: any): SecurityVulnerability[] {
    const vulnerabilities: SecurityVulnerability[] = [];

    // Parse based on package manager format
    if (this.packageManager === 'npm' && auditData.vulnerabilities) {
      for (const [pkgName, vulnData] of Object.entries(
        auditData.vulnerabilities as any
      )) {
        const typedVulnData = vulnData as any;
        if (typedVulnData.via && Array.isArray(typedVulnData.via)) {
          for (const via of typedVulnData.via) {
            if (typeof via === 'object' && via.title) {
              vulnerabilities.push({
                package: pkgName,
                severity: via.severity || 'moderate',
                title: via.title,
                description: via.url || '',
                vulnerable_versions: typedVulnData.range || '',
                patched_versions: '',
                recommendation: `Update ${pkgName} to fix vulnerability`,
                cwe: via.cwe ? [via.cwe] : undefined,
              });
            }
          }
        }
      }
    }

    return vulnerabilities;
  }

  private async findOutdatedPackages(): Promise<OutdatedPackage[]> {
    const outdated: OutdatedPackage[] = [];

    try {
      // This would integrate with package manager's outdated command
      // For now, return empty array as it requires actual package registry access
      return outdated;
    } catch {
      return outdated;
    }
  }

  private async generateRecommendations(
    current: PackageInfo[],
    vulnerabilities: SecurityVulnerability[],
    outdated: OutdatedPackage[]
  ): Promise<DependencyRecommendation[]> {
    const recommendations: DependencyRecommendation[] = [];

    // Recommendations for vulnerabilities
    for (const vuln of vulnerabilities) {
      recommendations.push({
        type: 'update',
        package: vuln.package,
        reason: `Security vulnerability: ${vuln.title}`,
        impact: 'positive',
        effort: vuln.severity === 'critical' ? 'high' : 'medium',
        commands: [
          `${this.packageManager} ${this.packageManager === 'npm' ? 'audit fix' : 'audit --fix'}`,
        ],
      });
    }

    // Recommendations for common improvements
    recommendations.push(...this.getCommonRecommendations(current));

    return recommendations;
  }

  private getCommonRecommendations(
    current: PackageInfo[]
  ): DependencyRecommendation[] {
    const recommendations: DependencyRecommendation[] = [];
    const packageNames = current.map((p) => p.name);

    // Recommend TypeScript if not present
    if (!packageNames.includes('typescript')) {
      recommendations.push({
        type: 'add',
        package: 'typescript',
        version: '^5.9.2',
        reason:
          'Add TypeScript for better type safety and developer experience',
        impact: 'positive',
        effort: 'medium',
        commands: ['pnpm add -D typescript'],
      });
    }

    // Recommend ESLint if not present
    if (!packageNames.includes('eslint')) {
      recommendations.push({
        type: 'add',
        package: 'eslint',
        version: '^8.57.1',
        reason: 'Add ESLint for code quality and consistency',
        impact: 'positive',
        effort: 'low',
        commands: ['pnpm add -D eslint'],
      });
    }

    // Recommend Prettier if not present
    if (!packageNames.includes('prettier')) {
      recommendations.push({
        type: 'add',
        package: 'prettier',
        version: '^3.6.2',
        reason: 'Add Prettier for consistent code formatting',
        impact: 'positive',
        effort: 'low',
        commands: ['pnpm add -D prettier'],
      });
    }

    return recommendations;
  }

  private async analyzeBundleSize(): Promise<BundleSizeAnalysis> {
    // Simplified bundle size analysis
    const byPackage: PackageSizeInfo[] = [];
    const suggestions: BundleOptimization[] = [];

    // Would integrate with webpack-bundle-analyzer or similar
    suggestions.push({
      type: 'lazy-load',
      description: 'Implement code splitting for large components',
      savings: '~20% initial bundle size',
      implementation: [
        'Use React.lazy() for route components',
        'Implement dynamic imports for heavy libraries',
      ],
    });

    return {
      total: '0 MB', // Would calculate actual size
      byPackage,
      suggestions,
      treeshaking: {
        enabled: true,
        effectiveness: 85,
        issues: [],
        recommendations: [
          'Ensure all imports use named imports where possible',
        ],
      },
    };
  }

  private async detectConflicts(): Promise<DependencyConflict[]> {
    // Would analyze package.json and lock file for version conflicts
    return [];
  }

  private getRequirementPatterns(): Map<
    string,
    Array<{ name: string; version: string; reason: string; dev?: boolean }>
  > {
    return new Map([
      [
        'testing',
        [
          {
            name: '@testing-library/react',
            version: '^16.3.0',
            reason: 'React component testing utilities',
            dev: true,
          },
          {
            name: '@testing-library/jest-dom',
            version: '^6.8.0',
            reason: 'Custom Jest matchers for DOM',
            dev: true,
          },
          {
            name: 'jest',
            version: '^29.7.0',
            reason: 'JavaScript testing framework',
            dev: true,
          },
        ],
      ],
      [
        'ui',
        [
          {
            name: '@mui/material',
            version: '^6.1.8',
            reason: 'Material-UI components',
          },
          {
            name: '@mui/icons-material',
            version: '^6.1.8',
            reason: 'Material-UI icons',
          },
        ],
      ],
      [
        'http',
        [
          {
            name: 'axios',
            version: '^1.7.7',
            reason: 'HTTP client for API calls',
          },
        ],
      ],
      [
        'state management',
        [
          {
            name: 'zustand',
            version: '^5.0.0',
            reason: 'Lightweight state management',
          },
          {
            name: '@reduxjs/toolkit',
            version: '^2.4.0',
            reason: 'Redux with modern patterns',
          },
        ],
      ],
      [
        'routing',
        [
          {
            name: 'react-router-dom',
            version: '^6.29.0',
            reason: 'React routing library',
          },
        ],
      ],
      [
        'validation',
        [
          {
            name: 'zod',
            version: '^3.23.8',
            reason: 'TypeScript-first schema validation',
          },
          {
            name: 'yup',
            version: '^1.6.0',
            reason: 'Object schema validation',
          },
        ],
      ],
      [
        'database',
        [
          { name: 'pg', version: '^8.13.1', reason: 'PostgreSQL client' },
          {
            name: 'prisma',
            version: '^6.1.0',
            reason: 'Modern database toolkit',
          },
        ],
      ],
    ]);
  }

  private async isPackageInstalled(packageName: string): Promise<boolean> {
    const packageJsonPath = path.join(this.rootPath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    return !!(
      packageJson.dependencies?.[packageName] ||
      packageJson.devDependencies?.[packageName] ||
      packageJson.peerDependencies?.[packageName]
    );
  }

  private async countPackageUsage(packageName: string): Promise<number> {
    // Would scan all files for import statements
    // For now, return a placeholder
    return 0;
  }

  private async getInstalledSize(packageName: string): Promise<string> {
    // Would calculate actual installed size
    return '0 MB';
  }

  private async detectUnusedPackages(): Promise<string[]> {
    // Would use tools like depcheck to find unused dependencies
    return [];
  }
}
