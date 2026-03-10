/**
 * GraphQL Resolvers for Operational Runbooks
 *
 * Implements query resolvers for runbook catalog, retrieval, and decision support.
 *
 * Data Source: apps/mcp-server/data/runbooks/*.json
 * Schema: apps/mcp-server/src/schema/runbook.schema.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataPath } from '../config/data-paths.config.js';

// ============================================================================
// Types (exported for GraphQL resolvers)
// ============================================================================

export interface Runbook {
  version: string;
  environment: string;
  runbookType?: string;
  metadata: {
    catalogId: string;
    name?: string;
    type?: string;
    purpose: string;
    maintainer: string;
    lastUpdated: string;
    sourceFile?: string;
    schemaVersion?: string;
  };
  executiveSummary: {
    purpose: string;
    scope: string;
    status?: string;
    estimatedDuration?: string;
    prerequisites?: string[];
    keyChanges?: string[];
  };
  phases?: any[];
  deploymentSteps?: any[];
  preFlightChecks?: any[];
  validation?: any;
  successCriteria?: any[];
  rollback?: any;
  mcpIntegration?: any;
  environmentConfigurations?: any;
  featureFlags?: any;
}

export interface RunbookCatalogEntry {
  catalogId: string;
  name: string;
  version: string;
  type: string;
  environment: string;
  purpose: string;
  status: string;
  phases: number;
  steps: number;
  estimatedDuration: string;
}

// ============================================================================
// Runbook Loader Service
// ============================================================================

class RunbookLoader {
  private runbooksCache: Map<string, Runbook> = new Map();
  private catalogCache: RunbookCatalogEntry[] | null = null;
  private runbooksPath: string;

  constructor() {
    const dataPath = getDataPath();
    this.runbooksPath = path.join(dataPath, 'runbooks');
  }

  /**
   * Load all runbooks from file system
   */
  private loadAllRunbooks(): Runbook[] {
    if (this.catalogCache && this.runbooksCache.size > 0) {
      return Array.from(this.runbooksCache.values());
    }

    const runbooks: Runbook[] = [];
    const runbookTypes = [
      'deployment',
      'migration',
      'operational',
      'emergency',
      'validation',
    ];

    for (const type of runbookTypes) {
      const typeDir = path.join(this.runbooksPath, type);

      if (!fs.existsSync(typeDir)) {
        continue;
      }

      const files = fs.readdirSync(typeDir).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(typeDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const runbook: Runbook = JSON.parse(content);

          // Cache the runbook
          this.runbooksCache.set(runbook.metadata.catalogId, runbook);
          runbooks.push(runbook);
        } catch (error) {
          console.error(`Error loading runbook ${file}:`, error);
        }
      }
    }

    return runbooks;
  }

  /**
   * Get runbook by catalog ID
   */
  getRunbook(catalogId: string): Runbook | null {
    if (this.runbooksCache.has(catalogId)) {
      return this.runbooksCache.get(catalogId)!;
    }

    // Load all runbooks if cache is empty
    this.loadAllRunbooks();

    return this.runbooksCache.get(catalogId) || null;
  }

  /**
   * Get all runbooks (with optional filters)
   */
  getRunbooks(type?: string, environment?: string): Runbook[] {
    let runbooks = this.loadAllRunbooks();

    if (type) {
      runbooks = runbooks.filter(
        (r) => (r.runbookType || r.metadata.type) === type
      );
    }

    if (environment && environment !== 'all') {
      runbooks = runbooks.filter(
        (r) => r.environment === environment || r.environment === 'all'
      );
    }

    return runbooks;
  }

  /**
   * Get lightweight runbook catalog
   */
  getRunbookCatalog(
    type?: string,
    environment?: string
  ): RunbookCatalogEntry[] {
    const runbooks = this.getRunbooks(type, environment);

    return runbooks.map((runbook) => {
      const phases = runbook.phases || runbook.deploymentSteps || [];
      const totalSteps = phases.reduce(
        (sum, phase) => sum + (phase.steps?.length || 0),
        0
      );

      return {
        catalogId: runbook.metadata.catalogId,
        name: runbook.metadata.name || runbook.metadata.catalogId,
        version: runbook.version,
        type: runbook.runbookType || runbook.metadata.type || 'operational',
        environment: runbook.environment,
        purpose: runbook.metadata.purpose,
        status: runbook.executiveSummary.status || 'READY',
        phases: phases.length,
        steps: totalSteps,
        estimatedDuration:
          runbook.executiveSummary.estimatedDuration || 'Unknown',
      };
    });
  }

  /**
   * Clear cache (for testing or updates)
   */
  clearCache(): void {
    this.runbooksCache.clear();
    this.catalogCache = null;
  }
}

// Singleton instance
const runbookLoader = new RunbookLoader();

// ============================================================================
// GraphQL Resolvers
// ============================================================================

export const runbookResolvers = {
  Query: {
    /**
     * Get complete runbook by catalog ID
     */
    getRunbook: (
      _: any,
      { catalogId }: { catalogId: string }
    ): Runbook | null => {
      return runbookLoader.getRunbook(catalogId);
    },

    /**
     * Get all runbooks (with optional filters)
     */
    getRunbooks: (
      _: any,
      { type, environment }: { type?: string; environment?: string }
    ): Runbook[] => {
      return runbookLoader.getRunbooks(type, environment);
    },

    /**
     * Get lightweight runbook catalog
     */
    getRunbookCatalog: (
      _: any,
      { type, environment }: { type?: string; environment?: string }
    ): RunbookCatalogEntry[] => {
      return runbookLoader.getRunbookCatalog(type, environment);
    },

    /**
     * Get deployment phases for a specific runbook
     */
    getDeploymentPhases: (
      _: any,
      { catalogId }: { catalogId: string }
    ): any[] | null => {
      const runbook = runbookLoader.getRunbook(catalogId);
      if (!runbook) {
        return null;
      }

      return runbook.phases || runbook.deploymentSteps || [];
    },

    /**
     * Get rollback procedure for a specific runbook
     */
    getRollbackProcedure: (
      _: any,
      { catalogId }: { catalogId: string }
    ): any | null => {
      const runbook = runbookLoader.getRunbook(catalogId);
      if (!runbook) {
        return null;
      }

      return runbook.rollback || null;
    },

    /**
     * Get pre-flight checks for a specific runbook
     */
    getPreFlightChecks: (
      _: any,
      { catalogId }: { catalogId: string }
    ): any[] | null => {
      const runbook = runbookLoader.getRunbook(catalogId);
      if (!runbook) {
        return null;
      }

      return runbook.preFlightChecks || [];
    },

    /**
     * Get success criteria for a specific runbook
     */
    getSuccessCriteria: (
      _: any,
      { catalogId }: { catalogId: string }
    ): any[] | null => {
      const runbook = runbookLoader.getRunbook(catalogId);
      if (!runbook) {
        return null;
      }

      return runbook.successCriteria || [];
    },

    /**
     * Get feature flag configuration from multi-environment runbook
     */
    getFeatureFlagStatus: (
      _: any,
      { runbookId }: { runbookId: string }
    ): any[] | null => {
      const runbook = runbookLoader.getRunbook(runbookId);
      if (!runbook || !runbook.featureFlags) {
        return null;
      }

      // Convert feature flags object to array format
      const flags = runbook.featureFlags;
      return Object.keys(flags).map((flagName) => ({
        name: flagName,
        description: flags[flagName].description || '',
        environments: flags[flagName].environments || {},
      }));
    },

    /**
     * Get environment-specific configuration from runbook
     */
    getEnvironmentConfig: (
      _: any,
      { runbookId, environment }: { runbookId: string; environment: string }
    ): any | null => {
      const runbook = runbookLoader.getRunbook(runbookId);
      if (!runbook || !runbook.environmentConfigurations) {
        return null;
      }

      const config = runbook.environmentConfigurations[environment];
      if (!config) {
        return null;
      }

      return {
        environment,
        featureFlags: config,
        ports: config.ports || [],
        services: config.services || [],
      };
    },
  },
};

/**
 * Export runbook loader for testing
 */
export { runbookLoader };
