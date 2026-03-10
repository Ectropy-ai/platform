import { z } from 'zod';

/**
 * Schema for demo statistics data returned from /api/demo/stats endpoint
 * Provides runtime validation with safe defaults for missing properties
 */
export const DemoStatsSchema = z.object({
  costReduction: z.number().optional().default(23.5),
  timeSavings: z.number().optional().default(31.2),
  searchSpeed: z.number().optional().default(26),
  uptime: z.number().optional().default(100),
});

/**
 * Schema for the complete demo stats API response
 */
export const DemoStatsResponseSchema = z.object({
  data: DemoStatsSchema,
});

/**
 * TypeScript types inferred from schemas
 */
export type DemoStats = z.infer<typeof DemoStatsSchema>;
export type DemoStatsResponse = z.infer<typeof DemoStatsResponseSchema>;

/**
 * Validates and transforms demo stats data with safe defaults
 * @param rawData - Raw data from API response
 * @returns Validated data with defaults applied
 */
export function validateDemoStats(rawData: unknown): DemoStats {
  const result = DemoStatsResponseSchema.safeParse(rawData);

  if (!result.success) {
    console.warn('Demo stats validation failed, using defaults:', result.error);
    
    // Return safe defaults if validation fails
    return {
      costReduction: 23.5,
      timeSavings: 31.2,
      searchSpeed: 26,
      uptime: 100,
    };
  }

  return result.data.data;
}

/**
 * Dashboard Analysis Schema
 * Validates cost reduction and optimization data from API
 */
export const DashboardAnalysisSchema = z.object({
  costReduction: z.number().optional().default(0),
  optimizationScore: z.number().min(0).max(100).optional().default(0),
  carbonSavings: z.number().optional().default(0),
  recommendations: z.array(z.string()).optional().default([]),
  lastUpdated: z.string().optional().default(new Date().toISOString()),
});

export type DashboardAnalysis = z.infer<typeof DashboardAnalysisSchema>;

/**
 * Project Summary Schema
 * Validates project data from API
 */
export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  status: z.enum(['active', 'completed', 'archived', 'planning', 'paused', 'cancelled']).optional().default('active'),
  budget: z.number().optional().default(0),
  spent: z.number().optional().default(0),
  analysis: DashboardAnalysisSchema.optional(),
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

/**
 * Dashboard Data Schema
 * Top-level schema for dashboard API response
 */
export const DashboardDataSchema = z.object({
  projects: z.array(ProjectSummarySchema).optional().default([]),
  totalCostReduction: z.number().optional().default(0),
  totalCarbonSavings: z.number().optional().default(0),
  overallScore: z.number().min(0).max(100).optional().default(0),
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;

/**
 * Safely parse and validate dashboard data
 * Returns validated data with defaults or throws detailed error
 */
export function validateDashboardData(rawData: unknown): DashboardData {
  try {
    return DashboardDataSchema.parse(rawData);
  } catch (error) {
    console.error('Dashboard data validation failed:', error);
    console.error('Raw data received:', JSON.stringify(rawData, null, 2));
    throw new Error('Invalid dashboard data structure from API');
  }
}

/**
 * Safely parse with fallback to empty dashboard
 * Never throws - returns safe defaults if validation fails
 */
export function safeParseDashboardData(rawData: unknown): DashboardData {
  const result = DashboardDataSchema.safeParse(rawData);
  
  if (!result.success) {
    console.error('Dashboard data validation failed, using defaults:', result.error);
    console.error('Raw data:', JSON.stringify(rawData, null, 2));
    
    // Return safe default structure
    return {
      projects: [],
      totalCostReduction: 0,
      totalCarbonSavings: 0,
      overallScore: 0,
    };
  }
  
  return result.data;
}
