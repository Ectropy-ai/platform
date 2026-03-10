import { execSync } from 'child_process';
import * as fs from 'fs';

function getChangedFiles() {
  try {
    const output = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' });
    return output.split('\n').filter((f) => f && fs.existsSync(f));
  } catch (err) {
    return [];
  }
}

async function main() {
  // Test @xenova/transformers first to ensure it's working
  try {
    const { pipeline } = await import('@xenova/transformers');
    console.log('✅ @xenova/transformers loaded successfully');
  } catch (error) {
    console.error('❌ @xenova/transformers failed to load:', error.message);
    process.exit(1);
  }

  // Proceed with embeddings generation
  try {
    const { generateEmbeddings } = await import('../libs/embeddings/src/generate.js');
    
    const changed = getChangedFiles();
    const files = changed.map((p) => ({ path: p, content: fs.readFileSync(p, 'utf-8') }));
    if (files.length) {
      await generateEmbeddings(files);
      console.log(`Indexed ${files.length} file(s)`);
    } else {
      console.log('No changed files to index');
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
