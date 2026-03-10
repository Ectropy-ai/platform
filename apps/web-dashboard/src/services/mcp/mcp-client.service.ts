/**
 * MCP Client Service
 * Handles all communication with MCP Server deliverable lifecycle endpoints
 */

import { apiClient } from '../apiClient';

export interface DeliverableSubmission {
  deliverableId: string;
  developer: string;
  workCompleted: {
    filesChanged: string[];
    testsPassed: boolean;
    description: string;
    estimatedEffort: string;
    commitSha?: string;
  };
  evidence: {
    artifacts: string[];
    context: string;
    approach: string;
    outcome: string;
    keyFindings?: string[];
    decisions?: string[];
  };
  decisionsApproved?: Array<{
    decisionId: string;
    option: string;
    rationale: string;
  }>;
}

export interface ValidationResult {
  approved: boolean;
  validationResults: {
    acceptanceCriteriaMet: boolean;
    dependenciesSatisfied: boolean;
    testsPass: boolean;
    codeQualityScore: number;
    details: {
      acceptanceCriteria: Array<{
        criterion: string;
        type: string;
        met: boolean;
        evidence?: string;
      }>;
      dependencyStatuses: Array<{
        deliverableId: string;
        name: string;
        status: string;
        blocking: boolean;
      }>;
      testResults: {
        passed: number;
        failed: number;
        total: number;
      };
    };
  };
  feedback?: string;
}

export interface DeliverableSubmitResponse {
  success: boolean;
  approved: boolean;
  validation: ValidationResult;
  evidence?: {
    sessionId: string;
    sessionPath: string;
    filesGenerated: {
      sessionJson: string;
      readme: string;
      evidenceJson: string;
      artifacts: string[];
    };
  };
  mcpUpdates?: {
    currentTruthUpdated: boolean;
    decisionLogUpdated: boolean;
    roadmapUpdated: boolean;
  };
  message?: string;
  error?: string;
}

export interface DeliverableStatus {
  id: string;
  name: string;
  description: string;
  status: string;
  assignedTo?: string;
  phase: string;
  priority: string;
  estimatedEffort: string;
  dependencies: Array<{
    deliverableId: string;
    name: string;
    status: string;
    blocking: boolean;
  }>;
  acceptanceCriteria: Array<{
    criterion: string;
    type: string;
    validation: string;
  }>;
  blockers?: string[];
  evidenceSessions: string[];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface DeliverableListItem {
  id: string;
  name: string;
  phase: string;
  status: string;
  priority: string;
  estimatedEffort?: string;
  assignedTo?: string;
}

export interface NextDeliverable {
  id: string;
  name: string;
  phase: string;
  priority: string;
  estimatedEffort?: string;
  dependenciesMet: boolean;
  blockers: string[];
}

class MCPClientService {
  private baseURL: string;

  constructor() {
    // Use existing apiClient which handles base URL configuration
    this.baseURL = '/api/mcp/deliverables';
  }

  /**
   * Submit completed deliverable for validation and evidence generation
   */
  async submitDeliverable(submission: DeliverableSubmission): Promise<DeliverableSubmitResponse> {
    try {
      const response = await apiClient.post<DeliverableSubmitResponse>(
        `${this.baseURL}/submit`,
        submission,
      );

      if (response.success && response.data) {
        return response.data;
      }

      return {
        success: false,
        approved: false,
        validation: this.getErrorValidation(),
        error: response.error || 'Unknown error',
      };
    } catch (error: any) {
      console.error('[MCP Client] Submit error:', error);
      return {
        success: false,
        approved: false,
        validation: this.getErrorValidation(),
        error: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Validate deliverable without submitting (pre-submission check)
   */
  async validateDeliverable(
    submission: DeliverableSubmission,
  ): Promise<{ success: boolean; validation: ValidationResult; message?: string }> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        validation: ValidationResult;
        message?: string;
      }>(`${this.baseURL}/validate`, submission);

      if (response.success && response.data) {
        return response.data;
      }

      return {
        success: false,
        validation: this.getErrorValidation(),
        message: response.error || 'Validation failed',
      };
    } catch (error: any) {
      console.error('[MCP Client] Validate error:', error);
      return {
        success: false,
        validation: this.getErrorValidation(),
        message: error.response?.data?.message || error.message || 'Validation failed',
      };
    }
  }

  /**
   * Get status of a specific deliverable
   */
  async getDeliverableStatus(
    deliverableId: string,
  ): Promise<{ success: boolean; deliverable?: DeliverableStatus; error?: string }> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        deliverable?: DeliverableStatus;
        error?: string;
      }>(`${this.baseURL}/${deliverableId}/status`);

      if (response.success && response.data) {
        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to get status',
      };
    } catch (error: any) {
      console.error('[MCP Client] Get status error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to get status',
      };
    }
  }

  /**
   * List all deliverables with optional filtering
   */
  async listDeliverables(filters?: {
    phase?: string;
    status?: string;
    priority?: string;
  }): Promise<{
    success: boolean;
    count?: number;
    deliverables?: DeliverableListItem[];
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (filters?.phase) params.append('phase', filters.phase);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.priority) params.append('priority', filters.priority);

      const response = await apiClient.get<{
        success: boolean;
        count?: number;
        deliverables?: DeliverableListItem[];
        error?: string;
      }>(`${this.baseURL}?${params.toString()}`);

      if (response.success && response.data) {
        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to list deliverables',
      };
    } catch (error: any) {
      console.error('[MCP Client] List deliverables error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to list deliverables',
      };
    }
  }

  /**
   * Get next recommended deliverable to work on
   */
  async getNextDeliverable(filters?: { phase?: string; developer?: string }): Promise<{
    success: boolean;
    deliverable?: NextDeliverable | null;
    message?: string;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (filters?.phase) params.append('phase', filters.phase);
      if (filters?.developer) params.append('developer', filters.developer);

      const response = await apiClient.get<{
        success: boolean;
        deliverable?: NextDeliverable | null;
        message?: string;
        error?: string;
      }>(`${this.baseURL}/next?${params.toString()}`);

      if (response.success && response.data) {
        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to get next deliverable',
      };
    } catch (error: any) {
      console.error('[MCP Client] Get next deliverable error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to get next deliverable',
      };
    }
  }

  /**
   * Helper: Build error validation response
   */
  private getErrorValidation(): ValidationResult {
    return {
      approved: false,
      validationResults: {
        acceptanceCriteriaMet: false,
        dependenciesSatisfied: false,
        testsPass: false,
        codeQualityScore: 0,
        details: {
          acceptanceCriteria: [],
          dependencyStatuses: [],
          testResults: { passed: 0, failed: 0, total: 0 },
        },
      },
      feedback: 'Request failed',
    };
  }
}

// Export singleton instance
export const mcpClient = new MCPClientService();
export default mcpClient;
