#!/usr/bin/env node

/**
 * Retention Policy Enforcement Script
 *
 * Automatically enforces retention policies defined in the JSON schema.
 * Moves expired nodes to quarterly archives and maintains audit trail.
 *
 * Usage:
 *   node scripts/governance/enforce-retention.js [--dry-run]
 *
 * Features:
 *   - Policy-driven retention enforcement
 *   - Quarterly archive organization
 *   - Exception handling (critical tag, knowledge nodes)
 *   - Complete audit trail logging
 *   - Index rebuilding after archiving
 *   - Dry-run mode for testing
 *
 * Exit codes:
 *   0 - Success (or no violations found)
 *   1 - Error occurred
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const REPO_ROOT = path.resolve(__dirname, '../..');
const JSON_PATH = path.join(
  REPO_ROOT,
  'apps/mcp-server/data/current-truth.json'
);
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'docs/schemas/current-truth-schema.json'
);
const AUDIT_LOG_PATH = path.join(
  REPO_ROOT,
  'evidence/governance/retention-audit.json'
);
const ARCHIVE_DIR = path.join(REPO_ROOT, 'docs/archive/quarterly');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

/**
 * Format output message
 */
function log(icon, message, color = colors.reset) {
  console.log(`${color}${icon} ${message}${colors.reset}`);
}

/**
 * Load JSON file with error handling
 */
function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(
      '❌',
      `Failed to load ${path.basename(filePath)}: ${error.message}`,
      colors.red
    );
    return null;
  }
}

/**
 * Calculate days since timestamp
 */
function daysSince(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

/**
 * Get quarter from date
 */
function getQuarter(date) {
  const month = date.getMonth();
  return Math.floor(month / 3) + 1;
}

/**
 * Check if node should be retained indefinitely
 */
function isKnowledgeNode(node) {
  const knowledgeTypes = ['pattern', 'decision', 'policy'];
  return knowledgeTypes.includes(node.nodeType);
}

/**
 * Check if node has critical tag
 */
function hasCriticalTag(node) {
  const tags = node.metadata.tags || [];
  return tags.includes('critical');
}

/**
 * Check if node violates retention policy
 */
function checkRetention(node, policies) {
  // Knowledge nodes are retained indefinitely
  if (isKnowledgeNode(node)) {
    return {
      violates: false,
      reason: 'Knowledge node - retained indefinitely until superseded',
      ruleId: 'rule-retention-002',
    };
  }

  const age = daysSince(node.timestamp);
  const defaultRetention = policies.retention.defaultDays;
  const extendedRetention = policies.retention.extendedDays;

  // Check for critical tag exception
  if (hasCriticalTag(node)) {
    if (age > extendedRetention) {
      return {
        violates: true,
        reason: `Exceeds extended retention (${age} days > ${extendedRetention} days)`,
        action: 'archive',
        ruleId: 'rule-retention-001-critical',
      };
    }
    return {
      violates: false,
      reason: `Critical tag - extended retention (${age}/${extendedRetention} days)`,
      ruleId: 'rule-retention-001-critical',
    };
  }

  // Check operational nodes (investigation, deployment, refactor, etc.)
  const operationalTypes = [
    'investigation',
    'deployment',
    'refactor',
    'deliverable',
    'infrastructure',
    'platform',
    'integration',
    'data',
    'workflow',
    'configuration',
    'requirement',
    'monitoring',
    'incident',
  ];

  if (operationalTypes.includes(node.nodeType) && age > defaultRetention) {
    return {
      violates: true,
      reason: `Exceeds default retention (${age} days > ${defaultRetention} days)`,
      action: 'archive',
      ruleId: 'rule-retention-001',
    };
  }

  return {
    violates: false,
    reason: `Within retention period (${age}/${defaultRetention} days)`,
    ruleId: 'rule-retention-001',
  };
}

/**
 * Get or create quarterly archive file
 */
function getArchiveFile(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const quarter = getQuarter(date);
  const archiveFilename = `${year}-Q${quarter}.json`;
  const archivePath = path.join(ARCHIVE_DIR, archiveFilename);

  // Create archive if it doesn't exist
  if (!fs.existsSync(archivePath)) {
    const quarterStart = new Date(year, (quarter - 1) * 3, 1);
    const quarterEnd = new Date(year, quarter * 3, 0);

    const archive = {
      archiveId: `${year}-Q${quarter}`,
      quarter,
      year,
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      nodeCount: 0,
      nodes: [],
      metadata: {
        archivePolicy: '45-day retention for operational nodes',
        quarterDateRange: {
          start: quarterStart.toISOString().split('T')[0],
          end: quarterEnd.toISOString().split('T')[0],
        },
      },
    };

    fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
    log('📁', `Created new archive: ${archiveFilename}`, colors.blue);
  }

  return archivePath;
}

/**
 * Archive expired node
 */
function archiveNode(node) {
  const archivePath = getArchiveFile(node.timestamp);
  const archive = loadJSON(archivePath);

  if (!archive) {
    throw new Error(`Failed to load archive: ${archivePath}`);
  }

  // Add archival metadata to node
  const archivedNode = {
    ...node,
    archivedAt: new Date().toISOString(),
    archivedReason: `Retention policy (${daysSince(node.timestamp)} days old)`,
  };

  // Add to archive
  archive.nodes.push(archivedNode);
  archive.nodeCount = archive.nodes.length;
  archive.lastUpdated = new Date().toISOString();

  // Write updated archive
  fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));

  return {
    archivePath: path.relative(REPO_ROOT, archivePath),
    archiveId: archive.archiveId,
  };
}

/**
 * Log audit trail entry
 */
function logAuditTrail(entry) {
  let auditLog = [];

  // Load existing audit log
  if (fs.existsSync(AUDIT_LOG_PATH)) {
    try {
      auditLog = loadJSON(AUDIT_LOG_PATH) || [];
    } catch (error) {
      log('⚠️ ', `Failed to load audit log, creating new one`, colors.yellow);
    }
  }

  // Ensure audit log is an array
  if (!Array.isArray(auditLog)) {
    auditLog = [];
  }

  // Add new entry
  auditLog.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });

  // Write updated audit log
  try {
    // Ensure directory exists
    const auditDir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }

    fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(auditLog, null, 2));
  } catch (error) {
    log('❌', `Failed to write audit log: ${error.message}`, colors.red);
  }
}

/**
 * Rebuild indexes after archiving
 */
function rebuildIndexes(json) {
  const index = {
    byNodeType: {},
    byStatus: {},
    byTag: {},
    byPhase: {},
    byDate: {},
  };

  for (const node of json.nodes) {
    // Index by node type
    if (!index.byNodeType[node.nodeType]) {
      index.byNodeType[node.nodeType] = [];
    }
    index.byNodeType[node.nodeType].push(node.nodeId);

    // Index by status
    if (!index.byStatus[node.status]) {
      index.byStatus[node.status] = [];
    }
    index.byStatus[node.status].push(node.nodeId);

    // Index by tags
    const tags = node.metadata.tags || [];
    for (const tag of tags) {
      if (!index.byTag[tag]) {
        index.byTag[tag] = [];
      }
      index.byTag[tag].push(node.nodeId);
    }

    // Index by phase
    if (node.metadata.phase) {
      if (!index.byPhase[node.metadata.phase]) {
        index.byPhase[node.metadata.phase] = [];
      }
      index.byPhase[node.metadata.phase].push(node.nodeId);
    }

    // Index by date (YYYY-MM format)
    const date = new Date(node.timestamp);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!index.byDate[yearMonth]) {
      index.byDate[yearMonth] = [];
    }
    index.byDate[yearMonth].push(node.nodeId);
  }

  json.index = index;
  return json;
}

/**
 * Main enforcement function
 */
function enforceRetention(dryRun = false) {
  console.log(
    `${colors.bold}${colors.blue}Retention Policy Enforcement${colors.reset}\n`
  );

  if (dryRun) {
    log('ℹ️ ', 'DRY RUN MODE - No changes will be made', colors.yellow);
    console.log();
  }

  // Check if files exist
  if (!fs.existsSync(JSON_PATH)) {
    log('❌', `JSON file not found: ${JSON_PATH}`, colors.red);
    process.exit(1);
  }

  // Load data
  log('📂', 'Loading current-truth.json...', colors.blue);
  const json = loadJSON(JSON_PATH);

  if (!json) {
    process.exit(1);
  }

  log('✅', `Loaded ${json.nodes.length} nodes`, colors.green);

  const policies = json.policies;
  log(
    '📋',
    `Retention policy: ${policies.retention.defaultDays} days (default), ${policies.retention.extendedDays} days (critical)`,
    colors.blue
  );

  console.log();
  log('🔍', 'Checking retention compliance...', colors.blue);

  const violations = [];
  const archived = [];
  const retained = [];

  // Check each node
  for (const node of json.nodes) {
    const check = checkRetention(node, policies);

    if (check.violates) {
      violations.push({
        node,
        action: check.action,
        reason: check.reason,
        ruleId: check.ruleId,
        age: daysSince(node.timestamp),
      });
    } else {
      retained.push({
        nodeId: node.nodeId,
        reason: check.reason,
      });
    }
  }

  // Report findings
  console.log();
  if (violations.length === 0) {
    log('✅', 'No retention violations found', colors.green);
    log(
      '📊',
      `All ${json.nodes.length} nodes within retention policy`,
      colors.green
    );

    // Log audit entry even if no violations
    if (!dryRun) {
      logAuditTrail({
        action: 'retention-check',
        result: 'no-violations',
        nodesChecked: json.nodes.length,
        enforcedBy: 'automated-script',
      });
    }

    return;
  }

  log('⚠️ ', `Found ${violations.length} retention violations`, colors.yellow);
  console.log();

  // Process violations
  for (const violation of violations) {
    const node = violation.node;
    const age = violation.age;

    if (dryRun) {
      log(
        '📝',
        `Would archive: ${node.nodeId} (${age} days old)`,
        colors.yellow
      );
      console.log(`   Title: ${node.title}`);
      console.log(`   Type: ${node.nodeType}`);
      console.log(`   Reason: ${violation.reason}`);
      console.log();
    } else {
      try {
        // Archive the node
        const archiveResult = archiveNode(node);
        archived.push(node.nodeId);

        // Remove from main JSON
        const nodeIndex = json.nodes.findIndex((n) => n.nodeId === node.nodeId);
        json.nodes.splice(nodeIndex, 1);

        // Log audit trail
        logAuditTrail({
          action: 'archive',
          nodeId: node.nodeId,
          nodeTitle: node.title,
          nodeType: node.nodeType,
          age,
          archivePath: archiveResult.archivePath,
          archiveId: archiveResult.archiveId,
          ruleId: violation.ruleId,
          reason: violation.reason,
          result: 'success',
          enforcedBy: 'automated-script',
        });

        log(
          '✅',
          `Archived: ${node.nodeId} → ${archiveResult.archivePath}`,
          colors.green
        );
        console.log(`   ${node.title} (${age} days old)`);
        console.log();
      } catch (error) {
        log(
          '❌',
          `Failed to archive ${node.nodeId}: ${error.message}`,
          colors.red
        );

        // Log failure in audit trail
        logAuditTrail({
          action: 'archive',
          nodeId: node.nodeId,
          nodeTitle: node.title,
          result: 'failure',
          error: error.message,
          enforcedBy: 'automated-script',
        });
      }
    }
  }

  if (dryRun) {
    console.log();
    log(
      'ℹ️ ',
      `Dry run complete: ${violations.length} nodes would be archived`,
      colors.yellow
    );
    log('💡', 'Run without --dry-run to perform actual archiving', colors.blue);
    return;
  }

  if (archived.length > 0) {
    console.log();
    log('🔨', 'Rebuilding indexes...', colors.blue);
    rebuildIndexes(json);
    log('✅', 'Indexes rebuilt', colors.green);

    // Update lastUpdated timestamp
    json.lastUpdated = new Date().toISOString();

    // Write updated JSON
    log('💾', 'Saving updated current-truth.json...', colors.blue);
    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2));
    log('✅', 'Changes saved', colors.green);

    console.log();
    log(
      '✅',
      `Successfully archived ${archived.length} expired nodes`,
      colors.green
    );
    log('📊', `Active nodes: ${json.nodes.length}`, colors.blue);
    log(
      '📝',
      `Audit trail: ${path.relative(REPO_ROOT, AUDIT_LOG_PATH)}`,
      colors.blue
    );
  }
}

/**
 * CLI interface
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    enforceRetention(dryRun);
    console.log();
    log('✅', 'Retention enforcement complete', colors.green);
    process.exit(0);
  } catch (error) {
    console.log();
    log('❌', `Fatal error: ${error.message}`, colors.red);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run enforcement
main();
