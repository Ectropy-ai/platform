/**
 * ============================================================================
 * ECTROPY DEMO SCENARIOS - PERSONA DEFINITIONS
 * ============================================================================
 * Enterprise persona definitions with behavioral traits for realistic
 * demo data generation. Based on demo-accounts.json and industry patterns.
 *
 * @module @ectropy/demo-scenarios/personas
 * @version 1.0.0
 * ============================================================================
 */

import type {
  Persona,
  PersonaBehavior,
  // PersonaRole, // Unused import
  ExtendedRole,
  AuthorityLevel,
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// BEHAVIOR PROFILES
// ============================================================================

/**
 * Behavioral profile for architects
 * - Detail-oriented, thorough reviews
 * - Design-focused communication
 * - Moderate escalation tendency
 */
const architectBehavior: PersonaBehavior = {
  responseSpeed: 6,
  thoroughness: 9,
  escalationTendency: 0.3,
  communicationStyle: 'technical',
  workingHours: {
    start: 8,
    end: 18,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.4,
};

/**
 * Behavioral profile for engineers
 * - Highly analytical, very thorough
 * - Technical communication style
 * - Low escalation (prefers to solve)
 */
const engineerBehavior: PersonaBehavior = {
  responseSpeed: 5,
  thoroughness: 10,
  escalationTendency: 0.2,
  communicationStyle: 'technical',
  workingHours: {
    start: 7,
    end: 17,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.3,
};

/**
 * Behavioral profile for contractors
 * - Fast responder, action-oriented
 * - Brief, practical communication
 * - Moderate escalation for scope/cost
 */
const contractorBehavior: PersonaBehavior = {
  responseSpeed: 8,
  thoroughness: 7,
  escalationTendency: 0.4,
  communicationStyle: 'brief',
  workingHours: {
    start: 6,
    end: 16,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.2,
};

/**
 * Behavioral profile for owners
 * - Selective engagement, high-level focus
 * - Formal communication
 * - High escalation (wants visibility)
 */
const ownerBehavior: PersonaBehavior = {
  responseSpeed: 4,
  thoroughness: 6,
  escalationTendency: 0.6,
  communicationStyle: 'formal',
  workingHours: {
    start: 9,
    end: 17,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.5,
};

/**
 * Behavioral profile for foremen
 * - Very fast responder, on-site
 * - Brief, practical communication
 * - Low escalation within authority
 */
const foremanBehavior: PersonaBehavior = {
  responseSpeed: 9,
  thoroughness: 6,
  escalationTendency: 0.3,
  communicationStyle: 'brief',
  workingHours: {
    start: 5,
    end: 15,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.1,
};

/**
 * Behavioral profile for superintendents
 * - Fast responder, site management focus
 * - Casual but professional communication
 * - Balanced escalation
 */
const superintendentBehavior: PersonaBehavior = {
  responseSpeed: 8,
  thoroughness: 7,
  escalationTendency: 0.35,
  communicationStyle: 'casual',
  workingHours: {
    start: 6,
    end: 17,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.15,
};

/**
 * Behavioral profile for project managers
 * - Balanced response time
 * - Professional, thorough communication
 * - Moderate escalation (ownership mentality)
 */
const projectManagerBehavior: PersonaBehavior = {
  responseSpeed: 7,
  thoroughness: 8,
  escalationTendency: 0.25,
  communicationStyle: 'formal',
  workingHours: {
    start: 7,
    end: 18,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.25,
};

/**
 * Behavioral profile for inspectors
 * - Methodical, scheduled responses
 * - Technical, regulatory communication
 * - Very low escalation (authority)
 */
const inspectorBehavior: PersonaBehavior = {
  responseSpeed: 4,
  thoroughness: 10,
  escalationTendency: 0.1,
  communicationStyle: 'technical',
  workingHours: {
    start: 7,
    end: 15,
    timezone: 'America/New_York',
  },
  changeRequestFrequency: 0.0,
};

// ============================================================================
// BEHAVIOR MAP
// ============================================================================

/**
 * Map of extended roles to behavior profiles
 */
export const behaviorProfiles: Record<ExtendedRole, PersonaBehavior> = {
  architect: architectBehavior,
  engineer: engineerBehavior,
  contractor: contractorBehavior,
  owner: ownerBehavior,
  foreman: foremanBehavior,
  superintendent: superintendentBehavior,
  pm: projectManagerBehavior,
  inspector: inspectorBehavior,
  field_worker: foremanBehavior, // Similar to foreman
};

// ============================================================================
// AUTHORITY LEVEL MAPPING
// ============================================================================

/**
 * Maps persona roles to default authority levels
 */
export const roleToAuthorityLevel: Record<ExtendedRole, AuthorityLevel> = {
  field_worker: 0,
  foreman: 1,
  superintendent: 2,
  pm: 3,
  contractor: 3, // Contractor typically has PM-level authority
  architect: 4,
  engineer: 4,
  owner: 5,
  inspector: 6, // Regulatory authority
};

// ============================================================================
// DEFAULT PERSONAS
// ============================================================================

/**
 * Creates the default architect persona
 */
export function createArchitectPersona(projectId: string): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:architect:${id}`,
    name: 'Alex Architect',
    email: 'architect@demo.com',
    role: 'architect',
    extendedRole: 'architect',
    company: 'Design Partners LLC',
    authorityLevel: 4,
    permissions: [
      'design',
      'upload',
      'collaborate',
      'export',
      'APPROVE_DESIGN_CHANGE',
    ],
    dashboardUrl: '/dashboard/architect',
    avatar: 'AA',
    behaviorTraits: architectBehavior,
  };
}

/**
 * Creates the default engineer persona
 */
export function createEngineerPersona(projectId: string): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:engineer:${id}`,
    name: 'Emma Engineer',
    email: 'engineer@demo.com',
    role: 'engineer',
    extendedRole: 'engineer',
    company: 'Structural Solutions Inc',
    authorityLevel: 4,
    permissions: [
      'analyze',
      'validate',
      'collaborate',
      'report',
      'APPROVE_DESIGN_CHANGE',
    ],
    dashboardUrl: '/dashboard/engineer',
    avatar: 'EE',
    behaviorTraits: engineerBehavior,
  };
}

/**
 * Creates the default contractor persona
 */
export function createContractorPersona(projectId: string): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:contractor:${id}`,
    name: 'Carlos Contractor',
    email: 'contractor@demo.com',
    role: 'contractor',
    extendedRole: 'contractor',
    company: 'BuildRight Construction',
    authorityLevel: 3,
    permissions: [
      'execute',
      'progress',
      'collaborate',
      'materials',
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE',
      'MODIFY_SCHEDULE',
    ],
    dashboardUrl: '/dashboard/contractor',
    avatar: 'CC',
    behaviorTraits: contractorBehavior,
  };
}

/**
 * Creates the default owner persona
 */
export function createOwnerPersona(projectId: string): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:owner:${id}`,
    name: 'Olivia Owner',
    email: 'owner@demo.com',
    role: 'owner',
    extendedRole: 'owner',
    company: 'Property Ventures',
    authorityLevel: 5,
    permissions: [
      'oversight',
      'approve',
      'track',
      'finance',
      'APPROVE_DECISION',
      'ESCALATE_DECISION',
    ],
    dashboardUrl: '/dashboard/owner',
    avatar: 'OO',
    behaviorTraits: ownerBehavior,
  };
}

// ============================================================================
// SUPPORTING CAST PERSONAS
// ============================================================================

/**
 * Creates a foreman persona for field scenarios
 */
export function createForemanPersona(
  projectId: string,
  trade: string
): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:foreman:${id}`,
    name: `${trade} Foreman`,
    email: `foreman.${trade.toLowerCase()}@demo.com`,
    role: 'contractor',
    extendedRole: 'foreman',
    company: 'BuildRight Construction',
    trade,
    authorityLevel: 1,
    permissions: [
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
    ],
    dashboardUrl: '/dashboard/field',
    avatar: `${trade.charAt(0)}F`,
    behaviorTraits: foremanBehavior,
  };
}

/**
 * Creates a superintendent persona
 */
export function createSuperintendentPersona(projectId: string): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:superintendent:${id}`,
    name: 'Sam Superintendent',
    email: 'superintendent@demo.com',
    role: 'contractor',
    extendedRole: 'superintendent',
    company: 'BuildRight Construction',
    authorityLevel: 2,
    permissions: [
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE',
      'MODIFY_SCHEDULE',
      'REQUEST_INSPECTION',
    ],
    dashboardUrl: '/dashboard/superintendent',
    avatar: 'SS',
    behaviorTraits: superintendentBehavior,
  };
}

/**
 * Creates a project manager persona
 */
export function createProjectManagerPersona(projectId: string): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:pm:${id}`,
    name: 'Paula ProjectManager',
    email: 'pm@demo.com',
    role: 'contractor',
    extendedRole: 'pm',
    company: 'BuildRight Construction',
    authorityLevel: 3,
    permissions: [
      'CAPTURE_DECISION',
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'ESCALATE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE',
      'CREATE_PRE_APPROVAL',
      'MODIFY_SCHEDULE',
      'REQUEST_INSPECTION',
    ],
    dashboardUrl: '/dashboard/pm',
    avatar: 'PM',
    behaviorTraits: projectManagerBehavior,
  };
}

/**
 * Creates an inspector persona
 */
export function createInspectorPersona(
  projectId: string,
  type: string = 'Building'
): Persona {
  const id = uuidv4();
  return {
    id,
    urn: `urn:ectropy:${projectId}:persona:inspector:${id}`,
    name: `${type} Inspector`,
    email: `inspector.${type.toLowerCase()}@demo.com`,
    role: 'owner', // Closest primary role
    extendedRole: 'inspector',
    company: 'City Building Department',
    authorityLevel: 6,
    permissions: [
      'APPROVE_DECISION',
      'REJECT_DECISION',
      'APPROVE_CODE_VARIANCE',
      'COMPLETE_INSPECTION',
    ],
    dashboardUrl: '/dashboard/inspector',
    avatar: 'BI',
    behaviorTraits: inspectorBehavior,
  };
}

// ============================================================================
// CAST FACTORY
// ============================================================================

/**
 * Creates a complete demo cast with all four primary personas
 */
export function createDemoCast(projectId: string): {
  architect: Persona;
  engineer: Persona;
  contractor: Persona;
  owner: Persona;
  supporting: Persona[];
} {
  return {
    architect: createArchitectPersona(projectId),
    engineer: createEngineerPersona(projectId),
    contractor: createContractorPersona(projectId),
    owner: createOwnerPersona(projectId),
    supporting: [
      createSuperintendentPersona(projectId),
      createProjectManagerPersona(projectId),
      createForemanPersona(projectId, 'HVAC'),
      createForemanPersona(projectId, 'Electrical'),
      createInspectorPersona(projectId, 'Building'),
    ],
  };
}

/**
 * Gets the appropriate persona for an authority level
 */
export function getPersonaForAuthorityLevel(
  cast: ReturnType<typeof createDemoCast>,
  level: AuthorityLevel
): Persona {
  const allPersonas = [
    cast.architect,
    cast.engineer,
    cast.contractor,
    cast.owner,
    ...cast.supporting,
  ];

  // Find persona with matching authority level
  const match = allPersonas.find((p) => p.authorityLevel === level);
  if (match) return match;

  // Fallback to contractor for field decisions
  if (level <= 3) return cast.contractor;

  // Fallback to owner for high-level decisions
  return cast.owner;
}
