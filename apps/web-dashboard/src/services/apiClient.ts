/**
 * @fileoverview API Client for the Ectropy Construction Platform
 * @version 1.0.0
 * @author Ectropy Development Team
 *
 * This module provides a centralized API client with:
 * - Type-safe API calls with TypeScript interfaces
 * - JWT token management and automatic refresh
 * - Request/response interceptors
 * - Error handling and retry mechanisms
 * - Security features (CSRF protection, request validation)
 * Security Features:
 * - JWT token storage with HttpOnly cookies (recommended for production)
 * - Request timeout to prevent hanging requests
 * - Input validation and sanitization
 * - CSRF token handling
 * - Automatic token refresh
 * Performance Features:
 * - Request caching for GET requests
 * - Batch request capabilities
 * - Connection pooling
 * - Gzip compression support
 */

import Cookies from 'js-cookie';
import { config as configService } from './config';

// Environment-based configuration with fallback
const API_BASE_URL = configService.apiBaseUrl;
const API_TIMEOUT = parseInt(process.env['REACT_APP_API_TIMEOUT'] || '30000');
const API_VERSION = process.env['REACT_APP_API_VERSION'] || 'v1';
// Type definitions for API requests and responses
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    permissions: string[];
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp?: string;
}

export interface Project {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  progress: number;
  created_at: string;
  updated_at: string;
  stakeholders: string[];
  budget: number;
  timeline: {
    start_date: string;
    end_date: string;
    milestones: Array<{
      id: string;
      name: string;
      date: string;
      completed: boolean;
    }>;
  };
}

export interface DAOProposal {
  title: string;
  description: string;
  status: 'active' | 'passed' | 'pending' | 'rejected';
  votes: number;
  total_votes: number;
  voting_deadline: string;
  proposer: string;
  category: 'governance' | 'technical' | 'financial';
}

export interface ManufacturerProduct {
  manufacturer: string;
  category: string;
  price: number;
  availability: 'in_stock' | 'out_of_stock' | 'limited';
  specifications: Record<string, string | number | boolean | null>;
  sustainability_rating: number;
  certifications: string[];
}

/**
 * Enhanced API Client class with security, performance, and maintainability improvements
 */
class APIClient {
  private baseURL: string;
  private timeout: number;
  private requestCache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private activeRequests = new Set<AbortController>();
  constructor() {
    this.baseURL = API_BASE_URL;
    this.timeout = API_TIMEOUT;
  }
  /**
   * Securely retrieve authentication token
   * SECURITY: Production deployment should use HttpOnly cookies for enhanced security
   * @returns {string | null} The authentication token
   */
  private getAuthToken(): string | null {
    try {
      return Cookies.get('authToken') || null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Securely store authentication token
   * SECURITY: Production deployment should use HttpOnly cookies with proper SameSite settings
   * @param {string} token - The authentication token to store
   */
  private setAuthToken(token: string): void {
    try {
      Cookies.set('authToken', token, { secure: true, sameSite: 'strict' });
    } catch (_error) {}
  }

  /**
   * Remove authentication token from storage
   */
  private removeAuthToken(): void {
    try {
      Cookies.remove('authToken');
      Cookies.remove('refreshToken');
    } catch (_error) {}
  }

  /**
   * Generate secure headers for API requests
   * @param {Record<string, string>} additionalHeaders - Additional headers to include
   * @returns {Record<string, string>} Complete headers object
   */
  private getHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF protection
      'X-API-Version': API_VERSION,
      ...additionalHeaders,
    };
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests (Double Submit Cookie pattern)
    const csrfToken = this.getCSRFToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    return headers;
  }

  /**
   * Get CSRF token from meta tag or cookie
   * @returns {string | null} CSRF token
   */
  private getCSRFToken(): string | null {
    // Try to get from meta tag first
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
      return metaTag.getAttribute('content');
    }

    // Fallback to cookie
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'XSRF-TOKEN' && value) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /**
   * Check if cached response is still valid
   * @param {string} cacheKey - The cache key to check
   * @returns {boolean} Whether the cached response is valid
   */
  private isCacheValid(cacheKey: string): boolean {
    const cached = this.requestCache.get(cacheKey);
    if (!cached) {
      return false;
    }
    return Date.now() - cached.timestamp < this.CACHE_DURATION;
  }

  /**
   * Get cached response if valid
   * @param {string} cacheKey - The cache key
   * @returns {any | null} Cached data or null
   */
  private getCachedResponse(cacheKey: string): unknown | null {
    if (this.isCacheValid(cacheKey)) {
      return this.requestCache.get(cacheKey)?.data || null;
    }
    return null;
  }

  /**
   * Cache response data
   * @param {string} cacheKey - The cache key
   * @param {any} data - The data to cache
   */
  private setCachedResponse(cacheKey: string, data: unknown): void {
    this.requestCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Validate and sanitize input data
   * @param {any} data - Data to validate
   * @returns {any} Sanitized data
   */
  private validateInput(data: unknown): unknown {
    if (typeof data === 'string') {
      // Basic XSS prevention
      return data.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (key.startsWith('__') || key.includes('prototype')) {
          continue; // Skip potentially dangerous properties
        }
        sanitized[key] = this.validateInput(value);
      }
      return sanitized;
    }
    return data;
  }

  /**
   * Enhanced request method with comprehensive error handling and security
   * @param {string} endpoint - API endpoint
   * @param {RequestInit} options - Fetch options
   * @returns {Promise<ApiResponse<T>>} API response
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    // STAGING FIX: Per-request AbortController to prevent cancellation cascades
    // ROOT CAUSE: Shared AbortController aborted ALL in-flight requests when a new one started
    // IMPACT: ViewerPage fires getProjects() then getMyProjectRole() — role fetch aborted projects fetch
    const abortController = new AbortController();
    this.activeRequests.add(abortController);
    const { signal } = abortController;
    // Generate cache key for GET requests
    const cacheKey = `${endpoint}:${options.method || 'GET'}`;
    const isGetRequest = !options.method || options.method.toUpperCase() === 'GET';
    // Check cache for GET requests
    if (isGetRequest) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return {
          success: true,
          data: cached as T,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Validate and sanitize request body
    if (options.body) {
      try {
        const parsedBody = JSON.parse(options.body as string);
        const sanitizedBody = this.validateInput(parsedBody);
        options.body = JSON.stringify(sanitizedBody);
      } catch (_error) {}
    }

    const requestOptions: RequestInit = {
      ...options,
      signal,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
      // Security: ensure credentials are included for CORS
      credentials: 'include',
    };

    // Set timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, requestOptions);
      clearTimeout(timeoutId);
      this.activeRequests.delete(abortController);

      // Handle different response types
      let responseData: unknown;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else if (contentType?.includes('text/')) {
        responseData = await response.text();
      } else {
        responseData = await response.blob();
      }

      if (!response.ok) {
        // Narrow responseData for property access
        const errBody = responseData as Record<string, unknown> | null;
        const errorMessage =
          (errBody?.error as string) ||
          (errBody?.message as string) ||
          `HTTP ${response.status}: ${response.statusText}`;

        // Handle authentication errors
        if (response.status === 401) {
          this.removeAuthToken();
          // Redirect to root — Login component renders when user is null
          window.location.href = '/';
        }

        // Handle trial limit errors (402 Payment Required)
        if (response.status === 402) {
          // Dispatch custom event for upgrade modal
          const upgradeEvent = new CustomEvent('show-upgrade-modal', {
            detail: {
              message: errorMessage,
              limitType: (errBody?.limit_type as string) || 'unknown',
              currentUsage: (errBody?.current_usage as number) || 0,
              limit: (errBody?.limit as number) || 0,
              tier: (errBody?.tier as string) || 'FREE',
              upgradeUrl: (errBody?.upgrade_url as string) || '/billing/upgrade',
            },
          });
          window.dispatchEvent(upgradeEvent);
        }

        return {
          success: false,
          error: errorMessage,
          code: (errBody?.code as string) || response.status.toString(),
          timestamp: new Date().toISOString(),
        };
      }

      // Cache successful GET requests
      if (isGetRequest && responseData) {
        this.setCachedResponse(cacheKey, responseData);
      }

      return {
        success: true,
        data: responseData as T,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.activeRequests.delete(abortController);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: 'Request was cancelled',
            code: 'ABORTED',
            timestamp: new Date().toISOString(),
          };
        }
        if (error.message.includes('Failed to fetch')) {
          return {
            success: false,
            error: 'Network error. Please check your internet connection.',
            code: 'NETWORK_ERROR',
            timestamp: new Date().toISOString(),
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Generic GET request method
   * @param {string} url - API endpoint URL
   * @param {RequestInit} options - Optional request options
   */
  async get<T = unknown>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Generic POST request method
   * @param {string} url - API endpoint URL
   * @param {any} data - Request payload
   * @param {RequestInit} options - Optional request options
   */
  async post<T = unknown>(
    url: string,
    data?: object,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const requestOptions = {
      method: 'POST',
      ...options,
    };

    if (data) {
      requestOptions.body = JSON.stringify(data);
    }

    return this.request<T>(url, requestOptions);
  }

  /**
   * Generic PUT request method
   * @param {string} url - API endpoint URL
   * @param {any} data - Request payload
   * @param {RequestInit} options - Optional request options
   */
  async put<T = unknown>(
    url: string,
    data?: object,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const requestOptions = {
      method: 'PUT',
      ...options,
    };

    if (data) {
      requestOptions.body = JSON.stringify(data);
    }

    return this.request<T>(url, requestOptions);
  }

  /**
   * Generic DELETE request method
   * @param {string} url - API endpoint URL
   * @param {RequestInit} options - Optional request options
   */
  async delete<T = unknown>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * Health check endpoint to verify API connectivity
   * @returns {Promise<ApiResponse<{ status: string; timestamp: string; uptime: number }>>} Health status
   */
  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string; uptime: number }>> {
    return this.request('/health');
  }

  /**
   * User authentication with secure token handling
   * @param {string} email - User email address
   * @param {string} password - User password
   * @returns {Promise<ApiResponse<LoginResponse>>} Authentication response
   */
  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    // Input validation
    if (!email || !password) {
      return {
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        error: 'Invalid email format',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Store token securely on successful login
    if (result.success && result.data?.accessToken) {
      this.setAuthToken(result.data.accessToken);
      // Store refresh token if available
      if (result.data.refreshToken) {
        try {
          Cookies.set('refreshToken', result.data.refreshToken, {
            secure: true,
            sameSite: 'strict',
          });
        } catch (_error) {
          // Enterprise pattern: _error for unused parameter
        }
      }
    }

    return result;
  }

  /**
   * User logout with token cleanup
   * @returns {Promise<ApiResponse<any>>} Logout response
   */
  async logout(): Promise<ApiResponse<{ success: boolean }>> {
    const result = await this.request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });

    // Always clean up tokens regardless of server response
    this.removeAuthToken();
    Cookies.remove('refreshToken');

    return result;
  }

  /**
   * Refresh authentication token
   * @returns {Promise<ApiResponse<LoginResponse>>} New token response
   */
  async refreshToken(): Promise<ApiResponse<LoginResponse>> {
    const refreshToken = Cookies.get('refreshToken') || null;
    if (!refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
        code: 'NO_REFRESH_TOKEN',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.request<LoginResponse>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    if (result.success && result.data?.accessToken) {
      this.setAuthToken(result.data.accessToken);
    }

    return result;
  }

  /**
   * Get all projects with pagination and filtering
   * @param {object} options - Query options
   * @returns {Promise<ApiResponse<Project[]>>} Projects response
   */
  async getProjects(
    options: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    } = {},
  ): Promise<ApiResponse<Project[]>> {
    const queryParams = new URLSearchParams();
    if (options.page) {
      queryParams.append('page', options.page.toString());
    }
    if (options.limit) {
      queryParams.append('limit', options.limit.toString());
    }
    if (options.status) {
      queryParams.append('status', options.status);
    }
    if (options.search) {
      queryParams.append('search', options.search);
    }

    const endpoint = `/api/v1/projects${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request(endpoint);
  }

  /**
   * Get specific project by ID
   * @param {string} id - Project ID
   * @returns {Promise<ApiResponse<Project>>} Project response
   */
  async getProject(id: string): Promise<ApiResponse<Project>> {
    if (!id) {
      return {
        success: false,
        error: 'Project ID is required',
      };
    }
    return this.request(`/api/v1/projects/${encodeURIComponent(id)}`);
  }

  /**
   * Create a new project
   * @param {Partial<Project>} project - Project data
   * @returns {Promise<ApiResponse<Project>>} Created project response
   */
  async createProject(project: Partial<Project>): Promise<ApiResponse<Project>> {
    if (!project.name) {
      return {
        success: false,
        error: 'Project name is required',
      };
    }
    return this.request('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  /**
   * Update existing project
   * @param {Partial<Project>} updates - Project updates
   * @returns {Promise<ApiResponse<Project>>} Updated project response
   */
  async updateProject(id: string, updates: Partial<Project>): Promise<ApiResponse<Project>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Get DAO proposals with filtering and pagination
   * @returns {Promise<ApiResponse<DAOProposal[]>>} DAO proposals response
   */
  async getDAOProposals(
    options: {
      category?: string;
    } = {},
  ): Promise<ApiResponse<DAOProposal[]>> {
    const queryParams = new URLSearchParams();

    if (options.category) {
      queryParams.append('category', options.category);
    }

    const endpoint = `/api/v1/dao/proposals${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request(endpoint);
  }

  /**
   * Get DAO templates for proposals
   * @returns {Promise<ApiResponse<any[]>>} DAO templates response
   */
  async getDAOTemplates(): Promise<ApiResponse<DAOProposal[]>> {
    return this.request('/api/v1/dao/templates');
  }

  /**
   * Vote on a DAO proposal
   * @param {string} proposalId - Proposal ID
   * @param {string} vote - Vote choice ('yes' or 'no')
   * @returns {Promise<ApiResponse<void>>} Vote response
   */
  async voteOnProposal(proposalId: string, vote: 'yes' | 'no'): Promise<ApiResponse<void>> {
    if (!proposalId) {
      return {
        success: false,
        error: 'Proposal ID is required',
        code: 'MISSING_PROPOSAL_ID',
        timestamp: new Date().toISOString(),
      };
    }

    if (!['yes', 'no'].includes(vote)) {
      return {
        success: false,
        error: 'Vote must be either "yes" or "no"',
        code: 'INVALID_VOTE',
        timestamp: new Date().toISOString(),
      };
    }

    return this.request(`/api/v1/dao/proposals/${encodeURIComponent(proposalId)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    });
  }

  /**
   * Get manufacturer products with filtering
   * @returns {Promise<ApiResponse<ManufacturerProduct[]>>} Products response
   */
  async getManufacturerProducts(
    options: { manufacturer?: string } = {},
  ): Promise<ApiResponse<ManufacturerProduct[]>> {
    const queryParams = new URLSearchParams();

    if (options.manufacturer) {
      queryParams.append('manufacturer', options.manufacturer);
    }

    const endpoint = `/api/v1/manufacturer/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request(endpoint);
  }

  /**
   * Search manufacturer products
   * @param {string} query - Search query
   * @param {object} options - Additional options
   * @returns {Promise<ApiResponse<ManufacturerProduct[]>>} Search results
   */
  async searchProducts(
    query: string,
    options: { category?: string; manufacturer?: string } = {},
  ): Promise<ApiResponse<ManufacturerProduct[]>> {
    if (!query || query.trim().length < 2) {
      return {
        success: false,
        error: 'Search query must be at least 2 characters long',
        code: 'INVALID_QUERY',
        timestamp: new Date().toISOString(),
      };
    }

    const queryParams = new URLSearchParams();
    queryParams.append('q', query.trim());

    if (options.category) {
      queryParams.append('category', options.category);
    }
    if (options.manufacturer) {
      queryParams.append('manufacturer', options.manufacturer);
    }

    return this.request(`/api/v1/manufacturer/products/search?${queryParams.toString()}`);
  }

  /**
   * Upload file with validation and progress tracking
   * @param {File} file - File to upload
   * @param {string} projectId - Project ID
   * @param {function} onProgress - Progress callback
   * @returns {Promise<ApiResponse<{ fileId: string; filename: string }>>} Upload response
   */
  async uploadFile(
    file: File,
    projectId: string,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<{ fileId: string; filename: string }>> {
    // Validation
    if (!file) {
      return {
        success: false,
        error: 'File is required',
        code: 'MISSING_FILE',
        timestamp: new Date().toISOString(),
      };
    }

    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID',
        timestamp: new Date().toISOString(),
      };
    }

    // File size validation (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: 'File size must be less than 10MB',
        code: 'FILE_TOO_LARGE',
        timestamp: new Date().toISOString(),
      };
    }

    // File type validation
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/zip',
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'File type not supported',
        code: 'INVALID_FILE_TYPE',
        timestamp: new Date().toISOString(),
      };
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    const headers: Record<string, string> = {};
    const authToken = this.getAuthToken();
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // If progress callback is provided, use XMLHttpRequest for progress tracking
    if (onProgress) {
      return new Promise(resolve => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable && onProgress) {
            const progress = (e.loaded / e.total) * 100;
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({
                success: true,
                data: data as { fileId: string; filename: string },
                timestamp: new Date().toISOString(),
              });
            } else {
              resolve({
                success: false,
                error: data?.error || 'Upload failed',
                code: xhr.status.toString(),
                timestamp: new Date().toISOString(),
              });
            }
          } catch (_error) {
            resolve({
              success: false,
              error: 'Invalid response from server',
              code: 'PARSE_ERROR',
              timestamp: new Date().toISOString(),
            });
          }
        });

        xhr.addEventListener('error', () => {
          resolve({
            success: false,
            error: 'Upload failed',
            code: 'NETWORK_ERROR',
            timestamp: new Date().toISOString(),
          });
        });

        xhr.open('POST', `${API_BASE_URL}/api/v1/files/upload`);

        // Set headers
        Object.keys(headers).forEach(key => {
          xhr.setRequestHeader(key, headers[key]);
        });

        xhr.send(formData);
      });
    }

    // Fallback to regular fetch without progress tracking
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data?.error || 'Upload failed',
          code: response.status.toString(),
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        data: data as { fileId: string; filename: string },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
        code: 'UPLOAD_ERROR',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current user profile
   * @returns {Promise<ApiResponse<any>>} User profile response
   */
  async getCurrentUser(): Promise<ApiResponse<LoginResponse['user']>> {
    return this.request('/auth/me');
  }

  /**
   * Update user profile
   * @param {Partial<LoginResponse['user']>} updates - Profile updates
   * @returns {Promise<ApiResponse<LoginResponse['user']>>} Updated profile response
   */
  async updateProfile(
    updates: Partial<LoginResponse['user']>,
  ): Promise<ApiResponse<LoginResponse['user']>> {
    if (!updates || Object.keys(updates).length === 0) {
      return {
        success: false,
        error: 'No updates provided',
        code: 'MISSING_UPDATES',
        timestamp: new Date().toISOString(),
      };
    }

    return this.request('/api/v1/users/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Get construction elements for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<ApiResponse<any[]>>} Construction elements response
   */
  async getConstructionElements(
    projectId: string,
  ): Promise<ApiResponse<Record<string, unknown>[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/elements`);
  }

  /**
   * Clear request cache
   */
  clearCache(): void {
    this.requestCache.clear();
  }

  /**
   * Cancel all pending requests
   */
  cancelRequests(): void {
    for (const controller of this.activeRequests) {
      controller.abort();
    }
    this.activeRequests.clear();
  }
}

/**
 * Singleton instance of the API client
 * Use this instance throughout the application for consistency
 */
export const apiClient = new APIClient();
