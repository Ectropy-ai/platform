/**
 * Version Utility for MCP Server
 * Reads version from package.json at runtime
 * Enterprise pattern: Single source of truth for version information
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the root package.json version
 * Follows monorepo fixed versioning strategy
 * @returns The current application version from monorepo root
 */
export function getVersion(): string {
  try {
    // Try multiple strategies to find package.json
    // Strategy 1: Use process.cwd() for Docker container environment
    //   In Docker: cwd is /app, package.json at /app/package.json
    const cwdPath = join(process.cwd(), 'package.json');

    try {
      const packageJsonContent = readFileSync(cwdPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      return packageJson.version || '0.0.0';
    } catch {
      // Strategy 2: Navigate from __dirname or import.meta.url
      const currentDir =
        typeof __dirname !== 'undefined'
          ? __dirname
          : dirname(fileURLToPath(import.meta.url));

      // Navigate up to monorepo root
      // Development: apps/mcp-server/src/utils -> root (4 levels)
      // Production: dist/apps/mcp-server/utils -> root (4 levels)
      const rootPackageJsonPath = join(currentDir, '../../../../package.json');

      const packageJsonContent = readFileSync(rootPackageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      return packageJson.version || '0.0.0';
    }
  } catch (error) {
    console.error('[MCP Server Version] Failed to read version from package.json:', error);
    // Fallback to environment variable if available
    return process.env['MCP_SERVER_VERSION'] || '0.0.0';
  }
}

/**
 * Get the MCP Server package version (local package)
 * Use this only if independent package versioning is needed
 * @returns The MCP Server package version
 */
export function getLocalVersion(): string {
  try {
    const currentDir =
      typeof __dirname !== 'undefined'
        ? __dirname
        : dirname(fileURLToPath(import.meta.url));

    // Navigate to local package.json: src/utils -> package root
    const localPackageJsonPath = join(currentDir, '../../package.json');

    const packageJsonContent = readFileSync(localPackageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    return packageJson.version || '0.0.0';
  } catch (error) {
    console.error(
      '[MCP Server Version] Failed to read local version from package.json:',
      error
    );
    return '0.0.0';
  }
}

/**
 * Version strategy configuration
 * Defines whether to use fixed (monorepo-wide) or independent versioning
 */
export const VERSION_STRATEGY = {
  type: 'fixed', // 'fixed' or 'independent'
  source: 'monorepo-root', // Where version is read from
  description:
    'All packages share the same version from monorepo root package.json',
} as const;

/**
 * Get the current version based on strategy
 * @returns The version according to configured strategy
 */
export function getCurrentVersion(): string {
  if (VERSION_STRATEGY.type === 'fixed') {
    return getVersion();
  } else {
    return getLocalVersion();
  }
}
