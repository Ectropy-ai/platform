/*
 * =============================================================================
 * PERFORMANCE AGENT - USAGE EXAMPLE
 *
 * This example demonstrates how to use the PerformanceAgent to analyze
 * project KPIs and generate predictive insights with full TypeScript compliance.
 * Features demonstrated:
 * - Type-safe initialization with proper interfaces
 * - Comprehensive KPI analysis with shared types
 * - Event-driven architecture with type-safe payloads
 * - Error handling and graceful degradation
 * - Real-world integration patterns
 */

import type { PerformanceKPIAnalysis } from './performance-agent.js';
import { PerformanceAgent } from './performance-agent.js';
import type { PredictionValue } from '@ectropy/shared';
/**
 * Example usage of the PerformanceAgent with full TypeScript compliance
 * This example shows how to:
 * 1. Initialize the PerformanceAgent with proper types
 * 2. Analyze project performance with type safety
 * 3. Interpret the results using the new structure
 * 4. Handle events and errors in a type-safe manner
 * 5. Integrate with real applications
export async function demonstratePerformanceAgent(): Promise<PerformanceKPIAnalysis> {
  // Type-safe database pool implementation
  const mockDbPool = {
    query: async <T = unknown>(query: string, params?: unknown[]) => {
      // Simulate realistic project data with proper typing
      if (query.includes('project_performance')) {
        return {
          rows: [
            {
              planned_value: 250000, // $250k planned value
              earned_value: 200000, // $200k earned value
              actual_cost: 220000, // $220k actual cost
              scheduled_duration: 120, // 120 days planned
              actual_duration: 100, // 100 days elapsed
            },
          ] as T[],
          rowCount: 1,
        };
      }
      if (query.includes('project_quality')) {
              defect_rate: 0.02, // 2% defect rate
              rework_cost: 8000, // $8k rework costs
              first_time_right_rate: 94, // 94% first-time-right
              quality_compliance_score: 91, // 91% quality compliance
              inspection_pass_rate: 96, // 96% inspection pass rate
      if (query.includes('project_safety')) {
              incident_rate: 0.003, // 0.3% incident rate
              near_miss_count: 5, // 5 near-miss events
              safety_compliance_score: 98, // 98% safety compliance
              days_without_incident: 75, // 75 days without incident
              safety_training_hours: 240, // 240 hours training
      return { rows: [] as T[], rowCount: 0 }; // Default empty result
    },
    connect: async () => ({
      query: async <T = unknown>(text: string, params?: any[]) => ({
        rows: [] as T[],
        rowCount: 0,
      }),
      release: () => {},
    }),
    end: async () => {},
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  };
  // Type-safe template service implementation
  const mockTemplateService = {
    getActiveTemplate: async (projectId: string) => ({
      templateId: 'commercial-construction-v2',
      name: 'Commercial Construction Template',
      version: '2.1.0',
      projectId,
      isActive: true,
      metadata: {
        industry: 'construction',
        complexity: 'high',
        size: 'large',
      },
    validateProjectAccess: async () => true,
  // Initialize the PerformanceAgent with proper configuration
  const agent = new PerformanceAgent(mockDbPool, mockTemplateService, {
    enableEventEmission: true,
    maxRetries: 3,
    timeout: 30000,
  });
  // Set up type-safe event listeners
  agent.on('analysis:completed', (payload: unknown) => {
    const typedPayload = payload as {
      projectId: string;
      metadata?: {
        overallScore: number;
        riskLevel: string;
        spiValue: number;
        cpiValue: number;
      };
    };
    if (typedPayload.metadata !== null) {
    }
  agent.on('analysis:error', (payload: unknown) => {
    const typedPayload = payload as { projectId: string; error?: Error };
    if (typedPayload.error !== null) {
  try {
    // Analyze a project with full type safety
      '🔍 Starting performance analysis for Commercial Tower Project...'
    );
    const analysis: PerformanceKPIAnalysis = await agent.analyzeProject(
      'commercial-tower-2024'
    // Display comprehensive results using the new structure
      `   Defect Rate: ${(analysis.quality.defectRate * 100).toFixed(2)}%`
      `   Quality Compliance: ${analysis.quality.qualityComplianceScore}%`
      `   Rework Cost: $${analysis.quality.reworkCost.toLocaleString()}`
      `   Incident Rate: ${(analysis.safety.incidentRate * 100).toFixed(3)}%`
      `   Safety Compliance: ${analysis.safety.safetyComplianceScore}%`
      `   Days Without Incident: ${analysis.safety.daysWithoutIncident}`
    Object.entries(analysis.kpis).forEach(([key, kpi]) => {
    });
      `   Forecasted Completion: ${analysis.predictions.forecastedCompletion.toDateString()}`
      `   Forecasted Cost: $${analysis.predictions.forecastedCost.toLocaleString()}`
    Object.entries(analysis.predictions).forEach(([key, pred]) => {
      const prediction = pred as unknown as PredictionValue;
        `   ${key}: ${prediction.value} (${(prediction.confidence * 100).toFixed(0)}% confidence, ${prediction.method})`
      );
    if (analysis.predictions.riskEvents.length > 0) {
      analysis.predictions.riskEvents.forEach((risk: string, index: number) => {
      });
    if (analysis.predictions.recommendations.length > 0) {
      analysis.predictions.recommendations.forEach(
        (rec: string, index: number) => {
        }
    // Display analysis metadata
    if (analysis.analysisMetadata !== null) {
        `   Time Range: ${analysis.analysisMetadata.timeRange.start.toDateString()} - ${analysis.analysisMetadata.timeRange.end.toDateString()}`
        `   Algorithms: ${analysis.analysisMetadata.algorithmsUsed.join(', ')}`
    // Demonstrate performance interpretation
    interpretPerformance(analysis);
    return analysis;
  } catch (_error) {
    throw error;
  }
}
 * Interpret performance results and provide insights with type safety
function interpretPerformance(analysis: PerformanceKPIAnalysis): void {
  const { spi, cpi, quality, safety, overallScore, riskLevel } = analysis;
  // Schedule Performance Interpretation
  if (spi.value > 1.1) {
  } else if (spi.value > 1.0) {
  } else if (spi.value >= 0.95) {
  } else if (spi.value >= 0.8) {
  } else {
  // Cost Performance Interpretation
  if (cpi.value > 1.1) {
  } else if (cpi.value > 1.0) {
  } else if (cpi.value >= 0.95) {
  } else if (cpi.value >= 0.8) {
  // Quality Assessment using the new KPI structure
  const qualityKPI = analysis.kpis['qualityCompliance'];
  if (qualityKPI && qualityKPI.status === 'good') {
  } else if (qualityKPI && qualityKPI.status === 'warning') {
  // Safety Assessment using the new KPI structure
  const safetyKPI = analysis.kpis['safetyCompliance'];
  if (safetyKPI && safetyKPI.status === 'good') {
  } else if (safetyKPI && safetyKPI.status === 'warning') {
      '🚨 Safety: Critical safety issues require immediate attention'
  // Overall Project Health
  if (overallScore >= 90) {
  } else if (overallScore >= 75) {
  } else if (overallScore >= 60) {
  // Risk Level Assessment
  switch (riskLevel) {
    case 'low':
      break;
    case 'medium':
        '🟡 Risk: Medium risk - monitor closely and take corrective actions'
    case 'high':
 * Example of how to use the PerformanceAgent in a real application with proper TypeScript
export function integrateWithApplication(): void {
// In your application service with full TypeScript compliance:
import { PerformanceAgent, PerformanceKPIAnalysis } from '@libs/ai-agents/performance';
interface ProjectHealthSummary {
  healthScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  scheduleStatus: 'ahead' | 'on-track' | 'behind';
  costStatus: 'under-budget' | 'on-budget' | 'over-budget';
  nextReview: Date;
  recommendations: string[];
  kpiSummary: {
    schedule: { value: number; status: string };
    cost: { value: number; status: string };
    quality: { value: number; status: string };
    safety: { value: number; status: string };
  };
}

class ProjectDashboardService {
  constructor(private performanceAgent: PerformanceAgent) {}
  
  async getProjectHealth(projectId: string): Promise<ProjectHealthSummary> {
    try {
      const analysis: PerformanceKPIAnalysis = await this.performanceAgent.analyzeProject(projectId);
      
      return {
        healthScore: analysis.overallScore,
        riskLevel: analysis.riskLevel,
        scheduleStatus: analysis.spi.status,
        costStatus: analysis.cpi.status,
        nextReview: analysis.predictions.forecastedCompletion,
        recommendations: analysis.predictions.recommendations.slice(0, 3),
        kpiSummary: {
          schedule: {
            value: analysis.kpis.schedulePerformanceIndex.value,
            status: analysis.kpis.schedulePerformanceIndex.status
          },
          cost: {
            value: analysis.kpis.costPerformanceIndex.value,
            status: analysis.kpis.costPerformanceIndex.status
          quality: {
            value: analysis.kpis.qualityCompliance.value,
            status: analysis.kpis.qualityCompliance.status
          safety: {
            value: analysis.kpis.safetyCompliance.value,
            status: analysis.kpis.safetyCompliance.status
          }
    } catch (_error) {
      throw new Error('Unable to analyze project performance');
  async setupRealTimeMonitoring(projectId: string): Promise<void> {
    // Type-safe event handling
    this.performanceAgent.on('analysis:completed', (payload) => {
      if (payload.metadata && payload.metadata.riskLevel === 'high') {
        this.sendAlert(projectId, payload);
    
    this.performanceAgent.on('analysis:error', (payload) => {
    });
    
    // Schedule regular analysis
    setInterval(() => {
      this.performanceAgent.analyzeProject(projectId).catch(error => {
      });
    }, 24 * 60 * 60 * 1000); // Daily analysis
  }

  private sendAlert(projectId: string, payload: any): void {
    // Implementation for sending alerts
  }
}

// Usage with dependency injection and proper typing
const dbPool = new DatabasePool({
  // TODO: Add connection config
  host: 'localhost',
  port: 5432,
  database: 'ectropy'
});
const templateService = new TemplateService(dbPool);
const performanceAgent = new PerformanceAgent(dbPool, templateService);
const dashboardService = new ProjectDashboardService(performanceAgent);

/** Migration guide from legacy structure to new TypeScript-compliant structure */
export function migrationGuide(): void {
  console.log(
    '   After:  agent = new PerformanceAgent(dbPool: DatabasePool, templateService: TemplateService)'
  );
  console.log(
    '   After:  PerformanceKPIAnalysis extends KPIAnalysis with shared types'
  );
  console.log(
    '   result.spi.value, result.cpi.value                    // Performance-specific'
  );
  console.log(
    '   result.kpis.schedulePerformanceIndex.value            // Shared KPI format'
  );
  console.log(
    '   result.predictions.forecastedCompletion.value         // Shared predictions'
  );
  console.log(
    '   result.predictions.forecastedCompletion       // Performance-specific'
  );
  console.log(
    '   agent.on("analysis:completed", (payload: AgentEventPayload) => {'
  );
  console.log(
    '   After:  import { PerformanceKPIAnalysis } from "./performance-agent.js";'
  );
}
// Function is already exported above via export keyword
