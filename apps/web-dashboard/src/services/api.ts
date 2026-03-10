import { User } from '../hooks/useAuth';
import { logger } from '../services/logger';
import { config } from './config';
import { errorHandler, ErrorContext } from './errorHandler';
import Cookies from 'js-cookie';

// API Response Types
export interface LoginResponse {
  token: string; // Changed from 'REDACTED' to string
  user: User;
  expires: string;
}
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: 'success' | 'error';
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'planning';
  stakeholders: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Input type for project creation.
 * Only `name` is required — API defaults: status='planning', stakeholders=[]
 */
export type CreateProjectInput = {
  name: string;
  description?: string;
  status?: Project['status'];
  stakeholders?: string[];
};

export interface GovernanceRules {
  voting_threshold?: number;
  proposal_duration?: number;
  stakeholder_weights?: Record<string, number>;
  [key: string]: number | Record<string, number> | undefined;
}

export interface DAOTemplate {
  id: string; // Add missing id property
  name: string; // Add missing name property
  description: string; // Add missing description property
  status: 'active' | 'draft' | 'archived';
  governance_rules: GovernanceRules;
  created_at?: string; // Add missing created_at property
}

export interface DAOProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  proposer_role: 'architect' | 'engineer' | 'contractor' | 'owner';
  status: 'draft' | 'voting' | 'approved' | 'rejected' | 'expired';
  voting_starts: string;
  voting_ends: string;
  votes_for: number;
  votes_against: number;
  abstentions: number;
  required_votes: number;
  created_at: string;
}

export interface DAOVote {
  proposal_id: string;
  voter: string;
  voter_role: 'architect' | 'engineer' | 'contractor' | 'owner';
  decision: 'for' | 'against' | 'abstain';
  comment?: string;
  voting_power: number;
  voted_at: string;
}

export interface ProductSpecifications {
  grade?: string;
  length?: string;
  weight?: string;
  yield_strength?: string;
  strength_class?: string;
  cement_type?: string;
  aggregate_size?: string;
  slump?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ManufacturerProduct {
  id: string; // Add missing id property
  name: string; // Add missing name property
  manufacturer: string;
  category: string;
  specifications: ProductSpecifications;
  price?: number;
  availability: 'in_stock' | 'out_of_stock' | 'discontinued';
}

// Engineering Task Types (Sprint 5 - 2026-01-24)
export interface EngineeringTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'review';
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'analysis' | 'calculation' | 'review' | 'inspection' | 'approval';
  assignedTo?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  review: number;
  overdue: number;
  completionRate: number;
}

// Structural Alert Types (Sprint 5 - 2026-01-24)
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface StructuralAlert {
  id: string;
  projectId: string;
  voxelId?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  source?: string;
  sourceDecisionUrn?: string;
  targetTrades?: string[];
  requiresAcknowledgment: boolean;
  acknowledgedBy?: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertStats {
  total: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
  unacknowledged: number;
  expiringSoon: number;
}

export interface ElementProperties {
  concrete_grade?: string;
  reinforcement?: string;
  finish?: string;
  steel_grade?: string;
  coating?: string;
  connection_type?: string;
  insulation?: string;
  finish_external?: string;
  finish_internal?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ConstructionElement {
  id: string; // Add missing id property
  name: string; // Add missing name property
  type: 'wall' | 'beam' | 'column' | 'slab' | 'foundation' | 'roof' | 'door' | 'window';
  status: 'planned' | 'in_progress' | 'completed' | 'on_hold';
  material?: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
  position?: {
    x: number;
    y: number;
    z: number;
  };
  properties?: ElementProperties;
}

// API Client Class
class EctropyApiService {
  private baseUrl: string;
  private token: string | null;
  constructor() {
    this.baseUrl = config.apiBaseUrl;
    this.token = null;
    // Perform initial health check
    this.performInitialHealthCheck();
  }
  private async performInitialHealthCheck(): Promise<void> {
    try {
      const health = await config.performHealthCheck();
      if (health.overall) {
      } else {
      }
    } catch (_error) {}
  }

  // Helper method to get CSRF token from cookie
  private getCSRFToken(): string | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
  }

  // Helper method to make authenticated requests with enterprise error handling
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    context: ErrorContext = {},
  ): Promise<ApiResponse<T>> {
    return errorHandler.handleApiError(
      async () => {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        };
        if (this.token) {
          defaultHeaders['Authorization'] = `Bearer ${this.token}`;
        }
        // Add CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
        const method = options.method?.toUpperCase() || 'GET';
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
          const csrfToken = this.getCSRFToken();
          if (csrfToken) {
            defaultHeaders['X-CSRF-Token'] = csrfToken;
          }
        }
        const config: RequestInit = {
          ...options,
          credentials: 'include', // Include cookies for session-based auth
          headers: {
            ...defaultHeaders,
            ...options.headers,
          },
        };

        const response = await fetch(url, config);
        if (!response.ok) {
          const errorData = await response.text();
          let errorMessage;
          try {
            const parsed = JSON.parse(errorData);
            errorMessage = parsed.message || `HTTP error! status: ${response.status}`;
          } catch {
            errorMessage = `HTTP error! status: ${response.status}`;
          }
          const error = new Error(errorMessage) as Error & { status: number; response: Response };
          error.status = response.status;
          error.response = response;
          throw error;
        }

        const data = await response.json();
        return data;
      },
      3, // maxRetries parameter
      {
        ...context,
        component: 'api-service',
        action: `${options.method || 'GET'} ${endpoint}`,
      },
    );
  }

  // Authentication methods
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      { action: 'login', userId: email },
    );

    if (response.data.token) {
      this.token = 'REDACTED';
      Cookies.set('authToken', this.token, { secure: true, sameSite: 'strict' });
    }

    return response.data;
  }

  async logout(): Promise<void> {
    this.token = 'REDACTED';
    Cookies.remove('authToken');
  }

  async validateToken(): Promise<User> {
    const response = await this.request<User>(
      '/api/auth/validate',
      {},
      { action: 'validate-token' },
    );
    return response.data;
  }

  /**
   * Generic GET request method for enterprise data layer
   * SPRINT 5 (2026-01-23): Added for React Query hook integration
   *
   * @param endpoint - API endpoint (e.g., '/api/v1/projects')
   * @param context - Optional error context for logging
   * @returns API response with data
   */
  async get<T>(endpoint: string, context?: ErrorContext): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' }, context || { action: `GET ${endpoint}` });
  }

  // Project methods
  async getProjects(): Promise<Project[]> {
    try {
      const response = await this.request<any>('/api/v1/projects');

      // ENTERPRISE FIX (2026-01-12): Handle multiple response formats safely
      // ROOT CAUSE: API returns { data: [...], pagination: {...} } but response could be malformed
      // SOLUTION: Defensive checks to prevent "Cannot read properties of undefined (reading 'length')"

      // If response has .data property (standard API format)
      if (response && typeof response === 'object' && 'data' in response) {
        return Array.isArray(response.data) ? response.data : [];
      }

      // If response is directly an array (legacy format or mock)
      if (Array.isArray(response)) {
        return response;
      }

      // If response is malformed, return empty array
      console.warn('Unexpected projects API response format:', response);
      return [];
    } catch (error) {
      // STAGING FIX: Throw errors instead of silently returning []
      // ROOT CAUSE: Returning [] on API failure triggers ViewerPage auto-create
      // which creates duplicate "My First Project" entries
      logger.error('Failed to fetch projects:', { error });
      throw error;
    }
  }

  /**
   * Get my role for a specific project
   * PHASE 1: Role Switcher Removal (2026-02-09)
   * Returns project-specific role from project_roles table
   */
  async getMyProjectRole(projectId: string): Promise<{
    role: string;
    permissions: string[];
    votingPower: number;
    projectId: string;
    assignedAt: string;
  }> {
    const response = await this.request<{
      role: string;
      permissions: string[];
      votingPower: number;
      projectId: string;
      assignedAt: string;
    }>(`/api/v1/projects/${projectId}/my-role`);
    return response.data;
  }

  async createProject(project: CreateProjectInput): Promise<Project> {
    const response = await this.request<Project>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
    return response.data;
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    try {
      const response = await this.request<Project>(`/api/v1/projects/${projectId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch project by ID:', { error });
      return null;
    }
  }

  async getProjectProposals(projectId: string): Promise<DAOProposal[]> {
    try {
      const response = await this.request<DAOProposal[]>(`/api/v1/projects/${projectId}/proposals`);
      return response.data || [];
    } catch (error) {
      logger.error('Failed to fetch project proposals:', { error });
      return [];
    }
  }

  async createProjectProposal(
    projectId: string,
    proposal: {
      title: string;
      description: string;
      proposalType: string;
      votingDays: number;
    },
  ): Promise<DAOProposal> {
    const response = await this.request<DAOProposal>(`/api/v1/projects/${projectId}/proposals`, {
      method: 'POST',
      body: JSON.stringify(proposal),
    });
    return response.data;
  }

  async getProposalById(proposalId: string): Promise<DAOProposal | null> {
    try {
      const response = await this.request<DAOProposal>(`/api/v1/proposals/${proposalId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch proposal:', { error });
      return null;
    }
  }

  async voteOnProjectProposal(
    proposalId: string,
    vote: {
      decision: 'approve' | 'reject' | 'abstain';
      comment?: string;
    },
  ): Promise<DAOVote> {
    const response = await this.request<DAOVote>(`/api/v1/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify(vote),
    });
    return response.data;
  }

  // DAO Template methods
  async getDAOTemplates(): Promise<DAOTemplate[]> {
    try {
      const response = await this.request<DAOTemplate[]>('/api/v1/dao/templates');
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - return empty array and let UI handle empty state
      logger.error('Failed to fetch DAO templates:', { error });
      return [];
    }
  }

  async createDAOTemplate(template: Omit<DAOTemplate, 'id' | 'created_at'>): Promise<DAOTemplate> {
    const response = await this.request<DAOTemplate>('/api/v1/dao/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
    return response.data;
  }

  // DAO Proposal and Voting methods
  async getDAOProposals(): Promise<DAOProposal[]> {
    try {
      const response = await this.request<DAOProposal[]>('/api/v1/dao/proposals');
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - return empty array and let UI handle empty state
      logger.error('Failed to fetch DAO proposals:', { error });
      return [];
    }
  }

  async createDAOProposal(proposal: {
    title: string;
    description: string;
    proposer_role: string;
    voting_period_days: number;
    required_votes: number;
  }): Promise<DAOProposal> {
    try {
      const response = await this.request<DAOProposal>('/api/v1/dao/proposals', {
        method: 'POST',
        body: JSON.stringify({
          ...proposal,
          proposer: 'current-user', // Would come from auth context
          status: 'voting',
          voting_starts: new Date().toISOString(),
          voting_ends: new Date(
            Date.now() + proposal.voting_period_days * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      });
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - throw error for proper handling by React Query
      logger.error('Failed to create DAO proposal:', { error });
      throw error;
    }
  }

  async voteOnProposal(
    proposalId: string,
    decision: 'for' | 'against' | 'abstain',
    comment?: string,
  ): Promise<DAOVote> {
    try {
      const response = await this.request<DAOVote>(`/api/v1/dao/proposals/${proposalId}/vote`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          comment,
          voter_role: 'owner', // Would come from auth context
        }),
      });
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - throw error for proper handling by React Query
      logger.error('Failed to vote on proposal:', { error, proposalId, decision });
      throw error;
    }
  }

  async getProposalVotes(proposalId: string): Promise<DAOVote[]> {
    try {
      const response = await this.request<DAOVote[]>(`/api/v1/dao/proposals/${proposalId}/votes`);
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - return empty array and let UI handle empty state
      logger.error('Failed to fetch proposal votes:', { error, proposalId });
      return [];
    }
  }

  // Manufacturer Product methods
  async getManufacturerProducts(): Promise<ManufacturerProduct[]> {
    try {
      const response = await this.request<ManufacturerProduct[]>('/api/manufacturer/products');
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - return empty array and let UI handle empty state
      logger.error('Failed to fetch manufacturer products:', { error });
      return [];
    }
  }

  // Construction Elements methods
  async getConstructionElements(projectId: string): Promise<ConstructionElement[]> {
    try {
      const response = await this.request<ConstructionElement[]>(
        `/api/v1/projects/${projectId}/elements`,
      );
      return response.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - return empty array and let UI handle empty state
      logger.error('Failed to fetch construction elements:', { error, projectId });
      return [];
    }
  }

  // File upload methods
  async uploadFile(
    file: File,
    type: 'ifc' | 'document' | 'image',
  ): Promise<{ url: string; id: string }> {
    const formData = new FormData();
    formData.append('ifcFile', file);
    formData.append('type', type);

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/ifc/upload`, {
        method: 'POST',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: formData,
      });
      const data = await response.json();
      return data.data;
    } catch (error) {
      // SPRINT 4: Remove mock data fallback - throw error for proper handling
      logger.error('Failed to upload file:', { error, fileName: file.name, type });
      throw error;
    }
  }

  // Engineering Tasks methods (Sprint 5 - 2026-01-24)
  async getEngineeringTasks(
    projectId?: string,
    filters?: { status?: string; priority?: string; type?: string },
  ): Promise<EngineeringTask[]> {
    try {
      const params = new URLSearchParams();
      if (projectId) {
        params.append('project_id', projectId);
      }
      if (filters?.status) {
        params.append('status', filters.status);
      }
      if (filters?.priority) {
        params.append('priority', filters.priority);
      }
      if (filters?.type) {
        params.append('type', filters.type);
      }

      const endpoint = projectId
        ? `/api/v1/projects/${projectId}/tasks`
        : `/api/v1/tasks?${params.toString()}`;

      const response = await this.request<{ tasks: EngineeringTask[]; stats?: TaskStats }>(
        endpoint,
      );
      return response.data?.tasks || response.data || [];
    } catch (error) {
      logger.error('Failed to fetch engineering tasks:', { error, projectId });
      return [];
    }
  }

  async getTaskById(taskId: string): Promise<EngineeringTask | null> {
    try {
      const response = await this.request<EngineeringTask>(`/api/v1/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch task:', { error, taskId });
      return null;
    }
  }

  async createTask(
    task: Omit<EngineeringTask, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  ): Promise<EngineeringTask> {
    const response = await this.request<EngineeringTask>('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
    return response.data;
  }

  async updateTaskStatus(
    taskId: string,
    status: EngineeringTask['status'],
  ): Promise<EngineeringTask> {
    const response = await this.request<EngineeringTask>(`/api/v1/tasks/${taskId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return response.data;
  }

  // Structural Alerts methods (Sprint 5 - 2026-01-24)
  async getStructuralAlerts(
    projectId?: string,
    filters?: { severity?: AlertSeverity; acknowledged?: boolean },
  ): Promise<StructuralAlert[]> {
    try {
      const params = new URLSearchParams();
      if (projectId) {
        params.append('project_id', projectId);
      }
      if (filters?.severity) {
        params.append('severity', filters.severity);
      }
      if (filters?.acknowledged !== undefined) {
        params.append('acknowledged', String(filters.acknowledged));
      }

      const endpoint = projectId
        ? `/api/v1/projects/${projectId}/alerts`
        : `/api/v1/alerts?${params.toString()}`;

      const response = await this.request<{ alerts: StructuralAlert[]; stats?: AlertStats }>(
        endpoint,
      );
      return response.data?.alerts || response.data || [];
    } catch (error) {
      logger.error('Failed to fetch structural alerts:', { error, projectId });
      return [];
    }
  }

  async getAlertById(alertId: string): Promise<StructuralAlert | null> {
    try {
      const response = await this.request<StructuralAlert>(`/api/v1/alerts/${alertId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch alert:', { error, alertId });
      return null;
    }
  }

  async acknowledgeAlert(alertId: string): Promise<StructuralAlert> {
    const response = await this.request<StructuralAlert>(`/api/v1/alerts/${alertId}/acknowledge`, {
      method: 'PUT',
    });
    return response.data;
  }

  async createAlert(
    alert: Omit<StructuralAlert, 'id' | 'createdAt' | 'acknowledgedBy'>,
  ): Promise<StructuralAlert> {
    const response = await this.request<StructuralAlert>('/api/v1/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
    return response.data;
  }

  // Health check with enhanced monitoring
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    services: { api: boolean; speckle: boolean; overall: boolean };
  }> {
    try {
      const response = await this.request<{ status: string; timestamp: string }>(
        '/api/health',
        {},
        { action: 'health-check' },
      );
      const configHealth = await config.performHealthCheck();
      return {
        ...response.data,
        services: configHealth,
      };
    } catch (error) {
      // Return fallback health status
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          api: false,
          speckle: false,
          overall: false,
        },
      };
    }
  }
}

// Create and export the API service instance
export const apiService = new EctropyApiService();
// Export the class for testing or custom instances
export default EctropyApiService;
