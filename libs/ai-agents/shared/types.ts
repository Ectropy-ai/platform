// Task status values for agent task lifecycle
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Event types for agent task events
export type TaskEventType =
  | 'created'
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'agent:error'
  | 'validation:complete'
  | 'analysis:complete'
  | 'manager:started'
  | 'manager:stopped'
  | 'task:started'
  | 'task:completed'
  | 'task:failed';

// Metadata for task events
export interface TaskEventMetadata {
  [key: string]: unknown;
}

// Standardized error for task events
export interface TaskEventError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Event object for agent task events
export interface TaskEvent {
  taskId: string;
  eventType: TaskEventType;
  status: TaskStatus;
  metadata?: TaskEventMetadata;
  error?: TaskEventError;
  timestamp: Date;
}

// Alias for agent task
export type Task = AgentTask;
// Standardized error class for all AI agents
export class AgentError extends Error {
  code: string;
  agentType: string;
  operation: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    agentType: string,
    operation: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.agentType = agentType;
    this.operation = operation;
    this.details = details;
  }
}
// ...existing code...
export interface BaseAgentResult {
  success: boolean;
  passed?: boolean;
  timestamp: Date;
  agentType: string;
  projectId: string;
  issues?: any[]; // Add optional issues property for compliance results
}
// ...existing code...
/**
 * Compliance Agent Types
 */
export interface ComplianceResult extends BaseAgentResult {
  passed: boolean;
  issues: ComplianceIssue[];
  validationDetails?: ValidationDetails;
}

export interface ComplianceIssue {
  code?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  recommendation?: string;
}

export interface ValidationDetails {
  ifcPath: string;
  templatesChecked: string[];
  codeReferences: string[];
  metadata?: Record<string, any>;
}

/**
 * Performance Agent Types
 */
export interface SPIData {
  /** Budgeted cost of work scheduled (BCWS) */
  plannedValue: number;
  /** Budgeted cost of work performed (BCWP) */
  earnedValue: number;
  /** Actual cost of work performed (ACWP) */
  actualCost: number;
  /** Originally planned project duration in days */
  scheduledDuration: number;
  /** Current project duration in days */
  actualDuration: number;
}

export interface CPIData {
  /** Total approved project budget */
  budgetAtCompletion: number;
  /** Forecasted total project cost */
  estimateAtCompletion: number;
}

export interface QualityMetrics {
  defectRate: number;
  reworkCost: number;
  firstTimeRightRate: number;
  qualityComplianceScore: number;
  inspectionPassRate: number;
}

export interface SafetyMetrics {
  /** Safety incidents per 100,000 hours worked */
  incidentRate: number;
  /** Number of near-miss safety events reported */
  nearMissCount: number;
  /** Safety compliance percentage (0-100) */
  safetyComplianceScore: number;
  /** Consecutive days without safety incidents */
  daysWithoutIncident: number;
  /** Total safety training hours completed by team */
  safetyTrainingHours: number;
}

export interface KPIAnalysis extends BaseAgentResult {
  /** Dictionary of calculated KPI values by name */
  kpis: Record<string, KPIValue>;
  /** Dictionary of predicted values by name */
  predictions: Record<string, PredictionValue>;
  /** Optional metadata about the analysis process */
  analysisMetadata?: AnalysisMetadata;
}

export interface KPIValue {
  /** The calculated KPI value */
  value: number;
  /** Unit of measurement (e.g., '%', 'days', '$', 'hours') */
  unit: string;
  /** Optional threshold value for status determination */
  threshold?: number;
  /** Current status based on thresholds */
  status: 'good' | 'warning' | 'critical';
}

export interface PredictionValue {
  /** The predicted value */
  value: number;
  /** Confidence level of the prediction (0-1) */
  confidence: number;
  /** Name of the prediction algorithm/method used */
  method: string;
}

export interface AnalysisMetadata {
  /** Number of data points used in the analysis */
  dataPoints: number;
  /** Time period covered by the analysis */
  timeRange: {
    start: Date;
    end: Date;
  };
  algorithmsUsed: string[];
}

export interface DetailedKPIAnalysis extends Omit<KPIAnalysis, 'predictions'> {
  // Performance indices
  spi: {
    value: number; // SPI = Earned Value / Planned Value
    status: 'ahead' | 'on-track' | 'behind'; // Schedule status
    variance: number; // Schedule variance in days
  };
  cpi: {
    value: number; // CPI = Earned Value / Actual Cost
    status: 'under-budget' | 'on-budget' | 'over-budget'; // Cost status
    variance: number; // Cost variance in currency
  };
  quality: QualityMetrics;
  safety: SafetyMetrics;
  overallScore: number; // Composite score (0-100)
  riskLevel: 'low' | 'medium' | 'high'; // Project risk assessment
  trends: {
    spiTrend: number[];
    cpiTrend: number[];
    qualityTrend: number[];
    safetyTrend: number[];
  };
  predictions: {
    forecastedCompletion: Date;
    forecastedCost: number;
    riskEvents: string[];
    recommendations: string[];
  };
}

/**
 */
export interface SupplierData {
  id: string;
  name: string;
  certifications: string[];
  riskFactors: string[];
}

export interface ProcurementCheck extends BaseAgentResult {
  approved: boolean;
  notes: string;
  supplierValidations: SupplierValidation[];
  riskAssessment?: RiskAssessment;
}
export interface ProcurementResult extends BaseAgentResult {
  procurementType:
    | 'supplier-validation'
    | 'procurement-check'
    | 'risk-assessment';
  supplierData?: SupplierData;
  validationResults?: SupplierValidation[];
  riskMetrics?: RiskMetrics;
}

export interface SupplierValidation {
  supplierId: string;
  status: 'approved' | 'rejected' | 'pending';
  riskScore: number;
  issues: string[];
  validatedAt: Date;
  validatedBy: string;
  contactInfo?: ContactInfo;
  performanceHistory?: PerformanceRecord[];
  complianceStatus?: ComplianceRecord;
}

export interface ContactInfo {
  email: string;
  phone?: string;
  address?: Address;
  primaryContact: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface PerformanceRecord {
  deliveryScore: number;
  qualityScore: number;
  communicationScore: number;
  overallRating: number;
  recordedAt: Date;
}

export interface ComplianceRecord {
  certifications: CertificationStatus[];
  auditResults: AuditResult[];
  lastAuditDate: Date;
  nextAuditDue: Date;
  complianceScore: number;
}

export interface CertificationStatus {
  type: string;
  status: 'active' | 'expired' | 'pending' | 'revoked';
  issueDate: Date;
  expiryDate: Date;
  issuingBody: string;
}

export interface AuditResult {
  auditId: string;
  auditDate: Date;
  auditor: string;
  score: number;
  findings: AuditFinding[];
  recommendations: string[];
}

export interface AuditFinding {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation?: string;
  resolved: boolean;
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  mitigationStrategies: string[];
  assessmentDate: Date;
  nextReviewDate: Date;
  assessedBy: string;
}

export interface RiskFactor {
  impact: 'low' | 'medium' | 'high';
  likelihood: 'low' | 'medium' | 'high';
}

export interface RiskMetrics {
  totalRiskScore: number;
  categoryBreakdown: Record<string, number>;
  trendAnalysis: TrendData[];
  benchmarkComparison?: BenchmarkData;
}

export interface TrendData {
  period: string;
  changePercentage: number;
  keyFactors: string[];
}

export interface BenchmarkData {
  industryAverage: number;
  peerComparison: number;
  bestInClass: number;
  position: 'above' | 'at' | 'below';
}

export interface AgentTask {
  id: string;
  agentType: 'compliance' | 'performance' | 'procurement';
  projectId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: number;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  scheduledAt?: Date;
}

export interface TaskManagerStatistics {
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  total: number;
  averageExecutionTime: number;
  successRate: number;
}

export interface AgentEventPayload {
  taskId?: string;
  projectId?: string;
  agentType?: string;
  operation?: string;
  result?: BaseAgentResult;
  error?: AgentError;
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  pollIntervalMs?: number;
  maxRetries?: number;
  timeout?: number;
  enableEventEmission?: boolean;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DatabasePool {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  connect(): Promise<DatabaseClient>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface DatabaseClient {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  release(err?: Error | boolean): void;
}
export interface TemplateService {
  getActiveTemplate(projectId: string): Promise<TemplateData | null>;
  validateProjectAccess(projectId: string, userId?: string): Promise<boolean>;
}

export interface TemplateData {
  templateId: string;
  version: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
}
