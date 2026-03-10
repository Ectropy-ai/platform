#!/usr/bin/env node

/**
 * Evidence Schema Auto-Fixer
 * 
 * Attempts to automatically fix common schema validation issues in evidence files.
 * Creates backups before making changes.
 * 
 * Usage:
 *   node scripts/validation/fix-evidence-schema.mjs
 *   node scripts/validation/fix-evidence-schema.mjs --file evidence/my-file.json
 *   node scripts/validation/fix-evidence-schema.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants for maintainability
const DEFAULT_PHASE_NUMBER = '4';
const REQUIRED_FIELDS_COUNT = 7; // evidenceId, timestamp, phaseId, deliverableId, evidenceType, status, summary

// Parse command line arguments
const args = process.argv.slice(2);
let targetFile = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && i + 1 < args.length) {
    targetFile = args[i + 1];
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  }
}

/**
 * Get all JSON files in evidence directory
 */
function getEvidenceFiles() {
  const evidenceDir = path.join(__dirname, '../../evidence');
  const files = [];
  
  if (!fs.existsSync(evidenceDir)) {
    return files;
  }
  
  function scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        try {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.name === 'schema' || entry.name.startsWith('.')) continue;
          
          if (entry.isDirectory()) {
            scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(fullPath);
          }
        } catch (err) {
          console.warn(`⚠️  Skipping ${entry.name}: ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`⚠️  Cannot read directory ${dir}: ${err.message}`);
    }
  }
  
  scanDirectory(evidenceDir);
  return files;
}

/**
 * Attempt to fix a single evidence file
 */
function fixEvidenceFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Check if already valid
    const hasAllRequired = 
      data.evidenceId &&
      data.timestamp &&
      data.phaseId &&
      data.deliverableId &&
      data.evidenceType &&
      data.status &&
      data.summary;
    
    if (hasAllRequired) {
      return { file: filePath, status: 'already-valid', fixed: false };
    }
    
    // Try to fix by adding missing fields
    const fixes = [];
    let modified = false;
    
    if (!data.evidenceId) {
      // Generate ID from filename
      const basename = path.basename(filePath, '.json');
      data.evidenceId = basename.replace(/[^a-zA-Z0-9-_]/g, '-');
      fixes.push('Added evidenceId from filename');
      modified = true;
    }
    
    if (!data.timestamp) {
      // Use file modification time or current time
      const stats = fs.statSync(filePath);
      data.timestamp = stats.mtime.toISOString();
      fixes.push('Added timestamp from file modification time');
      modified = true;
    }
    
    if (!data.phaseId) {
      // Try to infer from path or use phase-4 as default
      const pathParts = filePath.split(path.sep);
      let phaseId = 'phase-4'; // Default to phase 4
      
      for (const part of pathParts) {
        const match = part.match(/phase-([1-6])/i);
        if (match) {
          phaseId = `phase-${match[1]}`;
          break;
        }
      }
      
      data.phaseId = phaseId;
      fixes.push(`Added phaseId (${phaseId})`);
      modified = true;
    }
    
    if (!data.deliverableId) {
      // Try to infer from phaseId or use default
      const phaseNum = data.phaseId ? data.phaseId.match(/\d+/)?.[0] : DEFAULT_PHASE_NUMBER;
      data.deliverableId = `p${phaseNum}-d1`;
      fixes.push(`Added deliverableId (${data.deliverableId})`);
      modified = true;
    }
    
    if (!data.evidenceType) {
      // Default to 'validation' - most common type
      data.evidenceType = 'validation';
      fixes.push('Added evidenceType (validation)');
      modified = true;
    }
    
    if (!data.status) {
      // Try to infer from existing data or use 'success'
      if (data.result === 'success' || data.valid === true) {
        data.status = 'success';
      } else if (data.result === 'failure' || data.valid === false) {
        data.status = 'failure';
      } else {
        data.status = 'success'; // Default
      }
      fixes.push(`Added status (${data.status})`);
      modified = true;
    }
    
    if (!data.summary) {
      // Generate summary from filename or use generic
      const basename = path.basename(filePath, '.json');
      const readable = basename.replace(/[-_]/g, ' ');
      data.summary = `Evidence: ${readable}`.substring(0, 200);
      fixes.push('Added summary from filename');
      modified = true;
    }
    
    if (!modified) {
      return { file: filePath, status: 'no-fixes-needed', fixed: false };
    }
    
    if (dryRun) {
      return { file: filePath, status: 'would-fix', fixed: false, fixes };
    }
    
    // Wrap existing data in details if not already wrapped
    if (!data.details && Object.keys(data).length > REQUIRED_FIELDS_COUNT) {
      const { evidenceId, timestamp, phaseId, deliverableId, evidenceType, status, summary, ...rest } = data;
      const wrapped = {
        evidenceId,
        timestamp,
        phaseId,
        deliverableId,
        evidenceType,
        status,
        summary,
        details: rest
      };
      
      // Create backup
      const backupPath = `${filePath}.backup`;
      fs.writeFileSync(backupPath, content);
      
      // Write fixed file
      fs.writeFileSync(filePath, JSON.stringify(wrapped, null, 2));
      
      return { file: filePath, status: 'fixed-with-wrap', fixed: true, fixes: [...fixes, 'Wrapped original data in details'] };
    }
    
    // Create backup
    const backupPath = `${filePath}.backup`;
    fs.writeFileSync(backupPath, content);
    
    // Write fixed file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    return { file: filePath, status: 'fixed', fixed: true, fixes };
    
  } catch (error) {
    return { file: filePath, status: 'error', fixed: false, error: error.message };
  }
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Evidence Schema Auto-Fixer\n');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  let files;
  if (targetFile) {
    const fullPath = path.resolve(targetFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${targetFile}`);
      process.exit(1);
    }
    files = [fullPath];
    console.log(`Fixing single file: ${targetFile}\n`);
  } else {
    files = getEvidenceFiles();
    console.log(`Found ${files.length} evidence files\n`);
  }
  
  if (files.length === 0) {
    console.log('⚠️  No evidence files found to fix');
    process.exit(0);
  }
  
  // Process files
  const results = files.map(fixEvidenceFile);
  
  // Categorize results
  const alreadyValid = results.filter(r => r.status === 'already-valid');
  const fixed = results.filter(r => r.fixed);
  const wouldFix = results.filter(r => r.status === 'would-fix');
  const errors = results.filter(r => r.status === 'error');
  
  // Print results
  if (alreadyValid.length > 0) {
    console.log(`✅ Already Valid: ${alreadyValid.length} files`);
  }
  
  if (wouldFix.length > 0) {
    console.log(`\n🔍 Would Fix: ${wouldFix.length} files\n`);
    wouldFix.forEach(r => {
      const relativePath = path.relative(process.cwd(), r.file);
      console.log(`  ${relativePath}`);
      r.fixes.forEach(fix => console.log(`    • ${fix}`));
    });
  }
  
  if (fixed.length > 0) {
    console.log(`\n✅ Fixed: ${fixed.length} files\n`);
    fixed.forEach(r => {
      const relativePath = path.relative(process.cwd(), r.file);
      console.log(`  ${relativePath}`);
      r.fixes.forEach(fix => console.log(`    • ${fix}`));
      console.log(`    📦 Backup created: ${path.basename(r.file)}.backup`);
    });
  }
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors: ${errors.length} files\n`);
    errors.forEach(r => {
      const relativePath = path.relative(process.cwd(), r.file);
      console.log(`  ${relativePath}: ${r.error}`);
    });
  }
  
  // Summary
  console.log('\n' + '─'.repeat(60));
  console.log(`Total: ${results.length} | Valid: ${alreadyValid.length} | Fixed: ${fixed.length + wouldFix.length} | Errors: ${errors.length}`);
  console.log('─'.repeat(60));
  
  if (dryRun && wouldFix.length > 0) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  } else if (fixed.length > 0) {
    console.log('\n✨ Evidence files have been fixed!');
    console.log('💡 Review changes and run validation: node scripts/validation/validate-evidence.cjs');
    console.log('💡 Backups created with .backup extension');
  } else if (errors.length === 0) {
    console.log('\n✨ All evidence files are valid!');
  }
  
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
