/**
 * ============================================================================
 * RFI STORM SCENARIO
 * ============================================================================
 * Demonstrates problem resolution and coordination challenges when
 * multiple RFIs flood in during a critical phase. Shows the platform's
 * ability to prioritize, coordinate, and resolve issues efficiently.
 *
 * Building Type: Duplex (Ifc2x3_Duplex_Architecture.ifc)
 * Duration: 10 weeks
 * Complexity: Medium
 * Focus: Problem resolution, collaboration, coordination
 *
 * @module @ectropy/demo-scenarios/scenarios
 * @version 1.0.0
 * ============================================================================
 */

import type {
  DemoScenario,
  BuildingConfig,
  ScenarioEvent,
  ScenarioMilestone,
  TalkingPoint,
  TimelinePosition,
} from '../types/index.js';
import { createDemoCast } from '../personas/index.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// BUILDING CONFIGURATION
// ============================================================================

const duplexBuilding: BuildingConfig = {
  type: 'duplex',
  ifcFile: 'Ifc2x3_Duplex_Architecture.ifc',
  name: 'Urban Duplex Development',
  description: 'Modern side-by-side duplex with shared systems and mirrored floor plans. Complex coordination required between units.',
  squareFeet: 3800,
  levels: 2,
  systems: ['structural', 'mechanical', 'electrical', 'plumbing', 'fire_protection'],
  phases: [
    { phase: 'preconstruction', startWeek: 0, endWeek: 1 },
    { phase: 'sitework', startWeek: 1, endWeek: 2 },
    { phase: 'foundation', startWeek: 2, endWeek: 3 },
    { phase: 'structure', startWeek: 3, endWeek: 5 },
    { phase: 'rough_in', startWeek: 5, endWeek: 7 },
    { phase: 'finishes', startWeek: 8, endWeek: 9 },
    { phase: 'commissioning', startWeek: 9, endWeek: 10 },
    { phase: 'closeout', startWeek: 10, endWeek: 10 },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEventId(): string {
  return `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;
}

function createPosition(week: number, day: number, hour: number): TimelinePosition {
  return { week, day, hour };
}

// ============================================================================
// WEEK 1-2: NORMAL START
// ============================================================================

const normalStartEvents: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(1, 1, 9),
    type: 'milestone',
    actor: 'owner',
    priority: 'high',
    title: 'Duplex Project Kickoff',
    description: 'Project kickoff for urban duplex development with dual-unit coordination',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Project Kickoff',
      phase: 'preconstruction',
      percentComplete: 0,
      deliverables: ['Dual-unit coordination plan', 'Shared systems strategy', 'Unit A/B identification'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(1, 2, 10),
    type: 'upload',
    actor: 'architect',
    priority: 'high',
    title: 'Duplex BIM Model Upload',
    description: 'Architect uploads duplex IFC model with both units',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'upload',
      fileType: 'ifc',
      fileName: 'Ifc2x3_Duplex_Architecture.ifc',
      fileSize: 4500000,
      description: 'Complete duplex model with Unit A and Unit B, shared party wall, and common systems',
      version: '1.0',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(2, 1, 7),
    type: 'milestone',
    actor: 'contractor',
    priority: 'normal',
    title: 'Site Work & Foundation',
    description: 'Combined foundation pour for both units',
    voxelRefs: ['VOX-L0-FND-A01', 'VOX-L0-FND-B01', 'VOX-L0-FND-SHARED'],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Foundation Start',
      phase: 'foundation',
      percentComplete: 15,
      deliverables: ['Combined slab', 'Party wall foundation', 'Unit demarcation'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'normal',
    },
  },
];

// ============================================================================
// WEEK 3: THE RFI STORM BEGINS
// ============================================================================

const rfiStormEvents: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 8),
    type: 'alert',
    actor: 'system',
    priority: 'high',
    title: 'Coordination Conflict Detected',
    description: 'System detects multiple trade conflicts at party wall',
    voxelRefs: ['VOX-L1-PARTY-001', 'VOX-L1-PARTY-002'],
    decisionRefs: [],
    payload: {
      type: 'alert',
      alertType: 'coordination_conflict',
      severity: 'warning',
      message: 'MEP systems from Unit A and Unit B conflict at party wall chase. 12 potential clashes identified.',
      requiresAcknowledgment: true,
    },
    consequences: [
      {
        category: 'COORDINATION_CONFLICT',
        description: 'Multiple trade coordination issues at party wall',
        severity: 'medium',
      },
    ],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 9),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #001: Party Wall HVAC Routing',
    description: 'HVAC contractor questions duct routing through party wall',
    voxelRefs: ['VOX-L1-PARTY-001'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-001',
      subject: 'HVAC Duct Routing at Party Wall',
      question: 'Drawings show supply ducts for both units passing through party wall chase at same elevation. Physical space insufficient for both. Which unit takes priority?',
      requestor: 'contractor',
      assignedTo: 'engineer',
      dueDate: createPosition(3, 2, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 9),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #002: Electrical Panel Location',
    description: 'Electrician questions panel locations relative to water heaters',
    voxelRefs: ['VOX-L1-UTIL-A01', 'VOX-L1-UTIL-B01'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-002',
      subject: 'Electrical Panel Clearance to Water Heaters',
      question: 'Unit B panel as shown is 28" from water heater. NEC requires 30" working clearance. Should we move panel or water heater?',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 2, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 10),
    type: 'rfi',
    actor: 'contractor',
    priority: 'critical',
    title: 'RFI #003: Fire Rating at Party Wall',
    description: 'Fire protection concern at party wall penetrations',
    voxelRefs: ['VOX-L1-PARTY-001', 'VOX-L1-PARTY-002', 'VOX-L2-PARTY-001'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-003',
      subject: 'Fire Rating Maintenance at Party Wall Penetrations',
      question: 'With 12 MEP penetrations through 2-hour party wall, how should fire stopping be detailed? Standard firestop caulk insufficient for duct penetrations.',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 2, 12),
      status: 'open',
    },
    consequences: [
      {
        category: 'REGULATORY_CONCERN',
        description: 'Fire code compliance at party wall',
        severity: 'high',
      },
    ],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 11),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #004: Plumbing Stack Conflict',
    description: 'Plumbing stacks conflict at second floor',
    voxelRefs: ['VOX-L2-PLUMB-A01', 'VOX-L2-PLUMB-B01'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-004',
      subject: 'Plumbing Stack Conflict at Second Floor',
      question: 'Unit A and Unit B bathroom stacks as designed would occupy same joist bay. Is shared stack acceptable or should Unit B shift 16"?',
      requestor: 'contractor',
      assignedTo: 'engineer',
      dueDate: createPosition(3, 2, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 13),
    type: 'rfi',
    actor: 'contractor',
    priority: 'normal',
    title: 'RFI #005: Window Header Sizing',
    description: 'Structural question on window headers',
    voxelRefs: ['VOX-L1-STR-A03', 'VOX-L1-STR-B03'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-005',
      subject: 'Window Header Size Discrepancy',
      question: 'Architectural shows 4x10 header at 6\' window. Structural shows 4x12. Which is correct?',
      requestor: 'contractor',
      assignedTo: 'engineer',
      dueDate: createPosition(3, 3, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 14),
    type: 'rfi',
    actor: 'contractor',
    priority: 'normal',
    title: 'RFI #006: Exterior Finish at Unit Transition',
    description: 'Question about siding detail at unit demarcation',
    voxelRefs: ['VOX-L1-EXT-001'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-006',
      subject: 'Siding Detail at Unit Transition',
      question: 'No detail shown for siding transition between units. Should there be a reveal, or continuous siding?',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 4, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 14),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #007: Shared Meter Location',
    description: 'Utility meter placement question',
    voxelRefs: ['VOX-L0-EXT-001'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-007',
      subject: 'Electric and Gas Meter Locations',
      question: 'Utility company requires meters on street-facing wall. Design shows them on side. Need new location that satisfies both utility and design intent.',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 3, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 15),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #008: HVAC Equipment Sizing',
    description: 'Equipment sizing question for split systems',
    voxelRefs: ['VOX-L1-MECH-A01', 'VOX-L1-MECH-B01'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-008',
      subject: 'HVAC Equipment Sizing Confirmation',
      question: 'Mechanical schedule shows 2.5 ton units but load calc in specs indicates 3 ton required. Which size to order?',
      requestor: 'contractor',
      assignedTo: 'engineer',
      dueDate: createPosition(3, 2, 17),
      status: 'open',
    },
    consequences: [
      {
        category: 'MATERIAL_MISMATCH',
        description: 'Equipment sizing discrepancy needs resolution',
        severity: 'medium',
      },
    ],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 16),
    type: 'rfi',
    actor: 'contractor',
    priority: 'normal',
    title: 'RFI #009: Stair Railing Height',
    description: 'Code compliance question on railings',
    voxelRefs: ['VOX-L1-STAIR-A01', 'VOX-L1-STAIR-B01'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-009',
      subject: 'Stair Railing Height Clarification',
      question: 'Drawings show 36" railing height. Current code requires 38". Please confirm intended height.',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 4, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 16),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #010: Shared Driveway Dimensions',
    description: 'Site work question on shared driveway',
    voxelRefs: ['VOX-L0-SITE-001'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-010',
      subject: 'Shared Driveway Width and Easement',
      question: 'Shared driveway shown as 18\' but civil says 20\' required for fire access. Also, which unit owns the easement?',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 2, 17),
      status: 'open',
    },
    consequences: [
      {
        category: 'REGULATORY_CONCERN',
        description: 'Fire access requirements',
        severity: 'high',
      },
    ],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 17),
    type: 'rfi',
    actor: 'contractor',
    priority: 'normal',
    title: 'RFI #011: Insulation at Party Wall',
    description: 'Sound insulation specification question',
    voxelRefs: ['VOX-L1-PARTY-001', 'VOX-L2-PARTY-001'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-011',
      subject: 'Sound Insulation Specification',
      question: 'Specs reference STC 50 rating but don\'t specify product. Roxul vs fiberglass? Also affects fire rating selection.',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(3, 4, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 17),
    type: 'rfi',
    actor: 'contractor',
    priority: 'high',
    title: 'RFI #012: Foundation Waterproofing',
    description: 'Waterproofing system clarification',
    voxelRefs: ['VOX-L0-FND-A01', 'VOX-L0-FND-B01'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-012',
      subject: 'Foundation Waterproofing System',
      question: 'Specs mention dampproofing but geotech report recommends full waterproofing due to high water table. Which system should we install?',
      requestor: 'contractor',
      assignedTo: 'engineer',
      dueDate: createPosition(3, 2, 17),
      status: 'open',
    },
    consequences: [
      {
        category: 'QUALITY_IMPACT',
        description: 'Water intrusion risk if wrong system selected',
        severity: 'high',
      },
    ],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'highlighted',
    },
  },
];

// ============================================================================
// WEEK 3 CONTINUED: ESCALATION & RESPONSE
// ============================================================================

const escalationEvents: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 2, 8),
    type: 'alert',
    actor: 'system',
    priority: 'critical',
    title: 'RFI Overload Alert',
    description: 'System flags unusual RFI volume requiring coordination meeting',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'alert',
      alertType: 'coordination_conflict',
      severity: 'critical',
      message: '12 RFIs submitted in 24 hours. 4 are CRITICAL priority. Recommend immediate coordination meeting.',
      requiresAcknowledgment: true,
    },
    consequences: [
      {
        category: 'SCHEDULE_DELAY',
        description: 'Work stoppage pending RFI resolution',
        severity: 'high',
        quantifiedImpact: { days: 2 },
      },
    ],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 2, 9),
    type: 'escalation',
    actor: 'contractor',
    priority: 'critical',
    title: 'Emergency Coordination Meeting Called',
    description: 'PM escalates to owner due to RFI volume',
    voxelRefs: [],
    decisionRefs: ['DEC-RFI-STORM-001'],
    payload: {
      type: 'decision',
      decisionType: 'ESCALATION',
      question: 'Multiple critical RFIs blocking work. Request emergency coordination meeting with all parties.',
      options: [
        {
          id: 'OPT-A',
          description: 'Schedule emergency meeting tomorrow AM',
          consequences: ['1 day delay', 'All parties aligned'],
          estimatedCost: 2500,
          estimatedDelay: 1,
          recommended: true,
        },
        {
          id: 'OPT-B',
          description: 'Continue normal RFI process',
          consequences: ['Extended delays', 'Compounding issues'],
          estimatedCost: 0,
          estimatedDelay: 5,
        },
      ],
      authorityRequired: 5, // Owner level
      budgetImpact: 2500,
      scheduleImpact: 1,
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 2, 10),
    type: 'approval',
    actor: 'owner',
    priority: 'critical',
    title: 'Emergency Meeting Approved',
    description: 'Owner approves emergency coordination meeting',
    voxelRefs: [],
    decisionRefs: ['DEC-RFI-STORM-001'],
    payload: {
      type: 'approval',
      approvalType: 'decision',
      approvedBy: 'owner',
      conditions: ['All parties must attend', 'Come prepared with solutions'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 3, 8),
    type: 'milestone',
    actor: 'owner',
    priority: 'high',
    title: 'Emergency Coordination Meeting',
    description: 'All parties meet to resolve RFI backlog',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'RFI Resolution Meeting',
      phase: 'structure',
      percentComplete: 25,
      deliverables: [
        'Prioritized RFI list',
        'Action items assigned',
        'Resolution deadlines set',
        'Coordination protocol established',
      ],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
];

// ============================================================================
// WEEK 3-4: RESOLUTION PHASE
// ============================================================================

const resolutionEvents: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 3, 14),
    type: 'comment',
    actor: 'engineer',
    priority: 'high',
    title: 'RFI #001 & #004 Resolved',
    description: 'Engineer provides coordinated MEP solution',
    voxelRefs: ['VOX-L1-PARTY-001', 'VOX-L2-PLUMB-A01', 'VOX-L2-PLUMB-B01'],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content: 'RFI #001: Unit A HVAC to route at ceiling level, Unit B at floor level. Eliminates conflict. RFI #004: Shared plumbing stack acceptable with 4" main - each unit connects separately. Updated drawings attached.',
      attachments: ['SK-M001-RFI-001-004.pdf'],
      mentions: ['contractor', 'architect'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 3, 15),
    type: 'comment',
    actor: 'architect',
    priority: 'high',
    title: 'RFI #002, #003, #006 Resolved',
    description: 'Architect provides party wall and code solutions',
    voxelRefs: ['VOX-L1-UTIL-B01', 'VOX-L1-PARTY-001'],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content: 'RFI #002: Move water heater 6" per attached. RFI #003: UL-listed fire-rated duct wrap specified (see attached detail). RFI #006: 2" reveal at unit transition - detail attached.',
      attachments: ['SK-A001-RFI-002.pdf', 'DT-A005-Firestop.pdf', 'DT-A006-Reveal.pdf'],
      mentions: ['contractor', 'engineer'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 4, 10),
    type: 'comment',
    actor: 'engineer',
    priority: 'normal',
    title: 'RFI #005, #008, #012 Resolved',
    description: 'Engineer resolves structural and mechanical questions',
    voxelRefs: ['VOX-L1-STR-A03', 'VOX-L1-MECH-A01', 'VOX-L0-FND-A01'],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content: 'RFI #005: Use structural 4x12 header. RFI #008: 3-ton units per load calc. RFI #012: Full waterproofing system required per geotech - Delta MS membrane specified.',
      mentions: ['contractor'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 5, 11),
    type: 'comment',
    actor: 'architect',
    priority: 'normal',
    title: 'Remaining RFIs Resolved',
    description: 'Architect closes out remaining RFIs',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content: 'RFI #007: Meters relocated to alcove on street-facing wall (SK attached). RFI #009: 38" railing confirmed. RFI #010: 20\' driveway per civil, easement language attached. RFI #011: Roxul mineral wool for combined fire/sound rating.',
      attachments: ['SK-A002-Meters.pdf', 'Legal-Easement.pdf'],
      mentions: ['contractor', 'owner'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(4, 1, 9),
    type: 'milestone',
    actor: 'contractor',
    priority: 'high',
    title: 'All RFIs Resolved - Work Resumes',
    description: 'All 12 RFIs resolved within 5 days, work resumes with clear direction',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'RFI Storm Resolved',
      phase: 'structure',
      percentComplete: 30,
      deliverables: [
        '12 RFIs closed',
        '8 sketch revisions issued',
        'Coordination protocol established',
        'Weekly coordination meetings scheduled',
      ],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
];

// ============================================================================
// WEEK 5-10: RECOVERY AND COMPLETION
// ============================================================================

const recoveryEvents: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(5, 2, 8),
    type: 'comment',
    actor: 'contractor',
    priority: 'normal',
    title: 'Weekly Coordination Meeting',
    description: 'First of new weekly coordination meetings',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content: 'Weekly coordination meeting #1 complete. No new conflicts identified. Three minor clarifications addressed on the spot. New protocol working well.',
      mentions: ['architect', 'engineer', 'owner'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(7, 4, 14),
    type: 'inspection',
    actor: 'contractor',
    priority: 'high',
    title: 'Rough-In Inspection Both Units',
    description: 'Combined rough-in inspection for Unit A and Unit B',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'inspection',
      inspectionType: 'COVER_UP',
      scheduledDate: createPosition(8, 1, 9),
      requirements: [
        'Verify all RFI resolutions implemented',
        'Confirm fire rating at party wall',
        'Check HVAC routing per revised drawings',
        'Inspect plumbing stack connections',
      ],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(8, 1, 12),
    type: 'approval',
    actor: 'system',
    priority: 'high',
    title: 'Rough-In Inspection Passed',
    description: 'Inspector notes excellent coordination and documentation',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'approval',
      approvalType: 'inspection',
      approvedBy: 'owner',
      conditions: [],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: false,
      emphasis: 'highlighted',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(10, 3, 10),
    type: 'milestone',
    actor: 'contractor',
    priority: 'critical',
    title: 'Duplex Substantial Completion',
    description: 'Both units complete with lessons learned from RFI storm',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Substantial Completion',
      phase: 'closeout',
      percentComplete: 100,
      deliverables: [
        'CO for both units',
        'Complete RFI log with resolutions',
        'Coordination protocol documented',
        'Lessons learned compiled',
      ],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'critical',
    },
  },
];

// ============================================================================
// MILESTONES
// ============================================================================

const milestones: ScenarioMilestone[] = [
  {
    id: 'MS-001',
    name: 'Project Kickoff',
    position: createPosition(1, 1, 9),
    description: 'Initial project meeting for duplex development',
    highlightedEvents: [],
    presenterNotes: [
      'Introduce dual-unit complexity',
      'Highlight shared systems challenges',
      'Set up the coming coordination issues',
    ],
  },
  {
    id: 'MS-002',
    name: 'RFI Storm Begins',
    position: createPosition(3, 1, 9),
    description: '12 RFIs submitted in one day - coordination chaos',
    highlightedEvents: [],
    presenterNotes: [
      'Show the flood of RFIs coming in',
      'Demonstrate automatic prioritization',
      'Highlight how system flags critical issues',
      'Ask: "How would your team handle this?"',
    ],
  },
  {
    id: 'MS-003',
    name: 'Emergency Escalation',
    position: createPosition(3, 2, 9),
    description: 'PM escalates to owner for emergency meeting',
    highlightedEvents: [],
    presenterNotes: [
      'Show authority cascade in action',
      'Demonstrate escalation workflow',
      'Highlight owner visibility and control',
    ],
  },
  {
    id: 'MS-004',
    name: 'RFI Storm Resolved',
    position: createPosition(4, 1, 9),
    description: 'All 12 RFIs resolved with improved coordination',
    highlightedEvents: [],
    presenterNotes: [
      'Show complete resolution trail',
      'Demonstrate how quickly issues were resolved',
      'Highlight new coordination protocol',
      'Contrast with traditional RFI process',
    ],
  },
  {
    id: 'MS-005',
    name: 'Project Complete',
    position: createPosition(10, 3, 10),
    description: 'Both units complete with documented lessons learned',
    highlightedEvents: [],
    presenterNotes: [
      'Show project timeline with RFI storm clearly visible',
      'Demonstrate lessons learned documentation',
      'Highlight how coordination improved after storm',
    ],
  },
];

// ============================================================================
// TALKING POINTS
// ============================================================================

const talkingPoints: TalkingPoint[] = [
  {
    position: createPosition(3, 1, 9),
    topic: 'RFI Volume Management',
    points: [
      'Ectropy automatically prioritizes RFIs by impact and urgency',
      'Critical issues are flagged immediately',
      'Related RFIs are linked for coordinated resolution',
    ],
    questions: [
      'How does your team currently prioritize RFIs?',
      'What happens when RFIs pile up?',
    ],
  },
  {
    position: createPosition(3, 2, 9),
    topic: 'Escalation Workflow',
    points: [
      'Authority cascade ensures decisions reach the right level',
      'Owner has visibility without being overwhelmed',
      'Emergency meetings can be scheduled with one click',
    ],
    questions: [
      'How long does it take to get all parties in a room?',
      'How do owners typically find out about issues?',
    ],
  },
  {
    position: createPosition(4, 1, 9),
    topic: 'Rapid Resolution',
    points: [
      '12 complex RFIs resolved in 5 days',
      'All resolutions documented with attachments',
      'New coordination protocol prevents future storms',
    ],
    questions: [
      'What would this typically take in your projects?',
      'How much would that delay cost?',
    ],
  },
  {
    position: createPosition(10, 3, 10),
    topic: 'Lessons Learned',
    points: [
      'Complete audit trail from storm to resolution',
      'Coordination improvements measurable',
      'Future projects benefit from documented patterns',
    ],
  },
];

// ============================================================================
// SCENARIO FACTORY
// ============================================================================

/**
 * Creates the RFI Storm scenario with a specific project ID
 */
export function createRFIStormScenario(projectId: string): DemoScenario {
  const cast = createDemoCast(projectId);
  const allEvents = [
    ...normalStartEvents,
    ...rfiStormEvents,
    ...escalationEvents,
    ...resolutionEvents,
    ...recoveryEvents,
  ];

  // Update URNs with project ID
  allEvents.forEach((event) => {
    event.urn = `urn:ectropy:${projectId}:event:${event.id}`;
  });

  return {
    id: 'scenario-rfi-storm-duplex',
    name: 'RFI Storm - Duplex Coordination',
    description:
      'Demonstrates problem resolution when 12 RFIs flood in during a critical phase. Shows the platform\'s ability to prioritize, coordinate, and resolve issues efficiently through the authority cascade.',
    version: '1.0.0',
    buildingType: 'duplex',
    buildingConfig: duplexBuilding,
    duration: {
      weeks: 10,
      acceleratedMinutes: 25,
      defaultPlaybackSpeed: 10,
    },
    complexity: 'medium',
    focusAreas: ['problem_resolution', 'collaboration', 'authority_cascade'],
    cast,
    timeline: allEvents,
    milestones,
    seedRequirements: {
      voxelCount: 40,
      elementCount: 80,
      decisionCount: 15,
      authorityLevels: [0, 1, 2, 3, 4, 5, 6],
      requiresSpeckle: true,
    },
    talkingPoints,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'Ectropy Demo Team',
      tags: ['problem-resolution', 'multi-unit', 'coordination', 'rfi-management'],
      minVersion: '2.0.0',
      tested: true,
      productionReady: true,
    },
  };
}

export default createRFIStormScenario;
