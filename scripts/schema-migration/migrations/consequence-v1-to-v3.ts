/**
 * Consequence Schema Migration: V1 -> V3
 *
 * Transforms consequence records from V1 format to V3 format with:
 * - URN identifiers ($id)
 * - Graph metadata (graphMetadata)
 * - Schema version tracking
 * - Causal relationship edges
 */

import * as path from 'path';
import {
  registerMigration,
  createValidator,
  generateUrn,
  addGraphMetadata,
} from '../migrate';

// V1 Consequence structure (legacy)
interface ConsequenceV1 {
  id: string;
  decisionId: string;
  type: string;
  description: string;
  severity: string;
  affectedAreas?: string[];
  estimatedCost?: number;
  estimatedDelay?: number;
  mitigationPlan?: string;
  actualOutcome?: string;
  createdAt: string;
  resolvedAt?: string;
}

// V3 Consequence structure (current)
interface ConsequenceV3 {
  $schema: string;
  $id: string;
  schemaVersion: string;
  id: string;
  decisionUrn: string;
  type: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  impact: {
    areas: string[];
    cost?: {
      estimated: number;
      actual?: number;
      currency: string;
    };
    schedule?: {
      estimatedDelay: number;
      actualDelay?: number;
      unit: string;
    };
  };
  mitigation?: {
    plan: string;
    status: string;
    assignee?: string;
  };
  outcome?: {
    description: string;
    resolvedAt: string;
    effectiveness: string;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
    resolvedAt?: string;
  };
  graphMetadata: {
    nodeType: string;
    inEdges: Array<{ type: string; target: string }>;
    outEdges: Array<{ type: string; target: string }>;
  };
}

/**
 * Migrate a V1 consequence to V3 format
 */
function migrateConsequenceV1ToV3(v1: ConsequenceV1): ConsequenceV3 {
  const urn = generateUrn('ectropy', 'consequence', v1.id);
  const decisionUrn = generateUrn('ectropy', 'decision', v1.decisionId);

  // Map severity to uppercase enum
  const severityMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
  };

  const v3: ConsequenceV3 = {
    $schema: '../../schemas/consequence/consequence-v3.schema.json',
    $id: urn,
    schemaVersion: '3.0.0',
    id: v1.id,
    decisionUrn,
    type: v1.type,
    description: v1.description,
    severity: severityMap[v1.severity?.toLowerCase()] || 'MEDIUM',
    impact: {
      areas: v1.affectedAreas || [],
      ...(v1.estimatedCost && {
        cost: {
          estimated: v1.estimatedCost,
          currency: 'USD',
        },
      }),
      ...(v1.estimatedDelay && {
        schedule: {
          estimatedDelay: v1.estimatedDelay,
          unit: 'hours',
        },
      }),
    },
    ...(v1.mitigationPlan && {
      mitigation: {
        plan: v1.mitigationPlan,
        status: v1.resolvedAt ? 'COMPLETE' : 'IN_PROGRESS',
      },
    }),
    ...(v1.actualOutcome && v1.resolvedAt && {
      outcome: {
        description: v1.actualOutcome,
        resolvedAt: v1.resolvedAt,
        effectiveness: 'UNKNOWN',
      },
    }),
    timestamps: {
      createdAt: v1.createdAt,
      updatedAt: v1.resolvedAt || v1.createdAt,
      ...(v1.resolvedAt && { resolvedAt: v1.resolvedAt }),
    },
    graphMetadata: {
      nodeType: 'Consequence',
      inEdges: [{ type: 'CAUSED_BY', target: decisionUrn }],
      outEdges: v1.affectedAreas?.map(area => ({
        type: 'AFFECTS',
        target: `urn:luhtech:ectropy:area:${area.toLowerCase().replace(/\s+/g, '-')}`,
      })) || [],
    },
  };

  return v3;
}

// Register the migration
registerMigration({
  name: 'consequence-v1-to-v3',
  schema: 'consequence',
  sourceVersion: 'v1',
  targetVersion: 'v3',
  migrate: migrateConsequenceV1ToV3,
  validate: (data) => {
    // Basic validation - full validation would use AJV with schema
    const v3 = data as ConsequenceV3;
    return !!(
      v3.$id &&
      v3.$id.startsWith('urn:luhtech:') &&
      v3.schemaVersion === '3.0.0' &&
      v3.graphMetadata?.nodeType === 'Consequence'
    );
  },
});

console.log('Loaded migration: consequence-v1-to-v3');
