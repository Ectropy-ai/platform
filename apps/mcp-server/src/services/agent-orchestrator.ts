/**
 * Agent Orchestrator Service
 *
 * Coordinates between the 5 AI agents (Cost Estimation, Schedule Optimization,
 * Compliance Check, Quality Assurance, Document Processing) and provides
 * centralized analysis, issue detection, and solution generation capabilities.
 */

import {
  getAgent,
  getAgentStatus,
  processWithAgent,
  type AgentType,
} from '../agents/index.js';

// Core types for orchestrator functionality
export interface AnalysisScope {
  scope: 'full' | 'partial' | 'files';
  options: {
    includeIssues: boolean;
    includeSolutions: boolean;
    includeMetrics: boolean;
  };
  targetFiles?: string[];
  projectId?: string;
}

export interface Issue {
  id: string;
  type: 'compliance' | 'quality' | 'performance' | 'cost' | 'schedule';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  source: AgentType;
  projectId?: string;
  createdAt: Date;
  status: 'open' | 'in-progress' | 'resolved';
  metadata?: Record<string, any>;
}

export interface Solution {
  id: string;
  issueId: string;
  title: string;
  description: string;
  implementation: string[];
  estimatedEffort: string;
  priority: 'low' | 'medium' | 'high';
  agentRecommendations: AgentType[];
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface AnalysisResult {
  id: string;
  projectId?: string;
  scope: AnalysisScope;
  issues: Issue[];
  solutions: Solution[];
  metrics: {
    totalIssues: number;
    criticalIssues: number;
    analysisTime: number;
    agentsUsed: AgentType[];
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

// Custom error for agent operations
export class AgentExecutionError extends Error {
  public agent: string;
  public action: string;
  public _originalError?: Error;

  constructor(
    agent: string,
    action: string,
    message: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AgentExecutionError';
    this.agent = agent;
    this.action = action;
    this._originalError = originalError;
  }
}

/**
 * Agent Orchestrator Class
 * Manages complex workflows involving multiple AI agents
 */
export class AgentOrchestrator {
  private analysisCache = new Map<string, AnalysisResult>();
  private issueStore = new Map<string, Issue>();
  private solutionStore = new Map<string, Solution>();

  /**
   * Trigger comprehensive codebase analysis
   */
  async analyzeCodebase(scope: AnalysisScope): Promise<AnalysisResult> {
    const analysisId = this.generateId();
    const startTime = Date.now();

    const analysis: AnalysisResult = {
      id: analysisId,
      projectId: scope.projectId,
      scope,
      issues: [],
      solutions: [],
      metrics: {
        totalIssues: 0,
        criticalIssues: 0,
        analysisTime: 0,
        agentsUsed: [],
      },
      status: 'running',
      createdAt: new Date(),
    };

    // Cache the analysis immediately
    this.analysisCache.set(analysisId, analysis);

    try {
      // Run analysis with multiple agents based on scope
      const agentTypes: AgentType[] = this.getRelevantAgents(scope);
      const agentPromises = agentTypes.map(async (agentType) => {
        try {
          const agentResult = await this.runAgentAnalysis(agentType, scope);
          return { agentType, result: agentResult };
        } catch (error) {
          return { agentType, error };
        }
      });

      const agentResults = await Promise.allSettled(agentPromises);

      // Process results and extract issues
      for (const result of agentResults) {
        if (result.status === 'fulfilled' && result.value.result) {
          const { agentType, result: agentResult } = result.value;
          analysis.metrics.agentsUsed.push(agentType);

          // Extract issues from agent result
          const issues = this.extractIssuesFromAgentResult(
            agentType,
            agentResult,
            scope.projectId
          );
          analysis.issues.push(...issues);

          // Generate solutions if requested
          if (scope.options.includeSolutions && issues.length > 0) {
            const solutions = await this.generateSolutionsForIssues(issues);
            analysis.solutions.push(...solutions);
          }
        }
      }

      // Update metrics
      analysis.metrics.totalIssues = analysis.issues.length;
      analysis.metrics.criticalIssues = analysis.issues.filter(
        (i) => i.severity === 'critical'
      ).length;
      analysis.metrics.analysisTime = Date.now() - startTime;
      analysis.status = 'completed';
      analysis.completedAt = new Date();

      // Store issues and solutions
      analysis.issues.forEach((issue) => this.issueStore.set(issue.id, issue));
      analysis.solutions.forEach((solution) =>
        this.solutionStore.set(solution.id, solution)
      );
    } catch (error) {
      analysis.status = 'failed';
      analysis.error = error instanceof Error ? error.message : 'Unknown error';
      analysis.completedAt = new Date();
    }

    // Update cache
    this.analysisCache.set(analysisId, analysis);
    return analysis;
  }

  /**
   * Get all identified issues
   */
  getIssues(projectId?: string): Issue[] {
    const allIssues = Array.from(this.issueStore.values());
    return projectId
      ? allIssues.filter((issue) => issue.projectId === projectId)
      : allIssues;
  }

  /**
   * Submit new issue for analysis
   */
  async submitIssue(issueData: Partial<Issue>): Promise<Issue> {
    const issue: Issue = {
      id: this.generateId(),
      type: issueData.type || 'quality',
      severity: issueData.severity || 'medium',
      title: issueData.title || 'Untitled Issue',
      description: issueData.description || '',
      source: issueData.source || 'quality',
      projectId: issueData.projectId,
      createdAt: new Date(),
      status: 'open',
      metadata: issueData.metadata || {},
    };

    this.issueStore.set(issue.id, issue);
    return issue;
  }

  /**
   * Get all solutions
   */
  getSolutions(issueId?: string): Solution[] {
    const allSolutions = Array.from(this.solutionStore.values());
    return issueId
      ? allSolutions.filter((solution) => solution.issueId === issueId)
      : allSolutions;
  }

  /**
   * Generate solutions for specific issues
   */
  async generateSolutions(issueIds: string[]): Promise<Solution[]> {
    const issues = issueIds
      .map((id) => this.issueStore.get(id))
      .filter(Boolean) as Issue[];
    return this.generateSolutionsForIssues(issues);
  }

  /**
   * Execute specific agent action
   */
  async executeAgentAction(
    agentName: AgentType,
    action: string,
    params: any
  ): Promise<any> {
    const agent = getAgent(agentName);
    if (!agent) {
      throw new AgentExecutionError(
        agentName,
        action,
        `Agent '${agentName}' not found`
      );
    }

    try {
      // For now, route all actions through the process method
      // In a real implementation, you might have specific action methods
      return processWithAgent(agentName, { action, params });
    } catch (error) {
      throw new AgentExecutionError(
        agentName,
        action,
        `Failed to execute action '${action}' on agent '${agentName}'`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get orchestrator health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    agentFramework: ReturnType<typeof getAgentStatus>;
    cache: {
      analyses: number;
      issues: number;
      solutions: number;
    };
    performance: {
      lastAnalysisTime?: number;
      averageAnalysisTime?: number;
    };
  } {
    const agentStatus = getAgentStatus();

    return {
      status: agentStatus.systemHealth.overallStatus,
      agentFramework: agentStatus,
      cache: {
        analyses: this.analysisCache.size,
        issues: this.issueStore.size,
        solutions: this.solutionStore.size,
      },
      performance: {
        lastAnalysisTime: this.getLastAnalysisTime(),
        averageAnalysisTime: this.calculateAverageAnalysisTime(),
      },
    };
  }

  // Private helper methods

  private getRelevantAgents(scope: AnalysisScope): AgentType[] {
    // For full analysis, use all agents
    if (scope.scope === 'full') {
      return ['cost', 'schedule', 'compliance', 'quality', 'document'];
    }

    // For partial analysis, use core agents
    if (scope.scope === 'partial') {
      return ['compliance', 'quality'];
    }

    // For file-specific analysis, use document and quality agents
    return ['document', 'quality'];
  }

  private async runAgentAnalysis(
    agentType: AgentType,
    scope: AnalysisScope
  ): Promise<any> {
    // Prepare input for the specific agent
    const input = {
      scope: scope.scope,
      files: scope.targetFiles,
      projectId: scope.projectId,
      options: scope.options,
    };

    return processWithAgent(agentType, input);
  }

  private extractIssuesFromAgentResult(
    agentType: AgentType,
    agentResult: any,
    projectId?: string
  ): Issue[] {
    // This would be customized based on each agent's output format
    // For now, provide a generic implementation
    const issues: Issue[] = [];

    if (agentResult.issues && Array.isArray(agentResult.issues)) {
      agentResult.issues.forEach((issueData: any) => {
        issues.push({
          id: this.generateId(),
          type: this.mapAgentTypeToIssueType(agentType),
          severity: issueData.severity || 'medium',
          title: issueData.title || `${agentType} Issue`,
          description: issueData.description || '',
          source: agentType,
          projectId,
          createdAt: new Date(),
          status: 'open',
          metadata: issueData.metadata || {},
        });
      });
    }

    return issues;
  }

  private async generateSolutionsForIssues(
    issues: Issue[]
  ): Promise<Solution[]> {
    const solutions: Solution[] = [];

    for (const issue of issues) {
      // Generate solution based on issue type and agent recommendations
      const solution: Solution = {
        id: this.generateId(),
        issueId: issue.id,
        title: `Solution for: ${issue.title}`,
        description: this.generateSolutionDescription(issue),
        implementation: this.generateImplementationSteps(issue),
        estimatedEffort: this.estimateEffort(issue),
        priority: this.calculateSolutionPriority(issue),
        agentRecommendations: [issue.source],
        createdAt: new Date(),
        metadata: {},
      };

      solutions.push(solution);
    }

    return solutions;
  }

  private mapAgentTypeToIssueType(agentType: AgentType): Issue['type'] {
    const mapping: Record<AgentType, Issue['type']> = {
      cost: 'cost',
      schedule: 'schedule',
      compliance: 'compliance',
      quality: 'quality',
      document: 'quality', // Document issues typically relate to quality
    };
    return mapping[agentType];
  }

  private generateSolutionDescription(_issue: Issue): string {
    return `Automated solution generated for ${_issue.type} issue: ${_issue.title}. 
This solution addresses the identified problem and provides actionable steps for resolution.`;
  }

  private generateImplementationSteps(_issue: Issue): string[] {
    // Generate generic implementation steps based on issue type
    const baseSteps = [
      'Review the identified issue details',
      'Assess impact and dependencies',
      'Plan implementation approach',
      'Execute the solution',
      'Validate the fix',
      'Document the resolution',
    ];

    return baseSteps;
  }

  private estimateEffort(issue: Issue): string {
    const effortMap: Record<Issue['severity'], string> = {
      low: '1-2 hours',
      medium: '4-8 hours',
      high: '1-2 days',
      critical: '3-5 days',
    };
    return effortMap[issue.severity];
  }

  private calculateSolutionPriority(issue: Issue): Solution['priority'] {
    const priorityMap: Record<Issue['severity'], Solution['priority']> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'high',
    };
    return priorityMap[issue.severity];
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLastAnalysisTime(): number | undefined {
    const analyses = Array.from(this.analysisCache.values());
    if (analyses.length === 0) {
      return undefined;
    }

    const lastAnalysis = analyses
      .filter((a) => a.status === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    return lastAnalysis?.metrics.analysisTime;
  }

  private calculateAverageAnalysisTime(): number | undefined {
    const completedAnalyses = Array.from(this.analysisCache.values()).filter(
      (a) => a.status === 'completed'
    );

    if (completedAnalyses.length === 0) {
      return undefined;
    }

    const totalTime = completedAnalyses.reduce(
      (sum, a) => sum + a.metrics.analysisTime,
      0
    );
    return Math.round(totalTime / completedAnalyses.length);
  }
}

// Export singleton instance
export const agentOrchestrator = new AgentOrchestrator();
