#!/usr/bin/env node
/**
 * Synthetic Decision Data Generator for Ectropy Demo
 *
 * Generates V3-compliant PM decisions, consequences, voxels, and participants
 * for the Canadian Plant Pilot (Maple Ridge Industrial Facility)
 *
 * Usage: node generate-synthetic-data.js [outputDir]
 *
 * @version 1.0.0
 * @date 2026-01-08
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectId: 'canadian-plant-pilot',
  projectName: 'Maple Ridge Industrial Facility',
  schemaVersion: '3.0.0',
  seed: 20260108,

  decisionCount: 75,
  voxelCount: 200,
  consequenceRatio: 0.3,

  timing: {
    avgResponseDays: 6.4,
    medianResponseDays: 9.7,
    unansweredRate: 0.22,
  },

  authorityLevels: {
    FIELD: 0,
    FOREMAN: 1,
    SUPERINTENDENT: 2,
    PM: 3,
    ARCHITECT_ENGINEER: 4,
    OWNER: 5,
    REGULATORY: 6,
  },

  budgetThresholds: [0, 2500, 7500, 37500, 75000, 150000, Infinity],
};

// ============================================================================
// ZONE DEFINITIONS
// ============================================================================

const ZONES = {
  'ZONE-A': {
    id: 'ZONE-A',
    name: 'Manufacturing Hall',
    bounds: { minX: 0, maxX: 50, minY: 0, maxY: 35, minZ: 0, maxZ: 10 },
    trades: ['STRUCTURAL', 'CONCRETE', 'ELECTRICAL', 'MECHANICAL'],
    decisionWeight: 0.35,
  },
  'ZONE-B': {
    id: 'ZONE-B',
    name: 'Office Block',
    bounds: { minX: 50, maxX: 80, minY: 0, maxY: 25, minZ: 4, maxZ: 10 },
    trades: ['DRYWALL', 'ELECTRICAL', 'HVAC', 'FLOORING'],
    decisionWeight: 0.2,
  },
  'ZONE-C': {
    id: 'ZONE-C',
    name: 'Loading/Receiving',
    bounds: { minX: 0, maxX: 30, minY: 35, maxY: 50, minZ: 0, maxZ: 6 },
    trades: ['CONCRETE', 'ELECTRICAL', 'DOORS'],
    decisionWeight: 0.15,
  },
  'ZONE-D': {
    id: 'ZONE-D',
    name: 'MEP Core',
    bounds: { minX: 30, maxX: 40, minY: 20, maxY: 30, minZ: 0, maxZ: 15 },
    trades: ['ELECTRICAL', 'MECHANICAL', 'PLUMBING', 'FIRE_PROTECTION'],
    decisionWeight: 0.2,
  },
  'ZONE-E': {
    id: 'ZONE-E',
    name: 'Site/Exterior',
    bounds: { minX: 0, maxX: 80, minY: 0, maxY: 50, minZ: 10, maxZ: 15 },
    trades: ['ROOFING', 'ENVELOPE', 'SITEWORK'],
    decisionWeight: 0.1,
  },
};

// ============================================================================
// PARTICIPANTS
// ============================================================================

const PARTICIPANTS = [
  {
    id: 'tom-bradley',
    name: 'Tom Bradley',
    role: 'Ironworker Journeyman',
    company: 'BC Steel Erectors',
    level: 0,
    zones: ['ZONE-A'],
  },
  {
    id: 'maria-santos',
    name: 'Maria Santos',
    role: 'Electrician',
    company: 'Maple Electric Ltd',
    level: 0,
    zones: ['ZONE-D', 'ZONE-A'],
  },
  {
    id: 'kevin-nguyen',
    name: 'Kevin Nguyen',
    role: 'Structural Foreman',
    company: 'BC Steel Erectors',
    level: 1,
    zones: ['ZONE-A', 'ZONE-C'],
    budgetLimit: 2500,
  },
  {
    id: 'lisa-chen',
    name: 'Lisa Chen',
    role: 'Electrical Foreman',
    company: 'Maple Electric Ltd',
    level: 1,
    zones: ['ZONE-D', 'ZONE-B'],
    budgetLimit: 2500,
  },
  {
    id: 'mike-wilson',
    name: 'Mike Wilson',
    role: 'General Superintendent',
    company: 'Maple Builders GC',
    level: 2,
    zones: ['ALL'],
    budgetLimit: 7500,
  },
  {
    id: 'jennifer-park',
    name: 'Jennifer Park',
    role: 'MEP Superintendent',
    company: 'Maple Builders GC',
    level: 2,
    zones: ['ZONE-D', 'ZONE-E'],
    budgetLimit: 7500,
  },
  {
    id: 'sarah-thompson',
    name: 'Sarah Thompson',
    role: 'Project Manager',
    company: 'Maple Builders GC',
    level: 3,
    zones: ['ALL'],
    budgetLimit: 37500,
  },
  {
    id: 'james-wright',
    name: 'James Wright',
    role: 'Structural Engineer',
    company: 'Wright Engineering',
    level: 4,
    zones: ['ALL'],
  },
  {
    id: 'amanda-foster',
    name: 'Amanda Foster',
    role: 'Project Architect',
    company: 'Foster Design Group',
    level: 4,
    zones: ['ALL'],
  },
  {
    id: 'robert-chen',
    name: 'Robert Chen',
    role: 'Owner Representative',
    company: 'Maple Ridge Industries',
    level: 5,
    zones: ['ALL'],
    budgetLimit: 150000,
  },
  {
    id: 'inspector-williams',
    name: 'David Williams',
    role: 'Building Inspector',
    company: 'City of Maple Ridge',
    level: 6,
    zones: ['ALL'],
  },
  {
    id: 'inspector-garcia',
    name: 'Elena Garcia',
    role: 'Electrical Inspector',
    company: 'BC Safety Authority',
    level: 6,
    zones: ['ALL'],
  },
  {
    id: 'inspector-patel',
    name: 'Raj Patel',
    role: 'Fire Inspector',
    company: 'Maple Ridge Fire Dept',
    level: 6,
    zones: ['ALL'],
  },
];

// ============================================================================
// DECISION TEMPLATES
// ============================================================================

const DECISION_TEMPLATES = {
  MATERIAL_SUBSTITUTION: {
    weight: 0.2,
    templates: [
      {
        title: 'Steel Beam Substitution W12x26 to W12x30',
        budgetRange: [1500, 5000],
        scheduleRange: [0, 2],
        zone: 'ZONE-A',
      },
      {
        title: 'Concrete Mix Design Change 4000 PSI to 4500 PSI',
        budgetRange: [0, 3000],
        scheduleRange: [0, 1],
        zone: 'ZONE-A',
      },
      {
        title: 'Electrical Conduit Material - EMT to Rigid',
        budgetRange: [500, 2500],
        scheduleRange: [0, 1],
        zone: 'ZONE-D',
      },
      {
        title: 'Roofing Membrane Substitution',
        budgetRange: [2000, 8000],
        scheduleRange: [1, 3],
        zone: 'ZONE-E',
      },
      {
        title: 'Door Hardware Manufacturer Change',
        budgetRange: [0, 1500],
        scheduleRange: [0, 0],
        zone: 'ZONE-B',
      },
    ],
  },
  DESIGN_CLARIFICATION: {
    weight: 0.25,
    templates: [
      {
        title: 'RFI: Column Grid Dimension Clarification',
        budgetRange: [0, 0],
        scheduleRange: [0, 0],
        zone: 'ZONE-A',
      },
      {
        title: 'RFI: Electrical Panel Location Confirmation',
        budgetRange: [0, 0],
        scheduleRange: [0, 0],
        zone: 'ZONE-D',
      },
      {
        title: 'RFI: Door Swing Direction Confirmation',
        budgetRange: [0, 0],
        scheduleRange: [0, 0],
        zone: 'ZONE-B',
      },
      {
        title: 'RFI: Structural Connection Detail',
        budgetRange: [0, 0],
        scheduleRange: [0, 0],
        zone: 'ZONE-A',
      },
      {
        title: 'RFI: Fire Rating Requirement Clarification',
        budgetRange: [0, 0],
        scheduleRange: [0, 0],
        zone: 'ZONE-D',
      },
      {
        title: 'RFI: Dock Leveler Electrical Requirements',
        budgetRange: [0, 0],
        scheduleRange: [0, 0],
        zone: 'ZONE-C',
      },
    ],
  },
  COORDINATION_ISSUE: {
    weight: 0.2,
    templates: [
      {
        title: 'MEP Clash: Duct vs Beam Conflict',
        budgetRange: [1000, 5000],
        scheduleRange: [1, 3],
        zone: 'ZONE-D',
      },
      {
        title: 'Electrical Panel Conflict with HVAC Duct',
        budgetRange: [2000, 8000],
        scheduleRange: [2, 5],
        zone: 'ZONE-D',
      },
      {
        title: 'Conduit Routing Through Structural Member',
        budgetRange: [500, 3000],
        scheduleRange: [1, 2],
        zone: 'ZONE-A',
      },
      {
        title: 'Fire Sprinkler Head Spacing Conflict',
        budgetRange: [1000, 4000],
        scheduleRange: [1, 2],
        zone: 'ZONE-D',
      },
      {
        title: 'Ceiling Height Coordination Issue',
        budgetRange: [0, 2000],
        scheduleRange: [0, 1],
        zone: 'ZONE-B',
      },
    ],
  },
  SCHEDULE_IMPACT: {
    weight: 0.15,
    templates: [
      {
        title: 'Steel Delivery Delay - 10 Days',
        budgetRange: [0, 15000],
        scheduleRange: [5, 14],
        zone: 'ZONE-A',
      },
      {
        title: 'Weather Delay - Concrete Pour Rescheduled',
        budgetRange: [0, 5000],
        scheduleRange: [2, 5],
        zone: 'ZONE-A',
      },
      {
        title: 'Equipment Rental Extension Required',
        budgetRange: [3000, 10000],
        scheduleRange: [3, 7],
        zone: 'ZONE-A',
      },
      {
        title: 'Inspection Delay - Rescheduling Required',
        budgetRange: [0, 2000],
        scheduleRange: [1, 3],
        zone: 'ZONE-D',
      },
      {
        title: 'Weekend Overtime Authorization',
        budgetRange: [5000, 25000],
        scheduleRange: [-3, -1],
        zone: 'ZONE-A',
      },
    ],
  },
  SAFETY_COMPLIANCE: {
    weight: 0.1,
    templates: [
      {
        title: 'Fall Protection Plan Modification',
        budgetRange: [0, 3000],
        scheduleRange: [0, 1],
        zone: 'ZONE-E',
      },
      {
        title: 'Temporary Scaffolding Configuration',
        budgetRange: [500, 2500],
        scheduleRange: [0, 1],
        zone: 'ZONE-A',
      },
      {
        title: 'Hot Work Permit Extension Request',
        budgetRange: [0, 500],
        scheduleRange: [0, 0],
        zone: 'ZONE-A',
      },
    ],
  },
  CHANGE_ORDER: {
    weight: 0.1,
    templates: [
      {
        title: 'Owner-Requested Additional Electrical Outlets',
        budgetRange: [5000, 20000],
        scheduleRange: [2, 5],
        zone: 'ZONE-B',
      },
      {
        title: 'Unforeseen Condition: Additional Foundation Work',
        budgetRange: [15000, 50000],
        scheduleRange: [5, 10],
        zone: 'ZONE-A',
      },
      {
        title: 'Design Change: Conference Room Expansion',
        budgetRange: [10000, 30000],
        scheduleRange: [3, 7],
        zone: 'ZONE-B',
      },
    ],
  },
};

// ============================================================================
// SEEDED RANDOM
// ============================================================================

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  pick(array) {
    return array[this.nextInt(0, array.length - 1)];
  }

  weightedPick(items) {
    const totalWeight = items.reduce(
      (sum, item) => sum + (item.weight || 1),
      0
    );
    let random = this.next() * totalWeight;
    for (const item of items) {
      random -= item.weight || 1;
      if (random <= 0) {
        return item;
      }
    }
    return items[items.length - 1];
  }
}

// ============================================================================
// GENERATORS
// ============================================================================

function generateVoxels(rng) {
  const voxels = [];
  const statuses = [
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETE',
    'BLOCKED',
    'INSPECTION_REQUIRED',
  ];
  const statusWeights = [0.15, 0.35, 0.35, 0.1, 0.05];

  for (const [zoneId, zone] of Object.entries(ZONES)) {
    const { bounds } = zone;
    const count = Math.floor(CONFIG.voxelCount * zone.decisionWeight);

    for (let i = 0; i < count; i++) {
      const x = rng.nextInt(bounds.minX, bounds.maxX);
      const y = rng.nextInt(bounds.minY, bounds.maxY);
      const z = rng.nextInt(bounds.minZ, bounds.maxZ);

      let statusRandom = rng.next();
      let statusIndex = 0;
      for (let j = 0; j < statusWeights.length; j++) {
        statusRandom -= statusWeights[j];
        if (statusRandom <= 0) {
          statusIndex = j;
          break;
        }
      }

      voxels.push({
        $id: `urn:luhtech:${CONFIG.projectId}:voxel:VOX-${zoneId}-${x}-${y}-${z}`,
        $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json',
        schemaVersion: CONFIG.schemaVersion,
        voxelId: `VOX-${zoneId}-${x}-${y}-${z}`,
        zone: zoneId,
        zoneName: zone.name,
        coordinates: { x, y, z },
        status: statuses[statusIndex],
        trades: zone.trades,
        decisions: [],
        inspections: [],
        graphMetadata: { inEdges: [], outEdges: [] },
      });
    }
  }
  return voxels;
}

function calculateAuthority(budgetImpact, scheduleImpact, category) {
  let authority = 0;
  for (let i = 0; i < CONFIG.budgetThresholds.length; i++) {
    if (budgetImpact <= CONFIG.budgetThresholds[i]) {
      authority = i;
      break;
    }
  }
  if (scheduleImpact > 7) {
    authority = Math.max(authority, 3);
  }
  if (scheduleImpact > 14) {
    authority = Math.max(authority, 5);
  }
  if (category === 'SAFETY_COMPLIANCE') {
    authority = Math.max(authority, 2);
  }
  if (category === 'CHANGE_ORDER') {
    authority = Math.max(authority, 3);
  }
  return Math.min(authority, 6);
}

function getParticipant(level, zone, rng) {
  const eligible = PARTICIPANTS.filter(
    (p) =>
      p.level === level && (p.zones.includes('ALL') || p.zones.includes(zone))
  );
  return eligible.length > 0
    ? rng.pick(eligible)
    : PARTICIPANTS.find((p) => p.level === level);
}

function randomDate(rng, start, end) {
  return new Date(rng.nextInt(start.getTime(), end.getTime()));
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function generateDecisions(rng, voxels) {
  const decisions = [];
  const demoStart = new Date('2026-02-01');
  const demoEnd = new Date('2026-04-30');

  const categories = Object.entries(DECISION_TEMPLATES).map(([key, val]) => ({
    key,
    ...val,
  }));

  for (let seq = 1; seq <= CONFIG.decisionCount; seq++) {
    const category = rng.weightedPick(categories);
    const template = rng.pick(category.templates);

    const zoneVoxels = voxels.filter((v) => v.zone === template.zone);
    const voxel =
      zoneVoxels.length > 0 ? rng.pick(zoneVoxels) : rng.pick(voxels);

    const budgetImpact = rng.nextInt(
      template.budgetRange[0],
      template.budgetRange[1]
    );
    const scheduleImpact = rng.nextInt(
      template.scheduleRange[0],
      template.scheduleRange[1]
    );
    const requiredAuthority = calculateAuthority(
      budgetImpact,
      scheduleImpact,
      category.key
    );

    const requester = getParticipant(
      Math.min(requiredAuthority, 2),
      voxel.zone,
      rng
    );
    const createdAt = randomDate(rng, demoStart, demoEnd);

    const statusRandom = rng.next();
    let status,
      approvedBy = null,
      approvedAt = null;

    if (statusRandom < CONFIG.timing.unansweredRate) {
      status = 'PENDING';
    } else {
      const responseDelayDays = Math.round(
        rng.nextFloat(1, CONFIG.timing.avgResponseDays * 2)
      );
      if (rng.next() > 0.15) {
        status = 'APPROVED';
        const approver = getParticipant(requiredAuthority, voxel.zone, rng);
        approvedBy = `urn:luhtech:${CONFIG.projectId}:participant:${approver?.id || 'sarah-thompson'}`;
        approvedAt = addDays(createdAt, responseDelayDays);
      } else {
        status = 'REJECTED';
      }
    }

    const decisionId = `DEC-2026-${String(seq).padStart(4, '0')}`;
    const decision = {
      $id: `urn:luhtech:${CONFIG.projectId}:pm-decision:${decisionId}`,
      $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json',
      schemaVersion: CONFIG.schemaVersion,
      meta: {
        projectId: CONFIG.projectId,
        sourceOfTruth: `data/projects/${CONFIG.projectId}/decisions.json`,
        lastUpdated: new Date().toISOString(),
        syncStatus: { syncDirection: 'v3-is-source-of-truth' },
      },
      decisionId,
      title: template.title,
      description: `Decision regarding ${template.title.toLowerCase()}. ${category.key.replace(/_/g, ' ').toLowerCase()} requiring review.`,
      category: category.key,
      type:
        status === 'PENDING'
          ? 'PROPOSAL'
          : status === 'APPROVED'
            ? 'APPROVAL'
            : 'REJECTION',
      status,
      authorityLevel: {
        required: requiredAuthority,
        current:
          status === 'APPROVED'
            ? requiredAuthority
            : Math.min(requiredAuthority - 1, 2),
      },
      voxelRef: voxel.$id,
      voxelContext: {
        voxelId: voxel.voxelId,
        coordinates: voxel.coordinates,
        zone: voxel.zone,
        zoneName: voxel.zoneName,
      },
      budgetImpact: { estimated: budgetImpact, currency: 'CAD' },
      scheduleImpact: {
        delayDays: scheduleImpact,
        criticalPath: scheduleImpact > 5,
      },
      participants: {
        requestedBy: `urn:luhtech:${CONFIG.projectId}:participant:${requester?.id || 'mike-wilson'}`,
        ...(approvedBy && { approvedBy }),
      },
      timestamps: {
        createdAt: createdAt.toISOString(),
        updatedAt: (approvedAt || createdAt).toISOString(),
        ...(approvedAt && { approvedAt: approvedAt.toISOString() }),
      },
      consequences: [],
      relatedDecisions: [],
      graphMetadata: {
        inEdges: [voxel.$id],
        outEdges: [],
        edges: [
          {
            from: voxel.$id,
            to: `urn:luhtech:${CONFIG.projectId}:pm-decision:${decisionId}`,
            type: 'contains',
          },
        ],
      },
    };

    voxel.decisions.push(decision.$id);
    voxel.graphMetadata.outEdges.push(decision.$id);
    decisions.push(decision);
  }
  return decisions;
}

function generateConsequences(rng, decisions) {
  const consequences = [];
  const templates = [
    {
      category: 'SCHEDULE_DELAY',
      severity: 'MINOR',
      scheduleImpact: [1, 3],
      budgetImpact: [0, 2000],
    },
    {
      category: 'SCHEDULE_DELAY',
      severity: 'MODERATE',
      scheduleImpact: [3, 7],
      budgetImpact: [2000, 10000],
    },
    {
      category: 'COST_INCREASE',
      severity: 'MINOR',
      scheduleImpact: [0, 0],
      budgetImpact: [500, 5000],
    },
    {
      category: 'REWORK_REQUIRED',
      severity: 'MINOR',
      scheduleImpact: [1, 2],
      budgetImpact: [1000, 5000],
    },
  ];

  let seq = 1;
  const eligible = decisions.filter(
    (d) =>
      d.status === 'APPROVED' &&
      (d.budgetImpact.estimated > 0 || d.scheduleImpact.delayDays > 0)
  );

  for (const decision of eligible) {
    if (rng.next() > CONFIG.consequenceRatio) {
      continue;
    }

    const template = rng.pick(templates);
    const consequenceId = `CONSQ-2026-${String(seq).padStart(4, '0')}`;

    const consequence = {
      $id: `urn:luhtech:${CONFIG.projectId}:consequence:${consequenceId}`,
      $schema: 'https://luhtech.dev/schemas/pm/consequence.schema.json',
      schemaVersion: CONFIG.schemaVersion,
      consequenceId,
      title: `${template.category.replace(/_/g, ' ')} - ${template.severity}`,
      category: template.category,
      severity: template.severity,
      sourceDecision: decision.$id,
      budgetDelta: rng.nextInt(
        template.budgetImpact[0],
        template.budgetImpact[1]
      ),
      scheduleDelta: rng.nextInt(
        template.scheduleImpact[0],
        template.scheduleImpact[1]
      ),
      affectedZones: [decision.voxelContext.zone],
      status: 'REALIZED',
      timestamps: {
        createdAt:
          decision.timestamps.approvedAt || decision.timestamps.createdAt,
        realizedAt:
          decision.timestamps.approvedAt || decision.timestamps.createdAt,
      },
      graphMetadata: { inEdges: [decision.$id], outEdges: [] },
    };

    decision.consequences.push(consequence.$id);
    decision.graphMetadata.outEdges.push(consequence.$id);
    consequences.push(consequence);
    seq++;
  }
  return consequences;
}

function generateInspections(rng, voxels) {
  const inspections = [];
  const types = ['ROUGH_IN', 'COVER_UP', 'FINAL', 'SAFETY', 'QUALITY'];
  const inspectors = PARTICIPANTS.filter((p) => p.level === 6);

  for (let seq = 1; seq <= 20; seq++) {
    const voxel = rng.pick(voxels);
    const inspector = rng.pick(inspectors);
    const scheduledDate = randomDate(
      rng,
      new Date('2026-02-01'),
      new Date('2026-04-30')
    );

    const statusRandom = rng.next();
    let status,
      completedAt = null;
    if (statusRandom < 0.3) {
      status = 'SCHEDULED';
    } else if (statusRandom < 0.7) {
      status = 'PASSED';
      completedAt = addDays(scheduledDate, rng.nextInt(0, 2));
    } else if (statusRandom < 0.85) {
      status = 'FAILED';
      completedAt = addDays(scheduledDate, rng.nextInt(0, 2));
    } else {
      status = 'CONDITIONAL';
      completedAt = addDays(scheduledDate, rng.nextInt(0, 2));
    }

    const inspectionId = `INSP-2026-${String(seq).padStart(4, '0')}`;
    inspections.push({
      $id: `urn:luhtech:${CONFIG.projectId}:inspection:${inspectionId}`,
      $schema: 'https://luhtech.dev/schemas/pm/inspection.schema.json',
      schemaVersion: CONFIG.schemaVersion,
      inspectionId,
      type: rng.pick(types),
      status,
      voxelRef: voxel.$id,
      voxelContext: {
        voxelId: voxel.voxelId,
        zone: voxel.zone,
        zoneName: voxel.zoneName,
      },
      inspector: `urn:luhtech:${CONFIG.projectId}:participant:${inspector.id}`,
      inspectorName: inspector.name,
      timestamps: {
        scheduledAt: scheduledDate.toISOString(),
        ...(completedAt && { completedAt: completedAt.toISOString() }),
      },
      graphMetadata: { inEdges: [voxel.$id], outEdges: [] },
    });
    voxel.inspections.push(inspections[inspections.length - 1].$id);
  }
  return inspections;
}

function generateParticipantRecords() {
  const levelNames = Object.keys(CONFIG.authorityLevels);
  return PARTICIPANTS.map((p) => ({
    $id: `urn:luhtech:${CONFIG.projectId}:participant:${p.id}`,
    $schema: 'https://luhtech.dev/schemas/pm/participant.schema.json',
    schemaVersion: CONFIG.schemaVersion,
    participantId: p.id,
    name: p.name,
    role: p.role,
    company: p.company,
    authorityLevel: p.level,
    authorityLevelName: levelNames[p.level],
    zones: p.zones,
    budgetLimit: p.budgetLimit,
    contact: {
      email: `${p.id.replace(/-/g, '.')}@${p.company.toLowerCase().replace(/\s+/g, '')}.ca`,
      phone: `+1-604-555-${String(1000 + PARTICIPANTS.indexOf(p)).slice(-4)}`,
    },
    graphMetadata: { inEdges: [], outEdges: [] },
  }));
}

function generateProjectConfig() {
  return {
    $id: `urn:luhtech:${CONFIG.projectId}:project:config`,
    $schema: 'https://luhtech.dev/schemas/pm/project-config.schema.json',
    schemaVersion: CONFIG.schemaVersion,
    projectId: CONFIG.projectId,
    name: CONFIG.projectName,
    description: '150,000 sq ft manufacturing plant with office space',
    location: {
      address: '1250 Industrial Parkway',
      city: 'Maple Ridge',
      province: 'British Columbia',
      country: 'Canada',
      coordinates: { lat: 49.2194, lng: -122.5984 },
      timezone: 'America/Vancouver',
    },
    budget: { total: 25000000, currency: 'CAD' },
    schedule: {
      startDate: '2026-01-06',
      targetCompletion: '2026-12-31',
      currentPhase: 'CONSTRUCTION',
    },
    zones: Object.values(ZONES).map((z) => ({ id: z.id, name: z.name })),
    authorityLevels: Object.entries(CONFIG.authorityLevels).map(
      ([name, level]) => ({
        level,
        name,
        budgetThreshold: CONFIG.budgetThresholds[level],
      })
    ),
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🏗️  Ectropy Synthetic Data Generator');
  console.log('====================================\n');

  const rng = new SeededRandom(CONFIG.seed);

  console.log('📦 Generating voxels...');
  const voxels = generateVoxels(rng);
  console.log(`   Created ${voxels.length} voxels\n`);

  console.log('📋 Generating decisions...');
  const decisions = generateDecisions(rng, voxels);
  console.log(`   Created ${decisions.length} decisions\n`);

  console.log('⚡ Generating consequences...');
  const consequences = generateConsequences(rng, decisions);
  console.log(`   Created ${consequences.length} consequences\n`);

  console.log('🔍 Generating inspections...');
  const inspections = generateInspections(rng, voxels);
  console.log(`   Created ${inspections.length} inspections\n`);

  console.log('👥 Generating participants...');
  const participants = generateParticipantRecords();
  console.log(`   Created ${participants.length} participants\n`);

  console.log('⚙️  Generating project config...');
  const projectConfig = generateProjectConfig();

  // Statistics
  console.log('\n📊 Generation Summary');
  console.log('--------------------');
  console.log(`   Voxels: ${voxels.length}`);
  console.log(`   Decisions: ${decisions.length}`);
  console.log(
    `   - Approved: ${decisions.filter((d) => d.status === 'APPROVED').length}`
  );
  console.log(
    `   - Pending: ${decisions.filter((d) => d.status === 'PENDING').length}`
  );
  console.log(
    `   - Rejected: ${decisions.filter((d) => d.status === 'REJECTED').length}`
  );
  console.log(`   Consequences: ${consequences.length}`);
  console.log(`   Inspections: ${inspections.length}`);

  // Category distribution
  console.log('\n📈 Decision Categories:');
  const categoryCount = {};
  for (const d of decisions) {
    categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(categoryCount).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(
      `   ${cat}: ${count} (${Math.round((count / decisions.length) * 100)}%)`
    );
  }

  // Zone distribution
  console.log('\n🗺️  Decisions by Zone:');
  const zoneCount = {};
  for (const d of decisions) {
    const zone = d.voxelContext.zone;
    zoneCount[zone] = (zoneCount[zone] || 0) + 1;
  }
  for (const [zone, count] of Object.entries(zoneCount).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`   ${zone} (${ZONES[zone]?.name}): ${count}`);
  }

  // Output
  const outputDir = process.argv[2] || './data/projects/canadian-plant-pilot';
  console.log(`\n💾 Writing to ${outputDir}...`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = {
    'project-config.json': projectConfig,
    'participants.json': participants,
    'voxels.json': voxels,
    'decisions.json': decisions,
    'consequences.json': consequences,
    'inspections.json': inspections,
  };

  for (const [filename, data] of Object.entries(files)) {
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`   Written: ${filepath}`);
  }

  // Combined file
  const allData = {
    projectConfig,
    participants,
    voxels,
    decisions,
    consequences,
    inspections,
  };
  fs.writeFileSync(
    path.join(outputDir, 'all-data.json'),
    JSON.stringify(allData, null, 2)
  );
  console.log(`   Written: ${path.join(outputDir, 'all-data.json')}`);

  console.log('\n✅ Synthetic data generation complete!');
}

main();
