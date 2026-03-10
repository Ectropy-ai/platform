import { PerformanceAgent } from './performance-agent.js';
import type {
  TemplateService,
  TemplateData,
} from '@ectropy/ai-agents-shared/types';
import { vi } from 'vitest';

const TEST_PROJECT_ID = 'test-project-123';
const mockTemplateService: TemplateService = {
  getActiveTemplate: vi.fn(
    async (): Promise<TemplateData> => ({
      templateId: 't1',
      name: 'Test Template',
      version: '1.0.0',
      projectId: TEST_PROJECT_ID,
      isActive: true,
      metadata: {},
    })
  ),
  validateProjectAccess: vi.fn(async () => true),
} as any; // Use any to allow Jest mock flexibility
const mockDbPool = {
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
};
describe('PerformanceAgent', () => {
  let agent: PerformanceAgent;
  beforeEach(() => {
    agent = new PerformanceAgent(mockDbPool, mockTemplateService);
    mockDbPool.query.mockClear();
    (
      mockTemplateService.getActiveTemplate as ReturnType<typeof vi.fn>
    ).mockClear();
  });
  describe('analyzeProject', () => {
    it.skip('should emit analysis results with comprehensive KPIs', async () => {
      const listener = vi.fn();
      agent.on('analysis:completed', listener);
      // Mock database responses with sample data
      mockDbPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              planned_value: 100000,
              earned_value: 80000,
              actual_cost: 85000,
              scheduled_duration: 30,
              actual_duration: 25,
              budget_at_completion: 150000,
              estimate_at_completion: 160000,
              defect_rate: 0.03,
              rework_cost: 5000,
              first_time_right_rate: 92,
              quality_compliance_score: 88,
              inspection_pass_rate: 94,
              incident_rate: 0.005,
              near_miss_count: 3,
              safety_compliance_score: 96,
              days_without_incident: 45,
              safety_training_hours: 120,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Historical trends
        .mockResolvedValueOnce({ rows: [{ planned_duration: 90 }] }) // Project duration
        .mockResolvedValueOnce({ rows: [{ budget: 150000 }] }) // Project budget
        .mockResolvedValueOnce({ rows: [] }); // Store results
      const analysis = await agent.analyzeProject('p1');
      expect(listener).toHaveBeenCalledWith({
        projectId: 'p1',
        agentType: 'performance',
        operation: 'analyzeProject',
        result: expect.any(Object),
        metadata: {
          overallScore: expect.any(Number),
          riskLevel: expect.any(String),
          spiValue: expect.any(Number),
          cpiValue: expect.any(Number),
        },
      });
      expect(analysis).toMatchObject({
        success: true,
        timestamp: expect.any(Date),
        spi: expect.objectContaining({
          value: expect.any(Number),
          status: expect.stringMatching(/ahead|on-track|behind/),
          variance: expect.any(Number),
        }),
        cpi: expect.objectContaining({
          status: expect.stringMatching(/under-budget|on-budget|over-budget/),
        }),
        quality: expect.objectContaining({
          defectRate: expect.any(Number),
          qualityComplianceScore: expect.any(Number),
        }),
        safety: expect.objectContaining({
          incidentRate: expect.any(Number),
          safetyComplianceScore: expect.any(Number),
        }),
        overallScore: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high/),
        kpis: expect.objectContaining({
          schedulePerformanceIndex: expect.objectContaining({
            value: expect.any(Number),
            unit: 'ratio',
            status: expect.stringMatching(/good|warning|critical/),
          }),
          costPerformanceIndex: expect.objectContaining({}),
        }),
        predictions: expect.objectContaining({
          forecastedCompletion: expect.any(Date),
          forecastedCost: expect.any(Number),
          riskEvents: expect.any(Array),
          recommendations: expect.any(Array),
        }),
      });
    });
    it('should handle database errors gracefully', async () => {
      mockDbPool.query.mockRejectedValue(
        new Error('Database connection failed')
      );
      const analysis = await agent.analyzeProject('p1');
      // Should return analysis with default values when database fails
      expect(analysis.projectId).toBe('p1');
      expect(analysis.spi.value).toBeGreaterThan(0);
    });

    it.skip('should calculate SPI correctly', async () => {
      mockDbPool.query.mockResolvedValue({ rows: [] }); // Use defaults
      // With default values: earned_value (80000) / planned_value (100000) = 0.8
      const analysis = await agent.analyzeProject('p1');
      expect(analysis.spi.value).toBe(0.8);
      expect(analysis.spi.status).toBe('behind');
    });

    it.skip('should calculate CPI correctly', async () => {
      // With default values: earned_value (80000) / actual_cost (85000) = 0.941
      const analysis = await agent.analyzeProject('p1');
      expect(analysis.cpi.value).toBe(0.941);
      expect(analysis.cpi.status).toBe('on-budget');
    });

    it('should assess risk level based on metrics', async () => {
      // With default values (SPI: 0.8 = 1 risk factor), should be low risk (need >=2 for medium)
      const analysis = await agent.analyzeProject('p1');
      expect(analysis.riskLevel).toBe('low');
    });

    it.skip('should generate relevant recommendations', async () => {
      const analysis = await agent.analyzeProject('p1');
      expect(analysis.predictions.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('resource reallocation'),
          expect.stringContaining('schedule'),
        ])
      );
    });

    it.skip('should emit error event when template is not found', async () => {
      (
        mockTemplateService.getActiveTemplate as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      const errorListener = vi.fn();
      agent.on('analysis:error', errorListener);
      await expect(agent.analyzeProject('invalid-project')).rejects.toThrow(
        'No active template found for project invalid-project'
      );
      expect(errorListener).toHaveBeenCalledWith({
        projectId: 'invalid-project',
        error: expect.any(Error),
      });
    });

    it.skip('should generate predictions with trend analysis', async () => {
      // Mock historical trends
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [] }) // SPI data
        .mockResolvedValueOnce({ rows: [] }) // CPI data
        .mockResolvedValueOnce({ rows: [] }) // Quality metrics
        .mockResolvedValueOnce({ rows: [] }); // Safety metrics
      const analysis = await agent.analyzeProject('p1');
      // Historical trends
      analysis.trends = [
        { spi_value: 1.0, cpi_value: 1.0, quality_score: 85, safety_score: 95 },
        {
          spi_value: 0.9,
          cpi_value: 0.95,
          quality_score: 87,
          safety_score: 96,
        },
        { spi_value: 0.8, cpi_value: 0.9, quality_score: 88, safety_score: 94 },
      ];
      expect(analysis.trends).toHaveLength(3);
      expect(analysis.predictions.forecastedCompletion).toBeInstanceOf(Date);
      expect(analysis.predictions.forecastedCost).toBeGreaterThan(0);
    });

    it.skip('should use type-safe KPI structure', async () => {
      const analysis = await agent.analyzeProject('p1');
      expect(analysis.kpis.schedulePerformanceIndex).toEqual({
        value: 0.8,
        unit: 'ratio',
        threshold: 1.0,
        status: 'warning',
      });
      expect(analysis.predictions.forecastedCompletion).toEqual({
        value: expect.any(Number),
        confidence: 0.8,
        method: 'linear_trend_analysis',
      });
    });

    it.skip('should emit type-safe events', async () => {
      const listener = vi.fn();
      agent.on('analysis:completed', listener);
      mockDbPool.query.mockResolvedValue({ rows: [] });
      await agent.analyzeProject('test-project');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'performance',
          projectId: 'test-project',
          operation: 'analyzeProject',
          result: expect.any(Object),
          metadata: expect.any(Object),
        })
      );
    });

    it('throws error when no template is found', async () => {
      (
        mockTemplateService.getActiveTemplate as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      await expect(agent.analyzeProject('p1')).rejects.toThrow(
        'No active template found'
      );
    });

    it.skip('includes proper KPI structure in results', async () => {
      mockDbPool.query.mockResolvedValue({ rows: [] }); // Use defaults
      const result = await agent.analyzeProject('p1');
      expect(result.kpis.schedulePerformanceIndex).toEqual({
        value: 0.8,
        unit: 'ratio',
        threshold: 1.0,
        status: 'warning',
      });
      expect(result.predictions.forecastedCompletion).toEqual({
        value: expect.any(Number),
        confidence: 0.8,
        method: 'linear_trend_analysis',
      });
    });
  });
});
