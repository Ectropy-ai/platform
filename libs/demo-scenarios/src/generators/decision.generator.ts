/**
 * ============================================================================
 * DECISION EVENT GENERATOR
 * ============================================================================
 * Generates realistic decision events for demo scenarios, following the
 * M3 decision lifecycle and authority cascade patterns.
 *
 * @module @ectropy/demo-scenarios/generators
 * @version 1.0.0
 * ============================================================================
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ScenarioEvent,
  DecisionEventPayload,
  DecisionOption,
  PMDecisionType,
  AuthorityLevel,
  TimelinePosition,
  ConsequenceRef,
  Persona,
} from '../types/index.js';

// ============================================================================
// DECISION TEMPLATES
// ============================================================================

/**
 * Common construction decision templates
 */
export interface DecisionTemplate {
  title: string;
  descriptionTemplate: string;
  questionTemplate: string;
  type: PMDecisionType;
  authorityRequired: AuthorityLevel;
  options: Omit<DecisionOption, 'id'>[];
  possibleConsequences: ConsequenceRef[];
  voxelTypes: string[];
  phase: string;
}

/**
 * Library of reusable decision templates
 */
export const decisionTemplates: Record<string, DecisionTemplate> = {
  'tolerance-variance-minor': {
    title: 'Minor Tolerance Variance',
    descriptionTemplate: 'Field variance of {variance}" detected at {location}',
    questionTemplate:
      'Variance of {variance}" detected. Within authority to approve correction method?',
    type: 'APPROVAL',
    authorityRequired: 1, // Foreman
    options: [
      {
        description: 'Shim/adjust to correct',
        consequences: ['Minor labor for adjustment'],
        estimatedCost: 50,
        estimatedDelay: 0,
        recommended: true,
      },
      {
        description: 'Request remediation',
        consequences: ['Potential delay', 'Additional cost'],
        estimatedCost: 500,
        estimatedDelay: 1,
      },
    ],
    possibleConsequences: [
      {
        category: 'TOLERANCE_VARIANCE',
        description: 'Minor variance adjusted',
        severity: 'low',
      },
    ],
    voxelTypes: ['STR', 'FND'],
    phase: 'structure',
  },
  'tolerance-variance-major': {
    title: 'Major Tolerance Variance',
    descriptionTemplate:
      'Significant variance of {variance}" detected at {location}',
    questionTemplate:
      'Variance of {variance}" exceeds field authority. Escalation required for resolution approach.',
    type: 'ESCALATION',
    authorityRequired: 3, // PM
    options: [
      {
        description: 'Design modification to accommodate',
        consequences: ['Design revision required', 'Potential schedule impact'],
        estimatedCost: 2500,
        estimatedDelay: 2,
        recommended: true,
      },
      {
        description: 'Remediation and correction',
        consequences: ['Significant rework', 'Schedule delay'],
        estimatedCost: 8000,
        estimatedDelay: 5,
      },
      {
        description: 'Accept as-is with documentation',
        consequences: ['Potential future issues', 'Warranty implications'],
        estimatedCost: 0,
        estimatedDelay: 0,
      },
    ],
    possibleConsequences: [
      {
        category: 'TOLERANCE_VARIANCE',
        description: 'Major variance requiring decision',
        severity: 'high',
      },
      {
        category: 'REWORK_REQUIRED',
        description: 'Potential rework depending on decision',
        severity: 'medium',
      },
    ],
    voxelTypes: ['STR', 'FND', 'MEP'],
    phase: 'structure',
  },
  'material-substitution': {
    title: 'Material Substitution Request',
    descriptionTemplate: 'Substitution requested for {material} at {location}',
    questionTemplate:
      'Specified {material} unavailable. Lead time {leadTime} weeks. Approve substitute {substitute}?',
    type: 'APPROVAL',
    authorityRequired: 2, // Superintendent
    options: [
      {
        description: 'Approve substitute material',
        consequences: [
          'Substitute may have different properties',
          'Update submittals',
        ],
        estimatedCost: 0,
        estimatedDelay: 0,
        recommended: true,
      },
      {
        description: 'Wait for specified material',
        consequences: ['Schedule delay', 'Possible sequencing issues'],
        estimatedCost: 0,
        estimatedDelay: 0, // Will be calculated from leadTime
      },
    ],
    possibleConsequences: [
      {
        category: 'MATERIAL_MISMATCH',
        description: 'Substitution may affect performance',
        severity: 'low',
      },
    ],
    voxelTypes: ['STR', 'MEP', 'FIN'],
    phase: 'rough_in',
  },
  'design-clarification': {
    title: 'Design Clarification Required',
    descriptionTemplate: 'Clarification needed on {element} at {location}',
    questionTemplate:
      'Drawing conflict between {docA} and {docB}. Which takes precedence?',
    type: 'CLARIFICATION',
    authorityRequired: 4, // Architect
    options: [
      {
        description: 'Follow architectural intent',
        consequences: ['May require structural verification'],
        estimatedCost: 0,
        estimatedDelay: 0,
      },
      {
        description: 'Follow structural requirements',
        consequences: ['May affect design intent'],
        estimatedCost: 0,
        estimatedDelay: 0,
      },
      {
        description: 'Issue revised detail',
        consequences: ['Additional design time'],
        estimatedCost: 500,
        estimatedDelay: 1,
        recommended: true,
      },
    ],
    possibleConsequences: [
      {
        category: 'DESIGN_CHANGE',
        description: 'Clarification may require design update',
        severity: 'low',
      },
    ],
    voxelTypes: ['STR', 'MEP', 'ARCH'],
    phase: 'structure',
  },
  'coordination-conflict': {
    title: 'Trade Coordination Conflict',
    descriptionTemplate: 'Conflict between {tradeA} and {tradeB} at {location}',
    questionTemplate:
      '{tradeA} and {tradeB} routing conflicts at {location}. Which trade adjusts?',
    type: 'DIRECTION',
    authorityRequired: 2, // Superintendent
    options: [
      {
        description: '{tradeA} adjusts routing',
        consequences: [
          '{tradeA} additional labor',
          'Potential material changes',
        ],
        estimatedCost: 500,
        estimatedDelay: 0,
      },
      {
        description: '{tradeB} adjusts routing',
        consequences: [
          '{tradeB} additional labor',
          'Potential material changes',
        ],
        estimatedCost: 500,
        estimatedDelay: 0,
      },
      {
        description: 'Both trades adjust with redesign',
        consequences: ['Design time required', 'Optimal solution'],
        estimatedCost: 1500,
        estimatedDelay: 1,
        recommended: true,
      },
    ],
    possibleConsequences: [
      {
        category: 'COORDINATION_CONFLICT',
        description: 'Trade coordination required',
        severity: 'medium',
      },
      {
        category: 'REWORK_REQUIRED',
        description: 'Routing adjustment needed',
        severity: 'low',
      },
    ],
    voxelTypes: ['MEP'],
    phase: 'rough_in',
  },
  'schedule-acceleration': {
    title: 'Schedule Acceleration Request',
    descriptionTemplate: 'Request to accelerate {phase} at {location}',
    questionTemplate:
      'Schedule behind by {days} days. Approve overtime/additional crews to recover?',
    type: 'APPROVAL',
    authorityRequired: 3, // PM
    options: [
      {
        description: 'Approve overtime for current crews',
        consequences: ['Additional labor cost', 'Crew fatigue risk'],
        estimatedCost: 5000,
        estimatedDelay: -2, // Negative = recovery
        recommended: true,
      },
      {
        description: 'Add additional crew',
        consequences: ['Significant cost increase', 'Coordination complexity'],
        estimatedCost: 15000,
        estimatedDelay: -3,
      },
      {
        description: 'Accept schedule slip',
        consequences: ['Project delay', 'Potential liquidated damages'],
        estimatedCost: 0,
        estimatedDelay: 0,
      },
    ],
    possibleConsequences: [
      {
        category: 'SCHEDULE_DELAY',
        description: 'Schedule impact assessment',
        severity: 'medium',
      },
      {
        category: 'COST_INCREASE',
        description: 'Acceleration costs',
        severity: 'medium',
      },
    ],
    voxelTypes: [],
    phase: 'structure',
  },
  'safety-concern': {
    title: 'Safety Concern Identified',
    descriptionTemplate: 'Safety issue identified at {location}',
    questionTemplate: 'Safety concern: {issue}. Immediate action required.',
    type: 'DIRECTION',
    authorityRequired: 2, // Superintendent
    options: [
      {
        description: 'Stop work and remediate',
        consequences: ['Work stoppage', 'Safety prioritized'],
        estimatedCost: 0,
        estimatedDelay: 0,
        recommended: true,
      },
      {
        description: 'Implement temporary protection',
        consequences: ['Work continues', 'Temporary measures'],
        estimatedCost: 500,
        estimatedDelay: 0,
      },
    ],
    possibleConsequences: [
      {
        category: 'SAFETY_RISK',
        description: 'Safety concern requiring action',
        severity: 'high',
      },
    ],
    voxelTypes: [],
    phase: 'structure',
  },
  'change-order-minor': {
    title: 'Minor Change Order',
    descriptionTemplate: 'Owner-requested change for {element}',
    questionTemplate:
      'Owner requests {change}. Estimated cost ${cost}. Proceed?',
    type: 'APPROVAL',
    authorityRequired: 3, // PM (within budget authority)
    options: [
      {
        description: 'Approve and proceed',
        consequences: ['Additional work', 'Budget adjustment'],
        estimatedCost: 0, // Variable
        estimatedDelay: 0,
        recommended: true,
      },
      {
        description: 'Decline - out of scope',
        consequences: ['Owner may be dissatisfied'],
        estimatedCost: 0,
        estimatedDelay: 0,
      },
    ],
    possibleConsequences: [
      {
        category: 'SCOPE_CHANGE',
        description: 'Scope addition',
        severity: 'low',
      },
      {
        category: 'COST_INCREASE',
        description: 'Budget impact',
        severity: 'low',
      },
    ],
    voxelTypes: [],
    phase: 'finishes',
  },
  'inspection-failure': {
    title: 'Inspection Deficiency',
    descriptionTemplate: 'Inspection failed at {location}',
    questionTemplate:
      'Inspection failed: {deficiency}. Corrective action required.',
    type: 'DIRECTION',
    authorityRequired: 2, // Superintendent
    options: [
      {
        description: 'Immediate correction and re-inspection',
        consequences: ['Rework required', 'Re-inspection fee'],
        estimatedCost: 1000,
        estimatedDelay: 1,
        recommended: true,
      },
      {
        description: 'Request variance from inspector',
        consequences: ['May not be approved', 'Documentation required'],
        estimatedCost: 200,
        estimatedDelay: 2,
      },
    ],
    possibleConsequences: [
      {
        category: 'REWORK_REQUIRED',
        description: 'Correction needed',
        severity: 'medium',
      },
      {
        category: 'REGULATORY_CONCERN',
        description: 'Code compliance',
        severity: 'high',
      },
    ],
    voxelTypes: [],
    phase: 'rough_in',
  },
};

// ============================================================================
// GENERATOR FUNCTIONS
// ============================================================================

/**
 * Options for generating a decision
 */
export interface DecisionGeneratorOptions {
  projectId: string;
  templateId: string;
  position: TimelinePosition;
  variables?: Record<string, string | number>;
  actor?: Persona;
  voxelRefs?: string[];
  customOptions?: Partial<DecisionOption>[];
}

/**
 * Generates a decision event from a template
 */
export function generateDecision(
  options: DecisionGeneratorOptions
): ScenarioEvent {
  const template = decisionTemplates[options.templateId];
  if (!template) {
    throw new Error(`Unknown decision template: ${options.templateId}`);
  }

  const id = `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;
  const decisionId = `DEC-${uuidv4().substring(0, 8).toUpperCase()}`;
  const variables = options.variables || {};

  // Apply variable substitution
  const applyVariables = (text: string): string => {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return result;
  };

  // Generate options with IDs
  const generatedOptions: DecisionOption[] = template.options.map(
    (opt, index) => ({
      ...opt,
      id: `OPT-${String.fromCharCode(65 + index)}`, // OPT-A, OPT-B, etc.
      description: applyVariables(opt.description),
      consequences: opt.consequences.map((c) => applyVariables(c)),
    })
  );

  // Apply custom option overrides if provided
  if (options.customOptions) {
    options.customOptions.forEach((custom, index) => {
      if (generatedOptions[index]) {
        Object.assign(generatedOptions[index], custom);
      }
    });
  }

  const payload: DecisionEventPayload = {
    type: 'decision',
    decisionType: template.type,
    question: applyVariables(template.questionTemplate),
    options: generatedOptions,
    authorityRequired: template.authorityRequired,
    budgetImpact:
      generatedOptions.find((o) => o.recommended)?.estimatedCost || 0,
    scheduleImpact:
      generatedOptions.find((o) => o.recommended)?.estimatedDelay || 0,
  };

  return {
    id,
    urn: `urn:ectropy:${options.projectId}:event:${id}`,
    position: options.position,
    type: 'decision',
    actor: options.actor?.role || 'contractor',
    priority: template.authorityRequired >= 3 ? 'high' : 'normal',
    title: applyVariables(template.title),
    description: applyVariables(template.descriptionTemplate),
    voxelRefs: options.voxelRefs || [],
    decisionRefs: [decisionId],
    payload,
    consequences: template.possibleConsequences,
    triggeredEvents: [],
    metadata: {
      probability: 0.8,
      dependencies: [],
      skippable: false,
      interactive: true,
      emphasis: template.authorityRequired >= 4 ? 'highlighted' : 'normal',
    },
  };
}

/**
 * Generates a random decision appropriate for a project phase
 */
export function generateRandomDecisionForPhase(
  projectId: string,
  phase: string,
  position: TimelinePosition,
  voxelRefs: string[] = []
): ScenarioEvent {
  // Filter templates by phase
  const phaseTemplates = Object.entries(decisionTemplates)
    .filter(([_, t]) => t.phase === phase || t.phase === '')
    .map(([id, _]) => id);

  if (phaseTemplates.length === 0) {
    // Default to tolerance variance
    phaseTemplates.push('tolerance-variance-minor');
  }

  const templateId =
    phaseTemplates[Math.floor(Math.random() * phaseTemplates.length)];

  return generateDecision({
    projectId,
    templateId,
    position,
    voxelRefs,
    variables: {
      variance: (Math.random() * 0.5).toFixed(2),
      location: `Zone ${Math.floor(Math.random() * 10) + 1}`,
      leadTime: Math.floor(Math.random() * 8) + 2,
    },
  });
}

/**
 * Generates an approval event for a decision
 */
export function generateApprovalForDecision(
  decision: ScenarioEvent,
  approver: Persona,
  position: TimelinePosition,
  projectId: string,
  _selectedOption?: string // Unused parameter - reserved for future use
): ScenarioEvent {
  const id = `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;

  return {
    id,
    urn: `urn:ectropy:${projectId}:event:${id}`,
    position,
    type: 'approval',
    actor: approver.role,
    priority: decision.priority,
    title: `${decision.title} - Approved`,
    description: `${approver.name} approved the decision`,
    voxelRefs: decision.voxelRefs,
    decisionRefs: decision.decisionRefs,
    payload: {
      type: 'approval',
      approvalType: 'decision',
      approvedBy: approver.role,
      conditions: [],
    },
    consequences: [],
    triggeredEvents: [],
    metadata: {
      probability: 1.0,
      dependencies: [decision.id],
      skippable: false,
      interactive: false,
      emphasis: 'normal',
    },
  };
}
