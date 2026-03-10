/**
 * ============================================================================
 * HAPPY PATH SCENARIO
 * ============================================================================
 * Demonstrates ideal construction workflow with smooth approvals and
 * successful project execution. Perfect for introductory demos.
 *
 * Building Type: Single Family House (Ifc4_SampleHouse.ifc)
 * Duration: 8 weeks
 * Complexity: Low
 * Focus: Basic workflow, authority cascade, BIM integration
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
  // EventPriority, // Unused import
} from '../types/index.js';
import { createDemoCast } from '../personas/index.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// BUILDING CONFIGURATION
// ============================================================================

const houseBuilding: BuildingConfig = {
  type: 'house',
  ifcFile: 'Ifc4_SampleHouse.ifc',
  name: 'Modern Single Family Residence',
  description:
    'Contemporary 3-bedroom single family home with open floor plan and sustainable features',
  squareFeet: 2400,
  levels: 2,
  systems: ['structural', 'mechanical', 'electrical', 'plumbing'],
  phases: [
    { phase: 'preconstruction', startWeek: 0, endWeek: 0 },
    { phase: 'sitework', startWeek: 1, endWeek: 1 },
    { phase: 'foundation', startWeek: 2, endWeek: 2 },
    { phase: 'structure', startWeek: 3, endWeek: 4 },
    { phase: 'rough_in', startWeek: 5, endWeek: 6 },
    { phase: 'finishes', startWeek: 7, endWeek: 7 },
    { phase: 'commissioning', startWeek: 8, endWeek: 8 },
    { phase: 'closeout', startWeek: 8, endWeek: 8 },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEventId(): string {
  return `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;
}

function createPosition(
  week: number,
  day: number,
  hour: number
): TimelinePosition {
  return { week, day, hour };
}

// ============================================================================
// TIMELINE EVENTS
// ============================================================================

/**
 * Week 1: Project Kickoff
 */
const week1Events: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(1, 1, 9),
    type: 'milestone',
    actor: 'owner',
    priority: 'high',
    title: 'Project Kickoff Meeting',
    description: 'Initial project kickoff with all stakeholders present',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Project Kickoff',
      phase: 'preconstruction',
      percentComplete: 0,
      deliverables: [
        'Project charter signed',
        'Team roles assigned',
        'Communication plan established',
      ],
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
    position: createPosition(1, 1, 14),
    type: 'upload',
    actor: 'architect',
    priority: 'high',
    title: 'Initial BIM Model Upload',
    description:
      'Architect uploads the initial IFC model to Speckle for team review',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'upload',
      fileType: 'ifc',
      fileName: 'Ifc4_SampleHouse.ifc',
      fileSize: 2270000,
      description: 'Initial architectural model with complete design intent',
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
    position: createPosition(1, 2, 10),
    type: 'comment',
    actor: 'engineer',
    priority: 'normal',
    title: 'Structural Review Complete',
    description: 'Engineer confirms structural elements are constructable',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content:
        'Reviewed structural elements. All beam and column sizes are appropriate for the loads. Foundation design is adequate for soil conditions. Approved to proceed with construction.',
      mentions: ['architect', 'contractor'],
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
    position: createPosition(1, 3, 8),
    type: 'schedule_update',
    actor: 'contractor',
    priority: 'normal',
    title: 'Construction Schedule Published',
    description: 'Contractor publishes the 8-week construction schedule',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Schedule Published',
      phase: 'preconstruction',
      percentComplete: 5,
      deliverables: [
        '8-week master schedule',
        'Resource loading',
        'Milestone dates',
      ],
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
];

/**
 * Week 2: Foundation Phase
 */
const week2Events: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(2, 1, 7),
    type: 'milestone',
    actor: 'contractor',
    priority: 'high',
    title: 'Foundation Work Begins',
    description: 'Excavation and foundation work commences on site',
    voxelRefs: ['VOX-L0-FND-001', 'VOX-L0-FND-002', 'VOX-L0-FND-003'],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Foundation Start',
      phase: 'foundation',
      percentComplete: 10,
      deliverables: ['Excavation complete', 'Formwork in place'],
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
    position: createPosition(2, 3, 14),
    type: 'inspection',
    actor: 'contractor',
    priority: 'high',
    title: 'Foundation Inspection Requested',
    description: 'Request for pre-pour foundation inspection submitted',
    voxelRefs: ['VOX-L0-FND-001', 'VOX-L0-FND-002', 'VOX-L0-FND-003'],
    decisionRefs: [],
    payload: {
      type: 'inspection',
      inspectionType: 'ROUGH_IN',
      scheduledDate: createPosition(2, 4, 9),
      requirements: [
        'Verify rebar placement per structural drawings',
        'Confirm form dimensions',
        'Check waterproofing membrane',
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
    position: createPosition(2, 4, 11),
    type: 'approval',
    actor: 'system',
    priority: 'high',
    title: 'Foundation Inspection Passed',
    description: 'Building inspector approves foundation for concrete pour',
    voxelRefs: ['VOX-L0-FND-001', 'VOX-L0-FND-002', 'VOX-L0-FND-003'],
    decisionRefs: [],
    payload: {
      type: 'approval',
      approvalType: 'inspection',
      approvedBy: 'owner', // Inspector maps to regulatory/owner
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
    position: createPosition(2, 5, 6),
    type: 'notification',
    actor: 'contractor',
    priority: 'normal',
    title: 'Concrete Pour Scheduled',
    description: 'Concrete pour scheduled for tomorrow morning',
    voxelRefs: ['VOX-L0-FND-001', 'VOX-L0-FND-002', 'VOX-L0-FND-003'],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content:
        'Concrete pour scheduled for Friday 6:00 AM. Weather forecast is clear. All parties please confirm availability.',
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
];

/**
 * Week 3-4: Framing Phase
 */
const week3_4Events: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 1, 7),
    type: 'milestone',
    actor: 'contractor',
    priority: 'high',
    title: 'Framing Phase Begins',
    description: 'First floor framing commences',
    voxelRefs: ['VOX-L1-STR-001', 'VOX-L1-STR-002'],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Framing Start',
      phase: 'structure',
      percentComplete: 25,
      deliverables: ['Sill plates installed', 'First floor joists set'],
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
    position: createPosition(3, 3, 10),
    type: 'decision',
    actor: 'contractor',
    priority: 'normal',
    title: 'Minor Tolerance Variance',
    description:
      'Foundation wall 1/4" out of square - within foreman authority',
    voxelRefs: ['VOX-L1-STR-001'],
    decisionRefs: ['DEC-HP-001'],
    payload: {
      type: 'decision',
      decisionType: 'APPROVAL',
      question:
        'Foundation wall measures 1/4" out of square. Should we shim the sill plate or request remediation?',
      options: [
        {
          id: 'OPT-A',
          description: 'Shim sill plate to correct (standard practice)',
          consequences: ['Minor time for shimming', 'Within tolerance'],
          estimatedCost: 50,
          estimatedDelay: 0,
          recommended: true,
        },
        {
          id: 'OPT-B',
          description: 'Request foundation remediation',
          consequences: ['Delay to schedule', 'Additional cost'],
          estimatedCost: 2000,
          estimatedDelay: 3,
        },
      ],
      authorityRequired: 1, // Foreman can approve
      budgetImpact: 50,
      scheduleImpact: 0,
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 0.8,
      dependencies: [],
      skippable: true,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(3, 3, 10),
    type: 'approval',
    actor: 'contractor',
    priority: 'normal',
    title: 'Tolerance Variance Approved',
    description:
      'Foreman approves shimming solution within authority (1/4" < 1/8" tolerance)',
    voxelRefs: ['VOX-L1-STR-001'],
    decisionRefs: ['DEC-HP-001'],
    payload: {
      type: 'approval',
      approvalType: 'decision',
      approvedBy: 'contractor',
      conditions: ['Document in daily log', 'Verify level after shimming'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 0.8,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(4, 2, 15),
    type: 'milestone',
    actor: 'contractor',
    priority: 'high',
    title: 'Roof Dried In',
    description:
      'Roof sheathing and underlayment complete - building is weather-tight',
    voxelRefs: ['VOX-L2-ROF-001', 'VOX-L2-ROF-002'],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Dry-In Complete',
      phase: 'structure',
      percentComplete: 45,
      deliverables: [
        'Roof sheathing complete',
        'Underlayment installed',
        'Weather-tight envelope',
      ],
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
];

/**
 * Week 5-6: MEP Rough-In Phase
 */
const week5_6Events: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(5, 1, 7),
    type: 'milestone',
    actor: 'contractor',
    priority: 'high',
    title: 'MEP Rough-In Begins',
    description: 'Mechanical, electrical, and plumbing rough-in work commences',
    voxelRefs: ['VOX-L1-MEP-001', 'VOX-L1-MEP-002', 'VOX-L2-MEP-001'],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'MEP Rough-In Start',
      phase: 'rough_in',
      percentComplete: 50,
      deliverables: [
        'HVAC ductwork layout',
        'Electrical panel set',
        'Plumbing risers in place',
      ],
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
    position: createPosition(5, 3, 11),
    type: 'rfi',
    actor: 'contractor',
    priority: 'normal',
    title: 'RFI: HVAC Supply Location',
    description:
      'Contractor requests clarification on living room supply register location',
    voxelRefs: ['VOX-L1-MEP-002'],
    decisionRefs: [],
    payload: {
      type: 'rfi',
      rfiNumber: 'RFI-001',
      subject: 'Living Room HVAC Supply Register Location',
      question:
        'Drawings show supply register centered on window. Window was shifted 6" during design. Please confirm register should also shift to maintain relationship.',
      requestor: 'contractor',
      assignedTo: 'architect',
      dueDate: createPosition(5, 4, 17),
      status: 'open',
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 0.9,
      dependencies: [],
      skippable: true,
      interactive: true,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(5, 4, 10),
    type: 'comment',
    actor: 'architect',
    priority: 'normal',
    title: 'RFI Response: HVAC Location',
    description: 'Architect responds to RFI with updated location',
    voxelRefs: ['VOX-L1-MEP-002'],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content:
        'Confirmed. Please shift supply register 6" to maintain centered relationship with window. Updated sketch attached. No cost impact expected.',
      mentions: ['contractor', 'engineer'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 0.9,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(6, 3, 14),
    type: 'inspection',
    actor: 'contractor',
    priority: 'high',
    title: 'Rough-In Inspection Requested',
    description: 'Request for MEP rough-in inspection before wall close-in',
    voxelRefs: ['VOX-L1-MEP-001', 'VOX-L1-MEP-002', 'VOX-L2-MEP-001'],
    decisionRefs: [],
    payload: {
      type: 'inspection',
      inspectionType: 'COVER_UP',
      scheduledDate: createPosition(6, 4, 9),
      requirements: [
        'Verify electrical per NEC',
        'Confirm plumbing vents and traps',
        'Check HVAC duct connections',
        'Inspect fire blocking',
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
    position: createPosition(6, 4, 12),
    type: 'approval',
    actor: 'system',
    priority: 'high',
    title: 'Rough-In Inspection Passed',
    description: 'All MEP rough-in inspections passed - approved for drywall',
    voxelRefs: ['VOX-L1-MEP-001', 'VOX-L1-MEP-002', 'VOX-L2-MEP-001'],
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
];

/**
 * Week 7-8: Finishes and Closeout
 */
const week7_8Events: ScenarioEvent[] = [
  {
    id: createEventId(),
    urn: '',
    position: createPosition(7, 1, 7),
    type: 'milestone',
    actor: 'contractor',
    priority: 'high',
    title: 'Finish Work Begins',
    description: 'Interior finishes, trim, and fixtures installation commences',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Finishes Start',
      phase: 'finishes',
      percentComplete: 75,
      deliverables: [
        'Drywall complete',
        'Paint started',
        'Trim installation beginning',
      ],
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
    position: createPosition(7, 4, 10),
    type: 'comment',
    actor: 'owner',
    priority: 'normal',
    title: 'Owner Site Visit',
    description: 'Owner visits site and expresses satisfaction with progress',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'comment',
      content:
        "Visited the site today. Very pleased with the quality of work and the team's communication throughout the project. Looking forward to the final walkthrough.",
      mentions: ['architect', 'contractor'],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 0.8,
      dependencies: [],
      skippable: true,
      interactive: false,
      emphasis: 'normal',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(8, 2, 9),
    type: 'inspection',
    actor: 'contractor',
    priority: 'critical',
    title: 'Final Inspection Scheduled',
    description: 'Final building inspection for Certificate of Occupancy',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'inspection',
      inspectionType: 'FINAL',
      scheduledDate: createPosition(8, 3, 9),
      requirements: [
        'All work complete per approved plans',
        'All prior inspections passed',
        'Smoke detectors installed and operational',
        'GFCI outlets tested',
        'Grading and drainage complete',
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
  {
    id: createEventId(),
    urn: '',
    position: createPosition(8, 3, 14),
    type: 'approval',
    actor: 'system',
    priority: 'critical',
    title: 'Certificate of Occupancy Issued',
    description: 'Building passes final inspection - CO issued',
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
      emphasis: 'critical',
    },
  },
  {
    id: createEventId(),
    urn: '',
    position: createPosition(8, 4, 10),
    type: 'milestone',
    actor: 'contractor',
    priority: 'critical',
    title: 'Project Substantial Completion',
    description:
      'Project reaches substantial completion - owner walkthrough complete',
    voxelRefs: [],
    decisionRefs: [],
    payload: {
      type: 'milestone',
      milestoneName: 'Substantial Completion',
      phase: 'closeout',
      percentComplete: 100,
      deliverables: [
        'Certificate of Occupancy',
        'Punch list complete',
        'O&M manuals delivered',
        'Warranty information provided',
        'Keys handed over',
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
    description: 'Initial project meeting with all stakeholders',
    highlightedEvents: [],
    presenterNotes: [
      'Show how all four personas have visibility into the project',
      'Demonstrate BIM model upload and team notification',
      'Highlight real-time collaboration features',
    ],
  },
  {
    id: 'MS-002',
    name: 'Foundation Complete',
    position: createPosition(2, 5, 12),
    description: 'Foundation work complete with inspection passed',
    highlightedEvents: [],
    presenterNotes: [
      'Show inspection workflow from request to approval',
      'Demonstrate how decisions are tracked with full audit trail',
      'Highlight mobile-friendly field worker experience',
    ],
  },
  {
    id: 'MS-003',
    name: 'Structure Dry-In',
    position: createPosition(4, 2, 15),
    description: 'Building envelope complete and weather-tight',
    highlightedEvents: [],
    presenterNotes: [
      'Show tolerance variance handling with authority cascade',
      'Demonstrate how minor decisions are auto-approved at field level',
      'Highlight progress tracking and phase completion',
    ],
  },
  {
    id: 'MS-004',
    name: 'MEP Rough-In Approved',
    position: createPosition(6, 4, 12),
    description:
      'All mechanical, electrical, and plumbing rough-in passed inspection',
    highlightedEvents: [],
    presenterNotes: [
      'Show RFI workflow from question to resolution',
      'Demonstrate multi-trade coordination',
      'Highlight cover-up inspection as quality gate',
    ],
  },
  {
    id: 'MS-005',
    name: 'Project Complete',
    position: createPosition(8, 4, 10),
    description:
      'Certificate of Occupancy issued, substantial completion achieved',
    highlightedEvents: [],
    presenterNotes: [
      'Show complete project timeline and decision history',
      'Demonstrate closeout documentation',
      'Highlight owner satisfaction with transparency throughout',
    ],
  },
];

// ============================================================================
// TALKING POINTS
// ============================================================================

const talkingPoints: TalkingPoint[] = [
  {
    position: createPosition(1, 1, 9),
    topic: 'Platform Introduction',
    points: [
      'Ectropy provides a single source of truth for construction projects',
      'All stakeholders have role-appropriate visibility',
      'Decisions are tracked with full audit trail',
    ],
    questions: [
      'How does your team currently share project information?',
      'What happens when a field decision needs to be made?',
    ],
  },
  {
    position: createPosition(3, 3, 10),
    topic: 'Authority Cascade',
    points: [
      '7-tier authority system ensures decisions are made at the right level',
      'Field workers can resolve minor issues immediately',
      'Larger decisions automatically escalate to appropriate authority',
    ],
    questions: [
      'How long does it take to get a decision on a field variance?',
      'What documentation do you keep for field decisions?',
    ],
  },
  {
    position: createPosition(5, 3, 11),
    topic: 'RFI Management',
    points: [
      'RFIs are linked to specific model locations',
      'Responses are tracked with deadlines',
      'Full history preserved for close-out documentation',
    ],
  },
  {
    position: createPosition(8, 4, 10),
    topic: 'Project Success',
    points: [
      'Complete audit trail from kickoff to closeout',
      'All decisions documented with rationale',
      'Owner has full visibility into project history',
    ],
    questions: [
      'How much time does your team spend on close-out documentation?',
      'Would instant access to all project decisions help with disputes?',
    ],
  },
];

// ============================================================================
// SCENARIO FACTORY
// ============================================================================

/**
 * Creates the Happy Path scenario with a specific project ID
 */
export function createHappyPathScenario(projectId: string): DemoScenario {
  const cast = createDemoCast(projectId);
  const allEvents = [
    ...week1Events,
    ...week2Events,
    ...week3_4Events,
    ...week5_6Events,
    ...week7_8Events,
  ];

  // Update URNs with project ID
  allEvents.forEach((event) => {
    event.urn = `urn:ectropy:${projectId}:event:${event.id}`;
  });

  return {
    id: 'scenario-happy-path-house',
    name: 'Happy Path - Single Family Home',
    description:
      "Demonstrates ideal construction workflow with smooth approvals and successful project execution. Perfect for introductory demos showing the platform's core capabilities.",
    version: '1.0.0',
    buildingType: 'house',
    buildingConfig: houseBuilding,
    duration: {
      weeks: 8,
      acceleratedMinutes: 20,
      defaultPlaybackSpeed: 10,
    },
    complexity: 'low',
    focusAreas: ['workflow', 'authority_cascade', 'bim_integration'],
    cast,
    timeline: allEvents,
    milestones,
    seedRequirements: {
      voxelCount: 25,
      elementCount: 50,
      decisionCount: 5,
      authorityLevels: [0, 1, 2, 3, 4, 5, 6],
      requiresSpeckle: true,
    },
    talkingPoints,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'Ectropy Demo Team',
      tags: ['introductory', 'residential', 'complete-workflow'],
      minVersion: '2.0.0',
      tested: true,
      productionReady: true,
    },
  };
}

export default createHappyPathScenario;
