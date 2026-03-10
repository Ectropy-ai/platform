/**
 * Shared Agent Types
 */
export interface AgentConfig {
  id: string;
  name: string;
  capabilities: string[];
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
}