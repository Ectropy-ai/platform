/**
 * Roadmap Data Models
 * Strategic roadmap tracking for MCP-guided development
 */

export interface RoadmapPhase {
  id: string;
  phase?: number; // Optional phase number (extracted from id if needed)
  name: string;
  description: string;
  status: 'planned' | 'in-progress' | 'complete' | 'blocked';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[]; // Phase IDs that must complete first
  deliverables: Deliverable[];
  blockers?: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  startDate?: Date;
  targetDate?: Date;
  completionDate?: Date;
}

export interface Deliverable {
  id: string;
  name: string;
  description: string;
  status: 'not-started' | 'in-progress' | 'complete';
  assignee?: string;
  assignedTo?: string; // Alias for assignee (some data uses this)
  filesImpacted: string[];
  testsCoverage?: number;
  evidence?: string[]; // URLs, commit hashes, etc.
}

export interface Roadmap {
  version: string;
  lastUpdated: Date;
  phases: RoadmapPhase[];
  currentPhase: string; // Current phase ID
  overallProgress: number; // 0-100
  businessRoadmapReference?: {
    description: string;
    location: string;
    mcpAccess: string;
    note: string;
  };
  strategicMilestones?: Record<
    string,
    {
      date: string;
      description: string;
      deliverables?: string[];
    }
  >;
}

export interface RoadmapAlignment {
  aligned: boolean;
  currentPhase: RoadmapPhase;
  workPlanMatchesPhase: boolean;
  phaseProgress: number;
  recommendations: string[];
  blockers: string[];
}

/**
 * Business Roadmap Data Models
 * Strategic business planning and operations tracking
 */

export interface BusinessRoadmap {
  // V3 schema properties
  schemaVersion?: string;
  ventureId?: string;
  organizationName: string;
  lastUpdated: string;
  founded?: string;
  industry?: string[];
  location?: string;
  license?: string;
  financials?: BusinessFinancials;
  team?: BusinessTeam;
  competitive?: Record<string, unknown>;
  market?: BusinessMarket;
  traction?: BusinessTraction;
  presentation?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  // Legacy V1 properties (optional for backward compatibility)
  version?: string;
  mission?: string;
  vision?: string;
  currentStage?: string;
  overallProgress?: number;
  productRoadmapReference?: {
    description: string;
    location: string;
    mcpAccess: string;
    note: string;
  };
  strategicMilestones?: Record<string, StrategicMilestone>;
  currentMetrics?: BusinessMetrics;
  phases?: BusinessPhase[];
}

export interface BusinessFinancials {
  preSeed?: Record<string, unknown>;
  burnRate?: Record<string, unknown>;
  runway?: Record<string, unknown>;
  mrr?: Record<string, unknown>;
  arr?: Record<string, unknown>;
  totalRaised?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BusinessTeam {
  current?: Record<string, unknown>;
  members?: unknown[];
  advisors?: unknown[];
  contractors?: unknown[];
  keyHires?: unknown[];
  [key: string]: unknown;
}

export interface BusinessMarket {
  tam?: Record<string, unknown>;
  sam?: Record<string, unknown>;
  som?: Record<string, unknown>;
  cagr?: Record<string, unknown>;
  trends?: unknown[];
  [key: string]: unknown;
}

export interface BusinessTraction {
  customerCount?: Record<string, unknown>;
  customers?: unknown[];
  testimonials?: unknown[];
  pilotDetails?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BusinessPhase {
  id: string;
  name: string;
  description: string;
  status: 'not-started' | 'in-progress' | 'complete';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[];
  startDate: string;
  targetDate: string;
  keyObjectives: string[];
  deliverables: BusinessDeliverable[];
}

export interface BusinessDeliverable {
  id: string;
  name: string;
  description: string;
  status: 'not-started' | 'in-progress' | 'complete';
  owner: string;
  targetDate?: string;
  dependencies?: string[];
  successMetrics?: Record<string, string>;
  evidence?: string[];
}

export interface StrategicMilestone {
  date: string;
  description: string;
  businessObjective: string;
  metrics: Record<string, string>;
}

export interface BusinessMetrics {
  asOf: string;
  team: {
    fullTime: number;
    contractors: number;
    advisors: number;
  };
  financials: {
    revenue: number;
    mrr: number;
    runway: string;
    monthlyBurn: number;
  };
  customers: {
    total: number;
    paying: number;
    pilots: number;
    leads: number;
  };
  community: {
    githubStars: number;
    contributors: number;
    slackMembers: number;
  };
  targets: {
    teamQ1_2026: number;
    revenueQ3_2026: number;
    customersQ3_2026: number;
    githubStarsQ4_2026: number;
  };
}
