#!/usr/bin/env npx tsx
/**
 * archive-mcp-data.ts
 * Enterprise MCP Data Archival System
 *
 * Archives old data from MCP JSON files to keep them lean and performant:
 * - current-truth.json: Archives nodes older than retention period
 * - infrastructure-catalog.json: Archives old changelog entries
 *
 * ENTERPRISE PATTERN: Data lifecycle management - keep active data lean, preserve history
 *
 * Usage: npx tsx scripts/mcp/archive-mcp-data.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const MCP_DATA_DIR = 'apps/mcp-server/data';
const ARCHIVE_DIR = 'apps/mcp-server/data/archive';

// Configuration
const CONFIG = {
  currentTruth: {
    file: 'current-truth.json',
    retentionDays: 45,
    maxNodes: 50, // Keep at most 50 nodes in active file
  },
  infrastructureCatalog: {
    file: 'infrastructure-catalog.json',
    maxChangelogVersions: 3, // Keep only last 3 version changelogs
  },
};

interface ArchiveResult {
  file: string;
  itemsArchived: number;
  originalSize: number;
  newSize: number;
  archiveFile?: string;
}

/**
 * Ensure archive directory exists
 */
function ensureArchiveDir(): void {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    console.log(`   📁 Created archive directory: ${ARCHIVE_DIR}`);
  }
}

/**
 * Get file size in KB
 */
function getFileSizeKB(filePath: string): number {
  const stats = fs.statSync(filePath);
  return Math.round(stats.size / 1024);
}

/**
 * Archive old nodes from current-truth.json
 */
function archiveCurrentTruth(dryRun: boolean): ArchiveResult {
  const filePath = path.join(MCP_DATA_DIR, CONFIG.currentTruth.file);
  const originalSize = getFileSizeKB(filePath);

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const nodes = data.nodes || [];

  const now = new Date();
  const cutoffDate = new Date(
    now.getTime() - CONFIG.currentTruth.retentionDays * 24 * 60 * 60 * 1000
  );

  // Separate nodes into keep and archive
  const nodesToKeep: any[] = [];
  const nodesToArchive: any[] = [];

  for (const node of nodes) {
    const nodeDate = new Date(node.timestamp);
    const isOld = nodeDate < cutoffDate;
    const exceedsMax = nodesToKeep.length >= CONFIG.currentTruth.maxNodes;

    if (isOld || exceedsMax) {
      nodesToArchive.push(node);
    } else {
      nodesToKeep.push(node);
    }
  }

  if (nodesToArchive.length === 0) {
    return {
      file: CONFIG.currentTruth.file,
      itemsArchived: 0,
      originalSize,
      newSize: originalSize,
    };
  }

  // Create archive file
  const archiveFileName = `current-truth-archive-${now.toISOString().split('T')[0]}.json`;
  const archiveFilePath = path.join(ARCHIVE_DIR, archiveFileName);

  // Load existing archive or create new
  let archiveData: any = {
    archivedAt: now.toISOString(),
    source: CONFIG.currentTruth.file,
    retentionDays: CONFIG.currentTruth.retentionDays,
    nodes: [],
  };

  if (fs.existsSync(archiveFilePath)) {
    archiveData = JSON.parse(fs.readFileSync(archiveFilePath, 'utf8'));
  }

  // Add nodes to archive
  archiveData.nodes.push(...nodesToArchive);
  archiveData.lastUpdated = now.toISOString();
  archiveData.totalNodes = archiveData.nodes.length;

  if (!dryRun) {
    // Write archive
    fs.writeFileSync(archiveFilePath, JSON.stringify(archiveData, null, 2));

    // Update original file
    data.nodes = nodesToKeep;
    data.metadata.totalNodes = nodesToKeep.length;
    data.metadata.lastArchived = now.toISOString();
    data.metadata.archivedNodesCount =
      (data.metadata.archivedNodesCount || 0) + nodesToArchive.length;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  const newSize = dryRun ? originalSize : getFileSizeKB(filePath);

  return {
    file: CONFIG.currentTruth.file,
    itemsArchived: nodesToArchive.length,
    originalSize,
    newSize,
    archiveFile: archiveFileName,
  };
}

/**
 * Archive old changelog entries from infrastructure-catalog.json
 */
function archiveInfrastructureCatalog(dryRun: boolean): ArchiveResult {
  const filePath = path.join(MCP_DATA_DIR, CONFIG.infrastructureCatalog.file);
  const originalSize = getFileSizeKB(filePath);

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const metadata = data.metadata || {};

  // Find all changesFromV* keys
  const changelogKeys = Object.keys(metadata).filter((k) =>
    k.startsWith('changesFromV')
  );

  if (
    changelogKeys.length <= CONFIG.infrastructureCatalog.maxChangelogVersions
  ) {
    return {
      file: CONFIG.infrastructureCatalog.file,
      itemsArchived: 0,
      originalSize,
      newSize: originalSize,
    };
  }

  // Sort by version (newest first) and keep only the latest
  const sortedKeys = changelogKeys.sort((a, b) => {
    const versionA = a.replace('changesFromV', '').replace(/_/g, '.');
    const versionB = b.replace('changesFromV', '').replace(/_/g, '.');
    return versionB.localeCompare(versionA, undefined, { numeric: true });
  });

  const keysToKeep = sortedKeys.slice(
    0,
    CONFIG.infrastructureCatalog.maxChangelogVersions
  );
  const keysToArchive = sortedKeys.slice(
    CONFIG.infrastructureCatalog.maxChangelogVersions
  );

  if (keysToArchive.length === 0) {
    return {
      file: CONFIG.infrastructureCatalog.file,
      itemsArchived: 0,
      originalSize,
      newSize: originalSize,
    };
  }

  // Create archive
  const now = new Date();
  const archiveFileName = `infrastructure-changelog-archive-${now.toISOString().split('T')[0]}.json`;
  const archiveFilePath = path.join(ARCHIVE_DIR, archiveFileName);

  const archiveData: any = {
    archivedAt: now.toISOString(),
    source: CONFIG.infrastructureCatalog.file,
    changelogs: {},
  };

  // Move old changelogs to archive
  for (const key of keysToArchive) {
    archiveData.changelogs[key] = metadata[key];
  }

  if (!dryRun) {
    // Write archive
    fs.writeFileSync(archiveFilePath, JSON.stringify(archiveData, null, 2));

    // Remove archived keys from original
    for (const key of keysToArchive) {
      delete metadata[key];
    }

    // Add archive reference
    metadata.changelogArchive = {
      lastArchived: now.toISOString(),
      archivedVersions: keysToArchive.length,
      archiveLocation: `archive/${archiveFileName}`,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  const newSize = dryRun ? originalSize : getFileSizeKB(filePath);

  return {
    file: CONFIG.infrastructureCatalog.file,
    itemsArchived: keysToArchive.length,
    originalSize,
    newSize,
    archiveFile: archiveFileName,
  };
}

/**
 * List existing archives
 */
function listArchives(): void {
  console.log('\n📦 Existing Archives:');

  if (!fs.existsSync(ARCHIVE_DIR)) {
    console.log('   No archives yet');
    return;
  }

  const files = fs.readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('   No archives yet');
    return;
  }

  for (const file of files) {
    const filePath = path.join(ARCHIVE_DIR, file);
    const size = getFileSizeKB(filePath);
    console.log(`   - ${file} (${size}KB)`);
  }
}

/**
 * Main archive function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(
    '╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║           MCP DATA ARCHIVAL - ENTERPRISE                        ║'
  );
  console.log(
    '║     Managing data lifecycle for optimal performance             ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝'
  );

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  ensureArchiveDir();

  const results: ArchiveResult[] = [];

  // Archive current-truth nodes
  console.log('\n📄 Processing current-truth.json...');
  console.log(
    `   Retention: ${CONFIG.currentTruth.retentionDays} days, max ${CONFIG.currentTruth.maxNodes} nodes`
  );
  const truthResult = archiveCurrentTruth(dryRun);
  results.push(truthResult);

  if (truthResult.itemsArchived > 0) {
    console.log(`   ✅ Archived ${truthResult.itemsArchived} nodes`);
    console.log(
      `   📉 Size: ${truthResult.originalSize}KB → ${truthResult.newSize}KB`
    );
    if (truthResult.archiveFile) {
      console.log(`   📦 Archive: ${truthResult.archiveFile}`);
    }
  } else {
    console.log(`   ℹ️  No nodes to archive (${truthResult.originalSize}KB)`);
  }

  // Archive infrastructure changelog
  console.log('\n📄 Processing infrastructure-catalog.json...');
  console.log(
    `   Keeping last ${CONFIG.infrastructureCatalog.maxChangelogVersions} version changelogs`
  );
  const infraResult = archiveInfrastructureCatalog(dryRun);
  results.push(infraResult);

  if (infraResult.itemsArchived > 0) {
    console.log(
      `   ✅ Archived ${infraResult.itemsArchived} changelog versions`
    );
    console.log(
      `   📉 Size: ${infraResult.originalSize}KB → ${infraResult.newSize}KB`
    );
    if (infraResult.archiveFile) {
      console.log(`   📦 Archive: ${infraResult.archiveFile}`);
    }
  } else {
    console.log(
      `   ℹ️  No changelogs to archive (${infraResult.originalSize}KB)`
    );
  }

  // List archives
  listArchives();

  // Summary
  console.log('\n' + '═'.repeat(68));
  console.log('📊 ARCHIVE SUMMARY');
  console.log('═'.repeat(68));

  const totalArchived = results.reduce((sum, r) => sum + r.itemsArchived, 0);
  const totalSaved = results.reduce(
    (sum, r) => sum + (r.originalSize - r.newSize),
    0
  );

  console.log(`\n   Items archived: ${totalArchived}`);
  console.log(`   Space saved: ${totalSaved}KB`);

  if (dryRun && totalArchived > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

main().catch((err) => {
  console.error('❌ Archive failed:', err.message);
  process.exit(1);
});
