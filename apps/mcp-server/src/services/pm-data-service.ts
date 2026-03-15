/**
 * @file pm-data-service.ts
 * @description PostgreSQL-backed data service for PM decisions, voxels,
 * inspections, consequences, and tolerance-overrides.
 *
 * Replaces local filesystem JSON reads and writes in pm-decision-tools.ts.
 * Decision record: DEC-003 (2026-03-15).
 *
 * ARCHITECTURE NOTE:
 * Tool handlers operate on the JSON Collection shape (PMDecisionsCollection,
 * VoxelsCollection, etc.). Prisma returns flat rows. This service owns the
 * bidirectional transform so tool handlers require zero changes.
 *
 * Pattern for saves: upsert-all. Each save receives the full collection and
 * upserts every item. Idempotent. No diff required. Slightly over-writes on
 * no-op saves but correct and simple.
 *
 * FIELD MAPPING (Task 2):
 *
 * PMDecision (21 mapped fields):
 *   $id → urn | decisionId → decision_id | title → title | description → description
 *   type → type | status → status | authorityLevel.required → authority_required
 *   authorityLevel.current → authority_current | voxelRef → primary_voxel_urn
 *   budgetImpact.estimated → budget_estimated | budgetImpact.actual → budget_actual
 *   budgetImpact.currency → budget_currency | scheduleImpact.delayDays → delay_days
 *   scheduleImpact.criticalPath → critical_path | supersedes → supersedes_urn
 *   supersededBy → superseded_by_urn | evidence → evidence (JSONB)
 *   createdAt → created_at | updatedAt → updated_at | graphMetadata → graph_metadata
 *   [voxelContext, participants, usfImpact, consequences, meta, etc. → meta JSONB]
 *
 * Voxel (22 mapped fields):
 *   $id → urn | voxelId → voxel_id | coordinates.x/y/z → coord_x/y/z
 *   coordinates.resolution → resolution | location.building → building
 *   location.level → level | location.zone → zone | location.system → system
 *   location.gridReference → grid_reference | status → status
 *   cost.estimated → estimated_cost | cost.actual → actual_cost
 *   schedule.plannedStart → planned_start | schedule.plannedEnd → planned_end
 *   schedule.actualStart → actual_start | schedule.actualEnd → actual_end
 *   schedule.isCriticalPath → is_critical_path | graphMetadata → graph_metadata
 *   [materials, labor, decisions, adjacentVoxels, inspectionStatus → meta JSONB]
 *
 * Inspection (18 mapped fields):
 *   $id → urn | inspectionId → inspection_id | type → inspection_type
 *   status → status | outcome → result_outcome | scheduledDate → scheduled_date
 *   completedDate → completed_at | findings → findings (JSONB)
 *   conditions → result_conditions | reinspectionRequired → reinspection_required
 *   punchList → punch_list | evidence → evidence (JSONB) | graphMetadata → graph_metadata
 *   decisionsValidated → decisions_validated | decisionsFailed → decisions_failed
 *   [voxelRef, decisionRef, inspector, voxelRefs, decisionsToValidate → meta JSONB]
 *
 * Consequence (14 mapped fields):
 *   $id → urn | consequenceId → consequence_id | category → category
 *   severity → severity | status → status | description → description
 *   budgetImpact.amount → budget_estimated | budgetImpact.isConfirmed → budget_confirmed
 *   scheduleImpact.delayDays → delay_days | mitigationPlan → mitigation_plan
 *   evidence → evidence (JSONB) | graphMetadata → graph_metadata
 *   [affectedVoxels, scheduleImpact.affectedMilestones → meta JSONB]
 *
 * ToleranceOverride (14 mapped fields):
 *   $id → urn | toleranceType → tolerance_type
 *   standardValue.value → standard_value | standardValue.unit → standard_unit
 *   standardValue.tolerance → standard_direction (encoded)
 *   approvedValue.value → approved_value | approvedValue.unit → approved_unit
 *   approvedValue.tolerance → approved_direction (encoded)
 *   rationale → rationale | applicableTrades → applicable_trades
 *   expiresAt → expires_at | status → (no column — stored in meta)
 *   sourceDecision → source_decision_urn | graphMetadata → (no column — dropped)
 *
 * @see DEC-003-SEPPA-STORAGE-MIGRATION.json
 */

import { PrismaClient } from '@prisma/client';
import type {
  PMDecision,
  PMDecisionStatus,
  PMDecisionsCollection,
  Voxel,
  VoxelsCollection,
  VoxelStatus,
  Inspection,
  InspectionsCollection,
  InspectionStatus,
  InspectionType,
  Consequence,
  ConsequencesCollection,
  ConsequenceStatus,
  ConsequenceCategory,
  ConsequenceSeverity,
  ToleranceOverride,
  ToleranceOverridesCollection,
  ToleranceType,
  PMURN,
  AuthorityLevel,
  GraphMetadata,
} from '../types/pm.types.js';

import {
  buildFileURN,
  setIdCounter,
  parseURN,
} from './pm-urn.utils.js';

// ============================================================================
// Section 1: Prisma Singleton
// ============================================================================

let _prisma: PrismaClient | null = null;

/** Returns singleton PrismaClient. Throws if DATABASE_URL is not set. */
function getPrisma(): PrismaClient {
  if (!_prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        '[pm-data-service] DATABASE_URL is not set. ' +
        'SEPPA cannot query decisions, voxels, or inspections. ' +
        'Set DATABASE_URL in the MCP server environment.'
      );
    }
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    });
  }
  return _prisma;
}

/** Disconnect the Prisma client and reset the singleton. */
export async function disconnectDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

// Expose getPrisma for testing
export { getPrisma };

// ============================================================================
// Section 2: Transform Functions
// ============================================================================

// --- PMDecision Transforms ---

/** Transforms Prisma PMDecision row to PMDecision JSON shape. */
function toPMDecision(row: any): PMDecision {
  const meta = (row.meta as Record<string, any>) ?? {};
  return {
    $id: row.urn as PMURN,
    $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json',
    schemaVersion: '3.0.0',
    meta: {
      projectId: row.project_id,
      sourceOfTruth: 'postgresql',
      lastUpdated: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
      syncStatus: meta.syncStatus,
    },
    decisionId: row.decision_id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    status: row.status,
    authorityLevel: {
      required: row.authority_required as AuthorityLevel,
      current: row.authority_current as AuthorityLevel,
      authorityRef: meta.authorityRef,
    },
    voxelRef: (row.primary_voxel_urn ?? meta.voxelRef ?? '') as PMURN,
    voxelContext: meta.voxelContext,
    budgetImpact: row.budget_estimated != null
      ? {
          estimated: Number(row.budget_estimated),
          actual: row.budget_actual != null ? Number(row.budget_actual) : undefined,
          currency: row.budget_currency ?? 'USD',
          variance: meta.budgetVariance,
        }
      : undefined,
    scheduleImpact: row.delay_days != null
      ? {
          delayDays: row.delay_days,
          criticalPath: row.critical_path ?? false,
          affectedMilestones: meta.affectedMilestones,
        }
      : undefined,
    participants: meta.participants,
    evidence: row.evidence ?? undefined,
    consequences: meta.consequences,
    relatedDecisions: meta.relatedDecisions,
    supersedes: row.supersedes_urn as PMURN | undefined,
    supersededBy: row.superseded_by_urn as PMURN | undefined,
    usfImpact: meta.usfImpact,
    createdAt: row.created_at?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    graphMetadata: (row.graph_metadata as GraphMetadata) ?? { inEdges: [], outEdges: [] },
  };
}

/** Transforms PMDecision JSON shape to Prisma row data for upsert. */
function toDecisionRow(projectId: string, d: PMDecision): Record<string, any> {
  return {
    urn: d.$id,
    project_id: projectId,
    decision_id: d.decisionId,
    title: d.title,
    description: d.description ?? null,
    type: d.type,
    status: d.status,
    authority_required: d.authorityLevel.required,
    authority_current: d.authorityLevel.current,
    authority_level_id: null, // FK — not populated from JSON shapes
    escalation_required: d.type === 'ESCALATION',
    auto_approved: false,
    primary_voxel_urn: d.voxelRef ?? null,
    question: null,
    rationale: null,
    options: null,
    selected_option: null,
    ai_analysis: null,
    budget_estimated: d.budgetImpact?.estimated ?? null,
    budget_actual: d.budgetImpact?.actual ?? null,
    budget_currency: d.budgetImpact?.currency ?? 'USD',
    budget_line: null,
    delay_days: d.scheduleImpact?.delayDays ?? null,
    delay_hours: d.scheduleImpact?.delayDays != null ? d.scheduleImpact.delayDays * 24 : null,
    critical_path: d.scheduleImpact?.criticalPath ?? false,
    look_ahead_week: null,
    requested_by_id: null, // FK — not populated from JSON shapes
    approved_by_id: null,  // FK — not populated from JSON shapes
    evidence: d.evidence ?? null,
    escalation_source_urn: null,
    escalation_target_urn: null,
    supersedes_urn: d.supersedes ?? null,
    superseded_by_urn: d.supersededBy ?? null,
    graph_metadata: d.graphMetadata ?? null,
    meta: {
      voxelContext: d.voxelContext,
      participants: d.participants,
      consequences: d.consequences,
      relatedDecisions: d.relatedDecisions,
      usfImpact: d.usfImpact,
      syncStatus: d.meta?.syncStatus,
      authorityRef: d.authorityLevel.authorityRef,
      budgetVariance: d.budgetImpact?.variance,
      affectedMilestones: d.scheduleImpact?.affectedMilestones,
    },
  };
}

// --- Voxel Transforms ---

/** Transforms Prisma Voxel row to Voxel JSON shape. */
function toVoxel(row: any): Voxel {
  const meta = (row.meta as Record<string, any>) ?? {};
  return {
    $id: row.urn as PMURN,
    $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json',
    schemaVersion: '3.0.0',
    voxelId: row.voxel_id,
    coordinates: {
      x: row.coord_x,
      y: row.coord_y,
      z: row.coord_z,
      resolution: row.resolution ?? 1.0,
    },
    location: (row.building || row.level || row.zone || row.system || row.grid_reference)
      ? {
          building: row.building ?? undefined,
          level: row.level ?? undefined,
          zone: row.zone ?? undefined,
          system: row.system ?? undefined,
          gridReference: row.grid_reference ?? undefined,
          ifcGuid: meta.ifcGuid,
        }
      : undefined,
    status: row.status as VoxelStatus,
    materials: meta.materials,
    labor: meta.labor ?? (row.estimated_hours != null
      ? { estimatedHours: row.estimated_hours, actualHours: row.actual_hours ?? undefined }
      : undefined),
    decisions: meta.decisions,
    adjacentVoxels: meta.adjacentVoxels,
    cost: row.estimated_cost != null
      ? {
          estimated: Number(row.estimated_cost),
          actual: row.actual_cost != null ? Number(row.actual_cost) : undefined,
          currency: meta.costCurrency ?? 'USD',
        }
      : undefined,
    schedule: (row.planned_start || row.planned_end || row.actual_start || row.actual_end)
      ? {
          plannedStart: row.planned_start?.toISOString?.() ?? undefined,
          plannedEnd: row.planned_end?.toISOString?.() ?? undefined,
          actualStart: row.actual_start?.toISOString?.() ?? undefined,
          actualEnd: row.actual_end?.toISOString?.() ?? undefined,
          isCriticalPath: row.is_critical_path ?? undefined,
        }
      : undefined,
    inspectionStatus: meta.inspectionStatus,
    usfWorkPacketRef: meta.usfWorkPacketRef,
    graphMetadata: (row.graph_metadata as GraphMetadata) ?? { inEdges: [], outEdges: [] },
  };
}

/** Transforms Voxel JSON shape to Prisma row data for upsert. */
function toVoxelRow(projectId: string, v: Voxel): Record<string, any> {
  const res = v.coordinates.resolution ?? 1.0;
  const halfRes = res / 2;
  return {
    urn: v.$id,
    project_id: projectId,
    voxel_id: v.voxelId,
    status: v.status,
    health_status: 'HEALTHY',
    coord_x: v.coordinates.x,
    coord_y: v.coordinates.y,
    coord_z: v.coordinates.z,
    resolution: res,
    min_x: v.coordinates.x - halfRes,
    max_x: v.coordinates.x + halfRes,
    min_y: v.coordinates.y - halfRes,
    max_y: v.coordinates.y + halfRes,
    min_z: v.coordinates.z - halfRes,
    max_z: v.coordinates.z + halfRes,
    building: v.location?.building ?? null,
    level: v.location?.level ?? null,
    zone: v.location?.zone ?? null,
    room: null,
    grid_reference: v.location?.gridReference ?? null,
    system: v.location?.system ?? null,
    ifc_elements: v.location?.ifcGuid ? [v.location.ifcGuid] : [],
    decision_count: 0,
    unacknowledged_count: 0,
    current_phase: null,
    percent_complete: null,
    planned_start: v.schedule?.plannedStart ? new Date(v.schedule.plannedStart) : null,
    planned_end: v.schedule?.plannedEnd ? new Date(v.schedule.plannedEnd) : null,
    actual_start: v.schedule?.actualStart ? new Date(v.schedule.actualStart) : null,
    actual_end: v.schedule?.actualEnd ? new Date(v.schedule.actualEnd) : null,
    is_critical_path: v.schedule?.isCriticalPath ?? false,
    estimated_cost: v.cost?.estimated ?? null,
    actual_cost: v.cost?.actual ?? null,
    estimated_hours: v.labor?.estimatedHours ?? null,
    actual_hours: v.labor?.actualHours ?? null,
    graph_metadata: v.graphMetadata ?? null,
    meta: {
      materials: v.materials,
      labor: v.labor,
      decisions: v.decisions,
      adjacentVoxels: v.adjacentVoxels,
      inspectionStatus: v.inspectionStatus,
      usfWorkPacketRef: v.usfWorkPacketRef,
      ifcGuid: v.location?.ifcGuid,
      costCurrency: v.cost?.currency,
    },
  };
}

// --- Inspection Transforms ---

/** Transforms Prisma Inspection row to Inspection JSON shape. */
function toInspection(row: any): Inspection {
  const meta = (row.meta as Record<string, any>) ?? {};
  return {
    $id: row.urn as PMURN,
    $schema: 'https://luhtech.dev/schemas/pm/inspection.schema.json',
    schemaVersion: '3.0.0',
    inspectionId: row.inspection_id,
    type: row.inspection_type as InspectionType,
    status: row.status as InspectionStatus,
    outcome: row.result_outcome ?? undefined,
    voxelRef: (meta.voxelRef ?? '') as PMURN,
    voxelRefs: meta.voxelRefs,
    decisionRef: meta.decisionRef,
    decisionsToValidate: meta.decisionsToValidate,
    decisionsValidated: row.decisions_validated?.length ? row.decisions_validated : undefined,
    decisionsFailed: row.decisions_failed?.length ? row.decisions_failed : undefined,
    scheduledDate: row.scheduled_date?.toISOString?.() ?? undefined,
    completedDate: row.completed_at?.toISOString?.() ?? undefined,
    inspector: meta.inspector,
    findings: row.findings ?? undefined,
    conditions: row.result_conditions?.length ? row.result_conditions : undefined,
    reinspectionRequired: row.reinspection_required ?? undefined,
    punchList: row.punch_list ?? undefined,
    evidence: row.evidence ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    graphMetadata: (row.graph_metadata as GraphMetadata) ?? { inEdges: [], outEdges: [] },
  };
}

/** Transforms Inspection JSON shape to Prisma row data for upsert. */
function toInspectionRow(projectId: string, i: Inspection): Record<string, any> {
  return {
    urn: i.$id,
    project_id: projectId,
    inspection_id: i.inspectionId,
    title: null,
    description: null,
    inspection_type: i.type,
    status: i.status,
    inspector_id: null, // FK — not populated from JSON shapes
    inspector_info: null,
    regulatory_body: null,
    permit_number: null,
    code_reference: null,
    jurisdiction_code: null,
    scheduled_date: i.scheduledDate ? new Date(i.scheduledDate) : null,
    actual_date: i.completedDate ? new Date(i.completedDate) : null,
    duration_minutes: null,
    decisions_reviewed: i.decisionsToValidate ?? [],
    decisions_validated: i.decisionsValidated ?? [],
    decisions_failed: i.decisionsFailed ?? [],
    findings: i.findings ?? null,
    punch_list: i.punchList ?? null,
    result_outcome: i.outcome ?? null,
    result_conditions: i.conditions ?? [],
    reinspection_required: i.reinspectionRequired ?? false,
    reinspection_date: null,
    result_notes: null,
    evidence: i.evidence ?? null,
    consequences_created: [],
    decisions_triggered: [],
    graph_metadata: i.graphMetadata ?? null,
    meta: {
      voxelRef: i.voxelRef,
      voxelRefs: i.voxelRefs,
      decisionRef: i.decisionRef,
      decisionsToValidate: i.decisionsToValidate,
      inspector: i.inspector,
    },
    started_at: null,
    completed_at: i.completedDate ? new Date(i.completedDate) : null,
  };
}

// --- Consequence Transforms ---

/** Transforms Prisma Consequence row to Consequence JSON shape. */
function toConsequence(row: any): Consequence {
  const meta = (row.meta as Record<string, any>) ?? {};
  return {
    $id: row.urn as PMURN,
    $schema: 'https://luhtech.dev/schemas/pm/consequence.schema.json',
    schemaVersion: '3.0.0',
    consequenceId: row.consequence_id,
    category: row.category,
    severity: row.severity,
    status: row.status,
    description: row.description ?? '',
    sourceDecision: (row.source_decision_urn ?? meta.sourceDecision ?? '') as PMURN,
    affectedVoxels: meta.affectedVoxels,
    budgetImpact: row.budget_estimated != null
      ? {
          amount: Number(row.budget_estimated),
          currency: meta.budgetCurrency ?? 'USD',
          isConfirmed: row.budget_confirmed ?? false,
        }
      : undefined,
    scheduleImpact: row.delay_days != null
      ? {
          delayDays: row.delay_days,
          affectedMilestones: meta.affectedMilestones,
        }
      : undefined,
    mitigationPlan: row.mitigation_plan ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    graphMetadata: (row.graph_metadata as GraphMetadata) ?? { inEdges: [], outEdges: [] },
  };
}

/**
 * Transforms Consequence JSON shape to Prisma row data for upsert.
 * @param decisionUuidMap URN→UUID map for resolving source_decision_id FK
 */
function toConsequenceRow(
  projectId: string,
  c: Consequence,
  decisionUuidMap: Map<string, string>,
): Record<string, any> {
  const sourceDecisionUuid = decisionUuidMap.get(c.sourceDecision as string);
  return {
    urn: c.$id,
    project_id: projectId,
    consequence_id: c.consequenceId,
    source_decision_id: sourceDecisionUuid ?? '00000000-0000-0000-0000-000000000000',
    title: c.description?.substring(0, 200) ?? null,
    description: c.description ?? null,
    category: c.category,
    severity: c.severity,
    status: c.status,
    discovered_by_urn: null,
    discovered_at: null,
    primary_voxel_id: null, // FK — would need voxel UUID lookup
    spatial_reference: null,
    budget_estimated: c.budgetImpact?.amount ?? null,
    budget_actual: null,
    budget_confirmed: c.budgetImpact?.isConfirmed ?? false,
    delay_days: c.scheduleImpact?.delayDays ?? null,
    critical_path: false,
    mitigation_plan: c.mitigationPlan ?? null,
    resolution_path: null,
    resolution_decision_urn: null,
    ai_trace_analysis: null,
    evidence: null,
    graph_metadata: c.graphMetadata ?? null,
    meta: {
      sourceDecision: c.sourceDecision,
      affectedVoxels: c.affectedVoxels,
      budgetCurrency: c.budgetImpact?.currency,
      affectedMilestones: c.scheduleImpact?.affectedMilestones,
    },
  };
}

// --- ToleranceOverride Transforms ---

/** Transforms Prisma ToleranceOverride row to ToleranceOverride JSON shape. */
function toToleranceOverride(row: any): ToleranceOverride {
  return {
    $id: row.urn as PMURN,
    $schema: 'https://luhtech.dev/schemas/pm/tolerance-override.schema.json',
    schemaVersion: '3.0.0',
    overrideId: parseURN(row.urn as PMURN)?.identifier ?? row.urn,
    toleranceType: row.tolerance_type as ToleranceType,
    voxelRef: (row.voxel?.urn ?? '') as PMURN,
    standardValue: {
      value: row.standard_value ?? 0,
      unit: row.standard_unit ?? '',
      tolerance: row.standard_direction ? parseFloat(row.standard_direction) || 0 : 0,
    },
    approvedValue: {
      value: row.approved_value,
      unit: row.approved_unit,
      tolerance: row.approved_direction ? parseFloat(row.approved_direction) || 0 : 0,
    },
    rationale: row.rationale ?? '',
    sourceDecision: row.source_decision_urn as PMURN,
    applicableTrades: row.applicable_trades ?? [],
    expiresAt: row.expires_at?.toISOString?.() ?? undefined,
    status: 'ACTIVE', // No status column in Prisma — default ACTIVE
    createdAt: row.created_at?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    graphMetadata: { inEdges: [], outEdges: [] }, // No column — default empty
  };
}

/**
 * Transforms ToleranceOverride JSON shape to Prisma row data for upsert.
 * @param voxelUuidMap URN→UUID map for resolving voxel_id FK
 */
function toToleranceOverrideRow(
  o: ToleranceOverride,
  voxelUuidMap: Map<string, string>,
): Record<string, any> {
  const voxelUuid = voxelUuidMap.get(o.voxelRef as string);
  return {
    urn: o.$id,
    voxel_id: voxelUuid ?? '00000000-0000-0000-0000-000000000000',
    tolerance_type: o.toleranceType,
    standard_value: o.standardValue.value,
    standard_unit: o.standardValue.unit,
    standard_direction: String(o.standardValue.tolerance),
    approved_value: o.approvedValue.value,
    approved_unit: o.approvedValue.unit,
    approved_direction: String(o.approvedValue.tolerance),
    source_decision_urn: o.sourceDecision,
    approved_by_urn: null,
    rationale: o.rationale ?? null,
    applicable_trades: o.applicableTrades ?? [],
    approval_date: new Date(o.createdAt),
    expires_at: o.expiresAt ? new Date(o.expiresAt) : null,
  };
}

// ============================================================================
// Section 3: Load Functions (async, return Collection shapes)
// ============================================================================

/**
 * Load all decisions for a project from PostgreSQL.
 * Returns PMDecisionsCollection — same shape as previous JSON file format.
 * Replaces: loadDecisions(projectId) in pm-decision-tools.ts
 */
export async function loadDecisions(projectId: string): Promise<PMDecisionsCollection> {
  const prisma = getPrisma();
  const rows = await prisma.pMDecision.findMany({
    where: { project_id: projectId },
    orderBy: { created_at: 'desc' },
  });
  const decisions = rows.map(toPMDecision);

  // Restore ID counter for ID generation continuity
  if (decisions.length > 0) {
    const maxId = Math.max(
      ...decisions.map((d) => {
        const match = d.decisionId.match(/DEC-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      }),
    );
    setIdCounter('decision', maxId);
  }

  return {
    $schema: 'https://luhtech.dev/schemas/pm/decisions-collection.json',
    $id: buildFileURN(projectId, 'decisions'),
    schemaVersion: '3.0.0',
    meta: {
      projectId,
      sourceOfTruth: 'postgresql',
      lastUpdated: new Date().toISOString(),
      totalDecisions: decisions.length,
    },
    indexes: buildDecisionIndexes(decisions),
    decisions,
  };
}

/**
 * Load all voxels for a project from PostgreSQL.
 * Returns VoxelsCollection — same shape as previous JSON file format.
 * Replaces: loadVoxels(projectId) in pm-decision-tools.ts
 */
export async function loadVoxels(projectId: string): Promise<VoxelsCollection> {
  const prisma = getPrisma();
  const rows = await prisma.voxel.findMany({
    where: { project_id: projectId },
    orderBy: { created_at: 'desc' },
  });
  const voxels = rows.map(toVoxel);

  return {
    $schema: 'https://luhtech.dev/schemas/pm/voxels-collection.json',
    $id: buildFileURN(projectId, 'voxels'),
    schemaVersion: '3.0.0',
    meta: {
      projectId,
      sourceOfTruth: 'postgresql',
      lastUpdated: new Date().toISOString(),
      totalVoxels: voxels.length,
    },
    indexes: buildVoxelIndexes(voxels),
    voxels,
  };
}

/**
 * Load all inspections for a project from PostgreSQL.
 * Returns InspectionsCollection — same shape as previous JSON file format.
 * Replaces: loadInspections(projectId) in pm-decision-tools.ts
 */
export async function loadInspections(projectId: string): Promise<InspectionsCollection> {
  const prisma = getPrisma();
  const rows = await prisma.inspection.findMany({
    where: { project_id: projectId },
    orderBy: { created_at: 'desc' },
  });
  const inspections = rows.map(toInspection);

  // Restore ID counter
  if (inspections.length > 0) {
    const maxId = Math.max(
      ...inspections.map((i) => {
        const match = i.inspectionId.match(/INSP-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      }),
    );
    setIdCounter('inspection', maxId);
  }

  return {
    $schema: 'https://luhtech.dev/schemas/pm/inspections-collection.json',
    $id: buildFileURN(projectId, 'inspections'),
    schemaVersion: '3.0.0',
    meta: {
      projectId,
      sourceOfTruth: 'postgresql',
      lastUpdated: new Date().toISOString(),
      totalInspections: inspections.length,
    },
    indexes: buildInspectionIndexes(inspections),
    inspections,
  };
}

/**
 * Load all consequences for a project from PostgreSQL.
 * Returns ConsequencesCollection — same shape as previous JSON file format.
 * Replaces: loadConsequences(projectId) in pm-decision-tools.ts
 */
export async function loadConsequences(projectId: string): Promise<ConsequencesCollection> {
  const prisma = getPrisma();
  const rows = await prisma.consequence.findMany({
    where: { project_id: projectId },
    orderBy: { created_at: 'desc' },
  });
  const consequences = rows.map(toConsequence);

  // Restore ID counter
  if (consequences.length > 0) {
    const maxId = Math.max(
      ...consequences.map((c) => {
        const match = c.consequenceId.match(/CONSQ-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      }),
    );
    setIdCounter('consequence', maxId);
  }

  return {
    $schema: 'https://luhtech.dev/schemas/pm/consequences-collection.json',
    $id: buildFileURN(projectId, 'consequences'),
    schemaVersion: '3.0.0',
    meta: {
      projectId,
      sourceOfTruth: 'postgresql',
      lastUpdated: new Date().toISOString(),
      totalConsequences: consequences.length,
    },
    indexes: buildConsequenceIndexes(consequences),
    consequences,
  };
}

/**
 * Load all tolerance overrides for a project from PostgreSQL.
 * Returns ToleranceOverridesCollection — same shape as previous JSON file format.
 * Replaces: loadToleranceOverrides(projectId) in pm-decision-tools.ts
 */
export async function loadToleranceOverrides(projectId: string): Promise<ToleranceOverridesCollection> {
  const prisma = getPrisma();
  // ToleranceOverride doesn't have project_id directly — it's via voxel FK
  const rows = await prisma.toleranceOverride.findMany({
    where: { voxel: { project_id: projectId } },
    include: { voxel: { select: { urn: true } } },
    orderBy: { created_at: 'desc' },
  });
  const overrides = rows.map(toToleranceOverride);

  // Restore ID counter
  if (overrides.length > 0) {
    const maxId = Math.max(
      ...overrides.map((o) => {
        const match = o.overrideId.match(/TOL-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      }),
    );
    setIdCounter('tolerance-override', maxId);
  }

  return {
    $schema: 'https://luhtech.dev/schemas/pm/tolerance-overrides-collection.json',
    $id: buildFileURN(projectId, 'tolerance-overrides'),
    schemaVersion: '3.0.0',
    meta: {
      projectId,
      sourceOfTruth: 'postgresql',
      lastUpdated: new Date().toISOString(),
      totalOverrides: overrides.length,
    },
    indexes: buildToleranceOverrideIndexes(overrides),
    overrides,
  };
}

// ============================================================================
// Section 4: Save Functions (async, upsert-all pattern)
// ============================================================================

/**
 * Save all decisions in a collection to PostgreSQL.
 * Upserts every item — idempotent, no diff required.
 * Replaces: saveDecisions(projectId, collection) in pm-decision-tools.ts
 */
export async function saveDecisions(
  projectId: string,
  collection: PMDecisionsCollection,
): Promise<void> {
  const prisma = getPrisma();
  if (collection.decisions.length === 0) return;

  await prisma.$transaction(
    collection.decisions.map((d) => {
      const data = toDecisionRow(projectId, d);
      return prisma.pMDecision.upsert({
        where: { urn: d.$id as string },
        create: data as any,
        update: data as any,
      });
    }),
  );
}

/**
 * Save all voxels in a collection to PostgreSQL.
 * Upserts every item — idempotent, no diff required.
 * Replaces: saveVoxels(projectId, collection) in pm-decision-tools.ts
 */
export async function saveVoxels(
  projectId: string,
  collection: VoxelsCollection,
): Promise<void> {
  const prisma = getPrisma();
  if (collection.voxels.length === 0) return;

  await prisma.$transaction(
    collection.voxels.map((v) => {
      const data = toVoxelRow(projectId, v);
      return prisma.voxel.upsert({
        where: { urn: v.$id as string },
        create: data as any,
        update: data as any,
      });
    }),
  );
}

/**
 * Save all inspections in a collection to PostgreSQL.
 * Upserts every item — idempotent, no diff required.
 * Replaces: saveInspections(projectId, collection) in pm-decision-tools.ts
 */
export async function saveInspections(
  projectId: string,
  collection: InspectionsCollection,
): Promise<void> {
  const prisma = getPrisma();
  if (collection.inspections.length === 0) return;

  await prisma.$transaction(
    collection.inspections.map((i) => {
      const data = toInspectionRow(projectId, i);
      return prisma.inspection.upsert({
        where: { urn: i.$id as string },
        create: data as any,
        update: data as any,
      });
    }),
  );
}

/**
 * Save all consequences in a collection to PostgreSQL.
 * Upserts every item — idempotent, no diff required.
 * Resolves source_decision_id FK via URN→UUID lookup.
 * Replaces: saveConsequences(projectId, collection) in pm-decision-tools.ts
 */
export async function saveConsequences(
  projectId: string,
  collection: ConsequencesCollection,
): Promise<void> {
  const prisma = getPrisma();
  if (collection.consequences.length === 0) return;

  // Build URN→UUID map for FK resolution
  const decisionUrns = [
    ...new Set(collection.consequences.map((c) => c.sourceDecision as string)),
  ];
  const decisions = await prisma.pMDecision.findMany({
    where: { urn: { in: decisionUrns } },
    select: { id: true, urn: true },
  });
  const decisionUuidMap = new Map(decisions.map((d) => [d.urn, d.id]));

  await prisma.$transaction(
    collection.consequences.map((c) => {
      const data = toConsequenceRow(projectId, c, decisionUuidMap);
      return prisma.consequence.upsert({
        where: { urn: c.$id as string },
        create: data as any,
        update: data as any,
      });
    }),
  );
}

/**
 * Save all tolerance overrides in a collection to PostgreSQL.
 * Upserts every item — idempotent, no diff required.
 * Resolves voxel_id FK via URN→UUID lookup.
 * Replaces: saveToleranceOverrides(projectId, collection) in pm-decision-tools.ts
 */
export async function saveToleranceOverrides(
  projectId: string,
  collection: ToleranceOverridesCollection,
): Promise<void> {
  const prisma = getPrisma();
  if (collection.overrides.length === 0) return;

  // Build URN→UUID map for FK resolution
  const voxelUrns = [
    ...new Set(collection.overrides.map((o) => o.voxelRef as string)),
  ];
  const voxels = await prisma.voxel.findMany({
    where: { urn: { in: voxelUrns } },
    select: { id: true, urn: true },
  });
  const voxelUuidMap = new Map(voxels.map((v) => [v.urn, v.id]));

  await prisma.$transaction(
    collection.overrides.map((o) => {
      const data = toToleranceOverrideRow(o, voxelUuidMap);
      return prisma.toleranceOverride.upsert({
        where: { urn: o.$id as string },
        create: data as any,
        update: data as any,
      });
    }),
  );
}

// ============================================================================
// Index Builders (compute-on-read, same shape as JSON collections)
// ============================================================================

function buildDecisionIndexes(decisions: PMDecision[]) {
  const byStatus: Record<string, string[]> = {};
  const byVoxel: Record<string, string[]> = {};
  const byAuthorityLevel: Record<string, string[]> = {};

  for (const d of decisions) {
    const status = d.status ?? 'UNKNOWN';
    (byStatus[status] ??= []).push(d.decisionId);

    const voxelId = parseURN(d.voxelRef)?.identifier;
    if (voxelId) {
      (byVoxel[voxelId] ??= []).push(d.decisionId);
    }

    const level = String(d.authorityLevel?.required ?? 0);
    (byAuthorityLevel[level] ??= []).push(d.decisionId);
  }

  return { byStatus, byVoxel, byAuthorityLevel } as PMDecisionsCollection['indexes'];
}

function buildVoxelIndexes(voxels: Voxel[]) {
  const byStatus: Record<string, string[]> = {};
  const byLevel: Record<string, string[]> = {};
  const byZone: Record<string, string[]> = {};

  for (const v of voxels) {
    (byStatus[v.status] ??= []).push(v.voxelId);
    if (v.location?.level) {
      (byLevel[v.location.level] ??= []).push(v.voxelId);
    }
    if (v.location?.zone) {
      (byZone[v.location.zone] ??= []).push(v.voxelId);
    }
  }

  return { byStatus, byLevel, byZone } as VoxelsCollection['indexes'];
}

function buildInspectionIndexes(inspections: Inspection[]) {
  const byStatus: Record<string, string[]> = {};
  const byType: Record<string, string[]> = {};
  const byVoxel: Record<string, string[]> = {};

  for (const i of inspections) {
    (byStatus[i.status] ??= []).push(i.inspectionId);
    (byType[i.type] ??= []).push(i.inspectionId);
    const voxelId = parseURN(i.voxelRef)?.identifier;
    if (voxelId) {
      (byVoxel[voxelId] ??= []).push(i.inspectionId);
    }
  }

  return { byStatus, byType, byVoxel } as InspectionsCollection['indexes'];
}

function buildConsequenceIndexes(consequences: Consequence[]) {
  const byStatus: Record<string, string[]> = {};
  const byCategory: Record<string, string[]> = {};
  const bySeverity: Record<string, string[]> = {};

  for (const c of consequences) {
    (byStatus[c.status] ??= []).push(c.consequenceId);
    (byCategory[c.category] ??= []).push(c.consequenceId);
    (bySeverity[c.severity] ??= []).push(c.consequenceId);
  }

  return { byStatus, byCategory, bySeverity } as ConsequencesCollection['indexes'];
}

function buildToleranceOverrideIndexes(overrides: ToleranceOverride[]) {
  const byType: Record<string, string[]> = {};
  const byVoxel: Record<string, string[]> = {};
  const byStatus: Record<string, string[]> = {};

  for (const o of overrides) {
    (byType[o.toleranceType] ??= []).push(o.overrideId);
    const voxelId = parseURN(o.voxelRef)?.identifier;
    if (voxelId) {
      (byVoxel[voxelId] ??= []).push(o.overrideId);
    }
    (byStatus[o.status] ??= []).push(o.overrideId);
  }

  return { byType, byVoxel, byStatus } as ToleranceOverridesCollection['indexes'];
}
