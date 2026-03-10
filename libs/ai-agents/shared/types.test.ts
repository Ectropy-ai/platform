/**
 * Type compatibility tests
 * Ensures all shared types work correctly and are compatible across agents
 */
import { describe, it, expect } from 'vitest';
import {
  AgentError,
  BaseAgentResult,
  ComplianceResult,
  ComplianceIssue,
  KPIAnalysis,
  DetailedKPIAnalysis,
  ProcurementCheck,
  SupplierValidation,
  SupplierData,
  AgentTask,
  TaskManagerStatistics,
  AgentEventPayload,
  AgentConfig,
  QueryResult,
  TemplateService,
  TemplateData,
  SPIData,
  CPIData,
  QualityMetrics,
  SafetyMetrics,
} from './types.js';

describe('Type Compatibility Tests', () => {
  describe('BaseAgentResult', () => {
    it('should accept valid base agent result', () => {
      const result: BaseAgentResult = {
        success: true,
        timestamp: new Date(),
        agentType: 'test',
        projectId: 'proj-123',
      };
      expect(result.success).toBe(true);
      expect(result.agentType).toBe('test');
      expect(result.projectId).toBe('proj-123');
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
  describe('AgentError', () => {
    it('should accept valid agent error', () => {
      const error: AgentError = new Error('Test error') as AgentError;
      error.code = 'TEST_ERROR';
      error.agentType = 'test';
      error.operation = 'testOperation';
      error.details = { testData: 'value' };
      expect(error.code).toBe('TEST_ERROR');
      expect(error.agentType).toBe('test');
      expect(error.operation).toBe('testOperation');
      expect(error.details).toEqual({ testData: 'value' });
    });
  });
  describe('ComplianceResult', () => {
    it('should extend BaseAgentResult correctly', () => {
      const issues: ComplianceIssue[] = [
        {
          code: 'MISSING_PERMIT',
          severity: 'error',
          message: 'Building permit not found',
          location: 'Section A',
          recommendation: 'Obtain building permit',
        },
      ];
      const result: ComplianceResult = {
        success: false,
        agentType: 'compliance',
        passed: false,
        issues,
        validationDetails: {
          ifcPath: '/path/to/model.ifc',
          templatesChecked: ['template-1'],
          codeReferences: ['Building Code 2023'],
        },
      };
      expect(result.passed).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('error');
    });
  });

  describe('KPIAnalysis vs DetailedKPIAnalysis', () => {
    it('should have compatible base KPIAnalysis', () => {
      const kpis = {
        spi: {
          value: 0.95,
          unit: 'ratio',
          status: 'warning' as const,
          threshold: 1.0,
        },
      };
      const predictions = {
        completion: { value: 30, confidence: 0.8, method: 'linear-regression' },
      };
      const analysis: KPIAnalysis = {
        agentType: 'performance',
        kpis,
        predictions,
        analysisMetadata: {
          dataPoints: 100,
          timeRange: { start: new Date(), end: new Date() },
          algorithmsUsed: ['linear-regression'],
        },
      };
      expect(analysis.kpis.spi.status).toBe('warning');
      expect(analysis.predictions.completion.confidence).toBe(0.8);
    });

    it('should support DetailedKPIAnalysis with specific fields', () => {
      const qualityMetrics: QualityMetrics = {
        defectRate: 0.02,
        reworkCost: 5000,
        firstTimeRightRate: 95,
        qualityComplianceScore: 92,
        inspectionPassRate: 98,
      };
      const safetyMetrics: SafetyMetrics = {
        incidentRate: 1.5,
        nearMissCount: 3,
        safetyComplianceScore: 96,
        daysWithoutIncident: 45,
        safetyTrainingHours: 120,
      };
      const detailedAnalysis: DetailedKPIAnalysis = {
        kpis: {
          spi: {
            value: 0.95,
            unit: 'ratio',
            status: 'warning',
            threshold: 1.0,
          },
        },
        predictions: {
          completion: {
            value: 30,
            confidence: 0.8,
            method: 'linear-regression',
          },
        },
        spi: {
          status: 'on-track',
          variance: -2,
        },
        cpi: {
          value: 1.05,
          status: 'under-budget',
          variance: 10000,
        },
        quality: qualityMetrics,
        safety: safetyMetrics,
        overallScore: 87,
        riskLevel: 'medium',
        trends: {
          spiTrend: [1.0, 0.98, 0.95],
          cpiTrend: [1.0, 1.02, 1.05],
          qualityTrend: [90, 91, 92],
          safetyTrend: [94, 95, 96],
          forecastedCompletion: new Date('2024-12-31'),
          forecastedCost: 150000,
          riskEvents: ['Weather delays possible'],
          recommendations: ['Increase quality control measures'],
        },
      };
      expect(detailedAnalysis.spi.status).toBe('on-track');
      expect(detailedAnalysis.quality.defectRate).toBe(0.02);
      expect(detailedAnalysis.safety.daysWithoutIncident).toBe(45);
    });
  });

  describe('ProcurementCheck', () => {
    it('should work with supplier validations', () => {
      const supplierData: SupplierData = {
        id: 'supplier-1',
        name: 'Acme Construction',
        certifications: ['ISO-9001', 'LEED'],
        riskFactors: ['late-delivery-history'],
      };
      const supplierValidation: SupplierValidation = {
        supplierId: supplierData.id,
        name: supplierData.name,
        status: 'pending',
        certifications: supplierData.certifications,
        riskScore: 35,
        issues: ['Some delivery delays in the past'],
      };
      const procurementCheck: ProcurementCheck = {
        agentType: 'procurement',
        approved: false,
        notes: 'Supplier requires additional review',
        supplierValidations: [supplierValidation],
        riskAssessment: {
          overallRisk: 'medium',
          factors: [
            {
              category: 'supplier-reliability',
              score: 35,
              description: 'Some concerns with delivery history',
            },
          ],
          mitigationStrategies: ['Establish backup supplier relationships'],
        },
      };
      expect(procurementCheck.approved).toBe(false);
      expect(procurementCheck.supplierValidations).toHaveLength(1);
      expect(procurementCheck.riskAssessment?.overallRisk).toBe('medium');
    });
  });

  describe('AgentTask', () => {
    it('should support all agent types and statuses', () => {
      const task: AgentTask = {
        id: 'task-123',
        agentType: 'compliance',
        status: 'pending',
        priority: 5,
        inputData: { ifcPath: '/path/to/model.ifc' },
        createdAt: new Date(),
        scheduledAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
      expect(task.agentType).toBe('compliance');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(5);
      expect(task.inputData?.ifcPath).toBe('/path/to/model.ifc');
    });
  });

  describe('TaskManagerStatistics', () => {
    it('should track all status types', () => {
      const stats: TaskManagerStatistics = {
        pending: 5,
        in_progress: 2,
        completed: 15,
        failed: 1,
        total: 23,
      };
      expect(stats.total).toBe(23);
      expect(stats.completed).toBe(15);
    });
  });

  describe('AgentEventPayload', () => {
    it('should support various event payloads', () => {
      const eventPayload: AgentEventPayload = {
        taskId: 'task-123',
        agentType: 'performance',
        operation: 'analyzeProject',
        result: {
          success: true,
          timestamp: new Date(),
          agentType: 'performance',
          projectId: 'proj-123',
        },
        metadata: {
          duration: 1500,
        },
      };
      expect(eventPayload.agentType).toBe('performance');
      expect(eventPayload.operation).toBe('analyzeProject');
      expect(eventPayload.result?.success).toBe(true);
      expect(eventPayload.metadata?.duration).toBe(1500);
    });
  });

  describe('QueryResult', () => {
    it('should work with typed data', () => {
      interface TestData {
        id: string;
        name: string;
      }
      const result: QueryResult<TestData> = {
        rows: [
          { id: '1', name: 'Test 1' },
          { id: '2', name: 'Test 2' },
        ],
        rowCount: 2,
      };
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Test 1');
      expect(result.rowCount).toBe(2);
    });
  });

  describe('TemplateService and TemplateData', () => {
    it('should implement service interface correctly', () => {
      const templateData: TemplateData = {
        templateId: 'tmpl-123',
        name: 'Building Code Template',
        version: '2.1.0',
        isActive: true,
        metadata: {
          codeVersion: '2023',
          jurisdiction: 'City of Example',
        },
      };
      // Mock service implementation
      const mockService: TemplateService = {
        async getActiveTemplate(projectId: string) {
          return projectId === 'proj-123' ? templateData : null;
        },
        async validateProjectAccess(projectId: string, userId?: string) {
          return projectId === 'proj-123';
        },
      };
      expect(templateData.isActive).toBe(true);
      expect(templateData.metadata.jurisdiction).toBe('City of Example');
    });
  });

  describe('Performance Metrics Types', () => {
    it('should support SPI and CPI data structures', () => {
      const spiData: SPIData = {
        plannedValue: 100000,
        earnedValue: 95000,
        actualCost: 98000,
        scheduledDuration: 30,
        actualDuration: 32,
      };
      const cpiData: CPIData = {
        budgetAtCompletion: 200000,
        estimateAtCompletion: 205000,
      };
      expect(spiData.plannedValue).toBe(100000);
      expect(cpiData.estimateAtCompletion).toBe(205000);
    });
    it('should support quality and safety metrics', () => {
      const quality: QualityMetrics = {
        defectRate: 0.015,
        reworkCost: 3500,
        firstTimeRightRate: 96.5,
        qualityComplianceScore: 94,
        inspectionPassRate: 97.2,
      };
      const safety: SafetyMetrics = {
        incidentRate: 2.1,
        nearMissCount: 4,
        safetyComplianceScore: 93.5,
        daysWithoutIncident: 28,
        safetyTrainingHours: 150,
      };
      expect(quality.firstTimeRightRate).toBe(96.5);
      expect(safety.daysWithoutIncident).toBe(28);
    });
  });
});
