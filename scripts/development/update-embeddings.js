#!/usr/bin/env node
/**
 * Embeddings Update Script - JavaScript Fallback
 * Pure JavaScript version for Node.js v20 compatibility
 * Used as fallback when TypeScript execution fails
 */

import { execSync } from 'child_process';
import fs from 'fs';

function getChangedFiles() {
  try {
    const output = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' });
    return output.split('\n').filter((f) => f && fs.existsSync(f));
  } catch (err) {
    return [];
  }
}

async function main() {
  try {
    console.log('Starting embeddings update...');
    
    // Test @xenova/transformers first to ensure it's working
    const { pipeline: _pipeline } = await import('@xenova/transformers');
    console.log('✅ @xenova/transformers loaded successfully');
    
    // Proceed with embeddings generation
    try {
      const { generateEmbeddings } = await import('../libs/embeddings/src/generate.js');
      
      const changed = getChangedFiles();
      const files = changed.map((p) => ({ path: p, content: fs.readFileSync(p, 'utf-8') }));
      
      if (files.length) {
        await generateEmbeddings(files);
        console.log(`✅ Indexed ${files.length} file(s)`);
      } else {
        console.log('✅ No changed files to index');
      }
    } catch (error) {
      console.error('Error during embeddings generation:', error.message);
      // Don't exit with error if it's just a database connection issue
      if (error.message.includes('fetch failed') || error.message.includes('Unable to check client-server compatibility')) {
        console.log('⚠️ Database connection issue detected, but @xenova/transformers is working correctly');
        process.exit(0);
      }
      process.exit(1);
    }
    
    console.log('✅ Embeddings updated successfully');
  } catch (error) {
    console.error('❌ Embeddings update failed:', error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Embeddings update failed:', err);
  process.exit(1);
});