/**
 * ============================================================================
 * INSPECTION & CONSEQUENCE GENERATOR
 * ============================================================================
 * Generates realistic inspection events and consequence records
 * for demo scenarios, following construction industry patterns.
 *
 * @module @ectropy/demo-scenarios/generators
 * @version 1.0.0
 * ============================================================================
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ScenarioEvent,
  InspectionEventPayload,
  InspectionType,
  ConsequenceRef,
  ConsequenceCategory,
  TimelinePosition,
  ProjectPhase,
} from '../types/index.js';

// ============================================================================
// INSPECTION TEMPLATES
// ============================================================================

/**
 * Inspection template definition
 */
export interface InspectionTemplate {
  type: InspectionType;
  name: string;
  description: string;
  phase: ProjectPhase;
  requirements: string[];
  typicalDuration: number; // hours
  passRate: number; // 0-1 probability of passing
  commonDeficiencies: string[];
}

/**
 * Standard inspection templates by type
 */
export const inspectionTemplates: Record<string, InspectionTemplate> = {
  'foundation-pre-pour': {
    type: 'ROUGH_IN',
    name: 'Foundation Pre-Pour Inspection',
    description:
      'Verify reinforcement, formwork, and waterproofing before concrete pour',
    phase: 'foundation',
    requirements: [
      'Verify rebar placement per structural drawings',
      'Confirm form dimensions and bracing',
      'Check waterproofing membrane installation',
      'Verify anchor bolt locations',
      'Inspect soil bearing conditions',
    ],
    typicalDuration: 2,
    passRate: 0.85,
    commonDeficiencies: [
      'Rebar spacing out of tolerance',
      'Missing tie wire at intersections',
      'Waterproofing membrane damage',
      'Anchor bolt location incorrect',
    ],
  },
  framing: {
    type: 'ROUGH_IN',
    name: 'Framing Inspection',
    description: 'Verify structural framing before wall covering',
    phase: 'structure',
    requirements: [
      'Verify stud spacing and sizing',
      'Check header sizes at openings',
      'Inspect connections and fasteners',
      'Verify fire blocking installation',
      'Check bracing and sheathing',
    ],
    typicalDuration: 3,
    passRate: 0.8,
    commonDeficiencies: [
      'Missing fire blocking',
      'Incorrect header size',
      'Nail spacing violations',
      'Missing hurricane ties',
    ],
  },
  'electrical-rough': {
    type: 'ROUGH_IN',
    name: 'Electrical Rough-In Inspection',
    description: 'Verify electrical installation before wall close-in',
    phase: 'rough_in',
    requirements: [
      'Verify wire sizing per load calculations',
      'Check box fill calculations',
      'Inspect grounding and bonding',
      'Verify GFCI/AFCI locations',
      'Check clearances and accessibility',
    ],
    typicalDuration: 2,
    passRate: 0.75,
    commonDeficiencies: [
      'Undersized wire for circuit',
      'Box overfill',
      'Missing equipment grounding',
      'GFCI not within required distance',
    ],
  },
  'plumbing-rough': {
    type: 'ROUGH_IN',
    name: 'Plumbing Rough-In Inspection',
    description: 'Verify plumbing installation before wall close-in',
    phase: 'rough_in',
    requirements: [
      'Verify pipe sizing and slope',
      'Check vent terminations',
      'Inspect water pressure test',
      'Verify cleanout locations',
      'Check fixture rough-in dimensions',
    ],
    typicalDuration: 2,
    passRate: 0.8,
    commonDeficiencies: [
      'Insufficient slope on drain',
      'Vent termination too close to opening',
      'Failed pressure test',
      'Missing cleanout',
    ],
  },
  'mechanical-rough': {
    type: 'ROUGH_IN',
    name: 'HVAC Rough-In Inspection',
    description: 'Verify HVAC installation before wall close-in',
    phase: 'rough_in',
    requirements: [
      'Verify duct sizing and connections',
      'Check return air pathways',
      'Inspect equipment clearances',
      'Verify combustion air provisions',
      'Check refrigerant line insulation',
    ],
    typicalDuration: 2,
    passRate: 0.85,
    commonDeficiencies: [
      'Undersized return air',
      'Missing duct insulation',
      'Insufficient combustion air',
      'Refrigerant line insulation gaps',
    ],
  },
  insulation: {
    type: 'COVER_UP',
    name: 'Insulation Inspection',
    description: 'Verify insulation before drywall installation',
    phase: 'rough_in',
    requirements: [
      'Verify R-values per energy code',
      'Check vapor barrier installation',
      'Inspect air sealing at penetrations',
      'Verify insulation contact with surfaces',
      'Check for compression or gaps',
    ],
    typicalDuration: 1.5,
    passRate: 0.9,
    commonDeficiencies: [
      'Compressed insulation at corners',
      'Missing vapor barrier',
      'Gaps around penetrations',
      'Incorrect R-value installed',
    ],
  },
  drywall: {
    type: 'COVER_UP',
    name: 'Drywall Inspection',
    description: 'Verify drywall installation before finishing',
    phase: 'finishes',
    requirements: [
      'Verify fire-rated assembly construction',
      'Check fastener pattern and depth',
      'Inspect corner bead installation',
      'Verify moisture-resistant board in wet areas',
    ],
    typicalDuration: 1,
    passRate: 0.95,
    commonDeficiencies: [
      'Fasteners too deep',
      'Wrong board type in wet area',
      'Fire tape missing at penetrations',
    ],
  },
  'fire-safety': {
    type: 'SAFETY',
    name: 'Fire Safety Inspection',
    description: 'Verify fire protection systems and egress',
    phase: 'commissioning',
    requirements: [
      'Verify smoke detector installation and operation',
      'Check fire extinguisher locations',
      'Inspect egress paths and signage',
      'Verify fire door operation',
      'Test interconnected alarms',
    ],
    typicalDuration: 2,
    passRate: 0.8,
    commonDeficiencies: [
      'Smoke detector not connected to alarm',
      'Missing fire extinguisher',
      'Blocked egress path',
      'Fire door closer not functioning',
    ],
  },
  final: {
    type: 'FINAL',
    name: 'Final Building Inspection',
    description: 'Final inspection for Certificate of Occupancy',
    phase: 'closeout',
    requirements: [
      'All prior inspections passed',
      'All work complete per approved plans',
      'Smoke and CO detectors operational',
      'GFCI outlets tested and working',
      'Grading and drainage complete',
      'Address numbers visible',
      'All egress operational',
    ],
    typicalDuration: 3,
    passRate: 0.7,
    commonDeficiencies: [
      'Outstanding items from prior inspections',
      'Missing smoke detector',
      'GFCI not functioning',
      'Incomplete grading',
      'Missing address numbers',
    ],
  },
};

// ============================================================================
// CONSEQUENCE TEMPLATES
// ============================================================================

/**
 * Consequence template for common construction issues
 */
export interface ConsequenceTemplate {
  category: ConsequenceCategory;
  descriptionTemplate: string;
  severityRange: ('low' | 'medium' | 'high')[];
  typicalCostRange: [number, number];
  typicalDelayRange: [number, number]; // days
}

/**
 * Common consequence templates
 */
export const consequenceTemplates: Record<string, ConsequenceTemplate> = {
  'schedule-delay': {
    category: 'SCHEDULE_DELAY',
    descriptionTemplate: 'Schedule delay of {days} days due to {reason}',
    severityRange: ['low', 'medium', 'high'],
    typicalCostRange: [0, 5000],
    typicalDelayRange: [1, 14],
  },
  'cost-increase': {
    category: 'COST_INCREASE',
    descriptionTemplate: 'Additional cost of ${amount} for {reason}',
    severityRange: ['low', 'medium', 'high'],
    typicalCostRange: [500, 25000],
    typicalDelayRange: [0, 3],
  },
  'rework-required': {
    category: 'REWORK_REQUIRED',
    descriptionTemplate: 'Rework required at {location}: {description}',
    severityRange: ['low', 'medium', 'high'],
    typicalCostRange: [500, 10000],
    typicalDelayRange: [1, 7],
  },
  'coordination-conflict': {
    category: 'COORDINATION_CONFLICT',
    descriptionTemplate:
      'Coordination conflict between {tradeA} and {tradeB} at {location}',
    severityRange: ['low', 'medium'],
    typicalCostRange: [0, 5000],
    typicalDelayRange: [0, 3],
  },
  'tolerance-variance': {
    category: 'TOLERANCE_VARIANCE',
    descriptionTemplate: 'Variance of {variance}" at {location}',
    severityRange: ['low', 'medium'],
    typicalCostRange: [0, 2000],
    typicalDelayRange: [0, 1],
  },
  'regulatory-concern': {
    category: 'REGULATORY_CONCERN',
    descriptionTemplate: 'Code compliance issue: {issue}',
    severityRange: ['medium', 'high'],
    typicalCostRange: [500, 15000],
    typicalDelayRange: [2, 14],
  },
  'safety-risk': {
    category: 'SAFETY_RISK',
    descriptionTemplate: 'Safety concern identified: {issue}',
    severityRange: ['medium', 'high'],
    typicalCostRange: [0, 5000],
    typicalDelayRange: [0, 5],
  },
  'material-mismatch': {
    category: 'MATERIAL_MISMATCH',
    descriptionTemplate: 'Material mismatch: {specified} vs {installed}',
    severityRange: ['low', 'medium'],
    typicalCostRange: [0, 8000],
    typicalDelayRange: [0, 7],
  },
  'design-change': {
    category: 'DESIGN_CHANGE',
    descriptionTemplate: 'Design modification required: {description}',
    severityRange: ['low', 'medium', 'high'],
    typicalCostRange: [500, 20000],
    typicalDelayRange: [1, 10],
  },
};

// ============================================================================
// GENERATOR FUNCTIONS
// ============================================================================

/**
 * Options for generating an inspection
 */
export interface InspectionGeneratorOptions {
  projectId: string;
  templateId: string;
  position: TimelinePosition;
  voxelRefs?: string[];
  forceResult?: 'passed' | 'failed' | 'conditional';
}

/**
 * Generates an inspection request event
 */
export function generateInspectionRequest(
  options: InspectionGeneratorOptions
): ScenarioEvent {
  const template = inspectionTemplates[options.templateId];
  if (!template) {
    throw new Error(`Unknown inspection template: ${options.templateId}`);
  }

  const id = `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;

  // Schedule inspection for next business day
  const scheduledPosition: TimelinePosition = {
    week: options.position.week,
    day: options.position.day + 1,
    hour: 9,
  };

  const payload: InspectionEventPayload = {
    type: 'inspection',
    inspectionType: template.type,
    scheduledDate: scheduledPosition,
    requirements: template.requirements,
  };

  return {
    id,
    urn: `urn:ectropy:${options.projectId}:event:${id}`,
    position: options.position,
    type: 'inspection',
    actor: 'contractor',
    priority: 'high',
    title: `${template.name} Requested`,
    description: template.description,
    voxelRefs: options.voxelRefs || [],
    decisionRefs: [],
    payload,
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: 'normal',
    },
  };
}

/**
 * Generates an inspection result event
 */
export function generateInspectionResult(
  request: ScenarioEvent,
  projectId: string,
  position: TimelinePosition,
  forceResult?: 'passed' | 'failed' | 'conditional'
): ScenarioEvent {
  const requestPayload = request.payload as InspectionEventPayload;
  const templateEntry = Object.entries(inspectionTemplates).find(
    ([_, t]) => t.type === requestPayload.inspectionType
  );
  const template = templateEntry ? templateEntry[1] : null;

  // Determine result
  let result: 'passed' | 'failed' | 'conditional';
  let deficiencies: string[] = [];

  if (forceResult) {
    result = forceResult;
  } else if (template) {
    const random = Math.random();
    if (random < template.passRate) {
      result = 'passed';
    } else if (random < template.passRate + 0.1) {
      result = 'conditional';
    } else {
      result = 'failed';
    }
  } else {
    result = 'passed';
  }

  // Add deficiencies for non-passing results
  if (result !== 'passed' && template) {
    const numDeficiencies =
      result === 'failed'
        ? Math.floor(Math.random() * 3) + 2
        : Math.floor(Math.random() * 2) + 1;

    for (
      let i = 0;
      i < numDeficiencies && i < template.commonDeficiencies.length;
      i++
    ) {
      deficiencies.push(template.commonDeficiencies[i]);
    }
  }

  const id = `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;

  const consequences: ConsequenceRef[] =
    result === 'failed'
      ? [
          {
            category: 'REWORK_REQUIRED',
            description: 'Corrections required before re-inspection',
            severity: 'medium',
          },
          {
            category: 'SCHEDULE_DELAY',
            description: 'Work paused pending corrections',
            severity: 'low',
            quantifiedImpact: { days: 2 },
          },
        ]
      : [];

  return {
    id,
    urn: `urn:ectropy:${projectId}:event:${id}`,
    position,
    type: result === 'passed' ? 'approval' : 'rejection',
    actor: 'system',
    priority: result === 'failed' ? 'critical' : 'high',
    title: `${request.title.replace(' Requested', '')} - ${result.charAt(0).toUpperCase() + result.slice(1)}`,
    description:
      result === 'passed'
        ? 'Inspection passed, approved to proceed'
        : `Inspection ${result}: ${deficiencies.join(', ')}`,
    voxelRefs: request.voxelRefs,
    decisionRefs: request.decisionRefs,
    payload: {
      type: 'approval',
      approvalType: 'inspection',
      approvedBy: 'owner', // Inspector mapped to regulatory
      conditions: result === 'conditional' ? deficiencies : [],
    },
    consequences,
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [request.id],
      skippable: false,
      interactive: false,
      emphasis: result === 'failed' ? 'critical' : 'highlighted',
    },
  };
}

/**
 * Generates a consequence record
 */
export function generateConsequence(
  templateId: string,
  variables: Record<string, string | number>
): ConsequenceRef {
  const template = consequenceTemplates[templateId];
  if (!template) {
    throw new Error(`Unknown consequence template: ${templateId}`);
  }

  // Apply variable substitution
  let description = template.descriptionTemplate;
  for (const [key, value] of Object.entries(variables)) {
    description = description.replace(
      new RegExp(`\\{${key}\\}`, 'g'),
      String(value)
    );
  }

  // Random severity from allowed range
  const severity =
    template.severityRange[
      Math.floor(Math.random() * template.severityRange.length)
    ];

  // Random quantified impact
  const cost = Math.floor(
    template.typicalCostRange[0] +
      Math.random() *
        (template.typicalCostRange[1] - template.typicalCostRange[0])
  );
  const days = Math.floor(
    template.typicalDelayRange[0] +
      Math.random() *
        (template.typicalDelayRange[1] - template.typicalDelayRange[0])
  );

  return {
    category: template.category,
    description,
    severity,
    quantifiedImpact: {
      cost: cost > 0 ? cost : undefined,
      days: days > 0 ? days : undefined,
    },
  };
}

/**
 * Generates consequences for an inspection failure
 */
export function generateInspectionFailureConsequences(
  deficiencies: string[]
): ConsequenceRef[] {
  const consequences: ConsequenceRef[] = [];

  // Always add rework consequence
  consequences.push({
    category: 'REWORK_REQUIRED',
    description: `Corrections required: ${deficiencies.join('; ')}`,
    severity: 'medium',
    quantifiedImpact: {
      days: Math.ceil(deficiencies.length / 2) + 1,
    },
  });

  // Add schedule delay
  consequences.push({
    category: 'SCHEDULE_DELAY',
    description: 'Work paused pending re-inspection',
    severity: 'low',
    quantifiedImpact: {
      days: 2,
    },
  });

  // Possible regulatory concern for certain deficiencies
  const regulatoryKeywords = [
    'code',
    'fire',
    'safety',
    'egress',
    'GFCI',
    'grounding',
  ];
  const hasRegulatoryIssue = deficiencies.some((d) =>
    regulatoryKeywords.some((k) => d.toLowerCase().includes(k.toLowerCase()))
  );

  if (hasRegulatoryIssue) {
    consequences.push({
      category: 'REGULATORY_CONCERN',
      description: 'Code compliance issue identified',
      severity: 'high',
    });
  }

  return consequences;
}
