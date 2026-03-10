#!/usr/bin/env tsx
/**
 * Migrate Deliverables to Phase-Specific Projects
 *
 * Migrates deliverables from master roadmap to phase-specific org projects:
 * - Phase 5a deliverables → Ectropy-Phase-5a (PVT_kwDOC9LeL84BH9E4)
 * - Phase 5b deliverables → Ectropy-Phase-5b (PVT_kwDOC9LeL84BH9FS)
 */

import { graphql } from '@octokit/graphql';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ProjectItem {
  id: string;
  content?: {
    number?: number;
    title?: string;
    url?: string;
  };
  deliverableId?: string;
}

const token = process.env.GITHUB_PROJECT_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.error(
    '❌ GITHUB_PROJECT_TOKEN or GITHUB_TOKEN environment variable required'
  );
  process.exit(1);
}

const graphqlClient = graphql.defaults({
  headers: {
    authorization: `token ${token}`,
  },
});

// Project IDs
const MASTER_PROJECT_ID = 'PVT_kwHOBUNY6s4BHKeg'; // User project
const PHASE_5A_PROJECT_ID = 'PVT_kwDOC9LeL84BH9E4'; // Org project
const PHASE_5B_PROJECT_ID = 'PVT_kwDOC9LeL84BH9FS'; // Org project
const ORG_NAME = 'Ectropy-ai';

/**
 * Fetch all items from master roadmap project
 */
async function fetchMasterProjectItems(): Promise<ProjectItem[]> {
  console.log('📥 Fetching items from master roadmap project...\n');

  const query = `
    query($projectId: ID!, $cursor: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          title
          items(first: 100, after: $cursor) {
            nodes {
              id
              content {
                ... on Issue {
                  number
                  title
                  url
                  labels(first: 20) {
                    nodes {
                      name
                    }
                  }
                }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `;

  let allItems: ProjectItem[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result: any = await graphqlClient(query, {
      projectId: MASTER_PROJECT_ID,
      cursor,
    });

    const items = result.node.items.nodes;
    const pageInfo = result.node.items.pageInfo;

    // Extract deliverable IDs from labels or title
    for (const item of items) {
      if (!item.content) continue;

      const labels = item.content.labels?.nodes || [];
      const deliverableLabel = labels.find((l: any) =>
        l.name.match(/^p\d+[a-z]?-d\d+$/)
      );

      if (deliverableLabel) {
        allItems.push({
          id: item.id,
          content: item.content,
          deliverableId: deliverableLabel.name,
        });
      } else {
        // Try to extract from title (e.g., "[p5a-d12] Title")
        const match = item.content.title.match(/\[(p\d+[a-z]?-d\d+)\]/);
        if (match) {
          allItems.push({
            id: item.id,
            content: item.content,
            deliverableId: match[1],
          });
        }
      }
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return allItems;
}

/**
 * Add issue to project
 */
async function addItemToProject(
  projectId: string,
  issueNumber: number
): Promise<string | null> {
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId
        contentId: $contentId
      }) {
        item {
          id
        }
      }
    }
  `;

  try {
    // Get issue node ID
    const issueQuery = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            id
          }
        }
      }
    `;

    const issueResult: any = await graphqlClient(issueQuery, {
      owner: 'luhtech',
      repo: 'Ectropy',
      number: issueNumber,
    });

    const contentId = issueResult.repository.issue.id;

    // Add to project
    const result: any = await graphqlClient(mutation, {
      projectId,
      contentId,
    });

    return result.addProjectV2ItemById.item.id;
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log(`   ⚠️  Issue #${issueNumber} already in project`);
      return null;
    }
    throw error;
  }
}

/**
 * Migrate deliverables to phase projects
 */
async function migrateToPhaseProjects() {
  console.log('🚀 Starting deliverable migration to phase projects\n');

  // Fetch items from master project
  const items = await fetchMasterProjectItems();

  console.log(`Found ${items.length} deliverable-tagged items\n`);

  // Group by phase
  const phase5aItems = items.filter((item) =>
    item.deliverableId?.startsWith('p5a-')
  );
  const phase5bItems = items.filter((item) =>
    item.deliverableId?.startsWith('p5b-')
  );

  console.log(`📊 Phase 5a: ${phase5aItems.length} items`);
  console.log(`📊 Phase 5b: ${phase5bItems.length} items\n`);

  // Migrate Phase 5a
  if (phase5aItems.length > 0) {
    console.log('🔄 Migrating Phase 5a deliverables...');
    let successCount = 0;
    let skipCount = 0;

    for (const item of phase5aItems) {
      if (!item.content?.number) continue;

      try {
        const result = await addItemToProject(
          PHASE_5A_PROJECT_ID,
          item.content.number
        );

        if (result) {
          console.log(
            `   ✅ ${item.deliverableId} - Issue #${item.content.number}: ${item.content.title}`
          );
          successCount++;
        } else {
          skipCount++;
        }
      } catch (error: any) {
        console.error(
          `   ❌ Failed to add #${item.content.number}: ${error.message}`
        );
      }
    }

    console.log(`\n✅ Phase 5a: ${successCount} added, ${skipCount} skipped\n`);
  }

  // Migrate Phase 5b
  if (phase5bItems.length > 0) {
    console.log('🔄 Migrating Phase 5b deliverables...');
    let successCount = 0;
    let skipCount = 0;

    for (const item of phase5bItems) {
      if (!item.content?.number) continue;

      try {
        const result = await addItemToProject(
          PHASE_5B_PROJECT_ID,
          item.content.number
        );

        if (result) {
          console.log(
            `   ✅ ${item.deliverableId} - Issue #${item.content.number}: ${item.content.title}`
          );
          successCount++;
        } else {
          skipCount++;
        }
      } catch (error: any) {
        console.error(
          `   ❌ Failed to add #${item.content.number}: ${error.message}`
        );
      }
    }

    console.log(`\n✅ Phase 5b: ${successCount} added, ${skipCount} skipped\n`);
  }

  console.log('✅ Migration complete!');
  console.log('\n📌 Next Steps:');
  console.log(
    `   - View Phase 5a: https://github.com/orgs/${ORG_NAME}/projects/1`
  );
  console.log(
    `   - View Phase 5b: https://github.com/orgs/${ORG_NAME}/projects/2`
  );
  console.log(`   - Update GITHUB_PROJECT_ID in .env to use phase projects`);
}

// Run migration
migrateToPhaseProjects().catch((error) => {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
});
