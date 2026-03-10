/**
 * Dashboard Schema Tests
 * Tests for Zod schema validation of dashboard data
 */

import { describe, it, expect } from 'vitest';
import {
  DemoStatsSchema,
  DemoStatsResponseSchema,
  validateDemoStats,
  DashboardAnalysisSchema,
  ProjectSummarySchema,
  DashboardDataSchema,
  validateDashboardData,
  safeParseDashboardData,
  type DemoStats,
  type DashboardAnalysis,
  type ProjectSummary,
  type DashboardData,
} from '../dashboard.schema';

describe('DemoStatsSchema', () => {
  it('validates complete valid data', () => {
    const validData = {
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    };

    const result = DemoStatsSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validData);
    }
  });

  it('applies default for missing costReduction', () => {
    const partialData = {
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    };

    const result = DemoStatsSchema.parse(partialData);
    expect(result.costReduction).toBe(23.5); // default value
    expect(result.timeSavings).toBe(31.2);
  });

  it('applies default for missing timeSavings', () => {
    const partialData = {
      costReduction: 23.5,
      searchSpeed: 26,
      uptime: 100,
    };

    const result = DemoStatsSchema.parse(partialData);
    expect(result.timeSavings).toBe(31.2); // default value
  });

  it('applies default for missing searchSpeed', () => {
    const partialData = {
      costReduction: 23.5,
      timeSavings: 31.2,
      uptime: 100,
    };

    const result = DemoStatsSchema.parse(partialData);
    expect(result.searchSpeed).toBe(26); // default value
  });

  it('applies default for missing uptime', () => {
    const partialData = {
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
    };

    const result = DemoStatsSchema.parse(partialData);
    expect(result.uptime).toBe(100); // default value
  });

  it('applies defaults for all missing fields', () => {
    const emptyData = {};

    const result = DemoStatsSchema.parse(emptyData);
    expect(result).toEqual({
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    });
  });

  it('accepts custom values over defaults', () => {
    const customData = {
      costReduction: 50.0,
      timeSavings: 75.0,
      searchSpeed: 10,
      uptime: 99.9,
    };

    const result = DemoStatsSchema.parse(customData);
    expect(result).toEqual(customData);
  });

  it('rejects invalid data types', () => {
    const invalidData = {
      costReduction: 'not a number',
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    };

    const result = DemoStatsSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('DemoStatsResponseSchema', () => {
  it('validates complete API response structure', () => {
    const validResponse = {
      data: {
        costReduction: 23.5,
        timeSavings: 31.2,
        searchSpeed: 26,
        uptime: 100,
      },
    };

    const result = DemoStatsResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validResponse);
    }
  });

  it('applies defaults for missing nested properties', () => {
    const responseWithMissingProps = {
      data: {
        costReduction: 23.5,
        // Missing other properties
      },
    };

    const result = DemoStatsResponseSchema.parse(responseWithMissingProps);
    expect(result.data).toEqual({
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    });
  });

  it('rejects response without data property', () => {
    const invalidResponse = {
      costReduction: 23.5,
      timeSavings: 31.2,
    };

    const result = DemoStatsResponseSchema.safeParse(invalidResponse);
    expect(result.success).toBe(false);
  });
});

describe('validateDemoStats', () => {
  it('validates and returns correct data for valid input', () => {
    const validInput = {
      data: {
        costReduction: 30.0,
        timeSavings: 40.0,
        searchSpeed: 20,
        uptime: 99.9,
      },
    };

    const result = validateDemoStats(validInput);
    expect(result).toEqual(validInput.data);
  });

  it('returns defaults for invalid input', () => {
    const invalidInput = {
      invalid: 'structure',
    };

    const result = validateDemoStats(invalidInput);
    expect(result).toEqual({
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    });
  });

  it('returns defaults for null input', () => {
    const result = validateDemoStats(null);
    expect(result).toEqual({
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    });
  });

  it('returns defaults for undefined input', () => {
    const result = validateDemoStats(undefined);
    expect(result).toEqual({
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    });
  });

  it('applies defaults for partially missing properties', () => {
    const partialInput = {
      data: {
        costReduction: 25.0,
        // Missing other properties
      },
    };

    const result = validateDemoStats(partialInput);
    expect(result).toEqual({
      costReduction: 25.0,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    });
  });

  it('handles missing costReduction gracefully', () => {
    const inputWithoutCostReduction = {
      data: {
        timeSavings: 40.0,
        searchSpeed: 20,
        uptime: 99.9,
      },
    };

    const result = validateDemoStats(inputWithoutCostReduction);
    expect(result.costReduction).toBe(23.5); // default value
    expect(result.timeSavings).toBe(40.0);
    expect(result.searchSpeed).toBe(20);
    expect(result.uptime).toBe(99.9);
  });
});

describe('DashboardAnalysisSchema', () => {
  it('validates complete valid analysis data', () => {
    const validAnalysis = {
      costReduction: 1500,
      optimizationScore: 85,
      carbonSavings: 250,
      recommendations: ['Use recycled materials', 'Optimize HVAC'],
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    const result = DashboardAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validAnalysis);
    }
  });

  it('applies defaults for missing costReduction', () => {
    const partialAnalysis = {
      optimizationScore: 85,
    };

    const result = DashboardAnalysisSchema.parse(partialAnalysis);
    expect(result.costReduction).toBe(0);
    expect(result.optimizationScore).toBe(85);
  });

  it('applies defaults for all missing fields', () => {
    const emptyAnalysis = {};

    const result = DashboardAnalysisSchema.parse(emptyAnalysis);
    expect(result.costReduction).toBe(0);
    expect(result.optimizationScore).toBe(0);
    expect(result.carbonSavings).toBe(0);
    expect(result.recommendations).toEqual([]);
    expect(result.lastUpdated).toBeDefined();
  });

  it('validates optimizationScore is within range', () => {
    const invalidAnalysis = {
      optimizationScore: 150, // Out of range
    };

    const result = DashboardAnalysisSchema.safeParse(invalidAnalysis);
    expect(result.success).toBe(false);
  });

  it('accepts valid optimizationScore at boundaries', () => {
    const analysisMin = DashboardAnalysisSchema.parse({ optimizationScore: 0 });
    const analysisMax = DashboardAnalysisSchema.parse({ optimizationScore: 100 });
    
    expect(analysisMin.optimizationScore).toBe(0);
    expect(analysisMax.optimizationScore).toBe(100);
  });
});

describe('ProjectSummarySchema', () => {
  it('validates complete valid project', () => {
    const validProject = {
      id: 'proj-123',
      name: 'Green Building',
      status: 'active' as const,
      budget: 1000000,
      spent: 250000,
      analysis: {
        costReduction: 15000,
        optimizationScore: 90,
        carbonSavings: 500,
        recommendations: ['Solar panels'],
        lastUpdated: '2024-01-15T10:00:00Z',
      },
    };

    const result = ProjectSummarySchema.safeParse(validProject);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('proj-123');
      expect(result.data.name).toBe('Green Building');
    }
  });

  it('applies defaults for missing optional fields', () => {
    const minimalProject = {
      id: 'proj-456',
      name: 'Test Project',
    };

    const result = ProjectSummarySchema.parse(minimalProject);
    expect(result.status).toBe('active');
    expect(result.budget).toBe(0);
    expect(result.spent).toBe(0);
    expect(result.analysis).toBeUndefined();
  });

  it('validates all status values', () => {
    const statuses = ['active', 'completed', 'archived', 'planning', 'paused', 'cancelled'];
    
    statuses.forEach(status => {
      const project = {
        id: 'proj-test',
        name: 'Test',
        status,
      };
      
      const result = ProjectSummarySchema.safeParse(project);
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid status', () => {
    const invalidProject = {
      id: 'proj-test',
      name: 'Test',
      status: 'invalid-status',
    };

    const result = ProjectSummarySchema.safeParse(invalidProject);
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const invalidProject = {
      id: 'proj-test',
      name: '',
    };

    const result = ProjectSummarySchema.safeParse(invalidProject);
    expect(result.success).toBe(false);
  });
});

describe('DashboardDataSchema', () => {
  it('validates complete valid dashboard data', () => {
    const validDashboard = {
      projects: [
        {
          id: 'proj-1',
          name: 'Project 1',
          status: 'active' as const,
          budget: 500000,
          spent: 100000,
          analysis: {
            costReduction: 5000,
            optimizationScore: 80,
            carbonSavings: 100,
            recommendations: ['Eco-friendly materials'],
            lastUpdated: '2024-01-15T10:00:00Z',
          },
        },
      ],
      totalCostReduction: 5000,
      totalCarbonSavings: 100,
      overallScore: 80,
    };

    const result = DashboardDataSchema.safeParse(validDashboard);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projects.length).toBe(1);
      expect(result.data.totalCostReduction).toBe(5000);
    }
  });

  it('applies defaults for missing fields', () => {
    const emptyDashboard = {};

    const result = DashboardDataSchema.parse(emptyDashboard);
    expect(result.projects).toEqual([]);
    expect(result.totalCostReduction).toBe(0);
    expect(result.totalCarbonSavings).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('validates projects array with defaults', () => {
    const partialDashboard = {
      projects: [
        { id: 'proj-1', name: 'Test' },
        { id: 'proj-2', name: 'Another' },
      ],
    };

    const result = DashboardDataSchema.parse(partialDashboard);
    expect(result.projects.length).toBe(2);
    expect(result.projects[0].status).toBe('active');
    expect(result.projects[0].budget).toBe(0);
  });
});

describe('validateDashboardData', () => {
  it('validates and returns correct data for valid input', () => {
    const validInput = {
      projects: [{ id: 'proj-1', name: 'Test' }],
      totalCostReduction: 1000,
      totalCarbonSavings: 50,
      overallScore: 75,
    };

    const result = validateDashboardData(validInput);
    expect(result.totalCostReduction).toBe(1000);
    expect(result.projects.length).toBe(1);
  });

  it('throws for invalid input', () => {
    const invalidInput = {
      projects: [{ id: 'proj-1' }], // Missing required 'name' field
    };

    expect(() => validateDashboardData(invalidInput)).toThrow('Invalid dashboard data structure from API');
  });
});

describe('safeParseDashboardData', () => {
  it('returns validated data for valid input', () => {
    const validInput = {
      projects: [{ id: 'proj-1', name: 'Test' }],
      totalCostReduction: 2000,
    };

    const result = safeParseDashboardData(validInput);
    expect(result.totalCostReduction).toBe(2000);
    expect(result.projects.length).toBe(1);
  });

  it('returns defaults for invalid input without throwing', () => {
    const invalidInput = {
      invalid: 'structure',
    };

    const result = safeParseDashboardData(invalidInput);
    expect(result.projects).toEqual([]);
    expect(result.totalCostReduction).toBe(0);
    expect(result.totalCarbonSavings).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('returns defaults for null input', () => {
    const result = safeParseDashboardData(null);
    expect(result).toEqual({
      projects: [],
      totalCostReduction: 0,
      totalCarbonSavings: 0,
      overallScore: 0,
    });
  });

  it('returns defaults for undefined input', () => {
    const result = safeParseDashboardData(undefined);
    expect(result).toEqual({
      projects: [],
      totalCostReduction: 0,
      totalCarbonSavings: 0,
      overallScore: 0,
    });
  });

  it('handles missing costReduction in project analysis', () => {
    const inputWithMissingCostReduction = {
      projects: [
        {
          id: 'proj-1',
          name: 'Test Project',
          analysis: {
            optimizationScore: 75,
            // Missing costReduction
          },
        },
      ],
    };

    const result = safeParseDashboardData(inputWithMissingCostReduction);
    expect(result.projects[0].analysis?.costReduction).toBe(0);
    expect(result.projects[0].analysis?.optimizationScore).toBe(75);
  });
});
