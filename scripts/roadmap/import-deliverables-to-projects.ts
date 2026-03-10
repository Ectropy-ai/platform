#!/usr/bin/env tsx
/**
 * Import Deliverables to Phase-Specific GitHub Projects
 *
 * Comprehensive bulk import of all Phase 5a, 5b, and 6 deliverables from roadmap.json
 * to GitHub Projects with complete field preservation and evidence linking.
 *
 * Features:
 * - Creates Phase 6 project if needed
 * - Extracts all deliverable fields from roadmap.json
 * - Creates GitHub issues with rich descriptions
 * - Links evidence files in issue bodies
 * - Adds issues to appropriate phase projects
 * - Dry-run mode for testing
 * - Detailed progress reporting
 *
 * Usage:
 *   pnpm roadmap:import           # Dry run (preview only)
 *   pnpm roadmap:import --execute # Actually create issues and add to projects
 */

import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

interface Deliverable {
  id: string;
  name: string;
  description: string;
  status: 'complete' | 'in-progress' | 'not-started' | 'blocked';
  startDate?: string;
  endDate?: string;
  priority?: string;
  dependencies?: string[];
  filesImpacted?: string[];
  evidence?: string[];
}

interface Phase {
  id: string;
  name: string;
  description: string;
  status: string;
  deliverables: Deliverable[];
}

interface Roadmap {
  version: string;
  lastUpdated: string;
  currentPhase: string;
  phases: Phase[];
}

interface ImportStats {
  totalDeliverables: number;
  issuesCreated: number;
  issuesSkipped: number;
  projectItemsAdded: number;
  errors: Array<{ deliverableId: string; error: string }>;
}

// ============================================================================
// Configuration
// ============================================================================

const DRY_RUN = !process.argv.includes('--execute');
const REPO_OWNER = 'luhtech';
const REPO_NAME = 'Ectropy';
const ORG_NAME = 'Ectropy-ai';

// Project mapping (will be populated dynamically)
const PROJECT_MAPPING: Record<string, number> = {};

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

const octokit = new Octokit({ auth: token });

// ============================================================================
// GitHub API Functions
// ============================================================================

/**
 * List all organization projects and build phase mapping
 */
async function listOrganizationProjects(): Promise<void> {
  console.log('📋 Fetching organization projects...\n');

  const { data } = await octokit.rest.projects.listForOrg({
    org: ORG_NAME,
    per_page: 100,
  });

  for (const project of data) {
    console.log(`   Found: ${project.name} (Project #${project.number})`);

    // Map phase IDs to project numbers
    if (project.name.includes('Phase-5a')) {
      PROJECT_MAPPING['phase-5a'] = project.number;
    } else if (project.name.includes('Phase-5b')) {
      PROJECT_MAPPING['phase-5b'] = project.number;
    } else if (project.name.includes('Phase-6')) {
      PROJECT_MAPPING['phase-6'] = project.number;
    }
  }

  console.log('');
}

/**
 * Create Phase 6 project if it doesn't exist
 */
async function ensurePhase6Project(): Promise<void> {
  if (PROJECT_MAPPING['phase-6']) {
    console.log('✅ Phase 6 project already exists\n');
    return;
  }

  console.log('🔨 Creating Phase 6 project...');

  if (DRY_RUN) {
    console.log('   [DRY RUN] Would create: Ectropy-Phase-6\n');
    PROJECT_MAPPING['phase-6'] = 999; // Dummy for dry run
    return;
  }

  const { data } = await octokit.rest.projects.createForOrg({
    org: ORG_NAME,
    name: 'Ectropy-Phase-6',
    body: 'Phase 6 deliverables - Automated import from roadmap.json',
  });

  PROJECT_MAPPING['phase-6'] = data.number;
  console.log(`   ✅ Created Project #${data.number}\n`);
}

/**
 * Create a GitHub issue with rich description
 */
async function createIssue(
  deliverable: Deliverable,
  phaseId: string
): Promise<number | null> {
  const title = `[${deliverable.id}] ${deliverable.name}`;

  // Build rich issue body with all fields
  const body = buildIssueBody(deliverable);

  // Build labels array
  const labels = [
    deliverable.id, // e.g., "p5a-d1"
    `status:${deliverable.status}`,
    phaseId, // e.g., "phase-5a"
  ];

  if (deliverable.priority) {
    labels.push(`priority:${deliverable.priority}`);
  }

  console.log(`   Creating issue: ${title}`);

  if (DRY_RUN) {
    console.log(`      [DRY RUN] Would create with ${labels.length} labels`);
    console.log(`      Body preview: ${body.substring(0, 100)}...`);
    return null;
  }

  try {
    const { data } = await octokit.rest.issues.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title,
      body,
      labels,
    });

    console.log(`      ✅ Created issue #${data.number}`);
    return data.number;
  } catch (error: any) {
    console.error(`      ❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Build formatted issue body with all deliverable fields
 */
function buildIssueBody(deliverable: Deliverable): string {
  let body = `## ${deliverable.name}\n\n`;

  // Description
  if (deliverable.description) {
    body += `${deliverable.description}\n\n`;
  }

  // Status badge
  const statusEmoji =
    {
      complete: '✅',
      'in-progress': '🔄',
      'not-started': '⏸️',
      blocked: '🚫',
    }[deliverable.status] || '❓';

  body += `**Status:** ${statusEmoji} ${deliverable.status}\n\n`;

  // Timeline
  if (deliverable.startDate || deliverable.endDate) {
    body += `### Timeline\n\n`;
    if (deliverable.startDate) {
      body += `- **Start Date:** ${deliverable.startDate}\n`;
    }
    if (deliverable.endDate) {
      body += `- **End Date:** ${deliverable.endDate}\n`;
    }
    body += `\n`;
  }

  // Dependencies
  if (deliverable.dependencies && deliverable.dependencies.length > 0) {
    body += `### Dependencies\n\n`;
    for (const dep of deliverable.dependencies) {
      body += `- ${dep}\n`;
    }
    body += `\n`;
  }

  // Files Impacted
  if (deliverable.filesImpacted && deliverable.filesImpacted.length > 0) {
    body += `### Files Impacted\n\n`;
    for (const file of deliverable.filesImpacted) {
      body += `- \`${file}\`\n`;
    }
    body += `\n`;
  }

  // Evidence (critical for linking to proof of completion)
  if (deliverable.evidence && deliverable.evidence.length > 0) {
    body += `### Evidence\n\n`;
    body += `> **Note:** These evidence items link this deliverable to concrete artifacts, logs, and documentation.\n\n`;
    for (const evidenceItem of deliverable.evidence) {
      // Check if evidence looks like a file path
      if (evidenceItem.includes('/') || evidenceItem.includes('\\')) {
        body += `- 📄 \`${evidenceItem}\`\n`;
      } else {
        body += `- ✓ ${evidenceItem}\n`;
      }
    }
    body += `\n`;
  }

  // Footer
  body += `---\n\n`;
  body += `*Imported from roadmap.json by automated script*\n`;
  body += `*Deliverable ID: \`${deliverable.id}\`*\n`;

  return body;
}

/**
 * Add issue to GitHub Project
 */
async function addIssueToProject(
  issueNumber: number,
  projectNumber: number,
  deliverableId: string
): Promise<boolean> {
  console.log(`   Adding #${issueNumber} to Project #${projectNumber}`);

  if (DRY_RUN) {
    console.log(`      [DRY RUN] Would add to project`);
    return true;
  }

  try {
    // Use gh CLI approach since it's more reliable than GraphQL for Projects V2
    const { execSync } = await import('child_process');

    const command = `gh project item-add ${projectNumber} --owner ${ORG_NAME} --url https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`;

    execSync(command, { stdio: 'pipe' });

    console.log(`      ✅ Added to project`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log(`      ⚠️  Already in project`);
      return true;
    }
    console.error(`      ❌ Failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// Main Import Logic
// ============================================================================

/**
 * Load roadmap.json
 */
function loadRoadmap(): Roadmap {
  const roadmapPath = join(process.cwd(), 'apps/mcp-server/data/roadmap.json');
  const content = readFileSync(roadmapPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Extract deliverables for phases 5a, 5b, and 6
 */
function extractTargetDeliverables(
  roadmap: Roadmap
): Map<string, Deliverable[]> {
  const deliverablesByPhase = new Map<string, Deliverable[]>();

  for (const phase of roadmap.phases) {
    if (['phase-5a', 'phase-5b', 'phase-6'].includes(phase.id)) {
      deliverablesByPhase.set(phase.id, phase.deliverables || []);
    }
  }

  return deliverablesByPhase;
}

/**
 * Main import workflow
 */
async function importDeliverables(): Promise<void> {
  console.log('🚀 Starting deliverables import to GitHub Projects\n');

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
    console.log(
      '   Use --execute flag to actually create issues and add to projects\n'
    );
  }

  const stats: ImportStats = {
    totalDeliverables: 0,
    issuesCreated: 0,
    issuesSkipped: 0,
    projectItemsAdded: 0,
    errors: [],
  };

  // Step 1: Load roadmap
  console.log('📥 Loading roadmap.json...\n');
  const roadmap = loadRoadmap();
  const deliverablesByPhase = extractTargetDeliverables(roadmap);

  // Count total
  for (const deliverables of deliverablesByPhase.values()) {
    stats.totalDeliverables += deliverables.length;
  }

  console.log(
    `Found ${stats.totalDeliverables} deliverables across 3 phases:\n`
  );
  for (const [phaseId, deliverables] of deliverablesByPhase.entries()) {
    console.log(`   ${phaseId}: ${deliverables.length} deliverables`);
  }
  console.log('');

  // Step 2: List existing projects
  await listOrganizationProjects();

  // Step 3: Ensure Phase 6 project exists
  await ensurePhase6Project();

  // Step 4: Process each phase
  for (const [phaseId, deliverables] of deliverablesByPhase.entries()) {
    const projectNumber = PROJECT_MAPPING[phaseId];

    if (!projectNumber) {
      console.error(`❌ No project found for ${phaseId}\n`);
      continue;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(
      `📦 Processing ${phaseId.toUpperCase()} (Project #${projectNumber})`
    );
    console.log(`${'='.repeat(80)}\n`);

    for (const deliverable of deliverables) {
      console.log(`\n🔹 Deliverable: ${deliverable.id} - ${deliverable.name}`);

      // Create issue
      const issueNumber = await createIssue(deliverable, phaseId);

      if (issueNumber === null) {
        if (!DRY_RUN) {
          stats.issuesSkipped++;
          stats.errors.push({
            deliverableId: deliverable.id,
            error: 'Failed to create issue',
          });
        }
        continue;
      }

      if (!DRY_RUN) {
        stats.issuesCreated++;
      }

      // Add to project
      if (issueNumber && projectNumber) {
        const added = await addIssueToProject(
          issueNumber,
          projectNumber,
          deliverable.id
        );
        if (added && !DRY_RUN) {
          stats.projectItemsAdded++;
        }
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Step 5: Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 IMPORT SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN - No actual changes made\n');
    console.log(`Total deliverables to import: ${stats.totalDeliverables}`);
    console.log('\nTo execute the import, run:');
    console.log('   pnpm roadmap:import --execute\n');
  } else {
    console.log(`Total deliverables: ${stats.totalDeliverables}`);
    console.log(`Issues created: ${stats.issuesCreated}`);
    console.log(`Issues skipped: ${stats.issuesSkipped}`);
    console.log(`Project items added: ${stats.projectItemsAdded}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errors (${stats.errors.length}):`);
      for (const error of stats.errors) {
        console.log(`   - ${error.deliverableId}: ${error.error}`);
      }
    }

    console.log('\n✅ Import complete!');
    console.log('\n📌 Next Steps:');
    console.log(
      `   - View Phase 5a: https://github.com/orgs/${ORG_NAME}/projects/${PROJECT_MAPPING['phase-5a']}`
    );
    console.log(
      `   - View Phase 5b: https://github.com/orgs/${ORG_NAME}/projects/${PROJECT_MAPPING['phase-5b']}`
    );
    console.log(
      `   - View Phase 6: https://github.com/orgs/${ORG_NAME}/projects/${PROJECT_MAPPING['phase-6']}`
    );
  }

  console.log('');
}

// ============================================================================
// Entry Point
// ============================================================================

importDeliverables().catch((error) => {
  console.error('\n❌ Import failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
