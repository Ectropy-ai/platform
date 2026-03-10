#!/usr/bin/env tsx

/**
 * Windows ESM Loader Fix - Enterprise Grade
 *
 * Implements proper ESM loader configuration for Windows compatibility
 * while maintaining ESM-first architecture across all platforms.
 *
 * Addresses Node.js ESM loader issue on Windows where `c:` protocol
 * requires `file://` URL scheme for proper module resolution.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const FIX_TARGETS = [
  'apps/mcp-server/project.json',
  'apps/api-gateway/project.json',
  'apps/web-dashboard/project.json',
];

interface ProjectConfig {
  targets?: {
    serve?: {
      options?: {
        nodeOptions?: string[];
        args?: string[];
        env?: Record<string, string>;
      };
    };
  };
}

function fixWindowsESMLoader(): void {
  console.log('🔧 Windows ESM Loader Enterprise Fix');
  console.log('====================================\n');

  let fixedCount = 0;
  let skippedCount = 0;

  FIX_TARGETS.forEach((target) => {
    const path = join(process.cwd(), target);

    if (!existsSync(path)) {
      console.log(`⚠️  Skipping ${target} - file not found`);
      skippedCount++;
      return;
    }

    try {
      const configContent = readFileSync(path, 'utf-8');
      const config: ProjectConfig = JSON.parse(configContent);

      // Initialize serve target if it doesn't exist
      if (!config.targets) {
        config.targets = {};
      }
      if (!config.targets.serve) {
        config.targets.serve = {};
      }
      if (!config.targets.serve.options) {
        config.targets.serve.options = {};
      }

      // Add Node options for Windows ESM compatibility
      const nodeOptions = [
        '--experimental-specifier-resolution=node',
        '--loader=tsx',
        '--no-warnings',
        '--enable-source-maps',
      ];

      // Environment variables for ESM support
      const envVars = {
        NODE_OPTIONS: nodeOptions.join(' '),
        NODE_NO_WARNINGS: '1',
        ESM_LOADER_ENABLED: 'true',
      };

      config.targets.serve.options.nodeOptions = nodeOptions;
      config.targets.serve.options.env = {
        ...config.targets.serve.options.env,
        ...envVars,
      };

      // Add Windows-specific arguments for file URL handling
      config.targets.serve.options.args = [
        ...(config.targets.serve.options.args || []),
        '--experimental-import-meta-resolve',
      ];

      writeFileSync(path, JSON.stringify(config, null, 2));
      console.log(`✅ Fixed ESM loader configuration for ${target}`);
      fixedCount++;
    } catch (error) {
      console.error(`❌ Error processing ${target}:`, error.message);
    }
  });

  console.log('\n📊 Windows ESM Loader Fix Summary:');
  console.log(`   Fixed: ${fixedCount} projects`);
  console.log(`   Skipped: ${skippedCount} projects`);

  if (fixedCount > 0) {
    console.log('\n🎯 Next Steps:');
    console.log('   1. Test services: npm run dev:all');
    console.log('   2. Validate Windows: npm run cross-platform:validate');
    console.log('   3. Run integration tests: npm run test');
  }
}

// File URL conversion utilities for cross-platform paths
export function createFileURL(filepath: string): string {
  return pathToFileURL(filepath).href;
}

export function normalizeESMPath(path: string): string {
  // Convert Windows paths to proper ESM import format
  if (process.platform === 'win32') {
    return createFileURL(path);
  }
  return path;
}

// Export for testing
export { FIX_TARGETS, fixWindowsESMLoader };

// Execute fix when run directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  fixWindowsESMLoader();
}
