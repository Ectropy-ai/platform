/**
 * Migrate .roadmap/ JSON Files to PostgreSQL via Prisma
 *
 * Reads all 7 canonical .roadmap/ JSON files, transforms entities to
 * Prisma model shapes, and bulk upserts into the database.
 *
 * Idempotent: Uses URN-based upsert so re-running is safe.
 *
 * Usage:
 *   pnpm tsx apps/mcp-server/src/scripts/migrate-roadmap-to-db.ts
 *
 * @module scripts/migrate-roadmap-to-db
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
// Enum Mapping: JSON (lowercase/kebab-case) -> DB (UPPER_CASE)
// ==============================================================================

const phaseStatusToDb: Record<string, string> = {
  planned: 'PLANNED',
  'in-progress': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  active: 'IN_PROGRESS',
  complete: 'COMPLETED',
  completed: 'COMPLETED',
  blocked: 'BLOCKED',
};

const featureStatusToDb: Record<string, string> = {
  planned: 'PLANNED',
  'in-progress': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  active: 'IN_PROGRESS',
  completed: 'COMPLETED',
  complete: 'COMPLETED',
  deferred: 'DEFERRED',
};

const nodeTypeToDb: Record<string, string> = {
  file: 'FILE',
  directory: 'DIRECTORY',
  service: 'SERVICE',
  workflow: 'WORKFLOW',
  deliverable: 'DELIVERABLE',
  milestone: 'MILESTONE',
  decision: 'DECISION',
  evidence: 'EVIDENCE',
  person: 'PERSON',
  'ip-asset': 'IP_ASSET',
  dependency: 'DEPENDENCY',
  phase: 'PHASE',
  task: 'TASK',
  metric: 'METRIC',
  extension: 'EXTENSION',
  node: 'NODE',
  workstream: 'WORKSTREAM',
  document: 'DOCUMENT',
};

const nodeStatusToDb: Record<string, string> = {
  active: 'ACTIVE',
  archived: 'ARCHIVED',
  deprecated: 'DEPRECATED',
};

const decisionStatusToDb: Record<string, string> = {
  proposed: 'PROPOSED',
  'under-review': 'UNDER_REVIEW',
  'under review': 'UNDER_REVIEW',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  implemented: 'IMPLEMENTED',
  deprecated: 'DEPRECATED',
};

const decisionImpactToDb: Record<string, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

// ==============================================================================
// Helpers
// ==============================================================================

function readJson(filename: string): any {
  const filepath = path.join(ROADMAP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`  ⚠️  File not found: ${filepath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function urn(type: string, id: string): string {
  return `urn:luhtech:${VENTURE_ID}:${type}:${id}`;
}

// ==============================================================================
// Migration Functions
// ==============================================================================

async function migrateVenture(): Promise<void> {
  console.log('\n📦 Migrating venture-summary.json + roadmap.json venture...');

  const summary = readJson('venture-summary.json');
  const roadmap = readJson('roadmap.json');
  if (!summary && !roadmap) return;

  const venture = summary?.venture || roadmap?.venture || {};
  const pitch = summary?.pitch || roadmap?.pitch || null;
  const metrics = summary?.metrics || null;

  await (prisma as any).roadmapVenture.upsert({
    where: { urn: urn('venture', VENTURE_ID) },
    update: {
      name: venture.name || VENTURE_ID,
      tagline: venture.tagline || null,
      type: venture.type || null,
      stage: venture.stage || null,
      domain: venture.domain || null,
      license: venture.license || null,
      founded: venture.founded || null,
      pitch: pitch || undefined,
      metrics: metrics || undefined,
    },
    create: {
      urn: urn('venture', VENTURE_ID),
      venture_id: VENTURE_ID,
      name: venture.name || VENTURE_ID,
      tagline: venture.tagline || null,
      type: venture.type || null,
      stage: venture.stage || null,
      domain: venture.domain || null,
      license: venture.license || null,
      founded: venture.founded || null,
      pitch: pitch || undefined,
      metrics: metrics || undefined,
    },
  });

  console.log('  ✅ RoadmapVenture: 1 record upserted');
}

async function migratePhases(): Promise<void> {
  console.log('\n📦 Migrating roadmap.json quarters → RoadmapPhase...');

  const roadmap = readJson('roadmap.json');
  if (!roadmap?.quarters) return;

  const quarters = roadmap.quarters;
  const phaseIds = Object.keys(quarters);
  let count = 0;

  for (const phaseId of phaseIds) {
    const q = quarters[phaseId];
    const status = phaseStatusToDb[(q.status || 'planned').toLowerCase()] || 'PLANNED';

    await (prisma as any).roadmapPhase.upsert({
      where: {
        venture_id_phase_id: { venture_id: VENTURE_ID, phase_id: phaseId },
      },
      update: {
        name: q.focus || q.theme || phaseId,
        status,
        start_date: q.startDate || null,
        target_date: q.targetDate || null,
        completion_date: q.completionDate || null,
      },
      create: {
        urn: urn('phase', phaseId),
        venture_id: VENTURE_ID,
        phase_id: phaseId,
        name: q.focus || q.theme || phaseId,
        status,
        start_date: q.startDate || null,
        target_date: q.targetDate || null,
        completion_date: q.completionDate || null,
      },
    });
    count++;
  }

  console.log(`  ✅ RoadmapPhase: ${count} records upserted (source: ${phaseIds.length})`);
}

async function migrateDeliverables(): Promise<void> {
  console.log('\n📦 Migrating roadmap.json deliverables → RoadmapDeliverableDb...');

  const roadmap = readJson('roadmap.json');
  if (!roadmap?.quarters) return;

  let count = 0;

  for (const [phaseId, quarter] of Object.entries(roadmap.quarters) as [string, any][]) {
    const deliverables = quarter.deliverables || [];

    for (const d of deliverables) {
      const deliverableId = d.id || `${phaseId}-${count}`;

      await (prisma as any).roadmapDeliverableDb.upsert({
        where: {
          venture_id_deliverable_id: { venture_id: VENTURE_ID, deliverable_id: deliverableId },
        },
        update: {
          title: d.name || d.title || deliverableId,
          status: d.status || 'planned',
          assigned_to: d.owner || d.assignedTo || null,
          completed_date: d.completedDate || null,
        },
        create: {
          urn: urn('deliverable', deliverableId),
          venture_id: VENTURE_ID,
          deliverable_id: deliverableId,
          title: d.name || d.title || deliverableId,
          status: d.status || 'planned',
          phase_id: phaseId,
          assigned_to: d.owner || d.assignedTo || null,
          completed_date: d.completedDate || null,
        },
      });
      count++;
    }
  }

  console.log(`  ✅ RoadmapDeliverableDb: ${count} records upserted`);
}

async function migrateFeatures(): Promise<void> {
  console.log('\n📦 Migrating roadmap.json features → RoadmapFeature...');

  const roadmap = readJson('roadmap.json');
  if (!roadmap?.features) return;

  let count = 0;

  for (const f of roadmap.features) {
    const featureId = f.id || `feature-${count}`;
    const status = featureStatusToDb[(f.status || 'planned').toLowerCase()] || 'PLANNED';
    const priority = typeof f.priority === 'number' ? f.priority : parseInt(f.priority, 10) || null;

    await (prisma as any).roadmapFeature.upsert({
      where: {
        venture_id_feature_id: { venture_id: VENTURE_ID, feature_id: featureId },
      },
      update: {
        name: f.name,
        category: f.category || null,
        status,
        priority,
        phase: f.phase || null,
        dependencies: f.dependencies || [],
        description: f.description || null,
      },
      create: {
        urn: f.featureUrn || urn('feature', featureId),
        venture_id: VENTURE_ID,
        feature_id: featureId,
        name: f.name,
        category: f.category || null,
        status,
        priority,
        phase: f.phase || null,
        dependencies: f.dependencies || [],
        description: f.description || null,
      },
    });
    count++;
  }

  console.log(`  ✅ RoadmapFeature: ${count} records upserted (source: ${roadmap.features.length})`);
}

async function migrateStateNodes(): Promise<void> {
  console.log('\n📦 Migrating current-truth.json nodes → StateNode...');

  const truth = readJson('current-truth.json');
  if (!truth?.nodes) return;

  let count = 0;

  for (const node of truth.nodes) {
    const nodeId = node.nodeId || node.$id || `node-${count}`;
    const rawType = (node.nodeType || node.type || 'node').toLowerCase();
    const nodeType = nodeTypeToDb[rawType] || 'NODE';
    const rawStatus = (node.status || 'active').toLowerCase();
    const status = nodeStatusToDb[rawStatus] || 'ACTIVE';

    await (prisma as any).stateNode.upsert({
      where: {
        venture_id_node_id: { venture_id: VENTURE_ID, node_id: nodeId },
      },
      update: {
        title: node.title || nodeId,
        node_type: nodeType,
        status,
        phase: node.metadata?.phase || null,
        path: node.path || null,
        description: node.content?.summary || node.description || null,
        owner: node.metadata?.author || node.owner || null,
        content: node.content || null,
        relationships: node.relationships || null,
        metadata: node.metadata || null,
        evidence: node.content?.evidence || node.evidence || [],
        tags: node.metadata?.tags || node.tags || [],
        source_created_at: node.timestamp || null,
        graph_metadata: node.graphMetadata || null,
      },
      create: {
        urn: urn('node', nodeId),
        venture_id: VENTURE_ID,
        node_id: nodeId,
        title: node.title || nodeId,
        node_type: nodeType,
        status,
        phase: node.metadata?.phase || null,
        path: node.path || null,
        description: node.content?.summary || node.description || null,
        owner: node.metadata?.author || node.owner || null,
        content: node.content || null,
        relationships: node.relationships || null,
        metadata: node.metadata || null,
        evidence: node.content?.evidence || node.evidence || [],
        tags: node.metadata?.tags || node.tags || [],
        source_created_at: node.timestamp || null,
        graph_metadata: node.graphMetadata || null,
      },
    });
    count++;
  }

  console.log(`  ✅ StateNode: ${count} records upserted (source: ${truth.nodes.length})`);
}

async function migratePlatformState(): Promise<void> {
  console.log('\n📦 Migrating current-truth.json platformState → PlatformState...');

  const truth = readJson('current-truth.json');
  if (!truth?.platformState) return;

  const ps = truth.platformState;

  await (prisma as any).platformState.upsert({
    where: { venture_id: VENTURE_ID },
    update: {
      health: ps.health || null,
      phase: ps.phase || null,
      completed_deliverables: ps.progress?.completedDeliverables || null,
      total_deliverables: ps.progress?.totalDeliverables || null,
      active_workstreams: ps.progress?.activeWorkstreams || null,
      production_readiness_score: ps.productionReadinessScore || null,
      type_safety_score: ps.typeSafetyScore || null,
      typescript_errors_resolved: ps.typeScriptErrorsResolved || null,
      state_data: ps,
    },
    create: {
      urn: urn('platform-state', VENTURE_ID),
      venture_id: VENTURE_ID,
      health: ps.health || null,
      phase: ps.phase || null,
      completed_deliverables: ps.progress?.completedDeliverables || null,
      total_deliverables: ps.progress?.totalDeliverables || null,
      active_workstreams: ps.progress?.activeWorkstreams || null,
      production_readiness_score: ps.productionReadinessScore || null,
      type_safety_score: ps.typeSafetyScore || null,
      typescript_errors_resolved: ps.typeScriptErrorsResolved || null,
      state_data: ps,
    },
  });

  console.log('  ✅ PlatformState: 1 record upserted');
}

async function migrateDecisions(): Promise<void> {
  console.log('\n📦 Migrating decision-log.json decisions → DocumentationDecision...');

  const log = readJson('decision-log.json');
  if (!log?.decisions) return;

  let count = 0;

  for (const d of log.decisions) {
    const decisionId = d.decisionId || `decision-${count}`;
    const rawStatus = (d.status || 'proposed').toLowerCase();
    const status = decisionStatusToDb[rawStatus] || 'PROPOSED';
    const rawImpact = (d.impact || 'medium').toLowerCase();
    const impact = decisionImpactToDb[rawImpact] || 'MEDIUM';

    await (prisma as any).documentationDecision.upsert({
      where: {
        venture_id_decision_id: { venture_id: VENTURE_ID, decision_id: decisionId },
      },
      update: {
        title: d.title,
        status,
        category: d.category || 'general',
        impact,
        proposed_by: d.proposedBy || null,
        proposed_date: d.timestamp || null,
        implemented_date: d.implementedDate || null,
        context: d.context || null,
        decision: d.decision || null,
        consequences: d.consequences || null,
        rationale: d.rationale || null,
        alternatives: d.alternatives || null,
        related_decisions: d.relatedDecisions || [],
        supersedes: d.supersedes || null,
        superseded_by: d.supersededBy || null,
        evidence: d.evidence || [],
        tags: d.tags || [],
        impacted_deliverables: d.impactedDeliverables || d.deliverables || [],
        impacted_services: d.impactedServices || d.services || [],
        impacted_infrastructure: d.impactedInfrastructure || d.infrastructure || [],
      },
      create: {
        urn: urn('decision', decisionId),
        venture_id: VENTURE_ID,
        decision_id: decisionId,
        title: d.title,
        status,
        category: d.category || 'general',
        impact,
        proposed_by: d.proposedBy || null,
        proposed_date: d.timestamp || null,
        implemented_date: d.implementedDate || null,
        context: d.context || null,
        decision: d.decision || null,
        consequences: d.consequences || null,
        rationale: d.rationale || null,
        alternatives: d.alternatives || null,
        related_decisions: d.relatedDecisions || [],
        supersedes: d.supersedes || null,
        superseded_by: d.supersededBy || null,
        evidence: d.evidence || [],
        tags: d.tags || [],
        impacted_deliverables: d.impactedDeliverables || d.deliverables || [],
        impacted_services: d.impactedServices || d.services || [],
        impacted_infrastructure: d.impactedInfrastructure || d.infrastructure || [],
      },
    });
    count++;
  }

  console.log(`  ✅ DocumentationDecision: ${count} records upserted (source: ${log.decisions.length})`);
}

async function migrateEnvironments(): Promise<void> {
  console.log('\n📦 Migrating infrastructure-catalog.json environments → InfraEnvironment...');

  const infra = readJson('infrastructure-catalog.json');
  if (!infra?.catalog?.environments) return;

  let count = 0;

  for (const env of infra.catalog.environments) {
    const environmentId = env.id || `env-${count}`;

    await (prisma as any).infraEnvironment.upsert({
      where: {
        venture_id_environment_id: { venture_id: VENTURE_ID, environment_id: environmentId },
      },
      update: {
        name: env.name || environmentId,
        type: env.type || null,
        url: env.url || null,
        notes: env.notes || null,
        servers_data: env.servers || null,
      },
      create: {
        urn: urn('environment', environmentId),
        venture_id: VENTURE_ID,
        environment_id: environmentId,
        name: env.name || environmentId,
        type: env.type || null,
        url: env.url || null,
        notes: env.notes || null,
        servers_data: env.servers || null,
      },
    });
    count++;
  }

  console.log(`  ✅ InfraEnvironment: ${count} records upserted (source: ${infra.catalog.environments.length})`);
}

async function migrateServices(): Promise<void> {
  console.log('\n📦 Migrating infrastructure-catalog.json services → InfraService...');

  const infra = readJson('infrastructure-catalog.json');
  if (!infra?.catalog?.services) return;

  let count = 0;

  for (const svc of infra.catalog.services) {
    const serviceId = svc.id || `service-${count}`;
    const port = Array.isArray(svc.ports) && svc.ports.length > 0 ? svc.ports[0] : null;

    await (prisma as any).infraService.upsert({
      where: {
        venture_id_service_id: { venture_id: VENTURE_ID, service_id: serviceId },
      },
      update: {
        name: svc.name || serviceId,
        type: svc.type || null,
        version: svc.version || null,
        status: svc.status || 'running',
        port,
        health_check: svc.healthCheck || null,
        dependencies: svc.dependencies || [],
        repository: svc.repository || null,
        tags: svc.tags || [],
      },
      create: {
        urn: urn('service', serviceId),
        venture_id: VENTURE_ID,
        service_id: serviceId,
        name: svc.name || serviceId,
        type: svc.type || null,
        version: svc.version || null,
        status: svc.status || 'running',
        port,
        health_check: svc.healthCheck || null,
        dependencies: svc.dependencies || [],
        repository: svc.repository || null,
        tags: svc.tags || [],
      },
    });
    count++;
  }

  console.log(`  ✅ InfraService: ${count} records upserted (source: ${infra.catalog.services.length})`);
}

async function migrateVotes(): Promise<void> {
  console.log('\n📦 Migrating votes.json → RoadmapVote...');

  const votesData = readJson('votes.json');
  if (!votesData?.votes) return;

  let count = 0;

  for (const v of votesData.votes) {
    const voteId = v.voteId || `vote-${count}`;

    await (prisma as any).roadmapVote.upsert({
      where: {
        venture_id_vote_id: { venture_id: VENTURE_ID, vote_id: voteId },
      },
      update: {
        decision_id: v.decisionId || '',
        status: v.status || 'open',
        voters: v.voters || null,
        result: v.result || null,
        closed_at: v.closedAt || null,
      },
      create: {
        urn: urn('vote', voteId),
        venture_id: VENTURE_ID,
        vote_id: voteId,
        decision_id: v.decisionId || '',
        status: v.status || 'open',
        voters: v.voters || null,
        result: v.result || null,
        closed_at: v.closedAt || null,
      },
    });
    count++;
  }

  console.log(`  ✅ RoadmapVote: ${count} records upserted (source: ${votesData.votes.length})`);
}

async function migrateDependencies(): Promise<void> {
  console.log('\n📦 Migrating dependencies.json → ExternalDependency...');

  const depsData = readJson('dependencies.json');
  if (!depsData?.dependencies) return;

  let count = 0;

  for (const dep of depsData.dependencies) {
    const dependencyId = dep.id || `dep-${count}`;

    await (prisma as any).externalDependency.upsert({
      where: {
        venture_id_dependency_id: { venture_id: VENTURE_ID, dependency_id: dependencyId },
      },
      update: {
        name: dep.name || dep.id || dependencyId,
        type: dep.type || null,
        description: dep.description || null,
        status: dep.status || 'active',
        impact: dep.impact || null,
        blocking: dep.blocking === true,
        notes: dep.notes || null,
      },
      create: {
        urn: urn('dependency', dependencyId),
        venture_id: VENTURE_ID,
        dependency_id: dependencyId,
        name: dep.name || dep.id || dependencyId,
        type: dep.type || null,
        description: dep.description || null,
        status: dep.status || 'active',
        impact: dep.impact || null,
        blocking: dep.blocking === true,
        notes: dep.notes || null,
      },
    });
    count++;
  }

  console.log(`  ✅ ExternalDependency: ${count} records upserted (source: ${depsData.dependencies.length})`);
}

// ==============================================================================
// Main
// ==============================================================================

async function main(): Promise<void> {
  console.log('🚀 Roadmap Migration: .roadmap/ JSON → PostgreSQL');
  console.log(`   Venture: ${VENTURE_ID}`);
  console.log(`   Source:  ${ROADMAP_DIR}`);
  console.log(`   Time:    ${new Date().toISOString()}`);

  const start = Date.now();

  try {
    // Order matters: venture first (FK parent), then children
    await migrateVenture();
    await migratePhases();
    await migrateDeliverables();
    await migrateFeatures();
    await migrateStateNodes();
    await migratePlatformState();
    await migrateDecisions();
    await migrateEnvironments();
    await migrateServices();
    await migrateVotes();
    await migrateDependencies();

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n✅ Migration complete in ${elapsed}s`);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
