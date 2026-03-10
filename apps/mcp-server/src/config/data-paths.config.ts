/**
 * Data Paths Configuration
 *
 * Centralized configuration for all data file paths.
 * Supports both development and production (Docker) environments.
 *
 * Environment Detection:
 * - Development: Files in apps/mcp-server/data/
 * - Production/Docker: Files in /app/data/
 * - Testing: Configurable via environment variables
 *
 * Path Resolution Strategy:
 * 1. Check environment variable (highest priority)
 * 2. Detect Docker environment (check if /app exists)
 * 3. Use development paths (fallback)
 */

import { join, resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if running in Docker container
 */
function isDocker(): boolean {
  // Check if /app directory exists (Docker convention)
  return existsSync('/app');
}

/**
 * Check if running in production mode
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get repository root directory (for development)
 */
function getRepoRoot(): string {
  // In development, resolve from this file's location
  // apps/mcp-server/src/config/ -> ../../../../
  return resolve(__dirname, '../../../../');
}

// ============================================================================
// Path Configuration
// ============================================================================

/**
 * Base data directory path
 *
 * Priority:
 * 1. DATA_PATH environment variable
 * 2. Docker: /app/data
 * 3. Development: apps/mcp-server/data
 */
export const DATA_PATH =
  process.env.DATA_PATH ||
  (isDocker() || isProduction()
    ? '/app/data'
    : join(getRepoRoot(), 'apps/mcp-server/data'));

/**
 * Repository root directory
 * Used for accessing .roadmap/ and other repo-level directories
 */
export const REPO_ROOT = isDocker() || isProduction() ? '/app' : getRepoRoot();

/**
 * Evidence files directory
 */
export const EVIDENCE_PATH =
  process.env.EVIDENCE_PATH || join(DATA_PATH, 'evidence');

/**
 * Individual data file paths
 *
 * V3 MIGRATION (2026-01-05): All core data files now in .roadmap/ directory
 * This is the enterprise-standard V3 schema location.
 * V1 paths in apps/mcp-server/data/ are deprecated but kept for reference.
 *
 * Graph-ready structure: All files include $id URN identifiers and graphMetadata
 */
export const DATA_FILES = {
  // ========================================================================
  // V3 SOURCE OF TRUTH (.roadmap/ directory)
  // ========================================================================

  // Core roadmap files - V3 enterprise schema
  decisionLog: join(REPO_ROOT, '.roadmap', 'decision-log.json'),
  infrastructureCatalog: join(
    REPO_ROOT,
    '.roadmap',
    'infrastructure-catalog.json'
  ),
  currentTruth: join(REPO_ROOT, '.roadmap', 'current-truth.json'),
  votes: join(REPO_ROOT, '.roadmap', 'votes.json'),
  roadmap: join(REPO_ROOT, '.roadmap', 'roadmap.json'),
  businessRoadmap: join(REPO_ROOT, '.roadmap', 'roadmap-business.json'),

  // Additional V3 files
  ventureSummary: join(REPO_ROOT, '.roadmap', 'venture-summary.json'),
  dependencies: join(REPO_ROOT, '.roadmap', 'dependencies.json'),
  boundaries: join(REPO_ROOT, '.roadmap', 'boundaries.json'),
  architecture: join(REPO_ROOT, '.roadmap', 'architecture.json'),
  techStack: join(REPO_ROOT, '.roadmap', 'tech-stack.json'),
} as const;

/**
 * Schema files directory (for validation)
 *
 * Uses REPO_ROOT-relative path, same as DATA_FILES.
 * In Docker: /app/.roadmap/schemas/meta/
 * In dev:    <repo>/.roadmap/schemas/meta/
 *
 * Overridable via SCHEMA_PATH env var for custom deployments.
 */
export const SCHEMA_PATH =
  process.env.SCHEMA_PATH || join(REPO_ROOT, '.roadmap', 'schemas', 'meta');

/**
 * Schema file paths
 */
export const SCHEMA_FILES = {
  decisionLog: join(SCHEMA_PATH, 'decision-log-schema.json'),
  vote: join(SCHEMA_PATH, 'vote-schema.json'),
  infrastructureCatalog: join(
    SCHEMA_PATH,
    'infrastructure-catalog-schema.json'
  ),
  currentTruth: join(SCHEMA_PATH, 'current-truth-schema.json'),
} as const;

// ============================================================================
// Configuration Object
// ============================================================================

/**
 * Complete data configuration
 */
export const DATA_CONFIG = {
  // Environment detection
  environment: {
    isDocker: isDocker(),
    isProduction: isProduction(),
    isDevelopment: !isProduction(),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Base paths
  paths: {
    data: DATA_PATH,
    evidence: EVIDENCE_PATH,
    schemas: SCHEMA_PATH,
    repoRoot: isDocker() ? '/app' : getRepoRoot(),
  },

  // Data files
  files: DATA_FILES,

  // Schema files
  schemas: SCHEMA_FILES,

  // Feature flags
  features: {
    enableCache: process.env.ENABLE_DATA_CACHE !== 'false',
    cacheTTL: parseInt(process.env.DATA_CACHE_TTL || '300000', 10), // 5 minutes default
  },
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate that all required data files exist
 */
export function validateDataFiles(): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  for (const [name, path] of Object.entries(DATA_FILES)) {
    if (!existsSync(path)) {
      missing.push(`${name}: ${path}`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get configuration summary for debugging
 */
export function getConfigSummary(): string {
  const lines = [
    '='.repeat(60),
    'Data Configuration Summary',
    '='.repeat(60),
    '',
    'Environment:',
    `  NODE_ENV: ${DATA_CONFIG.environment.nodeEnv}`,
    `  Is Docker: ${DATA_CONFIG.environment.isDocker}`,
    `  Is Production: ${DATA_CONFIG.environment.isProduction}`,
    '',
    'Paths:',
    `  Data: ${DATA_CONFIG.paths.data}`,
    `  Evidence: ${DATA_CONFIG.paths.evidence}`,
    `  Schemas: ${DATA_CONFIG.paths.schemas}`,
    '',
    'Data Files:',
  ];

  for (const [name, path] of Object.entries(DATA_FILES)) {
    const exists = existsSync(path) ? '✓' : '✗';
    lines.push(`  ${exists} ${name}: ${path}`);
  }

  lines.push('', '='.repeat(60));

  return lines.join('\n');
}

/**
 * Log configuration on startup (for debugging)
 */
export function logConfig(): void {
  console.log(getConfigSummary());

  const validation = validateDataFiles();
  if (!validation.valid) {
    console.warn('⚠️  Missing data files:');
    validation.missing.forEach((file) => console.warn(`   - ${file}`));
  }
}

/**
 * Get base data directory path (for runbook loader and other services)
 */
export function getDataPath(): string {
  return DATA_PATH;
}

// ============================================================================
// Type Exports
// ============================================================================

export type DataFileName = keyof typeof DATA_FILES;
export type SchemaFileName = keyof typeof SCHEMA_FILES;
