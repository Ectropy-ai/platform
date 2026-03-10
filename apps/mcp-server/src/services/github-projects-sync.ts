/**
 * GitHub Projects Bidirectional Sync Service
 *
 * Bidirectional sync between GitHub Projects V2 and roadmap-platform.json
 *
 * Features:
 * - Pull: GitHub Projects → roadmap.json
 * - Push: roadmap.json → GitHub Projects
 * - Update individual fields, statuses, evidence
 * - Add new deliverables
 * - Sync by Deliverable ID matching
 *
 * Project: luhtech/projects/3 (Ectropy Technical Roadmap)
 * Project ID: PVT_kwHOBUNY6s4BHKeg
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Roadmap, RoadmapPhase, Deliverable } from '../models/roadmap.js';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_ID = 'PVT_kwHOBUNY6s4BHKeg';
const PROJECT_OWNER = 'luhtech';
const PROJECT_NUMBER = 3;

// Field IDs from project schema
const FIELD_IDS = {
  title: 'PVTF_lAHOBUNY6s4BHKegzg3_3hU',
  status: 'PVTSSF_lAHOBUNY6s4BHKegzg3_3hc',
  phase: 'PVTSSF_lAHOBUNY6s4BHKegzg4ADOI',
  deliverableId: 'PVTF_lAHOBUNY6s4BHKegzg4ADTo',
  priority: 'PVTSSF_lAHOBUNY6s4BHKegzg4ADq8',
  targetDate: 'PVTF_lAHOBUNY6s4BHKegzg4ADs4',
  evidence: 'PVTF_lAHOBUNY6s4BHKegzg4ADx4',
  startDate: 'PVTF_lAHOBUNY6s4BHKegzg4JHGg',
  completedDate: 'PVTF_lAHOBUNY6s4BHKegzg4JHKs',
};

// Status option IDs - maps local statuses to GitHub Projects options
const STATUS_OPTIONS: Record<string, string> = {
  // Direct matches
  'not-started': 'f75ad846',
  'in-progress': '47fc9ee4',
  complete: '98236657',
  blocked: '99caca18',
  // Normalized variations
  completed: '98236657', // same as complete
  in_progress: '47fc9ee4', // underscore variant
  // Logical mappings (approved/pending/planned → not-started)
  approved: 'f75ad846',
  pending: 'f75ad846',
  planned: 'f75ad846',
};

// Phase option IDs
const PHASE_OPTIONS: Record<string, string> = {
  'phase-1': '63757a4a',
  'phase-2': '70f029ea',
  'phase-3': '511a6329',
  'phase-4': '1c79b8a1',
  'phase-5a': '08085ee8',
  'phase-5b': 'f1c58538',
  'phase-6': '7acc5f19',
};

// Priority option IDs
const PRIORITY_OPTIONS: Record<string, string> = {
  critical: '78b2ede5',
  high: '570d6249',
  medium: 'b45d5aee',
  low: '21f43a62',
};

// ============================================================================
// Types
// ============================================================================

interface GitHubProjectItem {
  id: string;
  deliverableId: string;
  title: string;
  status: string;
  phase: string;
  priority: string;
  evidence: string;
  targetDate?: string;
  startDate?: string;
  completedDate?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  changes: number;
  updates?: number;
  created?: number;
  errors: Array<{ deliverableId: string; error: string }>;
}

// ============================================================================
// GitHub Projects Sync Class
// ============================================================================

export class GitHubProjectsSync {
  private roadmapPath: string;

  constructor() {
    // Determine roadmap path
    const possiblePaths = [
      '/app/data/roadmap-platform.json',
      join(process.cwd(), 'data/roadmap-platform.json'),
      join(process.cwd(), 'apps/mcp-server/data/roadmap-platform.json'),
    ];

    const foundPath = possiblePaths.find((p) => existsSync(p));
    this.roadmapPath = foundPath || possiblePaths[2];
  }

  // ==========================================================================
  // Pull: GitHub Projects → Local JSON
  // ==========================================================================

  /**
   * Fetch all items from GitHub Project
   */
  async fetchFromGitHub(): Promise<GitHubProjectItem[]> {
    console.log('🔄 Fetching items from GitHub Project...');

    const query = `
      query($cursor: String) {
        node(id: "${PROJECT_ID}") {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
                content {
                  ... on DraftIssue { title body }
                  ... on Issue { title body number }
                }
              }
            }
          }
        }
      }
    `;

    const items: GitHubProjectItem[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = this.executeGraphQL(query, cursor ? { cursor } : {});
      const data = JSON.parse(result);

      if (!data.data?.node?.items) {
        throw new Error('Failed to fetch project items');
      }

      for (const node of data.data.node.items.nodes) {
        const item = this.parseProjectItem(node);
        if (item.deliverableId) {
          items.push(item);
        }
      }

      hasNextPage = data.data.node.items.pageInfo.hasNextPage;
      cursor = data.data.node.items.pageInfo.endCursor;
    }

    console.log(`✅ Fetched ${items.length} items from GitHub`);
    return items;
  }

  /**
   * Parse a project item node into structured data
   */
  private parseProjectItem(node: any): GitHubProjectItem {
    const item: GitHubProjectItem = {
      id: node.id,
      deliverableId: '',
      title: node.content?.title?.trim() || '',
      status: 'not-started',
      phase: '',
      priority: 'medium',
      evidence: '',
    };

    for (const field of node.fieldValues?.nodes || []) {
      const fieldName = field.field?.name;
      if (!fieldName) {
        continue;
      }

      switch (fieldName) {
        case 'Deliverable ID':
          item.deliverableId = field.text?.trim() || '';
          break;
        case 'Status':
          item.status = field.name?.toLowerCase() || 'not-started';
          break;
        case 'Phase':
          item.phase = field.name || '';
          break;
        case 'Priority':
          item.priority = field.name?.toLowerCase() || 'medium';
          break;
        case 'Evidence':
          item.evidence = field.text?.trim() || '';
          break;
        case 'Target Date':
          item.targetDate = field.date;
          break;
        case 'Start Date':
          item.startDate = field.date;
          break;
        case 'Completed Date':
          item.completedDate = field.date;
          break;
      }
    }

    return item;
  }

  /**
   * Sync from GitHub to local roadmap.json
   */
  async syncToLocal(): Promise<SyncResult> {
    try {
      console.log('🔄 Starting pull sync: GitHub → Local JSON...\n');

      // Fetch from GitHub
      const ghItems = await this.fetchFromGitHub();

      // Load existing roadmap
      const roadmap = this.loadRoadmap();

      // Track changes
      let changes = 0;

      // Update each phase with GitHub data
      for (const phase of roadmap.phases) {
        for (const deliverable of phase.deliverables) {
          const ghItem = ghItems.find(
            (i) => i.deliverableId === deliverable.id
          );
          if (!ghItem) {
            continue;
          }

          // Update status
          if (deliverable.status !== ghItem.status) {
            console.log(
              `  📝 ${deliverable.id}: status ${deliverable.status} → ${ghItem.status}`
            );
            deliverable.status = ghItem.status as any;
            changes++;
          }

          // Update evidence
          if (
            ghItem.evidence &&
            ghItem.evidence !== deliverable.evidence?.join(', ')
          ) {
            deliverable.evidence = ghItem.evidence
              .split(',')
              .map((e) => e.trim());
            changes++;
          }
        }
      }

      // Update phase statuses based on deliverables
      for (const phase of roadmap.phases) {
        const allComplete = phase.deliverables.every(
          (d) => d.status === 'complete'
        );
        const someInProgress = phase.deliverables.some(
          (d) => d.status === 'in-progress'
        );
        const newStatus = allComplete
          ? 'complete'
          : someInProgress
            ? 'in-progress'
            : 'planned';

        if (phase.status !== newStatus) {
          phase.status = newStatus;
          changes++;
        }
      }

      // Calculate overall progress
      roadmap.overallProgress = this.calculateProgress(roadmap.phases);

      // Write back
      roadmap.lastUpdated = new Date();
      this.writeRoadmap(roadmap);

      console.log(`\n✅ Pull sync complete: ${changes} changes applied`);

      return {
        success: true,
        message: `Synced ${ghItems.length} items from GitHub`,
        changes,
        errors: [],
      };
    } catch (error) {
      console.error('❌ Pull sync failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        changes: 0,
        errors: [],
      };
    }
  }

  // ==========================================================================
  // Push: Local JSON → GitHub Projects
  // ==========================================================================

  /**
   * Sync from local roadmap.json to GitHub Projects
   */
  async syncToGitHub(): Promise<SyncResult> {
    try {
      console.log('🔄 Starting push sync: Local JSON → GitHub...\n');

      // Load local roadmap
      const roadmap = this.loadRoadmap();

      // Fetch current GitHub items
      const ghItems = await this.fetchFromGitHub();

      // Build lookup by deliverable ID
      const ghItemMap = new Map<string, GitHubProjectItem>();
      for (const item of ghItems) {
        if (item.deliverableId) {
          ghItemMap.set(item.deliverableId, item);
        }
      }

      let updates = 0;
      let created = 0;
      const errors: Array<{ deliverableId: string; error: string }> = [];

      // Process each deliverable
      for (const phase of roadmap.phases) {
        for (const deliverable of phase.deliverables) {
          const ghItem = ghItemMap.get(deliverable.id);

          if (ghItem) {
            // Update existing item
            const updated = await this.updateProjectItem(
              ghItem.id,
              deliverable,
              phase.id,
              ghItem
            );
            if (updated) {
              updates++;
            }
          } else {
            // Create new item
            console.log(`  ➕ Creating new item: ${deliverable.id}`);
            try {
              await this.createProjectItem(deliverable, phase.id);
              created++;
            } catch (err) {
              errors.push({
                deliverableId: deliverable.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }

      console.log(
        `\n✅ Push sync complete: ${updates} updated, ${created} created`
      );

      return {
        success: true,
        message: `Pushed ${updates + created} items to GitHub`,
        changes: updates + created,
        updates,
        created,
        errors,
      };
    } catch (error) {
      console.error('❌ Push sync failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        changes: 0,
        updates: 0,
        errors: [],
      };
    }
  }

  /**
   * Update a project item with changed fields
   */
  private async updateProjectItem(
    itemId: string,
    deliverable: Deliverable,
    phaseId: string,
    current: GitHubProjectItem
  ): Promise<boolean> {
    const mutations: string[] = [];

    // Check status change
    if (current.status !== deliverable.status) {
      const optionId =
        STATUS_OPTIONS[deliverable.status as keyof typeof STATUS_OPTIONS];
      if (optionId) {
        mutations.push(
          this.buildFieldUpdateMutation(
            itemId,
            FIELD_IDS.status,
            optionId,
            'singleSelect'
          )
        );
        console.log(
          `  📝 ${deliverable.id}: status ${current.status} → ${deliverable.status}`
        );
      }
    }

    // Check phase change
    if (current.phase !== phaseId) {
      const optionId = PHASE_OPTIONS[phaseId];
      if (optionId) {
        mutations.push(
          this.buildFieldUpdateMutation(
            itemId,
            FIELD_IDS.phase,
            optionId,
            'singleSelect'
          )
        );
      }
    }

    // Check priority change
    const priority = (deliverable as any).priority || 'medium';
    if (current.priority !== priority) {
      const optionId = PRIORITY_OPTIONS[priority];
      if (optionId) {
        mutations.push(
          this.buildFieldUpdateMutation(
            itemId,
            FIELD_IDS.priority,
            optionId,
            'singleSelect'
          )
        );
      }
    }

    // Check evidence change (limit to 500 chars for text field)
    let evidence = deliverable.evidence?.join(', ') || '';
    if (evidence.length > 500) {
      evidence = `${evidence.substring(0, 497)}...`;
    }
    if (current.evidence !== evidence && evidence) {
      mutations.push(
        this.buildFieldUpdateMutation(
          itemId,
          FIELD_IDS.evidence,
          evidence,
          'text'
        )
      );
    }

    // Execute mutations
    if (mutations.length > 0) {
      for (const mutation of mutations) {
        try {
          this.executeGraphQL(mutation);
        } catch (err) {
          console.error(`    ❌ Failed to update ${deliverable.id}:`, err);
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Build a field update mutation
   */
  private buildFieldUpdateMutation(
    itemId: string,
    fieldId: string,
    value: string,
    type: 'text' | 'singleSelect' | 'date'
  ): string {
    let valueClause: string;

    switch (type) {
      case 'singleSelect':
        valueClause = `singleSelectOptionId: "${value}"`;
        break;
      case 'date':
        valueClause = `date: "${value}"`;
        break;
      case 'text':
      default:
        valueClause = `text: "${value.replace(/"/g, '\\"')}"`;
        break;
    }

    return `
      mutation {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: "${PROJECT_ID}"
            itemId: "${itemId}"
            fieldId: "${fieldId}"
            value: { ${valueClause} }
          }
        ) {
          projectV2Item { id }
        }
      }
    `;
  }

  /**
   * Create a new project item
   */
  private async createProjectItem(
    deliverable: Deliverable,
    phaseId: string
  ): Promise<void> {
    // Sanitize and truncate text for GraphQL
    const sanitizeText = (text: string, maxLength: number = 1500): string => {
      let sanitized = text
        .replace(/\\/g, '\\\\') // Escape backslashes first
        .replace(/"/g, '\\"') // Escape quotes
        .replace(/\n/g, '\\n') // Escape newlines
        .replace(/\r/g, '') // Remove carriage returns
        .replace(/\t/g, ' '); // Replace tabs with spaces

      // Truncate if needed
      if (sanitized.length > maxLength) {
        sanitized = `${sanitized.substring(0, maxLength - 3)}...`;
      }
      return sanitized;
    };

    const title = sanitizeText(deliverable.name, 200);
    const body = sanitizeText(deliverable.description || '', 1500);

    // First create a draft issue
    const createMutation = `
      mutation {
        addProjectV2DraftIssue(
          input: {
            projectId: "${PROJECT_ID}"
            title: "${title}"
            body: "${body}"
          }
        ) {
          projectItem { id }
        }
      }
    `;

    const result = this.executeGraphQL(createMutation);
    const data = JSON.parse(result);
    const itemId = data.data?.addProjectV2DraftIssue?.projectItem?.id;

    if (!itemId) {
      throw new Error('Failed to create project item');
    }

    // Set fields on the new item
    const statusOption =
      STATUS_OPTIONS[deliverable.status as keyof typeof STATUS_OPTIONS] ||
      STATUS_OPTIONS['not-started'];
    const phaseOption = PHASE_OPTIONS[phaseId];
    const priorityOption =
      PRIORITY_OPTIONS[(deliverable as any).priority || 'medium'];

    // Set Deliverable ID
    this.executeGraphQL(
      this.buildFieldUpdateMutation(
        itemId,
        FIELD_IDS.deliverableId,
        deliverable.id,
        'text'
      )
    );

    // Set Status
    this.executeGraphQL(
      this.buildFieldUpdateMutation(
        itemId,
        FIELD_IDS.status,
        statusOption,
        'singleSelect'
      )
    );

    // Set Phase
    if (phaseOption) {
      this.executeGraphQL(
        this.buildFieldUpdateMutation(
          itemId,
          FIELD_IDS.phase,
          phaseOption,
          'singleSelect'
        )
      );
    }

    // Set Priority
    if (priorityOption) {
      this.executeGraphQL(
        this.buildFieldUpdateMutation(
          itemId,
          FIELD_IDS.priority,
          priorityOption,
          'singleSelect'
        )
      );
    }

    // Set Evidence
    if (deliverable.evidence && deliverable.evidence.length > 0) {
      this.executeGraphQL(
        this.buildFieldUpdateMutation(
          itemId,
          FIELD_IDS.evidence,
          deliverable.evidence.join(', '),
          'text'
        )
      );
    }

    console.log(`    ✅ Created item for ${deliverable.id}`);
  }

  // ==========================================================================
  // Status & Utilities
  // ==========================================================================

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    lastUpdated: Date | null;
    source: string;
    syncMode: string;
    nextScheduledSync: string;
    localItems: number;
    githubItems: number;
  }> {
    try {
      const roadmap = this.loadRoadmap();
      const ghItems = await this.fetchFromGitHub();

      // Count local deliverables
      let localCount = 0;
      for (const phase of roadmap.phases) {
        localCount += phase.deliverables.length;
      }

      return {
        lastUpdated: roadmap.lastUpdated
          ? new Date(roadmap.lastUpdated as any)
          : null,
        source: 'GitHub Projects (luhtech/projects/3)',
        syncMode: 'bidirectional',
        nextScheduledSync: 'Manual only',
        localItems: localCount,
        githubItems: ghItems.length,
      };
    } catch (error) {
      return {
        lastUpdated: null,
        source: 'GitHub Projects',
        syncMode: 'bidirectional',
        nextScheduledSync: 'Manual only',
        localItems: 0,
        githubItems: 0,
      };
    }
  }

  /**
   * Execute GraphQL query via gh CLI
   */
  private executeGraphQL(
    query: string,
    variables?: Record<string, any>
  ): string {
    // Build JSON payload for gh api
    const payload = {
      query: query.trim(),
      variables: variables || {},
    };

    // Write payload to temp file to avoid shell escaping issues
    const tmpFile = join(process.cwd(), '.gh-graphql-payload.json');
    writeFileSync(tmpFile, JSON.stringify(payload), 'utf-8');

    try {
      const result = execSync(`gh api graphql --input "${tmpFile}"`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      // Clean up temp file
      try {
        execSync(`rm "${tmpFile}"`, { encoding: 'utf-8' });
      } catch {
        // Ignore cleanup errors
      }

      return result;
    } catch (error: any) {
      // Clean up temp file on error too
      try {
        execSync(`rm "${tmpFile}"`, { encoding: 'utf-8' });
      } catch {
        // Ignore cleanup errors
      }
      console.error('GraphQL Error:', error.stderr || error.message);
      throw error;
    }
  }

  /**
   * Load roadmap from file
   */
  private loadRoadmap(): Roadmap {
    if (!existsSync(this.roadmapPath)) {
      throw new Error(`Roadmap file not found: ${this.roadmapPath}`);
    }
    const content = readFileSync(this.roadmapPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Write roadmap to file
   */
  private writeRoadmap(roadmap: Roadmap): void {
    const content = JSON.stringify(roadmap, null, 2);
    writeFileSync(this.roadmapPath, content, 'utf-8');
    console.log(`📝 Written to: ${this.roadmapPath}`);
  }

  /**
   * Calculate overall progress
   */
  private calculateProgress(phases: RoadmapPhase[]): number {
    if (phases.length === 0) {
      return 0;
    }

    let totalProgress = 0;
    for (const phase of phases) {
      const deliverables = phase.deliverables.length;
      if (deliverables === 0) {
        totalProgress += phase.status === 'complete' ? 100 : 0;
      } else {
        const complete = phase.deliverables.filter(
          (d) => d.status === 'complete'
        ).length;
        totalProgress += (complete / deliverables) * 100;
      }
    }

    return Math.round(totalProgress / phases.length);
  }
}
