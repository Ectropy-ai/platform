/**
 * Type definitions for the Ectropy API
 * Generated from OpenAPI 3.0 specification
 */

export interface ClientConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: UserProfile;
  tokens: TokenPair;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'architect' | 'engineer' | 'contractor' | 'owner' | 'admin';
  firstName?: string;
  lastName?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'on_hold';
  total_budget?: number;
  start_date?: string;
  end_date?: string;
  location?: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  total_budget?: number;
  start_date?: string;
  end_date?: string;
  location?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: 'planned' | 'in_progress' | 'completed' | 'on_hold';
  total_budget?: number;
  start_date?: string;
  end_date?: string;
  location?: string;
}

export interface Element {
  id: string;
  project_id: string;
  element_name: string;
  element_type: string;
  ifc_id?: string;
  status: 'planned' | 'design_approved' | 'procurement' | 'in_progress' | 'completed' | 'on_hold' | 'rejected';
  material?: string;
  dimensions?: Record<string, any>;
  cost?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateElementRequest {
  element_name: string;
  element_type: string;
  ifc_id?: string;
  material?: string;
  dimensions?: Record<string, any>;
  cost?: number;
}

export interface UpdateElementRequest {
  element_name?: string;
  element_type?: string;
  status?: 'planned' | 'design_approved' | 'procurement' | 'in_progress' | 'completed' | 'on_hold' | 'rejected';
  material?: string;
  dimensions?: Record<string, any>;
  cost?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProjectListResponse {
  projects: Project[];
  pagination: Pagination;
}

export interface ElementListResponse {
  elements: Element[];
  pagination: Pagination;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  checks: {
    database: 'healthy' | 'unhealthy' | 'unknown';
    redis: 'healthy' | 'unhealthy' | 'unknown';
    memory: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
