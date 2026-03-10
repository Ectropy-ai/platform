/**
 * AI Agent types and interfaces for the Ectropy platform
 */

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  capabilities: AgentCapability[];
  config: AgentConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentType = 
  | 'ifc-processor' 
  | 'compliance-checker' 
  | 'document-processor'
  | 'quality-assurance'
  | 'predictive-analytics';

export type AgentStatus = 'active' | 'inactive' | 'error' | 'maintenance';

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
  version: string;
}

export interface AgentConfig {
  maxConcurrency?: number;
  timeout?: number;
  retryAttempts?: number;
  customSettings?: Record<string, any>;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  input: AgentInput;
  output?: AgentOutput;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  metadata: Record<string, any>;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentInput {
  type: string;
  data: any;
  metadata?: Record<string, any>;
}

export interface AgentOutput {
  type: string;
  data: any;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface AgentMetrics {
  agentId: string;
  executionCount: number;
  successRate: number;
  averageExecutionTime: number;
  lastExecuted?: Date;
  errorCount: number;
}

export interface AgentPrediction {
  id: string;
  agentId: string;
  prediction: any;
  confidence: number;
  createdAt: Date;
  validatedAt?: Date;
  accuracy?: number;
}