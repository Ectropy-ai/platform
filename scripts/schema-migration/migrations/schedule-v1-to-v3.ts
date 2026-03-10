/**
 * Schedule Schema Migration: V1 -> V3
 *
 * Transforms schedule/task data from V1 format to V3 format with:
 * - URN identifiers ($id)
 * - Graph metadata for dependency chains
 * - Critical path analysis support
 * - Schema version tracking
 */

import {
  registerMigration,
  generateUrn,
} from '../migrate';

// V1 Schedule Task structure (legacy)
interface ScheduleTaskV1 {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  wbsCode?: string;
  startDate: string;
  endDate: string;
  duration: number;
  durationUnit?: string;
  percentComplete?: number;
  status?: string;
  assignee?: string;
  predecessors?: string[];
  successors?: string[];
  resources?: string[];
  cost?: number;
  actualStart?: string;
  actualEnd?: string;
  createdAt: string;
  updatedAt?: string;
}

// V3 Schedule Task structure (current)
interface ScheduleTaskV3 {
  $schema: string;
  $id: string;
  schemaVersion: string;
  id: string;
  projectUrn: string;
  identity: {
    name: string;
    description: string;
    wbsCode?: string;
    activityId?: string;
  };
  schedule: {
    planned: {
      startDate: string;
      endDate: string;
      duration: number;
      durationUnit: 'hours' | 'days' | 'weeks';
    };
    actual?: {
      startDate?: string;
      endDate?: string;
      duration?: number;
    };
    baseline?: {
      startDate: string;
      endDate: string;
      duration: number;
    };
  };
  progress: {
    percentComplete: number;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ON_HOLD' | 'CANCELLED';
    earnedValue?: number;
  };
  dependencies: {
    predecessors: Array<{
      taskUrn: string;
      type: 'FS' | 'SS' | 'FF' | 'SF';
      lag?: number;
    }>;
    successors: Array<{
      taskUrn: string;
      type: 'FS' | 'SS' | 'FF' | 'SF';
      lag?: number;
    }>;
  };
  resources: {
    assigned: string[];
    cost?: {
      planned: number;
      actual?: number;
      currency: string;
    };
  };
  criticalPath: {
    isCritical: boolean;
    totalFloat?: number;
    freeFloat?: number;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    sourceSystem: string;
  };
  graphMetadata: {
    nodeType: string;
    inEdges: Array<{ type: string; target: string }>;
    outEdges: Array<{ type: string; target: string }>;
  };
}

/**
 * Map V1 status to V3 status enum
 */
function mapStatus(v1Status?: string): ScheduleTaskV3['progress']['status'] {
  const statusMap: Record<string, ScheduleTaskV3['progress']['status']> = {
    'not started': 'NOT_STARTED',
    'not-started': 'NOT_STARTED',
    pending: 'NOT_STARTED',
    'in progress': 'IN_PROGRESS',
    'in-progress': 'IN_PROGRESS',
    active: 'IN_PROGRESS',
    complete: 'COMPLETE',
    completed: 'COMPLETE',
    done: 'COMPLETE',
    'on hold': 'ON_HOLD',
    'on-hold': 'ON_HOLD',
    paused: 'ON_HOLD',
    cancelled: 'CANCELLED',
    canceled: 'CANCELLED',
  };
  return statusMap[v1Status?.toLowerCase() || ''] || 'NOT_STARTED';
}

/**
 * Normalize duration unit
 */
function normalizeDurationUnit(unit?: string): 'hours' | 'days' | 'weeks' {
  const unitMap: Record<string, 'hours' | 'days' | 'weeks'> = {
    h: 'hours',
    hr: 'hours',
    hrs: 'hours',
    hour: 'hours',
    hours: 'hours',
    d: 'days',
    day: 'days',
    days: 'days',
    w: 'weeks',
    wk: 'weeks',
    wks: 'weeks',
    week: 'weeks',
    weeks: 'weeks',
  };
  return unitMap[unit?.toLowerCase() || ''] || 'days';
}

/**
 * Migrate a V1 schedule task to V3 format
 */
function migrateScheduleV1ToV3(v1: ScheduleTaskV1): ScheduleTaskV3 {
  const urn = generateUrn('ectropy', 'task', v1.id);
  const projectUrn = generateUrn('ectropy', 'project', v1.projectId);

  const percentComplete = v1.percentComplete ?? 0;
  const status = v1.status
    ? mapStatus(v1.status)
    : percentComplete === 100
    ? 'COMPLETE'
    : percentComplete > 0
    ? 'IN_PROGRESS'
    : 'NOT_STARTED';

  const v3: ScheduleTaskV3 = {
    $schema: '../../schemas/schedule/schedule-task-v3.schema.json',
    $id: urn,
    schemaVersion: '3.0.0',
    id: v1.id,
    projectUrn,
    identity: {
      name: v1.name,
      description: v1.description || '',
      ...(v1.wbsCode && { wbsCode: v1.wbsCode }),
    },
    schedule: {
      planned: {
        startDate: v1.startDate,
        endDate: v1.endDate,
        duration: v1.duration,
        durationUnit: normalizeDurationUnit(v1.durationUnit),
      },
      ...(v1.actualStart || v1.actualEnd
        ? {
            actual: {
              ...(v1.actualStart && { startDate: v1.actualStart }),
              ...(v1.actualEnd && { endDate: v1.actualEnd }),
            },
          }
        : {}),
    },
    progress: {
      percentComplete,
      status,
    },
    dependencies: {
      predecessors: (v1.predecessors || []).map((predId) => ({
        taskUrn: generateUrn('ectropy', 'task', predId),
        type: 'FS' as const, // Default to Finish-to-Start
      })),
      successors: (v1.successors || []).map((succId) => ({
        taskUrn: generateUrn('ectropy', 'task', succId),
        type: 'FS' as const,
      })),
    },
    resources: {
      assigned: v1.resources || (v1.assignee ? [v1.assignee] : []),
      ...(v1.cost && {
        cost: {
          planned: v1.cost,
          currency: 'USD',
        },
      }),
    },
    criticalPath: {
      isCritical: false, // Will be calculated by scheduling engine
    },
    metadata: {
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt || v1.createdAt,
      sourceSystem: 'migration-v1-to-v3',
    },
    graphMetadata: {
      nodeType: 'ScheduleTask',
      inEdges: [
        { type: 'BELONGS_TO', target: projectUrn },
        ...(v1.predecessors || []).map((predId) => ({
          type: 'DEPENDS_ON',
          target: generateUrn('ectropy', 'task', predId),
        })),
      ],
      outEdges: (v1.successors || []).map((succId) => ({
        type: 'PRECEDES',
        target: generateUrn('ectropy', 'task', succId),
      })),
    },
  };

  return v3;
}

// Register the migration
registerMigration({
  name: 'schedule-v1-to-v3',
  schema: 'schedule',
  sourceVersion: 'v1',
  targetVersion: 'v3',
  migrate: migrateScheduleV1ToV3,
  validate: (data) => {
    const v3 = data as ScheduleTaskV3;
    return !!(
      v3.$id &&
      v3.$id.startsWith('urn:luhtech:') &&
      v3.schemaVersion === '3.0.0' &&
      v3.graphMetadata?.nodeType === 'ScheduleTask' &&
      v3.schedule?.planned?.startDate &&
      v3.progress?.status
    );
  },
});

console.log('Loaded migration: schedule-v1-to-v3');
