#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const issues = [];

// Check package.json files for Unix-specific patterns
function checkPackageJson(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const pkg = JSON.parse(content);
  
  if (pkg.scripts) {
    Object.entries(pkg.scripts).forEach(([name, script]) => {
      // Check for Unix-specific patterns
      if (script.includes('NODE_ENV=') && !script.includes('cross-env')) {
        issues.push({
          file: filepath,
          script: name,
          issue: 'Missing cross-env for NODE_ENV',
          fix: `"${name}": "cross-env ${script}"`
        });
      }
      
      if (script.includes('&&') && script.includes('NODE_ENV=')) {
        issues.push({
          file: filepath,
          script: name,
          issue: 'Unix-style environment setting',
          fix: 'Use cross-env instead'
        });
      }
      
      if (script.includes('rm -rf')) {
        issues.push({
          file: filepath,
          script: name,
          issue: 'Unix-specific rm command',
          fix: 'Use rimraf instead'
        });
      }
      
      if (script.includes('cp ') || script.includes('mv ')) {
        issues.push({
          file: filepath,
          script: name,
          issue: 'Unix-specific file commands',
          fix: 'Use node scripts or copyfiles package'
        });
      }
    });
  }
}

// Simple recursive function to find package.json files
function findPackageJsonFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...findPackageJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'package.json') {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Check all package.json files
const packageFiles = findPackageJsonFiles('.');

packageFiles.forEach(checkPackageJson);

// Report findings
if (issues.length === 0) {
  console.log('✅ No cross-platform issues found!');
} else {
  console.log(`❌ Found ${issues.length} cross-platform issues:\n`);
  issues.forEach(issue => {
    console.log(`File: ${issue.file}`);
    console.log(`  Script: ${issue.script}`);
    console.log(`  Issue: ${issue.issue}`);
    console.log(`  Fix: ${issue.fix}\n`);
  });
}

// Write report
fs.writeFileSync('platform-audit-report.json', JSON.stringify(issues, null, 2));
console.log('📋 Full report written to platform-audit-report.json');