/**
 * Dashboard API Client Tests
 * Tests for API client with schema validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fetchDashboardData, fetchDashboardDataSafe } from '../dashboard';
import { vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn() as ReturnType<typeof vi.fn>;

// Mock js-cookie (has default export)
vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(() => 'mock-token'),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

// Mock config (path relative to dashboard.ts file: ../../services/config)
vi.mock('../../../services/config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:3000',
  },
}));

// Mock logger
vi.mock('../../../services/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('fetchDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and validates dashboard data successfully', async () => {
    const mockResponse = {
      projects: [
        {
          id: 'proj-1',
          name: 'Test Project',
          status: 'active',
          budget: 100000,
          spent: 25000,
          analysis: {
            costReduction: 5000,
            optimizationScore: 85,
            carbonSavings: 100,
            recommendations: ['Use sustainable materials'],
            lastUpdated: '2024-01-15T10:00:00Z',
          },
        },
      ],
      totalCostReduction: 5000,
      totalCarbonSavings: 100,
      overallScore: 85,
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchDashboardData();

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/dashboard',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token',
        }),
        credentials: 'include',
      })
    );
  });

  it('applies defaults for missing fields in API response', async () => {
    const incompleteResponse = {
      projects: [
        {
          id: 'proj-1',
          name: 'Test Project',
          // Missing other fields
        },
      ],
      // Missing totalCostReduction, totalCarbonSavings, overallScore
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => incompleteResponse,
    } as Response);

    const result = await fetchDashboardData();

    expect(result.projects[0].status).toBe('active'); // default
    expect(result.projects[0].budget).toBe(0); // default
    expect(result.totalCostReduction).toBe(0); // default
    expect(result.totalCarbonSavings).toBe(0); // default
    expect(result.overallScore).toBe(0); // default
  });

  it('throws error when API request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(fetchDashboardData()).rejects.toThrow('API request failed: 500 Internal Server Error');
  });

  it('throws error when network fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    await expect(fetchDashboardData()).rejects.toThrow('Network error');
  });
});

describe('fetchDashboardDataSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and validates dashboard data successfully', async () => {
    const mockResponse = {
      projects: [{ id: 'proj-1', name: 'Test' }],
      totalCostReduction: 1000,
      totalCarbonSavings: 50,
      overallScore: 75,
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchDashboardDataSafe();

    expect(result.totalCostReduction).toBe(1000);
    expect(result.projects.length).toBe(1);
  });

  it('returns safe defaults when API request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await fetchDashboardDataSafe();

    expect(result).toEqual({
      projects: [],
      totalCostReduction: 0,
      totalCarbonSavings: 0,
      overallScore: 0,
    });
  });

  it('returns safe defaults when network fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    const result = await fetchDashboardDataSafe();

    expect(result).toEqual({
      projects: [],
      totalCostReduction: 0,
      totalCarbonSavings: 0,
      overallScore: 0,
    });
  });

  it('returns safe defaults for invalid API response', async () => {
    const invalidResponse = {
      invalid: 'structure',
      projects: 'not-an-array',
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => invalidResponse,
    } as Response);

    const result = await fetchDashboardDataSafe();

    expect(result).toEqual({
      projects: [],
      totalCostReduction: 0,
      totalCarbonSavings: 0,
      overallScore: 0,
    });
  });

  it('handles missing costReduction in project analysis gracefully', async () => {
    const responseWithMissingCostReduction = {
      projects: [
        {
          id: 'proj-1',
          name: 'Test Project',
          analysis: {
            optimizationScore: 80,
            // Missing costReduction
          },
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => responseWithMissingCostReduction,
    } as Response);

    const result = await fetchDashboardDataSafe();

    expect(result.projects[0].analysis?.costReduction).toBe(0);
    expect(result.projects[0].analysis?.optimizationScore).toBe(80);
  });
});
