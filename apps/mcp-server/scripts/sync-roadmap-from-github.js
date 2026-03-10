#!/usr/bin/env node

/**
 * Sync Roadmap from GitHub Projects
 * 
 * This script fetches the roadmap from GitHub Projects and updates
 * the local roadmap.json file.
 * 
 * Environment Variables Required:
 * - GITHUB_PROJECT_TOKEN or GITHUB_TOKEN: GitHub personal access token
 * - GITHUB_PROJECT_ID: The GitHub Project V2 ID
 * 
 * Usage:
 *   node sync-roadmap-from-github.js
 */

import { GitHubProjectsSync } from '../src/services/github-projects-sync.js';

async function main() {
  console.log('🚀 GitHub Projects → roadmap.json Sync');
  console.log('========================================\n');

  try {
    // Validate environment variables
    const token = process.env.GITHUB_PROJECT_TOKEN || process.env.GITHUB_TOKEN;
    const projectId = process.env.GITHUB_PROJECT_ID;

    if (!token) {
      console.error('❌ Error: GITHUB_PROJECT_TOKEN or GITHUB_TOKEN environment variable is required');
      console.error('   Set it with: export GITHUB_PROJECT_TOKEN=your_token_here');
      process.exit(1);
    }

    if (!projectId) {
      console.error('❌ Error: GITHUB_PROJECT_ID environment variable is required');
      console.error('   Set it with: export GITHUB_PROJECT_ID=your_project_id_here');
      process.exit(1);
    }

    console.log('📋 Configuration:');
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Token: ${token.substring(0, 8)}...`);
    console.log('');

    // Initialize sync service
    const syncService = new GitHubProjectsSync();

    // Perform sync
    const result = await syncService.syncToLocal();

    if (result.success) {
      console.log('\n✅ Sync completed successfully!');
      console.log(`   ${result.message}`);
      console.log(`   Changes detected: ${result.changes}`);
      process.exit(0);
    } else {
      console.error('\n❌ Sync failed!');
      console.error(`   ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during sync:');
    console.error(error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run main function
main();
