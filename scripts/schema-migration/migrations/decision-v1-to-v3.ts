/**
 * Decision Schema Migration: V1 -> V3
 *
 * Transforms decision records from V1 format to V3 format with:
 * - URN identifiers ($id)
 * - Graph metadata (graphMetadata)
 * - 7-tier authority cascade reference
 * - Schema version tracking
 */

import {
  registerMigration,
  generateUrn,
  addGraphMetadata,
} from '../migrate';

// V1 Decision structure (legacy)
interface DecisionV1 {
  id: string;
  title: string;
  description: string;
  status: string;
  priority?: string;
  category?: string;
  projectId?: string;
  decisionMaker?: string;
  createdBy: string;
  createdAt: string;
  dueDate?: string;
  resolvedAt?: string;
  resolution?: string;
  rationale?: string;
  alternatives?: string[];
  stakeholders?: string[];
  relatedDecisions?: string[];
}

// V3 Decision structure (current)
interface DecisionV3 {
  $schema: string;
  $id: string;
  schemaVersion: string;
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  projectUrn?: string;
  authority: {
    tier: number;
    tierName: string;
    decisionMaker: string;
    requiredApprovals?: string[];
  };
  resolution?: {
    outcome: string;
    rationale: string;
    alternativesConsidered: Array<{
      option: string;
      reason: string;
    }>;
  };
  lifecycle: {
    createdBy: string;
    createdAt: string;
    dueDate?: string;
    resolvedAt?: string;
    lastUpdated: string;
  };
  relationships: {
    stakeholders: string[];
    relatedDecisions: string[];
    consequences: string[];
  };
  graphMetadata: {
    nodeType: string;
    inEdges: Array<{ type: string; target: string }>;
    outEdges: Array<{ type: string; target: string }>;
  };
}

/**
 * Map V1 status to V3 status enum
 */
function mapStatus(v1Status: string): DecisionV3['status'] {
  const statusMap: Record<string, DecisionV3['status']> = {
    open: 'OPEN',
    pending: 'IN_REVIEW',
    'in-review': 'IN_REVIEW',
    approved: 'APPROVED',
    rejected: 'REJECTED',
    closed: 'APPROVED',
    superseded: 'SUPERSEDED',
  };
  return statusMap[v1Status?.toLowerCase()] || 'OPEN';
}

/**
 * Map V1 priority to V3 priority enum
 */
function mapPriority(v1Priority?: string): DecisionV3['priority'] {
  const priorityMap: Record<string, DecisionV3['priority']> = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
    urgent: 'CRITICAL',
  };
  return priorityMap[v1Priority?.toLowerCase() || ''] || 'MEDIUM';
}

/**
 * Infer authority tier from category/priority
 * Based on Ectropy 7-tier authority cascade
 */
function inferAuthorityTier(category?: string, priority?: string): { tier: number; tierName: string } {
  // Default mapping based on priority
  const priorityTiers: Record<string, { tier: number; tierName: string }> = {
    CRITICAL: { tier: 1, tierName: 'Project Executive' },
    HIGH: { tier: 2, tierName: 'Senior Project Manager' },
    MEDIUM: { tier: 4, tierName: 'Superintendent' },
    LOW: { tier: 6, tierName: 'Foreman' },
  };

  // Category overrides
  const categoryOverrides: Record<string, { tier: number; tierName: string }> = {
    'change-order': { tier: 2, tierName: 'Senior Project Manager' },
    'safety': { tier: 3, tierName: 'Project Manager' },
    'rfi': { tier: 4, tierName: 'Superintendent' },
    'material': { tier: 5, tierName: 'Assistant Superintendent' },
    'scheduling': { tier: 5, tierName: 'Assistant Superintendent' },
    'quality': { tier: 4, tierName: 'Superintendent' },
  };

  if (category && categoryOverrides[category.toLowerCase()]) {
    return categoryOverrides[category.toLowerCase()];
  }

  return priorityTiers[priority || 'MEDIUM'] || { tier: 4, tierName: 'Superintendent' };
}

/**
 * Migrate a V1 decision to V3 format
 */
function migrateDecisionV1ToV3(v1: DecisionV1): DecisionV3 {
  const urn = generateUrn('ectropy', 'decision', v1.id);
  const mappedPriority = mapPriority(v1.priority);
  const authorityInfo = inferAuthorityTier(v1.category, mappedPriority);

  const v3: DecisionV3 = {
    $schema: '../../schemas/decision/decision-v3.schema.json',
    $id: urn,
    schemaVersion: '3.0.0',
    id: v1.id,
    title: v1.title,
    description: v1.description,
    status: mapStatus(v1.status),
    priority: mappedPriority,
    category: v1.category || 'general',
    ...(v1.projectId && {
      projectUrn: generateUrn('ectropy', 'project', v1.projectId),
    }),
    authority: {
      tier: authorityInfo.tier,
      tierName: authorityInfo.tierName,
      decisionMaker: v1.decisionMaker || v1.createdBy,
    },
    ...(v1.resolution && {
      resolution: {
        outcome: v1.resolution,
        rationale: v1.rationale || '',
        alternativesConsidered: (v1.alternatives || []).map((alt) => ({
          option: alt,
          reason: 'Not selected',
        })),
      },
    }),
    lifecycle: {
      createdBy: v1.createdBy,
      createdAt: v1.createdAt,
      ...(v1.dueDate && { dueDate: v1.dueDate }),
      ...(v1.resolvedAt && { resolvedAt: v1.resolvedAt }),
      lastUpdated: v1.resolvedAt || v1.createdAt,
    },
    relationships: {
      stakeholders: v1.stakeholders || [],
      relatedDecisions: (v1.relatedDecisions || []).map((id) =>
        generateUrn('ectropy', 'decision', id)
      ),
      consequences: [],
    },
    graphMetadata: {
      nodeType: 'Decision',
      inEdges: v1.projectId
        ? [{ type: 'BELONGS_TO', target: generateUrn('ectropy', 'project', v1.projectId) }]
        : [],
      outEdges: (v1.relatedDecisions || []).map((id) => ({
        type: 'RELATES_TO',
        target: generateUrn('ectropy', 'decision', id),
      })),
    },
  };

  return v3;
}

// Register the migration
registerMigration({
  name: 'decision-v1-to-v3',
  schema: 'decision',
  sourceVersion: 'v1',
  targetVersion: 'v3',
  migrate: migrateDecisionV1ToV3,
  validate: (data) => {
    const v3 = data as DecisionV3;
    return !!(
      v3.$id &&
      v3.$id.startsWith('urn:luhtech:') &&
      v3.schemaVersion === '3.0.0' &&
      v3.graphMetadata?.nodeType === 'Decision' &&
      v3.authority?.tier >= 1 &&
      v3.authority?.tier <= 7
    );
  },
});

console.log('Loaded migration: decision-v1-to-v3');
