#!/usr/bin/env node
/**
 * Fix Encoding Script - Ectropy Platform
 * Removes UTF-8 BOM from JSON and other configuration files
 */

import fs from 'fs';

function removeBOM(filepath) {
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  File not found: ${filepath}`);
    return;
  }
  
  const content = fs.readFileSync(filepath);
  if (content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
    fs.writeFileSync(filepath, content.slice(3));
    console.log(`✅ Removed BOM from ${filepath}`);
    return true;
  }
  return false;
}

console.log('🔧 Fixing file encoding issues...\n');

const files = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  '.env',
  '.env.local',
  '.env.template',
  'nx.json',
  'jest.config.js',
  'eslint.config.js'
];

let fixedCount = 0;

files.forEach(file => {
  if (removeBOM(file)) {
    fixedCount++;
  }
});

if (fixedCount === 0) {
  console.log('✅ No BOM encoding issues found');
} else {
  console.log(`\n✅ Fixed ${fixedCount} files with BOM encoding issues`);
}

console.log('🎯 Encoding fix completed successfully');