#!/usr/bin/env npx tsx
/**
 * sync-mcp-data.ts
 * Enterprise MCP Data Synchronization
 *
 * Master script that runs all code extraction scripts to keep MCP data
 * synchronized with the actual codebase.
 *
 * ENTERPRISE PATTERN: Code-as-documentation - single command to sync all MCP data
 *
 * Usage: npx tsx scripts/mcp/sync-mcp-data.ts
 * Or:    pnpm mcp:sync
 */

import { execSync } from 'child_process';
import * as path from 'path';

const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

interface SyncResult {
  script: string;
  success: boolean;
  output: string;
  duration: number;
}

async function runScript(scriptName: string): Promise<SyncResult> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const startTime = Date.now();

  try {
    const output = execSync(`npx tsx "${scriptPath}"`, {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      script: scriptName,
      success: true,
      output,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      script: scriptName,
      success: false,
      output: error.stderr || error.message,
      duration: Date.now() - startTime,
    };
  }
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           MCP DATA SYNCHRONIZATION - ENTERPRISE                 ║');
  console.log('║     Extracting code metadata for MCP knowledge base             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const scripts = [
    { name: 'extract-routes.ts', description: 'API Routes' },
    { name: 'extract-env-vars.ts', description: 'Environment Variables' },
  ];

  const results: SyncResult[] = [];

  for (const script of scripts) {
    console.log(`\n🔄 Syncing ${script.description}...`);
    const result = await runScript(script.name);
    results.push(result);

    if (result.success) {
      console.log(result.output);
    } else {
      console.log(`❌ Failed: ${result.output}`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(68));
  console.log('📊 SYNC SUMMARY');
  console.log('═'.repeat(68));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n   ✅ Successful: ${successful}/${scripts.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${scripts.length}`);
    for (const r of results.filter(r => !r.success)) {
      console.log(`      - ${r.script}`);
    }
  }
  console.log(`   ⏱️  Total time: ${(totalDuration / 1000).toFixed(2)}s`);

  console.log('\n📁 Updated files:');
  console.log('   - apps/mcp-server/data/mcp-routes.json');
  console.log('   - apps/mcp-server/data/environment-variables.json');

  console.log('\n💡 Next steps:');
  console.log('   1. Review generated JSON files for accuracy');
  console.log('   2. Commit changes: git add apps/mcp-server/data/*.json');
  console.log('   3. Run MCP health check: curl http://localhost:3002/health');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
