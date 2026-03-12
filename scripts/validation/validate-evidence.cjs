#!/usr/bin/env node
'use strict';

/**
 * Evidence Schema Validator
 *
 * Validates evidence JSON files against the required schema.
 * Required fields: evidenceId, timestamp, phaseId, deliverableId,
 *                  evidenceType, status, summary
 *
 * Environment:
 *   EVIDENCE_VALIDATION_STRICT=true  → fail on any issue
 *   EVIDENCE_VALIDATION_STRICT=false → warn only, exit 0
 */

const fs = require('fs');
const path = require('path');

const STRICT = process.env.EVIDENCE_VALIDATION_STRICT === 'true';

const REQUIRED_FIELDS = [
  'evidenceId',
  'timestamp',
  'phaseId',
  'deliverableId',
  'evidenceType',
  'status',
  'summary',
];

const EVIDENCE_DIRS = [
  path.join(__dirname, '../../evidence'),
  path.join(__dirname, '../../apps/mcp-server/data/evidence'),
];

function scanDir(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'schema' || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      files.push(...scanDir(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(full);
    }
  }
  return files;
}

function validateFile(filePath) {
  const errors = [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    for (const field of REQUIRED_FIELDS) {
      if (!data[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  } catch (err) {
    errors.push(`Parse error: ${err.message}`);
  }
  return errors;
}

function main() {
  console.log('🔍 Evidence Schema Validator\n');

  let allFiles = [];
  for (const dir of EVIDENCE_DIRS) {
    const found = scanDir(dir);
    if (found.length > 0) {
      console.log(`  Found ${found.length} file(s) in ${path.relative(process.cwd(), dir)}`);
    }
    allFiles.push(...found);
  }

  if (allFiles.length === 0) {
    console.log('  No evidence files found — nothing to validate');
    console.log('✅ Evidence validation passed (no files)');
    process.exit(0);
  }

  let totalErrors = 0;
  let valid = 0;

  for (const file of allFiles) {
    const rel = path.relative(process.cwd(), file);
    const errors = validateFile(file);
    if (errors.length > 0) {
      totalErrors += errors.length;
      const prefix = STRICT ? '❌' : '⚠️ ';
      console.log(`  ${prefix} ${rel}`);
      errors.forEach(e => console.log(`      ${e}`));
    } else {
      valid++;
    }
  }

  console.log(`\n📊 Results: ${valid}/${allFiles.length} valid`);

  if (totalErrors > 0 && STRICT) {
    console.log(`❌ ${totalErrors} error(s) — strict mode, failing`);
    process.exit(1);
  }

  if (totalErrors > 0) {
    console.log(`⚠️  ${totalErrors} warning(s) — non-strict mode, passing`);
  }

  console.log('✅ Evidence validation passed');
  process.exit(0);
}

main();
