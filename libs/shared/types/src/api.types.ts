/**
 * Shared API Types
 * Common interfaces and types used across the API Gateway
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  timestamp: string;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T = any> extends SuccessResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  services: Record<string, 'connected' | 'disconnected' | 'error'>;
  uptime?: number;
  memory?: any;
}
export type { User } from './index.js';
