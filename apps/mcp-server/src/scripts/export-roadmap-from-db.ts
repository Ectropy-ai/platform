/**
 * Export Roadmap from Database to .roadmap/ JSON Files
 *
 * Reads database state and transforms it back to .roadmap/ JSON format.
 * Writes files that match the original schema versions.
 *
 * Prisma model access uses (prisma as any).modelName for flexibility
 * since the generated client types may not include these new models yet.
 *
 * Usage:
 *   pnpm tsx apps/mcp-server/src/scripts/export-roadmap-from-db.ts
 *
 * @module scripts/export-roadmap-from-db
 * @version 1.0.0
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ==============================================================================
// Configuration
// ==============================================================================

const VENTURE_ID = 'ectropy';
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const ROADMAP_DIR = path.join(REPO_ROOT, '.roadmap');

// ==============================================================================
// Prisma Client
// ==============================================================================

const prisma = new PrismaClient();

// ==============================================================================
// Enum Mapping: DB (UPPER_CASE) -> JSON (lowercase kebab-case)
// ==============================================================================

const phaseStatusMap: Record<string, string> = {
  PLANNED: 'planned',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'complete',
  BLOCKED: 'blocked',
};

const featureStatusMap: Record<string, string> = {
  PLANNED: 'planned',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  DEFERRED: 'deferred',
};

const nodeTypeMap: Record<string, string> = {
  FILE: 'file',
  DIRECTORY: 'directory',
  SERVICE: 'service',
  WORKFLOW: 'workflow',
  DELIVERABLE: 'deliverable',
  MILESTONE: 'milestone',
  DECISION: 'decision',
  EVIDENCE: 'evidence',
  PERSON: 'person',
  IP_ASSET: 'ip-asset',
  DEPENDENCY: 'dependency',
  PHASE: 'phase',
  TASK: 'task',
  METRIC: 'metric',
  EXTENSION: 'extension',
  NODE: 'node',
};

const nodeStatusMap: Record<string, string> = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DEPRECATED: 'deprecated',
};

const decisionStatusMap: Record<string, string> = {
  PROPOSED: 'proposed',
  UNDER_REVIEW: 'under-review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  IMPLEMENTED: 'implemented',
  DEPRECATED: 'deprecated',
};

const decisionImpactMap: Record<string, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

function mapEnum(value: string, map: Record<string, string>): string {
  return map[value] || value.toLowerCase().replace(/_/g, '-');
}

// ==============================================================================
// Helper: Write JSON file with deterministic serialization
// ==============================================================================

function writeJsonFile(filePath: string, data: unknown, entityCount: number, entityName: string): void {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, json + '\n', 'utf-8');
  console.log(`  Wrote ${filePath} (${entityCount} ${entityName})`);
}

// ==============================================================================
// Export: venture-summary.json (version 1.1.0)
// ==============================================================================

async function exportVentureSummary(venture: any): Promise<void> {
  const pitch = venture.pitch || {};
  const metrics = venture.metrics || {};

  const output: Record<string, any> = {
    $schema: 'https://luhtech.dev/schemas/venture-summary-v1.json',
    version: '1.1.0',
    lastUpdated: venture.updated_at
      ? new Date(venture.updated_at).toISOString()
      : new Date().toISOString(),
    meta: {
      truthUpDate: new Date().toISOString().split('T')[0],
      truthUpNote: `Exported from database for venture ${VENTURE_ID}`,
    },
    venture: {
      id: venture.venture_id,
      name: venture.name,
      tagline: venture.tagline || undefined,
      stage: venture.stage || undefined,
      founded: venture.founded || undefined,
      domain: venture.domain || undefined,
      industry: (venture.architecture as any)?.industry || [],
      location: (venture.architecture as any)?.location || undefined,
      license: venture.license || undefined,
    },
    pitch: pitch,
    metrics: metrics,
    team: (venture.architecture as any)?.team || { size: 1, founders: [], advisors: [], keyHires: [] },
    funding: (venture.architecture as any)?.funding || { totalRaised: '$0', investors: [], runway: null },
    milestones: (venture.architecture as any)?.milestones || { achieved: [], upcoming: [] },
    repositorySplit: (venture.architecture as any)?.repositorySplit || undefined,
    assets: (venture.architecture as any)?.assets || undefined,
  };

  // Remove undefined keys
  const cleaned = JSON.parse(JSON.stringify(output));
  writeJsonFile(path.join(ROADMAP_DIR, 'venture-summary.json'), cleaned, 1, 'venture');
}

// ==============================================================================
// Export: roadmap.json (schemaVersion 3.1.0)
// ==============================================================================

async function exportRoadmap(venture: any): Promise<void> {
  const phases = await (prisma as any).roadmapPhase.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { phase_id: 'asc' },
  });

  const deliverables = await (prisma as any).roadmapDeliverableDb.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { deliverable_id: 'asc' },
  });

  const features = await (prisma as any).roadmapFeature.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { feature_id: 'asc' },
  });

  // Group deliverables by phase_id
  const deliverablesByPhase: Record<string, any[]> = {};
  for (const d of deliverables) {
    if (!deliverablesByPhase[d.phase_id]) {
      deliverablesByPhase[d.phase_id] = [];
    }
    deliverablesByPhase[d.phase_id].push({
      id: d.deliverable_id,
      name: d.title,
      owner: d.assigned_to || undefined,
      status: d.status || 'planned',
      description: d.description || undefined,
      completedDate: d.completed_date || undefined,
    });
  }

  // Build quarters object from phases
  const quarters: Record<string, any> = {};
  for (const phase of phases) {
    const phaseDeliverables = deliverablesByPhase[phase.phase_id] || [];
    const graphMeta = phase.graph_metadata as any;

    quarters[phase.phase_id] = {
      focus: graphMeta?.focus || phase.name,
      theme: graphMeta?.theme || undefined,
      phases: graphMeta?.phases || [],
      status: mapEnum(phase.status, phaseStatusMap),
      milestones: graphMeta?.milestones || [],
      deliverables: phaseDeliverables,
      startDate: phase.start_date || undefined,
      targetDate: phase.target_date || undefined,
      completionDate: phase.completion_date || undefined,
    };
  }

  // Build features array
  const featuresArr = features.map((f: any) => {
    const graphMeta = f.graph_metadata as any;
    const feat: Record<string, any> = {
      id: f.feature_id,
      name: f.name,
      category: f.category || undefined,
      description: f.description || undefined,
      status: mapEnum(f.status, featureStatusMap),
      priority: f.priority || undefined,
      featureRef: graphMeta?.featureRef || undefined,
      featureUrn: graphMeta?.featureUrn || f.urn || undefined,
      specVersion: graphMeta?.specVersion || undefined,
      dependsOnFeatures: f.dependencies?.length > 0 ? f.dependencies : undefined,
      targetQuarter: graphMeta?.targetQuarter || undefined,
      completionMilestoneId: graphMeta?.completionMilestoneId || undefined,
      milestoneUrn: graphMeta?.milestoneUrn || undefined,
      deliverableIds: graphMeta?.deliverableIds || undefined,
    };
    return JSON.parse(JSON.stringify(feat)); // strip undefined
  });

  // Build the roadmap.json structure
  const output: Record<string, any> = {
    $schema: 'urn:luhtech:schema:roadmap:v3.1',
    schemaVersion: '3.1.0',
    meta: {
      ventureId: VENTURE_ID,
      ventureName: venture.name,
      lastUpdated: venture.updated_at
        ? new Date(venture.updated_at).toISOString()
        : new Date().toISOString(),
      author: 'erik',
      status: 'active',
      sourceDoc: '.roadmap/roadmap.json',
      strategicDocuments: [],
      syncStatus: {
        v1Path: 'apps/mcp-server/data/roadmap-platform.json',
        lastSync: new Date().toISOString(),
        syncDirection: 'v3-is-source-of-truth',
      },
    },
    venture: {
      type: (venture.architecture as any)?.type || 'Platform',
      architecture: (venture.architecture as any)?.architecture || 'Cloud-Native',
      forkParent: (venture.architecture as any)?.forkParent || null,
      codeReuse: (venture.architecture as any)?.codeReuse || 0,
      platformProgress: venture.overall_progress ? `${venture.overall_progress}%` : undefined,
      currentPhase: (venture.architecture as any)?.currentPhase || undefined,
      mission: venture.mission || undefined,
      vision: venture.vision || undefined,
      currentStage: venture.stage || undefined,
      overallProgress: venture.overall_progress || undefined,
    },
    features: featuresArr,
    quarters: quarters,
  };

  const cleaned = JSON.parse(JSON.stringify(output));
  const totalDeliverables = deliverables.length;
  writeJsonFile(
    path.join(ROADMAP_DIR, 'roadmap.json'),
    cleaned,
    phases.length,
    `phases, ${featuresArr.length} features, ${totalDeliverables} deliverables`
  );
}

// ==============================================================================
// Export: current-truth.json (schemaVersion 2.0.0)
// ==============================================================================

async function exportCurrentTruth(): Promise<void> {
  const stateNodes = await (prisma as any).stateNode.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { node_id: 'asc' },
  });

  const platformStates = await (prisma as any).platformState.findMany({
    where: { venture_id: VENTURE_ID },
  });

  const platformState = platformStates[0] || null;

  // Rebuild nodes array
  const nodes = stateNodes.map((n: any) => {
    const content = n.content as any;
    const metadata = n.metadata as any;
    const relationships = n.relationships as any;

    const node: Record<string, any> = {
      nodeId: n.node_id,
      nodeType: mapEnum(n.node_type, nodeTypeMap),
      timestamp: n.source_created_at || n.created_at?.toISOString() || undefined,
      title: n.title,
      status: n.status === 'ACTIVE' ? 'completed' : mapEnum(n.status, nodeStatusMap),
      content: content || undefined,
      metadata: metadata || undefined,
      relationships: relationships || undefined,
      phase: n.phase || undefined,
      path: n.path || undefined,
      description: n.description || undefined,
      owner: n.owner || undefined,
      evidence: n.evidence?.length > 0 ? n.evidence : undefined,
      tags: n.tags?.length > 0 ? n.tags : undefined,
      retentionDate: n.retention_date || undefined,
    };

    return JSON.parse(JSON.stringify(node)); // strip undefined
  });

  // Build indexes.byNodeType from nodes
  const byNodeType: Record<string, string[]> = {};
  for (const node of nodes) {
    const nt = node.nodeType;
    if (!byNodeType[nt]) {
      byNodeType[nt] = [];
    }
    byNodeType[nt].push(node.nodeId);
  }

  // Build indexes.byStatus from nodes
  const byStatus: Record<string, string[]> = {};
  for (const node of nodes) {
    const st = node.status || 'unknown';
    if (!byStatus[st]) {
      byStatus[st] = [];
    }
    byStatus[st].push(node.nodeId);
  }

  // Build platformState object
  const platformStateObj = platformState
    ? {
        health: platformState.health || 'healthy',
        phase: platformState.phase || undefined,
        progress: {
          completedDeliverables: platformState.completed_deliverables || 0,
          totalDeliverables: platformState.total_deliverables || 0,
          activeWorkstreams: platformState.active_workstreams || 0,
        },
        productionReadinessScore: platformState.production_readiness_score || 0,
        productionReadinessScoreValidated:
          (platformState.state_data as any)?.productionReadinessScoreValidated || true,
        productionReadinessValidationTimestamp:
          (platformState.state_data as any)?.productionReadinessValidationTimestamp || undefined,
        productionReadinessTarget:
          (platformState.state_data as any)?.productionReadinessTarget || 95,
        typeSafetyScore: platformState.type_safety_score || undefined,
        typeScriptErrorsResolved: platformState.typescript_errors_resolved || undefined,
      }
    : undefined;

  const output: Record<string, any> = {
    $schema: 'https://luhtech.dev/schemas/current-truth.schema.v2.json',
    $id: 'urn:luhtech:ectropy:file:current-truth',
    schemaVersion: '2.0.0',
    ventureId: VENTURE_ID,
    lastUpdated: new Date().toISOString(),
    meta: {
      sourceOfTruth: '.roadmap/current-truth.json',
      migratedFrom: ['apps/mcp-server/data/current-truth.json'],
      migrationDate: new Date().toISOString(),
      totalNodes: nodes.length,
      syncStatus: {
        canonicalPath: '.roadmap/current-truth.json',
        lastSync: new Date().toISOString(),
        syncDirection: 'v3-is-source-of-truth',
      },
    },
    policies: {
      retention: {
        defaultDays: 45,
        extendedDays: 90,
        archiveSchedule: 'quarterly',
      },
      archiving: {
        enabled: true,
        location: 'apps/mcp-server/data/evidence/archive/',
        nextArchiveDate: undefined,
      },
    },
    platformState: platformStateObj ? JSON.parse(JSON.stringify(platformStateObj)) : undefined,
    indexes: {
      byNodeType,
      byStatus,
    },
    nodes: nodes,
  };

  const cleaned = JSON.parse(JSON.stringify(output));
  writeJsonFile(
    path.join(ROADMAP_DIR, 'current-truth.json'),
    cleaned,
    nodes.length,
    `state nodes, ${platformState ? 1 : 0} platform state`
  );
}

// ==============================================================================
// Export: decision-log.json (version 2.0.0)
// ==============================================================================

async function exportDecisionLog(): Promise<void> {
  const decisions = await (prisma as any).documentationDecision.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { created_at: 'desc' },
  });

  const decisionsArr = decisions.map((d: any) => {
    const entry: Record<string, any> = {
      decisionId: d.decision_id,
      timestamp: d.proposed_date || d.created_at?.toISOString() || undefined,
      title: d.title,
      context: d.context || undefined,
      decision: d.decision || undefined,
      rationale: d.rationale || undefined,
      status: mapEnum(d.status, decisionStatusMap),
      category: d.category || undefined,
      impact: mapEnum(d.impact, decisionImpactMap),
      implementedDate: d.implemented_date || undefined,
      proposedDate: d.proposed_date || undefined,
      approvedDate: d.approved_date || undefined,
      evidence: d.evidence?.length > 0 ? d.evidence : undefined,
      tags: d.tags?.length > 0 ? d.tags : undefined,
      alternatives: d.alternatives || undefined,
      relatedDecisions: d.related_decisions?.length > 0 ? d.related_decisions : undefined,
      supersedes: d.supersedes || undefined,
      supersededBy: d.superseded_by || undefined,
      consequences: d.consequences || undefined,
      implementationNotes: d.implementation_notes || undefined,
      impactedDeliverables: d.impacted_deliverables?.length > 0 ? d.impacted_deliverables : undefined,
      impactedServices: d.impacted_services?.length > 0 ? d.impacted_services : undefined,
      impactedInfrastructure:
        d.impacted_infrastructure?.length > 0 ? d.impacted_infrastructure : undefined,
    };

    return JSON.parse(JSON.stringify(entry)); // strip undefined
  });

  const output = {
    $schema: 'https://luhtech.dev/schemas/decision-log-v2.json',
    version: '2.0.0',
    ventureId: VENTURE_ID,
    lastUpdated: new Date().toISOString(),
    decisions: decisionsArr,
  };

  writeJsonFile(
    path.join(ROADMAP_DIR, 'decision-log.json'),
    output,
    decisionsArr.length,
    'decisions'
  );
}

// ==============================================================================
// Export: infrastructure-catalog.json (version 2.0.0)
// ==============================================================================

async function exportInfrastructureCatalog(): Promise<void> {
  const environments = await (prisma as any).infraEnvironment.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { environment_id: 'asc' },
  });

  const services = await (prisma as any).infraService.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { service_id: 'asc' },
  });

  const environmentsArr = environments.map((e: any) => {
    const env: Record<string, any> = {
      id: e.environment_id,
      name: e.name,
      type: e.type || undefined,
      url: e.url || undefined,
      notes: e.notes || undefined,
      servers: e.servers_data || undefined,
      features: (e.graph_metadata as any)?.features || undefined,
    };
    return JSON.parse(JSON.stringify(env));
  });

  const servicesArr = services.map((s: any) => {
    const svc: Record<string, any> = {
      id: s.service_id,
      name: s.name,
      type: s.type || undefined,
      description: (s.graph_metadata as any)?.description || undefined,
      repository: s.repository || undefined,
      ports: (s.graph_metadata as any)?.ports || undefined,
      healthCheck: s.health_check
        ? JSON.parse(typeof s.health_check === 'string' ? s.health_check : JSON.stringify(s.health_check))
        : (s.graph_metadata as any)?.healthCheck || undefined,
      dependencies: s.dependencies?.length > 0 ? s.dependencies : undefined,
      status: s.status || undefined,
      documentation: s.documentation || undefined,
      tags: s.tags?.length > 0 ? s.tags : undefined,
    };
    return JSON.parse(JSON.stringify(svc));
  });

  const output = {
    $schema: 'https://luhtech.dev/schemas/infrastructure-catalog-v1.json',
    version: '2.0.0',
    ventureId: VENTURE_ID,
    lastUpdated: new Date().toISOString(),
    catalog: {
      environments: environmentsArr,
      services: servicesArr,
    },
  };

  writeJsonFile(
    path.join(ROADMAP_DIR, 'infrastructure-catalog.json'),
    output,
    environmentsArr.length,
    `environments, ${servicesArr.length} services`
  );
}

// ==============================================================================
// Export: votes.json (schemaVersion 2.0.0)
// ==============================================================================

async function exportVotes(): Promise<void> {
  const votes = await (prisma as any).roadmapVote.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { created_at: 'desc' },
  });

  const votesArr = votes.map((v: any) => {
    const vote: Record<string, any> = {
      voteId: v.vote_id,
      decisionId: v.decision_id,
      status: v.status || 'open',
      voters: v.voters || undefined,
      result: v.result || undefined,
      closedAt: v.closed_at || undefined,
    };
    return JSON.parse(JSON.stringify(vote));
  });

  // Build indexes
  const byStatus: Record<string, string[]> = {};
  const byDecision: Record<string, string[]> = {};
  for (const v of votesArr) {
    const st = v.status || 'open';
    if (!byStatus[st]) byStatus[st] = [];
    byStatus[st].push(v.voteId);

    const did = v.decisionId;
    if (!byDecision[did]) byDecision[did] = [];
    byDecision[did].push(v.voteId);
  }

  const output = {
    $schema: 'https://luhtech.dev/schemas/votes.schema.v2.json',
    $id: 'urn:luhtech:ectropy:file:votes',
    schemaVersion: '2.0.0',
    ventureId: VENTURE_ID,
    lastUpdated: new Date().toISOString(),
    meta: {
      sourceOfTruth: '.roadmap/votes.json',
      migratedFrom: ['apps/mcp-server/data/votes.json'],
      migrationDate: new Date().toISOString(),
      totalVotes: votesArr.length,
      syncStatus: {
        v1Path: 'apps/mcp-server/data/votes.json',
        lastSync: new Date().toISOString(),
        syncDirection: 'v3-is-source-of-truth',
      },
    },
    indexes: {
      byStatus,
      byDecision,
    },
    votes: votesArr,
  };

  writeJsonFile(path.join(ROADMAP_DIR, 'votes.json'), output, votesArr.length, 'votes');
}

// ==============================================================================
// Export: dependencies.json (version 1.0.0)
// ==============================================================================

async function exportDependencies(): Promise<void> {
  const dependencies = await (prisma as any).externalDependency.findMany({
    where: { venture_id: VENTURE_ID },
    orderBy: { dependency_id: 'asc' },
  });

  const depsArr = dependencies.map((d: any) => {
    const dep: Record<string, any> = {
      id: d.dependency_id,
      type: d.type || undefined,
      description: d.description || undefined,
      blocking: d.blocking,
      status: d.status || 'active',
      impact: d.impact || undefined,
      notes: d.notes || undefined,
      version: d.version || undefined,
      provider: d.provider || undefined,
      category: d.category || undefined,
      riskLevel: d.risk_level || undefined,
    };
    return JSON.parse(JSON.stringify(dep));
  });

  const output = {
    $schema: 'https://luhtech.dev/schemas/dependencies-v1.json',
    version: '1.0.0',
    ventureId: VENTURE_ID,
    lastUpdated: new Date().toISOString(),
    dependencies: depsArr,
  };

  writeJsonFile(
    path.join(ROADMAP_DIR, 'dependencies.json'),
    output,
    depsArr.length,
    'dependencies'
  );
}

// ==============================================================================
// Main
// ==============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Export Roadmap from Database');
  console.log('='.repeat(60));
  console.log(`  Venture ID: ${VENTURE_ID}`);
  console.log(`  Output dir: ${ROADMAP_DIR}`);
  console.log('');

  // Verify output directory exists
  if (!fs.existsSync(ROADMAP_DIR)) {
    console.error(`ERROR: Output directory does not exist: ${ROADMAP_DIR}`);
    process.exit(1);
  }

  // Load the venture record
  const venture = await (prisma as any).roadmapVenture.findFirst({
    where: { venture_id: VENTURE_ID },
  });

  if (!venture) {
    console.error(`ERROR: No RoadmapVenture found for venture_id="${VENTURE_ID}"`);
    console.error('  Run the migration script first to populate the database.');
    process.exit(1);
  }

  console.log(`  Found venture: ${venture.name} (${venture.venture_id})`);
  console.log('');
  console.log('Exporting files:');

  try {
    // 1. venture-summary.json
    await exportVentureSummary(venture);

    // 2. roadmap.json
    await exportRoadmap(venture);

    // 3. current-truth.json
    await exportCurrentTruth();

    // 4. decision-log.json
    await exportDecisionLog();

    // 5. infrastructure-catalog.json
    await exportInfrastructureCatalog();

    // 6. votes.json
    await exportVotes();

    // 7. dependencies.json
    await exportDependencies();

    console.log('');
    console.log('Export complete. 7 files written to .roadmap/');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('');
    console.error('Export failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
