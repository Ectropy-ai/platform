/**
 * Dashboard API Client
 * Handles fetching and validating dashboard data from the backend
 */

import { validateDashboardData, safeParseDashboardData, DashboardData } from '../../schemas/dashboard.schema';
import { logger } from '../../services/logger';
import { config } from '../../services/config';
import Cookies from 'js-cookie';

// Re-export types for convenience
export type { DashboardData } from '../../schemas/dashboard.schema';

/**
 * Get authentication token from cookies
 */
function getAuthToken(): string | undefined {
  return Cookies.get('auth_token') || Cookies.get('accessToken');
}

/**
 * Fetch dashboard data with validation
 * Throws on validation failure for critical paths
 */
export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${config.apiBaseUrl}/api/dashboard`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    
    // Validate response matches expected schema
    return validateDashboardData(rawData);
  } catch (error) {
    logger.error('Failed to fetch dashboard data:', { error });
    throw error;
  }
}

/**
 * Fetch dashboard data with safe fallback
 * Never throws - returns empty dashboard on any error
 */
export async function fetchDashboardDataSafe(): Promise<DashboardData> {
  try {
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${config.apiBaseUrl}/api/dashboard`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      logger.error(`API request failed: ${response.status}`);
      return safeParseDashboardData({});
    }

    const rawData = await response.json();
    return safeParseDashboardData(rawData);
  } catch (error) {
    logger.error('Failed to fetch dashboard data, using defaults:', { error });
    return safeParseDashboardData({});
  }
}
