/**
 * AI Analysis Service
 * Connects to backend AI agents for model analysis
 */

import { config } from './config';

export interface AnalysisResult {
  cost?: {
    total: number;
    breakdown: {
      materials: number;
      labor: number;
      equipment: number;
    };
  };
  compliance?: {
    passed: number;
    failed: number;
    warnings: number;
  };
  quality?: {
    score: number;
    issues: string[];
  };
}

export async function analyzeModel(modelId: string): Promise<{ data: AnalysisResult }> {
  const mcpUrl = config.speckleServerUrl;
  const response = await fetch(`${mcpUrl}/api/agents/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      modelId, 
      agents: ['cost', 'compliance', 'quality']
    })
  });
  
  if (!response.ok) {
    throw new Error('Analysis request failed');
  }
  
  return response.json();
}

export default { analyzeModel };