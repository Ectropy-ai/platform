import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  ClientConfig,
  LoginRequest,
  LoginResponse,
  UserProfile,
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectListResponse,
  Element,
  CreateElementRequest,
  UpdateElementRequest,
  ElementListResponse,
  HealthResponse,
  ErrorResponse,
} from './types.js';

/**
 * Ectropy API Client
 * Official TypeScript/JavaScript SDK for the Ectropy Federated Construction Platform
 */
export class EctropyClient {
  private client: AxiosInstance;
  private accessToken?: string;

  constructor(config: ClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (config.apiKey) {
      this.setAccessToken(config.apiKey);
    }

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ErrorResponse>) => {
        if (error.response) {
          const errorResponse: ErrorResponse = {
            error: error.response.data?.error || 'API Error',
            message: error.response.data?.message || error.message,
            statusCode: error.response.status,
          };
          throw errorResponse;
        }
        throw error;
      }
    );
  }

  /**
   * Set the access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear the access token
   */
  clearAccessToken(): void {
    this.accessToken = undefined;
    delete this.client.defaults.headers.common['Authorization'];
  }

  /**
   * Authentication API
   */
  auth = {
    /**
     * Login with email and password
     */
    login: async (credentials: LoginRequest): Promise<LoginResponse> => {
      const response = await this.client.post<LoginResponse>('/api/auth/login', credentials);
      // Automatically set the access token after successful login
      this.setAccessToken(response.data.tokens.accessToken);
      return response.data;
    },

    /**
     * Refresh access token
     */
    refresh: async (refreshToken: string): Promise<{ tokens: { accessToken: string; refreshToken: string; expiresIn: number } }> => {
      const response = await this.client.post('/api/auth/refresh', { refreshToken });
      this.setAccessToken(response.data.tokens.accessToken);
      return response.data;
    },

    /**
     * Logout the current user
     */
    logout: async (): Promise<{ message: string }> => {
      const response = await this.client.post('/api/auth/logout');
      this.clearAccessToken();
      return response.data;
    },

    /**
     * Get current user profile
     */
    me: async (): Promise<UserProfile> => {
      const response = await this.client.get<UserProfile>('/api/auth/me');
      return response.data;
    },
  };

  /**
   * Projects API
   */
  projects = {
    /**
     * List all projects with optional pagination
     */
    list: async (options?: { page?: number; limit?: number; status?: string }): Promise<ProjectListResponse> => {
      const response = await this.client.get<ProjectListResponse>('/api/v1/projects', {
        params: options,
      });
      return response.data;
    },

    /**
     * Get a specific project by ID
     */
    get: async (projectId: string): Promise<Project> => {
      const response = await this.client.get<Project>(`/api/v1/projects/${projectId}`);
      return response.data;
    },

    /**
     * Create a new project
     */
    create: async (data: CreateProjectRequest): Promise<Project> => {
      const response = await this.client.post<Project>('/api/v1/projects', data);
      return response.data;
    },

    /**
     * Update an existing project
     */
    update: async (projectId: string, data: UpdateProjectRequest): Promise<Project> => {
      const response = await this.client.put<Project>(`/api/v1/projects/${projectId}`, data);
      return response.data;
    },

    /**
     * Delete a project
     */
    delete: async (projectId: string): Promise<void> => {
      await this.client.delete(`/api/v1/projects/${projectId}`);
    },
  };

  /**
   * Elements API
   */
  elements = {
    /**
     * List elements for a specific project
     */
    list: async (projectId: string, options?: { page?: number; limit?: number }): Promise<ElementListResponse> => {
      const response = await this.client.get<ElementListResponse>(
        `/api/v1/projects/${projectId}/elements`,
        { params: options }
      );
      return response.data;
    },

    /**
     * Get a specific element by ID
     */
    get: async (elementId: string): Promise<Element> => {
      const response = await this.client.get<Element>(`/api/v1/elements/${elementId}`);
      return response.data;
    },

    /**
     * Create a new element within a project
     */
    create: async (projectId: string, data: CreateElementRequest): Promise<Element> => {
      const response = await this.client.post<Element>(
        `/api/v1/projects/${projectId}/elements`,
        data
      );
      return response.data;
    },

    /**
     * Update an existing element
     */
    update: async (elementId: string, data: UpdateElementRequest): Promise<Element> => {
      const response = await this.client.put<Element>(`/api/v1/elements/${elementId}`, data);
      return response.data;
    },

    /**
     * Delete an element
     */
    delete: async (elementId: string): Promise<void> => {
      await this.client.delete(`/api/v1/elements/${elementId}`);
    },
  };

  /**
   * Health API
   */
  health = {
    /**
     * Check system health
     */
    check: async (): Promise<HealthResponse> => {
      const response = await this.client.get<HealthResponse>('/health');
      return response.data;
    },
  };
}
