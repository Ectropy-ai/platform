/**
 * Type definitions for MCP Deliverable Lifecycle Management
 * Enables automated evidence generation and roadmap updates
 */

export interface DeliverableSubmission {
  deliverableId: string; // e.g., "p5a-monitoring-foundation"
  developer: string; // "erik-luhtech" or "agent-sonnet-4.5"
  workCompleted: {
    filesChanged: string[];
    testsPassed: boolean;
    description: string;
    estimatedEffort: string; // "3 days"
    commitSha?: string;
  };
  evidence: {
    artifacts: string[]; // paths to screenshots, logs, etc.
    context: string;
    approach: string;
    outcome: string;
    keyFindings?: string[];
    decisions?: string[];
  };
  decisionsApproved?: DecisionApproval[];
}

export interface DecisionApproval {
  decisionId: string;
  option: string;
  rationale: string;
  approvedBy: string;
}

export interface AcceptanceCriterion {
  criterion: string;
  validation: string;
  type: 'automated' | 'manual';
  met?: boolean;
  evidence?: string;
}

export interface DeliverableValidationResponse {
  approved: boolean;
  validationResults: {
    acceptanceCriteriaMet: boolean;
    dependenciesSatisfied: boolean;
    testsPass: boolean;
    codeQualityScore: number;
    details: {
      acceptanceCriteria: AcceptanceCriterion[];
      dependencyStatuses: DependencyStatus[];
      testResults: TestResults;
    };
  };
  feedback?: string;
  generatedEvidenceSessionId?: string;
  updatedFiles?: string[];
}

export interface DependencyStatus {
  deliverableId: string;
  name: string;
  status: DeliverableStatus;
  blocking: boolean;
}

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
  coverage?: number;
  failures?: TestFailure[];
}

export interface TestFailure {
  test: string;
  error: string;
}

export type DeliverableStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'completed'
  | 'blocked';

export interface DeliverableStatusResponse {
  id: string;
  name: string;
  description: string;
  status: DeliverableStatus;
  assignedTo?: string;
  phase: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort: string;
  dependencies: DependencyStatus[];
  acceptanceCriteria: AcceptanceCriterion[];
  blockers?: string[];
  evidenceSessions?: string[];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface EvidenceSessionMetadata {
  sessionId: string;
  deliverableId: string;
  developer: string;
  timestamp: string;
  phase: string;
  category: string;
  nodeType: 'deliverable' | 'investigation' | 'decision' | 'milestone';
  status: 'completed' | 'in-progress' | 'pending';
  tags: string[];
}

export interface EvidenceGenerationResult {
  success: boolean;
  sessionId: string;
  sessionPath: string;
  filesGenerated: {
    sessionJson: string;
    readme: string;
    evidenceJson: string;
    artifacts: string[];
  };
  mcpUpdates: {
    currentTruthUpdated: boolean;
    decisionLogUpdated: boolean;
    roadmapUpdated: boolean;
  };
  error?: string;
}
