import type { Request, Response } from 'express';
import type { User } from '../../../../libs/shared/types/src/index.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';
export interface TypedResponse<T = any> extends Response {
  json(body: T): this;
}

// Stakeholder roles
export type StakeholderRole =
  | 'architect'
  | 'engineer'
  | 'contractor'
  | 'owner'
  | 'admin'
  | 'viewer'
  | 'project_manager';
// Project data structures
export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  location: string;
  total_budget: number;
  currency: string;
  start_date: string;
  expected_completion: string;
  element_count: number;
  completed_element_count: number;
  user_role: StakeholderRole;
  permissions: string[];
  voting_power: number;
  governance_address?: string;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus =
  | 'planning'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled';
// BIM Element structures
export interface BIMElement {
  element_type: string;
  ifc_id: string;
  speckle_id: string;
  element_name: string;
  element_description: string;
  status: ElementStatus;
  creator_name: string;
  geometric_data?: GeometricData;
  properties?: ElementProperties;
  material_properties?: MaterialProperties;
  sustainability_metrics?: SustainabilityMetrics;
  cost_data?: CostData;
  schedule_data?: ScheduleData;
}

export type ElementStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'construction'
  | 'completed';
export interface GeometricData {
  volume?: number;
  area?: number;
  length?: number;
  coordinates?: number[];
}

export interface ElementProperties {
  [key: string]: string | number | boolean;
}

export interface MaterialProperties {
  material_type: string;
  density?: number;
  strength?: number;
  thermal_properties?: Record<string, number>;
}

export interface SustainabilityMetrics {
  carbon_footprint?: number;
  energy_consumption?: number;
  recyclability_score?: number;
}

export interface CostData {
  unit_cost?: number;
  total_cost?: number;
}

export interface ScheduleData {
  start_date?: string;
  end_date?: string;
  duration_days?: number;
}

// Audit log structure
export interface AuditLog {
  action: string;
  entity_type: string;
  timestamp: string;
  user_name: string;
}

// API Response structures
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error handling
export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
  details?: any;
}

// Database connection types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// Server configuration
export interface ServerConfig {
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  data: any;
  userId?: string;
}

// Session data
export interface SessionData {
  userId: string;
  username: string;
  role: StakeholderRole;
  loginTime: string;
}
