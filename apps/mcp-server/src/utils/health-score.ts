/**
 * Health score calculation utility for MCP Server
 * Calculates a weighted health score (0-100) from health check results
 */

interface HealthCheckStatus {
  status: string;
  latency?: number;
}

interface HealthChecks {
  database?: HealthCheckStatus;
  redis?: HealthCheckStatus;
  memory?: string;
  disk?: string;
}

interface WeightedCheck {
  name: string;
  weight: number;
  check: () => boolean;
  partialCredit?: () => number;
}

/**
 * Calculate weighted health score (0-100) from health checks
 * 
 * Weights:
 * - Database: 35 points (critical)
 * - Redis: 25 points (important)
 * - Memory: 20 points (important)
 * - Disk: 20 points (important)
 * Total: 100 points
 * 
 * @param checks - Health check results from various dependencies
 * @returns Integer score from 0-100
 */
export function calculateHealthScore(checks: HealthChecks): number {
  const weightedChecks: WeightedCheck[] = [
    {
      name: 'database',
      weight: 35,
      check: () => checks.database?.status === 'healthy',
      partialCredit: () => {
        if (checks.database?.status === 'not_configured') {return 0;}
        if (checks.database?.status === 'degraded') {return 0.5;}
        if (checks.database?.status === 'using_fallback') {return 0.3;}
        return 0;
      },
    },
    {
      name: 'redis',
      weight: 25,
      check: () => checks.redis?.status === 'healthy',
      partialCredit: () => {
        if (checks.redis?.status === 'using_fallback') {return 0.3;}
        if (checks.redis?.status === 'degraded') {return 0.5;}
        return 0;
      },
    },
    {
      name: 'memory',
      weight: 20,
      check: () => checks.memory === 'healthy',
      partialCredit: () => {
        if (checks.memory === 'warning') {return 0.5;}
        if (checks.memory === 'degraded') {return 0.5;}
        return 0;
      },
    },
    {
      name: 'disk',
      weight: 20,
      check: () => checks.disk === 'healthy',
      partialCredit: () => {
        if (checks.disk === 'degraded') {return 0.5;}
        return 0;
      },
    },
  ];

  let totalScore = 0;

  for (const item of weightedChecks) {
    if (item.check()) {
      // Full credit for healthy
      totalScore += item.weight;
    } else if (item.partialCredit) {
      // Partial credit for degraded/fallback services
      totalScore += item.weight * item.partialCredit();
    }
  }

  return Math.round(totalScore);
}
