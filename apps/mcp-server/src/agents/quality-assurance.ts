/**
 * Quality Assurance Agent
 * Handles defect detection, progress validation, and quality control for construction projects
 */

import { BaseAgent } from './base-agent.js';

export interface QualityAssuranceInput {
  projectId?: string;
  inspectionType:
    | 'progress'
    | 'defect_detection'
    | 'material_testing'
    | 'final_inspection'
    | 'safety_audit';
  phase?:
    | 'foundation'
    | 'framing'
    | 'mechanical'
    | 'electrical'
    | 'plumbing'
    | 'finishes'
    | 'completion';
  imageData?: Array<{
    id: string;
    url: string;
    location: string;
    timestamp: Date;
    metadata?: any;
  }>;
  sensorData?: Array<{
    type: 'moisture' | 'temperature' | 'pressure' | 'vibration' | 'sound';
    value: number;
    unit: string;
    location: string;
    timestamp: Date;
  }>;
  measurements?: Array<{
    type: string;
    expected: number;
    actual: number;
    tolerance: number;
    unit: string;
    location: string;
  }>;
  materials?: Array<{
    type: string;
    batch: string;
    testResults?: any;
    certifications?: string[];
  }>;
  standards?: string[];
}

export interface QualityDefect {
  id: string;
  type: 'dimensional' | 'material' | 'workmanship' | 'safety' | 'environmental';
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  description: string;
  location: string;
  phase: string;
  detectionMethod: 'visual' | 'measurement' | 'sensor' | 'testing';
  evidence?: Array<{
    type: 'image' | 'measurement' | 'sensor_data' | 'test_result';
    data: any;
  }>;
  rootCause?: string;
  impact: {
    cost: number;
    schedule: number; // days
    safety: 'low' | 'medium' | 'high';
    quality: 'low' | 'medium' | 'high';
  };
  remediation: {
    description: string;
    cost: number;
    timeRequired: number; // days
    preventiveMeasures: string[];
  };
  status: 'open' | 'in_progress' | 'resolved' | 'verified';
}

export interface QualityMetric {
  metric: string;
  current: number;
  target: number;
  trend: 'improving' | 'stable' | 'declining';
  unit: string;
}

export interface QualityAssuranceResult {
  overallQualityScore: number; // 0-100
  phaseCompletion: number; // 0-100 percentage
  defects: QualityDefect[];
  qualityMetrics: QualityMetric[];
  progressValidation: {
    expectedProgress: number;
    actualProgress: number;
    variance: number;
    onSchedule: boolean;
  };
  materialCompliance: {
    testedMaterials: number;
    passedTests: number;
    failedTests: number;
    pendingTests: number;
  };
  safetyAssessment: {
    hazardsIdentified: number;
    safeguardsInPlace: number;
    complianceScore: number;
  };
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    description: string;
    expectedBenefit: string;
  }>;
  nextInspections: Array<{
    type: string;
    scheduledDate: Date;
    location: string;
    requirements: string[];
  }>;
  qualityTrends: Array<{
    period: string;
    score: number;
    defectCount: number;
    resolvedCount: number;
  }>;
}

export class QualityAssuranceAgent extends BaseAgent {
  private qualityStandards: Map<string, any> = new Map();
  private defectDatabase: Map<string, QualityDefect> = new Map();

  constructor() {
    super();
    this.capabilities = [
      'defect_detection',
      'progress_validation',
      'material_testing',
      'dimensional_verification',
      'safety_inspection',
      'quality_metrics',
      'trend_analysis',
    ];
    this.loadQualityStandards();
  }

  getName(): string {
    return 'quality-assurance';
  }

  getDescription(): string {
    return 'Performs defect detection, progress validation, and quality control assessments';
  }

  getCapabilities(): string[] {
    return this.capabilities;
  }

  async process(input: QualityAssuranceInput): Promise<QualityAssuranceResult> {
    return this.processWithMetrics(async () => {
      // Process quality assurance
      console.log(
        `🔍 Processing quality assurance ${input.inspectionType} for phase: ${input.phase || 'general'}`
      );

      // Initialize result components
      const defects: QualityDefect[] = [];
      const qualityMetrics: QualityMetric[] = [];
      let progressValidation: any = {};
      let materialCompliance: any = {};
      let safetyAssessment: any = {};

      // Perform inspection based on type
      switch (input.inspectionType) {
        case 'defect_detection':
          const detectedDefects = await this.detectDefects(input);
          defects.push(...detectedDefects);
          break;

        case 'progress':
          progressValidation = await this.validateProgress(input);
          break;

        case 'material_testing':
          materialCompliance = await this.assessMaterialCompliance(input);
          break;

        case 'safety_audit':
          safetyAssessment = await this.performSafetyAudit(input);
          break;

        case 'final_inspection':
          // Comprehensive inspection
          defects.push(...(await this.detectDefects(input)));
          progressValidation = await this.validateProgress(input);
          materialCompliance = await this.assessMaterialCompliance(input);
          safetyAssessment = await this.performSafetyAudit(input);
          break;
      }

      // Calculate quality metrics
      qualityMetrics.push(...this.calculateQualityMetrics(input, defects));

      // Calculate overall quality score
      const overallQualityScore = this.calculateOverallQualityScore(
        defects,
        qualityMetrics,
        materialCompliance
      );

      // Calculate phase completion
      const phaseCompletion = this.calculatePhaseCompletion(
        input,
        progressValidation
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        defects,
        qualityMetrics,
        input
      );

      // Schedule next inspections
      const nextInspections = this.scheduleNextInspections(input, defects);

      // Analyze quality trends
      const qualityTrends = this.analyzeQualityTrends(
        input.projectId || 'unknown'
      );

      return {
        overallQualityScore,
        phaseCompletion,
        defects: defects.sort(
          (a, b) =>
            this.getSeverityWeight(b.severity) -
            this.getSeverityWeight(a.severity)
        ),
        qualityMetrics,
        progressValidation: progressValidation || {
          expectedProgress: 0,
          actualProgress: 0,
          variance: 0,
          onSchedule: true,
        },
        materialCompliance: materialCompliance || {
          testedMaterials: 0,
          passedTests: 0,
          failedTests: 0,
          pendingTests: 0,
        },
        safetyAssessment: safetyAssessment || {
          hazardsIdentified: 0,
          safeguardsInPlace: 0,
          complianceScore: 100,
        },
        recommendations,
        nextInspections,
        qualityTrends,
      };
    });
  }

  private async detectDefects(
    input: QualityAssuranceInput
  ): Promise<QualityDefect[]> {
    const defects: QualityDefect[] = [];

    // Analyze image data for visual defects
    if (input.imageData) {
      for (const image of input.imageData) {
        const visualDefects = await this.analyzeImageForDefects(image);
        defects.push(...visualDefects);
      }
    }

    // Analyze measurements for dimensional defects
    if (input.measurements) {
      for (const measurement of input.measurements) {
        const dimensionalDefects = this.checkDimensionalTolerance(measurement);
        if (dimensionalDefects) {
          defects.push(dimensionalDefects);
        }
      }
    }

    // Analyze sensor data for environmental defects
    if (input.sensorData) {
      for (const sensor of input.sensorData) {
        const environmentalDefects = this.analyzeSensorData(sensor);
        if (environmentalDefects) {
          defects.push(environmentalDefects);
        }
      }
    }

    return defects;
  }

  private async analyzeImageForDefects(image: any): Promise<QualityDefect[]> {
    const defects: QualityDefect[] = [];

    // Simulate AI-based image analysis for common construction defects
    const detectedIssues = [
      { type: 'crack', probability: 0.15 },
      { type: 'misalignment', probability: 0.1 },
      { type: 'surface_defect', probability: 0.08 },
      { type: 'incomplete_work', probability: 0.12 },
      { type: 'safety_violation', probability: 0.05 },
    ];

    for (const issue of detectedIssues) {
      if (Math.random() < issue.probability) {
        const defect: QualityDefect = {
          id: `DEF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: this.categorizeDefectType(issue.type),
          severity: this.determineSeverity(issue.type),
          description: this.generateDefectDescription(issue.type),
          location: image.location,
          phase: this.determinePhaseFromLocation(image.location),
          detectionMethod: 'visual',
          evidence: [
            {
              type: 'image',
              data: {
                imageId: image.id,
                url: image.url,
                timestamp: image.timestamp,
              },
            },
          ],
          rootCause: this.determineRootCause(issue.type),
          impact: this.calculateDefectImpact(issue.type),
          remediation: this.generateRemediationPlan(issue.type),
          status: 'open',
        };

        defects.push(defect);
      }
    }

    return defects;
  }

  private checkDimensionalTolerance(measurement: any): QualityDefect | null {
    const variance = Math.abs(measurement.actual - measurement.expected);
    const toleranceExceeded = variance > measurement.tolerance;

    if (toleranceExceeded) {
      return {
        id: `DEF-DIM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'dimensional',
        severity: variance > measurement.tolerance * 2 ? 'major' : 'minor',
        description: `Dimensional variance exceeds tolerance for ${measurement.type}`,
        location: measurement.location,
        phase: this.determinePhaseFromMeasurement(measurement.type),
        detectionMethod: 'measurement',
        evidence: [
          {
            type: 'measurement',
            data: {
              expected: measurement.expected,
              actual: measurement.actual,
              variance,
              tolerance: measurement.tolerance,
              unit: measurement.unit,
            },
          },
        ],
        rootCause: 'Installation or fabrication error',
        impact: {
          cost: variance * 100, // Estimated cost per unit variance
          schedule: variance > measurement.tolerance * 3 ? 2 : 1,
          safety: 'low',
          quality: variance > measurement.tolerance * 2 ? 'high' : 'medium',
        },
        remediation: {
          description: `Adjust ${measurement.type} to meet dimensional requirements`,
          cost: variance * 150,
          timeRequired: 1,
          preventiveMeasures: [
            'Enhanced measurement protocols',
            'Regular calibration checks',
          ],
        },
        status: 'open',
      };
    }

    return null;
  }

  private analyzeSensorData(sensor: any): QualityDefect | null {
    // Define acceptable ranges for different sensor types
    const acceptableRanges: Record<string, { min: number; max: number }> = {
      moisture: { min: 0, max: 15 }, // percentage
      temperature: { min: 32, max: 100 }, // Fahrenheit
      pressure: { min: 0, max: 50 }, // PSI
      vibration: { min: 0, max: 5 }, // units
      sound: { min: 0, max: 85 }, // decibels
    };

    const range = acceptableRanges[sensor.type];
    if (range && (sensor.value < range.min || sensor.value > range.max)) {
      return {
        id: `DEF-ENV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'environmental',
        severity:
          sensor.value > range.max * 1.5 || sensor.value < range.min * 0.5
            ? 'major'
            : 'minor',
        description: `${sensor.type} reading outside acceptable range`,
        location: sensor.location,
        phase: 'monitoring',
        detectionMethod: 'sensor',
        evidence: [
          {
            type: 'sensor_data',
            data: {
              sensorType: sensor.type,
              value: sensor.value,
              unit: sensor.unit,
              timestamp: sensor.timestamp,
              acceptableRange: range,
            },
          },
        ],
        rootCause: `Environmental control or equipment malfunction`,
        impact: {
          cost: 500,
          schedule: 1,
          safety:
            sensor.type === 'sound' || sensor.type === 'vibration'
              ? 'medium'
              : 'low',
          quality: 'medium',
        },
        remediation: {
          description: `Investigate and correct ${sensor.type} levels`,
          cost: 750,
          timeRequired: 1,
          preventiveMeasures: [
            'Regular environmental monitoring',
            'Calibrated sensor maintenance',
          ],
        },
        status: 'open',
      };
    }

    return null;
  }

  private async validateProgress(input: QualityAssuranceInput): Promise<any> {
    // Simulate progress validation based on phase
    const phaseProgress: Record<string, number> = {
      foundation: 85,
      framing: 70,
      mechanical: 45,
      electrical: 60,
      plumbing: 55,
      finishes: 30,
      completion: 95,
    };

    const expectedProgress = phaseProgress[input.phase || 'general'] || 50;
    const actualProgress = expectedProgress + (Math.random() - 0.5) * 20; // ±10% variance
    const variance = actualProgress - expectedProgress;

    return {
      expectedProgress,
      actualProgress: Math.max(0, Math.min(100, actualProgress)),
      variance,
      onSchedule: Math.abs(variance) <= 5,
    };
  }

  private async assessMaterialCompliance(
    input: QualityAssuranceInput
  ): Promise<any> {
    if (!input.materials) {
      return {
        testedMaterials: 0,
        passedTests: 0,
        failedTests: 0,
        pendingTests: 0,
      };
    }

    let passedTests = 0;
    let failedTests = 0;
    let pendingTests = 0;

    input.materials.forEach((material) => {
      if (material.testResults) {
        if (material.testResults.passed) {
          passedTests++;
        } else {
          failedTests++;
        }
      } else {
        pendingTests++;
      }
    });

    return {
      testedMaterials: input.materials.length,
      passedTests,
      failedTests,
      pendingTests,
    };
  }

  private async performSafetyAudit(_input: QualityAssuranceInput): Promise<any> {
    // Simulate safety audit results
    const hazardsIdentified = Math.floor(Math.random() * 5);
    const safeguardsInPlace = Math.floor(Math.random() * 10) + 5;
    const complianceScore = Math.max(60, 100 - hazardsIdentified * 10);

    return {
      hazardsIdentified,
      safeguardsInPlace,
      complianceScore,
    };
  }

  private calculateQualityMetrics(
    input: QualityAssuranceInput,
    defects: QualityDefect[]
  ): QualityMetric[] {
    const metrics: QualityMetric[] = [];

    // Defect density metric
    const defectDensity = defects.length / (input.measurements?.length || 1);
    metrics.push({
      metric: 'Defect Density',
      current: defectDensity,
      target: 0.1,
      trend: defectDensity < 0.1 ? 'improving' : 'declining',
      unit: 'defects per inspection point',
    });

    // Critical defect percentage
    const criticalDefects = defects.filter(
      (d) => d.severity === 'critical'
    ).length;
    const criticalPercentage =
      defects.length > 0 ? (criticalDefects / defects.length) * 100 : 0;
    metrics.push({
      metric: 'Critical Defect Rate',
      current: criticalPercentage,
      target: 5,
      trend: criticalPercentage < 5 ? 'improving' : 'declining',
      unit: 'percentage',
    });

    // Rework rate simulation
    const reworkRate = Math.random() * 10;
    metrics.push({
      metric: 'Rework Rate',
      current: reworkRate,
      target: 3,
      trend:
        reworkRate < 3 ? 'improving' : reworkRate < 5 ? 'stable' : 'declining',
      unit: 'percentage',
    });

    return metrics;
  }

  private calculateOverallQualityScore(
    defects: QualityDefect[],
    metrics: QualityMetric[],
    materialCompliance: any
  ): number {
    let score = 100;

    // Deduct for defects
    defects.forEach((defect) => {
      switch (defect.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'major':
          score -= 10;
          break;
        case 'minor':
          score -= 3;
          break;
        case 'cosmetic':
          score -= 1;
          break;
      }
    });

    // Deduct for poor metrics
    metrics.forEach((metric) => {
      if (metric.current > metric.target) {
        const ratio = metric.current / metric.target;
        score -= (ratio - 1) * 10;
      }
    });

    // Deduct for material failures
    if (materialCompliance.failedTests > 0) {
      const failureRate =
        materialCompliance.failedTests / materialCompliance.testedMaterials;
      score -= failureRate * 30;
    }

    return Math.max(0, Math.round(score));
  }

  private calculatePhaseCompletion(
    input: QualityAssuranceInput,
    progressValidation: any
  ): number {
    if (progressValidation.actualProgress !== undefined) {
      return Math.max(0, Math.min(100, progressValidation.actualProgress));
    }

    // Default phase completion based on inspection type
    const defaultCompletion: Record<string, number> = {
      foundation: 90,
      framing: 75,
      mechanical: 60,
      electrical: 65,
      plumbing: 55,
      finishes: 40,
      completion: 100,
    };

    return defaultCompletion[input.phase || 'general'] || 50;
  }

  private generateRecommendations(
    defects: QualityDefect[],
    metrics: QualityMetric[],
    input: QualityAssuranceInput
  ): any[] {
    const recommendations: any[] = [];

    // Recommendations based on defects
    const criticalDefects = defects.filter((d) => d.severity === 'critical');
    if (criticalDefects.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Critical Issues',
        description: `Address ${criticalDefects.length} critical defects immediately`,
        expectedBenefit: 'Prevent safety hazards and project delays',
      });
    }

    // Recommendations based on metrics
    const poorMetrics = metrics.filter((m) => m.current > m.target);
    if (poorMetrics.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Quality Improvement',
        description:
          'Implement process improvements to address quality metrics',
        expectedBenefit: 'Reduce defect rates and improve overall quality',
      });
    }

    // Phase-specific recommendations
    if (input.phase === 'foundation') {
      recommendations.push({
        priority: 'medium',
        category: 'Foundation Quality',
        description:
          'Conduct concrete strength testing before proceeding to framing',
        expectedBenefit: 'Ensure structural integrity of building foundation',
      });
    }

    return recommendations;
  }

  private scheduleNextInspections(
    input: QualityAssuranceInput,
    defects: QualityDefect[]
  ): any[] {
    const inspections: any[] = [];

    // Schedule follow-up for defects
    if (defects.length > 0) {
      inspections.push({
        type: 'Defect Follow-up',
        scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
        location: 'Areas with identified defects',
        requirements: [
          'Verify remediation completion',
          'Re-test affected areas',
        ],
      });
    }

    // Schedule phase-specific inspections
    const phaseInspections: Record<string, any> = {
      foundation: {
        type: 'Pre-framing Inspection',
        days: 3,
        requirements: [
          'Foundation curing complete',
          'Anchor bolt alignment verified',
        ],
      },
      framing: {
        type: 'Rough Framing Inspection',
        days: 5,
        requirements: [
          'Structural elements in place',
          'Code compliance verified',
        ],
      },
      mechanical: {
        type: 'MEP Rough-in Inspection',
        days: 7,
        requirements: ['All systems installed', 'Pressure testing complete'],
      },
    };

    const nextInspection = phaseInspections[input.phase || ''];
    if (nextInspection) {
      inspections.push({
        type: nextInspection.type,
        scheduledDate: new Date(
          Date.now() + nextInspection.days * 24 * 60 * 60 * 1000
        ),
        location: 'Project site',
        requirements: nextInspection.requirements,
      });
    }

    return inspections;
  }

  private analyzeQualityTrends(_projectId: string): any[] {
    // Simulate quality trend data
    const trends: any[] = [];

    for (let i = 4; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);

      trends.push({
        period: date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
        }),
        score: 75 + Math.random() * 20,
        defectCount: Math.floor(Math.random() * 10) + 2,
        resolvedCount: Math.floor(Math.random() * 8) + 1,
      });
    }

    return trends;
  }

  // Helper methods
  private categorizeDefectType(
    issueType: string
  ): 'dimensional' | 'material' | 'workmanship' | 'safety' | 'environmental' {
    const categoryMap: Record<string, any> = {
      crack: 'material',
      misalignment: 'dimensional',
      surface_defect: 'workmanship',
      incomplete_work: 'workmanship',
      safety_violation: 'safety',
    };

    return categoryMap[issueType] || 'workmanship';
  }

  private determineSeverity(
    issueType: string
  ): 'critical' | 'major' | 'minor' | 'cosmetic' {
    const severityMap: Record<string, any> = {
      crack: 'major',
      misalignment: 'minor',
      surface_defect: 'cosmetic',
      incomplete_work: 'major',
      safety_violation: 'critical',
    };

    return severityMap[issueType] || 'minor';
  }

  private generateDefectDescription(issueType: string): string {
    const descriptions: Record<string, string> = {
      crack: 'Visible crack detected in surface material',
      misalignment: 'Component alignment outside acceptable tolerance',
      surface_defect: 'Surface finish quality below standard',
      incomplete_work: 'Work not completed according to specifications',
      safety_violation: 'Safety protocol violation identified',
    };

    return descriptions[issueType] || 'Quality issue detected';
  }

  private determinePhaseFromLocation(location: string): string {
    if (location.includes('foundation')) {
      return 'foundation';
    }
    if (location.includes('frame')) {
      return 'framing';
    }
    if (location.includes('electrical')) {
      return 'electrical';
    }
    if (location.includes('plumbing')) {
      return 'plumbing';
    }
    return 'general';
  }

  private determinePhaseFromMeasurement(type: string): string {
    if (type.includes('foundation')) {
      return 'foundation';
    }
    if (type.includes('wall') || type.includes('beam')) {
      return 'framing';
    }
    return 'general';
  }

  private determineRootCause(issueType: string): string {
    const rootCauses: Record<string, string> = {
      crack: 'Material stress or settlement',
      misalignment: 'Installation error or measurement inaccuracy',
      surface_defect: 'Poor workmanship or material quality',
      incomplete_work: 'Process oversight or resource constraints',
      safety_violation: 'Training deficiency or procedure non-compliance',
    };

    return rootCauses[issueType] || 'Investigation required';
  }

  private calculateDefectImpact(issueType: string): any {
    const impacts: Record<string, any> = {
      crack: { cost: 1500, schedule: 3, safety: 'medium', quality: 'high' },
      misalignment: {
        cost: 800,
        schedule: 2,
        safety: 'low',
        quality: 'medium',
      },
      surface_defect: { cost: 300, schedule: 1, safety: 'low', quality: 'low' },
      incomplete_work: {
        cost: 1200,
        schedule: 2,
        safety: 'medium',
        quality: 'high',
      },
      safety_violation: {
        cost: 500,
        schedule: 1,
        safety: 'high',
        quality: 'medium',
      },
    };

    return (
      impacts[issueType] || {
        cost: 500,
        schedule: 1,
        safety: 'low',
        quality: 'medium',
      }
    );
  }

  private generateRemediationPlan(issueType: string): any {
    const plans: Record<string, any> = {
      crack: {
        description: 'Repair crack using appropriate materials and techniques',
        cost: 2000,
        timeRequired: 3,
        preventiveMeasures: [
          'Material quality control',
          'Settlement monitoring',
        ],
      },
      misalignment: {
        description: 'Realign component to specification',
        cost: 1000,
        timeRequired: 2,
        preventiveMeasures: [
          'Enhanced measurement protocols',
          'Quality checkpoints',
        ],
      },
      surface_defect: {
        description: 'Refinish surface to acceptable quality standard',
        cost: 400,
        timeRequired: 1,
        preventiveMeasures: ['Workmanship training', 'Material inspection'],
      },
      incomplete_work: {
        description: 'Complete work according to specifications',
        cost: 1500,
        timeRequired: 3,
        preventiveMeasures: ['Progress tracking', 'Work completion checklists'],
      },
      safety_violation: {
        description: 'Implement safety measures and provide training',
        cost: 750,
        timeRequired: 1,
        preventiveMeasures: [
          'Safety training program',
          'Regular safety audits',
        ],
      },
    };

    return (
      plans[issueType] || {
        description: 'Investigate and resolve issue',
        cost: 750,
        timeRequired: 2,
        preventiveMeasures: ['Enhanced quality controls'],
      }
    );
  }

  private getSeverityWeight(severity: string): number {
    const weights = { critical: 4, major: 3, minor: 2, cosmetic: 1 };
    return weights[severity as keyof typeof weights] || 0;
  }

  private loadQualityStandards(): void {
    // Load quality standards and best practices
  }

  async initialize(): Promise<void> {
    await super.initialize();
    await this.loadQualityStandards();
    console.log(
      '🔍 Quality Assurance Agent ready for defect detection and progress validation'
    );
  }
}
