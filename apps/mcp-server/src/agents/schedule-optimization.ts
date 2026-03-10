/**
 * Schedule Optimization Agent
 * Handles critical path analysis, resource allocation, and project scheduling for construction
 */

import { BaseAgent } from './base-agent.js';

export interface ScheduleTask {
  id: string;
  name: string;
  duration: number; // in days
  dependencies: string[];
  resourceRequirements: Array<{
    type: 'labor' | 'equipment' | 'material';
    name: string;
    quantity: number;
    availability?: Date[];
  }>;
  earlyStart?: Date;
  earlyFinish?: Date;
  lateStart?: Date;
  lateFinish?: Date;
  float?: number;
  isCritical?: boolean;
}

export interface ScheduleOptimizationInput {
  projectId?: string;
  tasks: ScheduleTask[];
  projectStartDate: Date;
  constraints?: Array<{
    type: 'resource' | 'weather' | 'permit' | 'custom';
    description: string;
    startDate?: Date;
    endDate?: Date;
    affectedTasks?: string[];
  }>;
  availableResources?: Array<{
    type: string;
    name: string;
    quantity: number;
    availability: Date[];
  }>;
  optimizationGoals?: Array<
    | 'minimize_duration'
    | 'minimize_cost'
    | 'balance_resources'
    | 'minimize_risk'
  >;
}

export interface ScheduleOptimizationResult {
  optimizedSchedule: ScheduleTask[];
  criticalPath: string[];
  projectDuration: number; // in days
  resourceUtilization: Array<{
    resource: string;
    utilizationRate: number; // 0-1
    conflicts: Array<{
      date: Date;
      overallocation: number;
      affectedTasks: string[];
    }>;
  }>;
  milestones: Array<{
    name: string;
    date: Date;
    dependencies: string[];
  }>;
  risks: Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
  recommendations: string[];
  feasibilityScore: number; // 0-1
}

export class ScheduleOptimizationAgent extends BaseAgent {
  constructor() {
    super();
    this.capabilities = [
      'critical_path_analysis',
      'resource_optimization',
      'schedule_leveling',
      'risk_assessment',
      'milestone_tracking',
      'constraint_management',
    ];
  }

  getName(): string {
    return 'schedule-optimization';
  }

  getDescription(): string {
    return 'Performs critical path analysis, resource allocation, and project schedule optimization';
  }

  getCapabilities(): string[] {
    return this.capabilities;
  }

  async process(
    input: ScheduleOptimizationInput
  ): Promise<ScheduleOptimizationResult> {
    return this.processWithMetrics(async () => {
      // Process schedule optimization
      console.log(
        `📅 Processing schedule optimization for ${input.projectId || 'unknown project'}`
      );

      // Perform forward pass to calculate early start/finish dates
      const tasksWithEarlyDates = this.calculateEarlyDates(
        input.tasks,
        input.projectStartDate
      );

      // Perform backward pass to calculate late start/finish dates
      const tasksWithLateDates = this.calculateLateDates(tasksWithEarlyDates);

      // Calculate float and identify critical path
      const optimizedTasks = this.calculateFloat(tasksWithLateDates);
      const criticalPath = this.identifyCriticalPath(optimizedTasks);

      // Calculate project duration
      const projectDuration = this.calculateProjectDuration(optimizedTasks);

      // Analyze resource utilization
      const resourceUtilization = this.analyzeResourceUtilization(
        optimizedTasks,
        input.availableResources
      );

      // Optimize resource allocation
      const resourceOptimizedTasks = await this.optimizeResourceAllocation(
        optimizedTasks,
        resourceUtilization
      );

      // Generate milestones
      const milestones = this.generateMilestones(
        resourceOptimizedTasks,
        criticalPath
      );

      // Assess risks
      const risks = this.assessScheduleRisks(
        resourceOptimizedTasks,
        input.constraints
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        resourceOptimizedTasks,
        risks,
        resourceUtilization
      );

      // Calculate feasibility score
      const feasibilityScore = this.calculateFeasibilityScore(
        resourceOptimizedTasks,
        resourceUtilization,
        risks
      );

      return {
        optimizedSchedule: resourceOptimizedTasks,
        criticalPath,
        projectDuration,
        resourceUtilization,
        milestones,
        risks,
        recommendations,
        feasibilityScore,
      };
    });
  }

  private calculateEarlyDates(
    tasks: ScheduleTask[],
    projectStartDate: Date
  ): ScheduleTask[] {
    const taskMap = new Map(tasks.map((task) => [task.id, { ...task }]));
    const processedTasks = new Set<string>();

    // Topological sort to process tasks in dependency order
    const processTasks = (taskId: string): void => {
      if (processedTasks.has(taskId)) {
        return;
      }

      const task = taskMap.get(taskId);
      if (!task) {
        return;
      }

      // Process dependencies first
      task.dependencies.forEach((depId) => processTasks(depId));

      // Calculate early start date
      let earlyStart = new Date(projectStartDate);

      task.dependencies.forEach((depId) => {
        const depTask = taskMap.get(depId);
        if (depTask?.earlyFinish) {
          const depFinishDate = new Date(depTask.earlyFinish);
          depFinishDate.setDate(depFinishDate.getDate() + 1); // Next working day
          if (depFinishDate > earlyStart) {
            earlyStart = depFinishDate;
          }
        }
      });

      task.earlyStart = earlyStart;
      task.earlyFinish = new Date(earlyStart);
      task.earlyFinish.setDate(task.earlyFinish.getDate() + task.duration - 1);

      processedTasks.add(taskId);
    };

    tasks.forEach((task) => processTasks(task.id));

    return Array.from(taskMap.values());
  }

  private calculateLateDates(tasks: ScheduleTask[]): ScheduleTask[] {
    const taskMap = new Map(tasks.map((task) => [task.id, { ...task }]));

    // Find project end date
    const projectEndDate = tasks.reduce((latest, task) => {
      if (task.earlyFinish && task.earlyFinish > latest) {
        return task.earlyFinish;
      }
      return latest;
    }, new Date(0));

    // Calculate late dates working backwards
    const processedTasks = new Set<string>();

    const processTasks = (taskId: string): void => {
      if (processedTasks.has(taskId)) {
        return;
      }

      const task = taskMap.get(taskId);
      if (!task) {
        return;
      }

      // Find all tasks that depend on this task
      const dependentTasks = tasks.filter((t) =>
        t.dependencies.includes(taskId)
      );

      // Process dependent tasks first
      dependentTasks.forEach((depTask) => processTasks(depTask.id));

      // Calculate late finish date
      let lateFinish = new Date(projectEndDate);

      dependentTasks.forEach((depTask) => {
        const depTaskObj = taskMap.get(depTask.id);
        if (depTaskObj?.lateStart) {
          const depStartDate = new Date(depTaskObj.lateStart);
          depStartDate.setDate(depStartDate.getDate() - 1); // Previous working day
          if (depStartDate < lateFinish) {
            lateFinish = depStartDate;
          }
        }
      });

      // If no dependents, use project end date
      if (dependentTasks.length === 0) {
        lateFinish = task.earlyFinish || projectEndDate;
      }

      task.lateFinish = lateFinish;
      task.lateStart = new Date(lateFinish);
      task.lateStart.setDate(task.lateStart.getDate() - task.duration + 1);

      processedTasks.add(taskId);
    };

    // Process tasks in reverse dependency order
    const tasksWithoutDependents = tasks.filter(
      (task) => !tasks.some((t) => t.dependencies.includes(task.id))
    );

    tasksWithoutDependents.forEach((task) => processTasks(task.id));
    tasks.forEach((task) => processTasks(task.id));

    return Array.from(taskMap.values());
  }

  private calculateFloat(tasks: ScheduleTask[]): ScheduleTask[] {
    return tasks.map((task) => {
      if (task.earlyStart && task.lateStart) {
        const earlyStartTime = task.earlyStart.getTime();
        const lateStartTime = task.lateStart.getTime();
        const floatDays = Math.floor(
          (lateStartTime - earlyStartTime) / (1000 * 60 * 60 * 24)
        );

        return {
          ...task,
          float: floatDays,
          isCritical: floatDays === 0,
        };
      }
      return task;
    });
  }

  private identifyCriticalPath(tasks: ScheduleTask[]): string[] {
    const criticalTasks = tasks.filter((task) => task.isCritical);

    // Sort critical tasks by early start date to get the critical path sequence
    return criticalTasks
      .sort(
        (a, b) =>
          (a.earlyStart?.getTime() || 0) - (b.earlyStart?.getTime() || 0)
      )
      .map((task) => task.id);
  }

  private calculateProjectDuration(tasks: ScheduleTask[]): number {
    const projectStart = tasks.reduce((earliest, task) => {
      if (task.earlyStart && task.earlyStart < earliest) {
        return task.earlyStart;
      }
      return earliest;
    }, new Date());

    const projectEnd = tasks.reduce((latest, task) => {
      if (task.earlyFinish && task.earlyFinish > latest) {
        return task.earlyFinish;
      }
      return latest;
    }, new Date(0));

    return (
      Math.ceil(
        (projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
    );
  }

  private analyzeResourceUtilization(
    tasks: ScheduleTask[],
    availableResources?: any[]
  ): any[] {
    const resourceUtilization: any[] = [];

    // Group resource requirements by type and name
    const resourceMap = new Map<string, any[]>();

    tasks.forEach((task) => {
      task.resourceRequirements.forEach((req) => {
        const key = `${req.type}-${req.name}`;
        if (!resourceMap.has(key)) {
          resourceMap.set(key, []);
        }
        resourceMap.get(key)!.push({
          taskId: task.id,
          quantity: req.quantity,
          startDate: task.earlyStart,
          endDate: task.earlyFinish,
        });
      });
    });

    // Analyze utilization for each resource
    resourceMap.forEach((allocations, resourceKey) => {
      const conflicts: any[] = [];
      const totalCapacity =
        availableResources?.find((r) => `${r.type}-${r.name}` === resourceKey)
          ?.quantity || 100;

      // Check for overallocation on each day
      const dateMap = new Map<string, number>();

      allocations.forEach((allocation) => {
        if (allocation.startDate && allocation.endDate) {
          const currentDate = new Date(allocation.startDate);
          while (currentDate <= allocation.endDate) {
            const dateKey = currentDate.toISOString().split('T')[0];
            const currentUsage = dateMap.get(dateKey) || 0;
            dateMap.set(dateKey, currentUsage + allocation.quantity);
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
      });

      // Find conflicts
      dateMap.forEach((usage, dateKey) => {
        if (usage > totalCapacity) {
          conflicts.push({
            date: new Date(dateKey),
            overallocation: usage - totalCapacity,
            affectedTasks: allocations
              .filter((a) => {
                const allocDate = new Date(dateKey);
                return a.startDate <= allocDate && allocDate <= a.endDate;
              })
              .map((a) => a.taskId),
          });
        }
      });

      const avgUtilization =
        Array.from(dateMap.values()).reduce(
          (sum, usage) => sum + Math.min(usage / totalCapacity, 1),
          0
        ) / dateMap.size;

      resourceUtilization.push({
        resource: resourceKey,
        utilizationRate: avgUtilization || 0,
        conflicts,
      });
    });

    return resourceUtilization;
  }

  private async optimizeResourceAllocation(
    tasks: ScheduleTask[],
    resourceUtilization: any[]
  ): Promise<ScheduleTask[]> {
    // Simple resource leveling algorithm
    const optimizedTasks = [...tasks];

    // For tasks with resource conflicts, try to reschedule within their float
    resourceUtilization.forEach((resource) => {
      resource.conflicts.forEach((conflict: any) => {
        conflict.affectedTasks.forEach((taskId: string) => {
          const task = optimizedTasks.find((t) => t.id === taskId);
          if (task && task.float && task.float > 0) {
            // Try to delay the task by 1 day if it has float
            if (task.earlyStart) {
              task.earlyStart = new Date(task.earlyStart);
              task.earlyStart.setDate(task.earlyStart.getDate() + 1);
            }
            if (task.earlyFinish) {
              task.earlyFinish = new Date(task.earlyFinish);
              task.earlyFinish.setDate(task.earlyFinish.getDate() + 1);
            }
            task.float = Math.max(0, (task.float || 0) - 1);
          }
        });
      });
    });

    return optimizedTasks;
  }

  private generateMilestones(
    tasks: ScheduleTask[],
    criticalPath: string[]
  ): any[] {
    const milestones: any[] = [];

    // Create milestones for critical path phases
    const phases = [
      { name: 'Foundation Complete', percentage: 0.2 },
      { name: 'Structural Complete', percentage: 0.4 },
      { name: 'Mechanical/Electrical Complete', percentage: 0.7 },
      { name: 'Finish Work Complete', percentage: 0.9 },
      { name: 'Project Complete', percentage: 1.0 },
    ];

    const criticalTasks = tasks.filter((task) =>
      criticalPath.includes(task.id)
    );
    const totalCriticalDuration = criticalTasks.reduce(
      (sum, task) => sum + task.duration,
      0
    );

    phases.forEach((phase) => {
      const targetDuration = totalCriticalDuration * phase.percentage;
      let accumulatedDuration = 0;

      for (const task of criticalTasks) {
        accumulatedDuration += task.duration;
        if (accumulatedDuration >= targetDuration) {
          milestones.push({
            name: phase.name,
            date: task.earlyFinish,
            dependencies: criticalPath.slice(
              0,
              criticalPath.indexOf(task.id) + 1
            ),
          });
          break;
        }
      }
    });

    return milestones;
  }

  private assessScheduleRisks(
    tasks: ScheduleTask[],
    constraints?: any[]
  ): any[] {
    const risks: any[] = [];

    // Assess critical path risks
    const criticalTasks = tasks.filter((task) => task.isCritical);
    if (criticalTasks.length > tasks.length * 0.3) {
      risks.push({
        type: 'schedule',
        description:
          'High percentage of critical tasks increases schedule risk',
        impact: 'high' as const,
        mitigation: 'Consider adding buffer time or parallel task execution',
      });
    }

    // Assess resource risks
    const resourceIntensiveTasks = tasks.filter(
      (task) => task.resourceRequirements.length > 3
    );
    if (resourceIntensiveTasks.length > 0) {
      risks.push({
        type: 'resource',
        description: 'Resource-intensive tasks may face allocation conflicts',
        impact: 'medium' as const,
        mitigation: 'Secure resource commitments early and have backup options',
      });
    }

    // Assess constraint risks
    if (constraints) {
      constraints.forEach((constraint) => {
        if (constraint.type === 'weather') {
          risks.push({
            type: 'weather',
            description: `Weather constraints may delay: ${constraint.description}`,
            impact: 'medium' as const,
            mitigation: 'Plan weather-dependent tasks during favorable seasons',
          });
        }
      });
    }

    return risks;
  }

  private generateRecommendations(
    tasks: ScheduleTask[],
    risks: any[],
    resourceUtilization: any[]
  ): string[] {
    const recommendations: string[] = [];

    // Critical path recommendations
    const criticalTasks = tasks.filter((task) => task.isCritical);
    if (criticalTasks.length > 0) {
      recommendations.push(
        `Monitor ${criticalTasks.length} critical path tasks closely to prevent delays`
      );
    }

    // Resource recommendations
    const highUtilizationResources = resourceUtilization.filter(
      (r) => r.utilizationRate > 0.9
    );
    if (highUtilizationResources.length > 0) {
      recommendations.push(
        'Consider additional resources for high-utilization periods'
      );
    }

    // Risk-based recommendations
    const highRisks = risks.filter((risk) => risk.impact === 'high');
    if (highRisks.length > 0) {
      recommendations.push('Develop contingency plans for high-impact risks');
    }

    // Float optimization
    const tasksWithFloat = tasks.filter((task) => (task.float || 0) > 5);
    if (tasksWithFloat.length > 0) {
      recommendations.push(
        'Leverage task float to optimize resource allocation'
      );
    }

    return recommendations;
  }

  private calculateFeasibilityScore(
    tasks: ScheduleTask[],
    resourceUtilization: any[],
    risks: any[]
  ): number {
    let score = 1.0;

    // Reduce score for resource conflicts
    const conflictCount = resourceUtilization.reduce(
      (sum, r) => sum + r.conflicts.length,
      0
    );
    score -= conflictCount * 0.1;

    // Reduce score for high-impact risks
    const highRiskCount = risks.filter((risk) => risk.impact === 'high').length;
    score -= highRiskCount * 0.2;

    // Reduce score for tight critical path
    const criticalTaskRatio =
      tasks.filter((task) => task.isCritical).length / tasks.length;
    if (criticalTaskRatio > 0.5) {
      score -= (criticalTaskRatio - 0.5) * 0.3;
    }

    return Math.max(score, 0);
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log(
      '📅 Schedule Optimization Agent ready for critical path analysis and resource optimization'
    );
  }
}
