/**
 * Schedule Optimizer Tool
 * Optimizes construction project schedules and identifies critical paths
 */

export const scheduleOptimizerTool = {
  name: 'schedule-optimizer',
  description: 'Optimizes construction schedules and manages project timelines',
  inputSchema: {
    type: 'object',
    properties: {
      projectPhases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            duration: { type: 'number', description: 'Duration in days' },
            dependencies: { type: 'array', items: { type: 'string' } },
            resources: { type: 'array', items: { type: 'string' } }
          },
          required: ['name', 'duration']
        }
      },
      constraints: {
        type: 'object',
        properties: {
          maxDuration: { type: 'number' },
          availableResources: { type: 'array', items: { type: 'string' } },
          weatherWindows: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    required: ['projectPhases']
  },
  
  async execute(input) {
    const { projectPhases, constraints = {} } = input;
    
    // Simple critical path calculation
    const phases = projectPhases.map((phase, index) => ({
      ...phase,
      id: index,
      earliestStart: 0,
      latestStart: 0,
      slack: 0
    }));
    
    // Calculate earliest start times
    phases.forEach(phase => {
      if (phase.dependencies && phase.dependencies.length > 0) {
        const dependencyPhases = phases.filter(p => 
          phase.dependencies.includes(p.name)
        );
        phase.earliestStart = Math.max(
          ...dependencyPhases.map(dep => dep.earliestStart + dep.duration)
        );
      }
    });
    
    // Calculate project duration
    const projectDuration = Math.max(
      ...phases.map(phase => phase.earliestStart + phase.duration)
    );
    
    // Calculate latest start times (backward pass)
    phases.forEach(phase => {
      const dependentPhases = phases.filter(p => 
        p.dependencies && p.dependencies.includes(phase.name)
      );
      
      if (dependentPhases.length === 0) {
        phase.latestStart = projectDuration - phase.duration;
      } else {
        phase.latestStart = Math.min(
          ...dependentPhases.map(dep => dep.latestStart)
        ) - phase.duration;
      }
      
      phase.slack = phase.latestStart - phase.earliestStart;
    });
    
    // Identify critical path
    const criticalPath = phases
      .filter(phase => phase.slack === 0)
      .map(phase => phase.name);
    
    // Resource optimization suggestions
    const resourceConflicts = [];
    const resourceUsage = {};
    
    phases.forEach(phase => {
      if (phase.resources) {
        phase.resources.forEach(resource => {
          if (!resourceUsage[resource]) {
            resourceUsage[resource] = [];
          }
          resourceUsage[resource].push({
            phase: phase.name,
            start: phase.earliestStart,
            end: phase.earliestStart + phase.duration
          });
        });
      }
    });
    
    // Check for resource conflicts
    Object.entries(resourceUsage).forEach(([resource, usage]) => {
      for (let i = 0; i < usage.length - 1; i++) {
        for (let j = i + 1; j < usage.length; j++) {
          const phase1 = usage[i];
          const phase2 = usage[j];
          
          if (phase1.start < phase2.end && phase2.start < phase1.end) {
            resourceConflicts.push({
              resource,
              conflictingPhases: [phase1.phase, phase2.phase],
              suggestion: 'Consider resource reallocation or phase adjustment'
            });
          }
        }
      }
    });
    
    return {
      success: true,
      optimization: {
        projectDuration,
        criticalPath,
        phases: phases.map(phase => ({
          name: phase.name,
          duration: phase.duration,
          earliestStart: phase.earliestStart,
          latestStart: phase.latestStart,
          slack: phase.slack,
          isCritical: phase.slack === 0
        })),
        resourceConflicts,
        recommendations: [
          ...criticalPath.length > 0 ? [`Focus on critical path: ${criticalPath.join(' → ')}`] : [],
          ...resourceConflicts.length > 0 ? ['Resolve resource conflicts to optimize schedule'] : [],
          constraints.maxDuration && projectDuration > constraints.maxDuration 
            ? [`Project duration (${projectDuration} days) exceeds constraint (${constraints.maxDuration} days)`] 
            : []
        ]
      },
      metadata: {
        phasesCount: phases.length,
        criticalPathLength: criticalPath.length,
        resourceConflicts: resourceConflicts.length,
        timestamp: new Date().toISOString()
      }
    };
  }
};