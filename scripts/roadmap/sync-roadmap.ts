#!/usr/bin/env tsx
/**
 * Roadmap Sync CLI
 *
 * Bidirectional sync between GitHub Projects and roadmap-platform.json
 *
 * Project: luhtech/projects/3 (Ectropy Technical Roadmap)
 *
 * Usage:
 *   pnpm roadmap:sync:pull    # GitHub Projects → roadmap.json
 *   pnpm roadmap:sync:push    # roadmap.json → GitHub Projects
 *   pnpm roadmap:sync:status  # Show sync status and item counts
 */

import { GitHubProjectsSync } from '../../apps/mcp-server/src/services/github-projects-sync.js';

const command = process.argv[2];

async function main() {
  console.log('═'.repeat(60));
  console.log('  Ectropy Roadmap Sync');
  console.log('  GitHub Projects ↔ roadmap-platform.json');
  console.log('═'.repeat(60));
  console.log('');

  try {
    const sync = new GitHubProjectsSync();

    switch (command) {
      case 'pull': {
        console.log('📥 PULL: GitHub Projects → Local JSON\n');
        const result = await sync.syncToLocal();

        console.log('\n' + '─'.repeat(60));
        if (result.success) {
          console.log(`✅ ${result.message}`);
          console.log(`📊 Changes applied: ${result.changes}`);
        } else {
          console.error(`❌ Sync failed: ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'push': {
        console.log('📤 PUSH: Local JSON → GitHub Projects\n');
        const result = await sync.syncToGitHub();

        console.log('\n' + '─'.repeat(60));
        if (result.success) {
          console.log(`✅ ${result.message}`);
          console.log(`📊 Updated: ${result.updates || 0}`);
          console.log(`📊 Created: ${result.created || 0}`);

          if (result.errors.length > 0) {
            console.log(`\n⚠️  Errors (${result.errors.length}):`);
            result.errors.forEach((err) => {
              console.log(`   - ${err.deliverableId}: ${err.error}`);
            });
          }
        } else {
          console.error(`❌ Sync failed: ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'status': {
        console.log('📊 SYNC STATUS\n');
        const status = await sync.getSyncStatus();

        console.log(`Source:        ${status.source}`);
        console.log(`Sync Mode:     ${status.syncMode}`);
        console.log(`Schedule:      ${status.nextScheduledSync}`);
        console.log(`Last Updated:  ${status.lastUpdated ? status.lastUpdated.toISOString() : 'Never'}`);
        console.log('');
        console.log(`Local Items:   ${status.localItems}`);
        console.log(`GitHub Items:  ${status.githubItems}`);

        if (status.localItems !== status.githubItems) {
          console.log(`\n⚠️  Item count mismatch - run pull or push to sync`);
        } else {
          console.log(`\n✅ Item counts match`);
        }
        break;
      }

      default: {
        console.log('Usage:\n');
        console.log('  pnpm roadmap:sync:pull     Pull from GitHub to local JSON');
        console.log('  pnpm roadmap:sync:push     Push from local JSON to GitHub');
        console.log('  pnpm roadmap:sync:status   Show sync status\n');
        console.log('Examples:\n');
        console.log('  # Update local roadmap with latest from GitHub');
        console.log('  pnpm roadmap:sync:pull\n');
        console.log('  # Push local changes (new deliverables, status updates) to GitHub');
        console.log('  pnpm roadmap:sync:push\n');
        process.exit(1);
      }
    }

    console.log('\n' + '═'.repeat(60));
  } catch (error) {
    console.error(
      '\n❌ Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
