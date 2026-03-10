/**
 * USF Historical Analytics Service - Phase 7: Historical Analytics
 *
 * Enterprise analytics service for Universal Service Factors that provides
 * historical trend analysis, performance tracking, predictive analytics,
 * and benchmarking reports for data-driven decision making.
 *
 * Features:
 * - Time series analysis of USF metrics
 * - Provider performance tracking over time
 * - Trend detection and classification
 * - Predictive analytics for resource planning
 * - Benchmarking and comparison reports
 * - Period-based aggregations and roll-ups
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @version 1.0.0
 */

import type {
  USFProfile,
  USFWorkPacket,
  USFFactors,
  USFSnapshot,
  USFPricingTier,
  USFProviderType,
  PMURN,
} from '../types/pm.types.js';
import {
  calculateComposite,
  DEFAULT_USF_WEIGHTS,
} from './usf.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Time period granularity for analytics
 */
export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Trend direction classification
 */
export type TrendDirection = 'improving' | 'stable' | 'declining';

/**
 * Performance tier classification
 */
export type PerformanceTier = 'exceptional' | 'above_average' | 'average' | 'below_average' | 'poor';

/**
 * Forecast confidence level
 */
export type ForecastConfidence = 'high' | 'medium' | 'low';

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  /** Timestamp */
  timestamp: string;
  /** Period label (e.g., "2026-W03", "2026-01") */
  periodLabel: string;
  /** USF factors at this point */
  factors: USFFactors;
  /** Composite score */
  composite: number;
  /** Sample size for this period */
  sampleSize: number;
  /** Work packets completed in period */
  workPacketCount: number;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  /** Metric being analyzed */
  metric: 'quality' | 'cost' | 'speed' | 'composite';
  /** Overall trend direction */
  direction: TrendDirection;
  /** Trend strength (0-1) */
  strength: number;
  /** Slope of trend line (change per period) */
  slope: number;
  /** R-squared value (fit quality) */
  rSquared: number;
  /** Periods analyzed */
  periodCount: number;
  /** Starting value */
  startValue: number;
  /** Ending value */
  endValue: number;
  /** Absolute change */
  absoluteChange: number;
  /** Percentage change */
  percentChange: number;
}

/**
 * Performance snapshot for a provider
 */
export interface PerformanceSnapshot {
  /** Snapshot ID */
  snapshotId: string;
  /** Provider URN */
  providerUrn: PMURN;
  /** Snapshot timestamp */
  timestamp: string;
  /** Period this snapshot covers */
  period: {
    startDate: string;
    endDate: string;
    granularity: AnalyticsPeriod;
  };
  /** USF factors */
  factors: USFFactors;
  /** Composite score */
  composite: number;
  /** Performance tier */
  performanceTier: PerformanceTier;
  /** Work packet statistics */
  workStats: {
    completed: number;
    onTime: number;
    onBudget: number;
    qualityPass: number;
  };
  /** Comparison to previous period */
  periodOverPeriod?: {
    qualityChange: number;
    costChange: number;
    speedChange: number;
    compositeChange: number;
  };
  /** Comparison to market benchmark */
  vsBenchmark?: {
    qualityDelta: number;
    costDelta: number;
    speedDelta: number;
    compositeDelta: number;
  };
}

/**
 * Forecast result
 */
export interface Forecast {
  /** Metric being forecasted */
  metric: 'quality' | 'cost' | 'speed' | 'composite';
  /** Forecast horizon (number of periods) */
  horizon: number;
  /** Period granularity */
  granularity: AnalyticsPeriod;
  /** Forecasted values */
  predictions: Array<{
    periodLabel: string;
    predictedValue: number;
    lowerBound: number;
    upperBound: number;
  }>;
  /** Confidence level */
  confidence: ForecastConfidence;
  /** Model used */
  model: 'linear' | 'exponential_smoothing' | 'moving_average';
  /** Historical accuracy (if available) */
  historicalMAPE?: number;
}

/**
 * Benchmark comparison result
 */
export interface BenchmarkComparison {
  /** Entity being compared */
  entityUrn: PMURN;
  /** Entity type */
  entityType: 'provider' | 'project' | 'trade';
  /** Comparison period */
  period: {
    startDate: string;
    endDate: string;
  };
  /** Entity's metrics */
  metrics: USFFactors & { composite: number };
  /** Benchmark metrics */
  benchmark: USFFactors & { composite: number };
  /** Deltas from benchmark */
  deltas: {
    quality: number;
    cost: number;
    speed: number;
    composite: number;
  };
  /** Percentile rankings */
  percentiles: {
    quality: number;
    cost: number;
    speed: number;
    composite: number;
  };
  /** Performance classification */
  classification: PerformanceTier;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Aggregated analytics report
 */
export interface AnalyticsReport {
  /** Report ID */
  reportId: string;
  /** Report type */
  reportType: 'provider' | 'project' | 'market' | 'comparison';
  /** Generated timestamp */
  generatedAt: string;
  /** Report period */
  period: {
    startDate: string;
    endDate: string;
    granularity: AnalyticsPeriod;
  };
  /** Summary metrics */
  summary: {
    averageQuality: number;
    averageCost: number;
    averageSpeed: number;
    averageComposite: number;
    totalWorkPackets: number;
    totalProviders: number;
  };
  /** Time series data */
  timeSeries: TimeSeriesPoint[];
  /** Trend analyses */
  trends: TrendAnalysis[];
  /** Top performers */
  topPerformers?: Array<{
    providerUrn: PMURN;
    composite: number;
    trend: TrendDirection;
  }>;
  /** Areas needing attention */
  attentionAreas?: string[];
  /** Forecasts */
  forecasts?: Forecast[];
}

/**
 * Provider ranking entry
 */
export interface ProviderRanking {
  /** Rank position */
  rank: number;
  /** Provider URN */
  providerUrn: PMURN;
  /** Provider name */
  providerName?: string;
  /** Provider type */
  providerType: USFProviderType;
  /** Composite score */
  composite: number;
  /** Individual factor scores */
  factors: USFFactors;
  /** Trend direction */
  trend: TrendDirection;
  /** Percentile in market */
  percentile: number;
  /** Sample size */
  sampleSize: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Trend classification thresholds
 */
export const TREND_THRESHOLDS = {
  improving: 0.02, // >= 2% improvement
  declining: -0.02, // <= -2% decline
  // Between = stable
};

/**
 * Performance tier thresholds (composite score)
 */
export const PERFORMANCE_TIER_THRESHOLDS = {
  exceptional: 0.90,
  above_average: 0.80,
  average: 0.70,
  below_average: 0.60,
  // Below 0.60 = poor
};

/**
 * Forecast confidence thresholds (based on R-squared)
 */
export const FORECAST_CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
  // Below 0.5 = low
};

/**
 * Moving average window sizes by period
 */
export const MOVING_AVERAGE_WINDOWS: Record<AnalyticsPeriod, number> = {
  daily: 7,
  weekly: 4,
  monthly: 3,
  quarterly: 4,
  yearly: 3,
};

// ============================================================================
// In-Memory Storage
// ============================================================================

const snapshotStore = new Map<string, PerformanceSnapshot>();
const timeSeriesStore = new Map<PMURN, TimeSeriesPoint[]>();
const reportStore = new Map<string, AnalyticsReport>();

// ============================================================================
// ID Generators
// ============================================================================

let snapshotIdCounter = 0;
let reportIdCounter = 0;

export function generateSnapshotId(): string {
  snapshotIdCounter++;
  const year = new Date().getFullYear();
  return `SNAP-${year}-${String(snapshotIdCounter).padStart(6, '0')}`;
}

export function generateReportId(): string {
  reportIdCounter++;
  const year = new Date().getFullYear();
  return `RPT-${year}-${String(reportIdCounter).padStart(5, '0')}`;
}

export function setAnalyticsIdCounter(
  type: 'snapshot' | 'report',
  value: number
): void {
  if (type === 'snapshot') {
    snapshotIdCounter = value;
  } else {
    reportIdCounter = value;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get period label for a date
 */
export function getPeriodLabel(date: Date, granularity: AnalyticsPeriod): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  switch (granularity) {
    case 'daily':
      return date.toISOString().split('T')[0];
    case 'weekly': {
      const weekNum = getWeekNumber(date);
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    }
    case 'monthly':
      return `${year}-${String(month).padStart(2, '0')}`;
    case 'quarterly': {
      const quarter = Math.ceil(month / 3);
      return `${year}-Q${quarter}`;
    }
    case 'yearly':
      return String(year);
  }
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Classify performance tier based on composite score
 */
export function classifyPerformanceTier(composite: number): PerformanceTier {
  if (composite >= PERFORMANCE_TIER_THRESHOLDS.exceptional) {return 'exceptional';}
  if (composite >= PERFORMANCE_TIER_THRESHOLDS.above_average) {return 'above_average';}
  if (composite >= PERFORMANCE_TIER_THRESHOLDS.average) {return 'average';}
  if (composite >= PERFORMANCE_TIER_THRESHOLDS.below_average) {return 'below_average';}
  return 'poor';
}

/**
 * Classify trend direction based on change
 */
export function classifyTrendDirection(percentChange: number): TrendDirection {
  if (percentChange >= TREND_THRESHOLDS.improving) {return 'improving';}
  if (percentChange <= TREND_THRESHOLDS.declining) {return 'declining';}
  return 'stable';
}

/**
 * Calculate simple linear regression
 */
function linearRegression(
  data: Array<{ x: number; y: number }>
): { slope: number; intercept: number; rSquared: number } {
  const n = data.length;
  if (n < 2) {
    return { slope: 0, intercept: data[0]?.y || 0, rSquared: 0 };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (const point of data) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
    sumY2 += point.y * point.y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  let ssTotal = 0, ssResidual = 0;

  for (const point of data) {
    const predicted = slope * point.x + intercept;
    ssTotal += (point.y - yMean) ** 2;
    ssResidual += (point.y - predicted) ** 2;
  }

  const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);

  return { slope, intercept, rSquared: Math.max(0, rSquared) };
}

/**
 * Calculate exponential moving average
 */
function exponentialMovingAverage(data: number[], alpha: number = 0.3): number[] {
  if (data.length === 0) {return [];}

  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(alpha * data[i] + (1 - alpha) * ema[i - 1]);
  }

  return ema;
}

// ============================================================================
// Time Series Functions
// ============================================================================

/**
 * Record a time series data point for a provider
 */
export function recordTimeSeriesPoint(
  providerUrn: PMURN,
  point: Omit<TimeSeriesPoint, 'periodLabel'>,
  granularity: AnalyticsPeriod = 'weekly'
): TimeSeriesPoint {
  const periodLabel = getPeriodLabel(new Date(point.timestamp), granularity);

  const fullPoint: TimeSeriesPoint = {
    ...point,
    periodLabel,
  };

  const existing = timeSeriesStore.get(providerUrn) || [];
  existing.push(fullPoint);

  // Keep sorted by timestamp
  existing.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  timeSeriesStore.set(providerUrn, existing);
  return fullPoint;
}

/**
 * Get time series for a provider
 */
export function getTimeSeries(
  providerUrn: PMURN,
  startDate?: string,
  endDate?: string
): TimeSeriesPoint[] {
  const series = timeSeriesStore.get(providerUrn) || [];

  if (!startDate && !endDate) {return series;}

  return series.filter((point) => {
    const ts = new Date(point.timestamp).getTime();
    const start = startDate ? new Date(startDate).getTime() : 0;
    const end = endDate ? new Date(endDate).getTime() : Infinity;
    return ts >= start && ts <= end;
  });
}

/**
 * Aggregate time series by period
 */
export function aggregateTimeSeries(
  points: TimeSeriesPoint[],
  granularity: AnalyticsPeriod
): TimeSeriesPoint[] {
  const buckets = new Map<string, TimeSeriesPoint[]>();

  for (const point of points) {
    const label = getPeriodLabel(new Date(point.timestamp), granularity);
    const bucket = buckets.get(label) || [];
    bucket.push(point);
    buckets.set(label, bucket);
  }

  const aggregated: TimeSeriesPoint[] = [];

  for (const [periodLabel, bucketPoints] of buckets) {
    const avgQuality = bucketPoints.reduce((sum, p) => sum + p.factors.quality, 0) / bucketPoints.length;
    const avgCost = bucketPoints.reduce((sum, p) => sum + p.factors.cost, 0) / bucketPoints.length;
    const avgSpeed = bucketPoints.reduce((sum, p) => sum + p.factors.speed, 0) / bucketPoints.length;
    const totalSamples = bucketPoints.reduce((sum, p) => sum + p.sampleSize, 0);
    const totalWorkPackets = bucketPoints.reduce((sum, p) => sum + p.workPacketCount, 0);

    aggregated.push({
      timestamp: bucketPoints[0].timestamp,
      periodLabel,
      factors: { quality: avgQuality, cost: avgCost, speed: avgSpeed },
      composite: calculateComposite({ quality: avgQuality, cost: avgCost, speed: avgSpeed }, DEFAULT_USF_WEIGHTS),
      sampleSize: totalSamples,
      workPacketCount: totalWorkPackets,
    });
  }

  return aggregated.sort((a, b) => a.periodLabel.localeCompare(b.periodLabel));
}

// ============================================================================
// Trend Analysis Functions
// ============================================================================

/**
 * Analyze trend for a metric over time series
 */
export function analyzeTrend(
  timeSeries: TimeSeriesPoint[],
  metric: 'quality' | 'cost' | 'speed' | 'composite'
): TrendAnalysis {
  if (timeSeries.length < 2) {
    const value = timeSeries.length === 1
      ? (metric === 'composite' ? timeSeries[0].composite : timeSeries[0].factors[metric])
      : 0;

    return {
      metric,
      direction: 'stable',
      strength: 0,
      slope: 0,
      rSquared: 0,
      periodCount: timeSeries.length,
      startValue: value,
      endValue: value,
      absoluteChange: 0,
      percentChange: 0,
    };
  }

  // Extract values
  const data = timeSeries.map((point, index) => ({
    x: index,
    y: metric === 'composite' ? point.composite : point.factors[metric],
  }));

  const regression = linearRegression(data);
  const startValue = data[0].y;
  const endValue = data[data.length - 1].y;
  const absoluteChange = endValue - startValue;
  const percentChange = startValue !== 0 ? absoluteChange / startValue : 0;

  return {
    metric,
    direction: classifyTrendDirection(percentChange),
    strength: Math.min(Math.abs(percentChange) / 0.1, 1), // Normalize to 0-1
    slope: regression.slope,
    rSquared: regression.rSquared,
    periodCount: timeSeries.length,
    startValue,
    endValue,
    absoluteChange,
    percentChange,
  };
}

/**
 * Analyze all USF factor trends
 */
export function analyzeAllTrends(timeSeries: TimeSeriesPoint[]): TrendAnalysis[] {
  return [
    analyzeTrend(timeSeries, 'quality'),
    analyzeTrend(timeSeries, 'cost'),
    analyzeTrend(timeSeries, 'speed'),
    analyzeTrend(timeSeries, 'composite'),
  ];
}

// ============================================================================
// Performance Snapshot Functions
// ============================================================================

/**
 * Create a performance snapshot for a provider
 */
export function createPerformanceSnapshot(
  profile: USFProfile,
  period: { startDate: string; endDate: string; granularity: AnalyticsPeriod },
  workPackets: USFWorkPacket[],
  benchmark?: USFFactors & { composite: number }
): PerformanceSnapshot {
  const snapshotId = generateSnapshotId();
  const now = new Date().toISOString();

  const composite = calculateComposite(profile.factors, DEFAULT_USF_WEIGHTS);
  const performanceTier = classifyPerformanceTier(composite);

  // Calculate work stats
  const completed = workPackets.filter((wp) => wp.status === 'completed').length;
  const onTime = workPackets.filter((wp) => {
    if (!wp.targets.durationHours || !wp.actuals?.actualDurationHours) {return false;}
    return wp.actuals.actualDurationHours <= wp.targets.durationHours;
  }).length;
  const onBudget = workPackets.filter((wp) => {
    if (!wp.targets.budgetAmount || !wp.actuals?.actualCost) {return false;}
    return wp.actuals.actualCost <= wp.targets.budgetAmount;
  }).length;
  const qualityPass = workPackets.filter((wp) => {
    if (!wp.actuals?.qualityScore) {return false;}
    return wp.actuals.qualityScore >= (wp.targets.qualityTarget || 0.7);
  }).length;

  // Get previous snapshot for period-over-period
  const previousSnapshots = Array.from(snapshotStore.values())
    .filter((s) => s.providerUrn === profile.$id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const previousSnapshot = previousSnapshots[0];

  const snapshot: PerformanceSnapshot = {
    snapshotId,
    providerUrn: profile.$id,
    timestamp: now,
    period,
    factors: profile.factors,
    composite,
    performanceTier,
    workStats: {
      completed,
      onTime,
      onBudget,
      qualityPass,
    },
  };

  // Add period-over-period comparison
  if (previousSnapshot) {
    snapshot.periodOverPeriod = {
      qualityChange: profile.factors.quality - previousSnapshot.factors.quality,
      costChange: profile.factors.cost - previousSnapshot.factors.cost,
      speedChange: profile.factors.speed - previousSnapshot.factors.speed,
      compositeChange: composite - previousSnapshot.composite,
    };
  }

  // Add benchmark comparison
  if (benchmark) {
    snapshot.vsBenchmark = {
      qualityDelta: profile.factors.quality - benchmark.quality,
      costDelta: profile.factors.cost - benchmark.cost,
      speedDelta: profile.factors.speed - benchmark.speed,
      compositeDelta: composite - benchmark.composite,
    };
  }

  snapshotStore.set(snapshotId, snapshot);
  return snapshot;
}

/**
 * Get snapshots for a provider
 */
export function getProviderSnapshots(
  providerUrn: PMURN,
  limit?: number
): PerformanceSnapshot[] {
  const snapshots = Array.from(snapshotStore.values())
    .filter((s) => s.providerUrn === providerUrn)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return limit ? snapshots.slice(0, limit) : snapshots;
}

// ============================================================================
// Forecasting Functions
// ============================================================================

/**
 * Generate forecast for a metric
 */
export function generateForecast(
  timeSeries: TimeSeriesPoint[],
  metric: 'quality' | 'cost' | 'speed' | 'composite',
  horizon: number = 3,
  granularity: AnalyticsPeriod = 'monthly'
): Forecast {
  const values = timeSeries.map((p) =>
    metric === 'composite' ? p.composite : p.factors[metric]
  );

  if (values.length < 3) {
    // Not enough data - return flat forecast
    const lastValue = values[values.length - 1] || 0.7;
    const predictions = Array.from({ length: horizon }, (_, i) => ({
      periodLabel: `Forecast+${i + 1}`,
      predictedValue: lastValue,
      lowerBound: lastValue * 0.9,
      upperBound: Math.min(lastValue * 1.1, 1),
    }));

    return {
      metric,
      horizon,
      granularity,
      predictions,
      confidence: 'low',
      model: 'moving_average',
    };
  }

  // Use linear regression for prediction
  const data = values.map((y, x) => ({ x, y }));
  const regression = linearRegression(data);

  // Determine confidence
  let confidence: ForecastConfidence;
  if (regression.rSquared >= FORECAST_CONFIDENCE_THRESHOLDS.high) {
    confidence = 'high';
  } else if (regression.rSquared >= FORECAST_CONFIDENCE_THRESHOLDS.medium) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Calculate standard error for confidence intervals
  const residuals = data.map((p) => p.y - (regression.slope * p.x + regression.intercept));
  const stdError = Math.sqrt(
    residuals.reduce((sum, r) => sum + r * r, 0) / (residuals.length - 2)
  );

  // Generate predictions
  const lastPeriodLabel = timeSeries[timeSeries.length - 1].periodLabel;
  const predictions = Array.from({ length: horizon }, (_, i) => {
    const x = values.length + i;
    const predicted = regression.slope * x + regression.intercept;
    const clampedPrediction = Math.max(0, Math.min(1, predicted));
    const margin = stdError * 1.96; // 95% confidence interval

    return {
      periodLabel: `${lastPeriodLabel}+${i + 1}`,
      predictedValue: clampedPrediction,
      lowerBound: Math.max(0, clampedPrediction - margin),
      upperBound: Math.min(1, clampedPrediction + margin),
    };
  });

  return {
    metric,
    horizon,
    granularity,
    predictions,
    confidence,
    model: 'linear',
    historicalMAPE: calculateMAPE(values, regression),
  };
}

/**
 * Calculate Mean Absolute Percentage Error
 */
function calculateMAPE(
  actuals: number[],
  regression: { slope: number; intercept: number }
): number {
  if (actuals.length === 0) {return 0;}

  let totalError = 0;
  for (let i = 0; i < actuals.length; i++) {
    const predicted = regression.slope * i + regression.intercept;
    if (actuals[i] !== 0) {
      totalError += Math.abs((actuals[i] - predicted) / actuals[i]);
    }
  }

  return totalError / actuals.length;
}

// ============================================================================
// Benchmarking Functions
// ============================================================================

/**
 * Compare provider against benchmark
 */
export function compareAgainstBenchmark(
  profile: USFProfile,
  benchmark: USFFactors & { composite: number },
  allProviders: USFProfile[],
  period: { startDate: string; endDate: string }
): BenchmarkComparison {
  const composite = calculateComposite(profile.factors, DEFAULT_USF_WEIGHTS);

  // Calculate percentiles
  const sortedByQuality = [...allProviders].sort((a, b) => a.factors.quality - b.factors.quality);
  const sortedByCost = [...allProviders].sort((a, b) => a.factors.cost - b.factors.cost);
  const sortedBySpeed = [...allProviders].sort((a, b) => a.factors.speed - b.factors.speed);
  const sortedByComposite = [...allProviders].sort((a, b) =>
    calculateComposite(a.factors, DEFAULT_USF_WEIGHTS) - calculateComposite(b.factors, DEFAULT_USF_WEIGHTS)
  );

  const qualityRank = sortedByQuality.findIndex((p) => p.$id === profile.$id) + 1;
  const costRank = sortedByCost.findIndex((p) => p.$id === profile.$id) + 1;
  const speedRank = sortedBySpeed.findIndex((p) => p.$id === profile.$id) + 1;
  const compositeRank = sortedByComposite.findIndex((p) => p.$id === profile.$id) + 1;

  const n = allProviders.length;
  const percentiles = {
    quality: n > 0 ? (qualityRank / n) * 100 : 50,
    cost: n > 0 ? (costRank / n) * 100 : 50,
    speed: n > 0 ? (speedRank / n) * 100 : 50,
    composite: n > 0 ? (compositeRank / n) * 100 : 50,
  };

  const deltas = {
    quality: profile.factors.quality - benchmark.quality,
    cost: profile.factors.cost - benchmark.cost,
    speed: profile.factors.speed - benchmark.speed,
    composite: composite - benchmark.composite,
  };

  // Generate recommendations
  const recommendations: string[] = [];

  if (deltas.quality < -0.05) {
    recommendations.push(`Quality ${(deltas.quality * 100).toFixed(1)}% below benchmark. Focus on defect reduction.`);
  }
  if (deltas.cost < -0.05) {
    recommendations.push(`Cost efficiency ${(deltas.cost * 100).toFixed(1)}% below benchmark. Review pricing structure.`);
  }
  if (deltas.speed < -0.05) {
    recommendations.push(`Speed ${(deltas.speed * 100).toFixed(1)}% below benchmark. Evaluate process bottlenecks.`);
  }
  if (percentiles.composite < 25) {
    recommendations.push('Overall performance in bottom quartile. Consider performance improvement plan.');
  }
  if (percentiles.composite >= 90) {
    recommendations.push('Exceptional performer. Consider for premium assignments and mentorship roles.');
  }

  return {
    entityUrn: profile.$id,
    entityType: 'provider',
    period,
    metrics: { ...profile.factors, composite },
    benchmark,
    deltas,
    percentiles,
    classification: classifyPerformanceTier(composite),
    recommendations,
  };
}

/**
 * Generate provider rankings
 */
export function generateProviderRankings(
  providers: USFProfile[],
  sortBy: 'quality' | 'cost' | 'speed' | 'composite' = 'composite'
): ProviderRanking[] {
  // Sort providers
  const sorted = [...providers].sort((a, b) => {
    if (sortBy === 'composite') {
      return calculateComposite(b.factors, DEFAULT_USF_WEIGHTS) -
             calculateComposite(a.factors, DEFAULT_USF_WEIGHTS);
    }
    return b.factors[sortBy] - a.factors[sortBy];
  });

  const n = providers.length;

  return sorted.map((profile, index) => {
    const composite = calculateComposite(profile.factors, DEFAULT_USF_WEIGHTS);

    // Get trend from history
    const history = profile.history || [];
    let trend: TrendDirection = 'stable';
    if (history.length >= 2) {
      const recentComposite = history[history.length - 1].composite;
      const previousComposite = history[history.length - 2].composite;
      const change = recentComposite - previousComposite;
      trend = classifyTrendDirection(change / previousComposite);
    }

    return {
      rank: index + 1,
      providerUrn: profile.$id,
      providerName: profile.providerInfo?.name,
      providerType: profile.providerType,
      composite,
      factors: profile.factors,
      trend,
      percentile: n > 0 ? ((n - index) / n) * 100 : 50,
      sampleSize: profile.confidence?.sampleSize || 0,
    };
  });
}

// ============================================================================
// Report Generation Functions
// ============================================================================

/**
 * Generate comprehensive analytics report
 */
export function generateAnalyticsReport(
  providers: USFProfile[],
  workPackets: USFWorkPacket[],
  period: { startDate: string; endDate: string; granularity: AnalyticsPeriod },
  reportType: 'provider' | 'project' | 'market' | 'comparison' = 'market'
): AnalyticsReport {
  const reportId = generateReportId();
  const now = new Date().toISOString();

  // Calculate summary metrics
  const n = providers.length;
  const avgQuality = n > 0 ? providers.reduce((sum, p) => sum + p.factors.quality, 0) / n : 0;
  const avgCost = n > 0 ? providers.reduce((sum, p) => sum + p.factors.cost, 0) / n : 0;
  const avgSpeed = n > 0 ? providers.reduce((sum, p) => sum + p.factors.speed, 0) / n : 0;
  const avgComposite = n > 0 ? providers.reduce((sum, p) =>
    sum + calculateComposite(p.factors, DEFAULT_USF_WEIGHTS), 0
  ) / n : 0;

  // Build aggregated time series from all providers
  const allPoints: TimeSeriesPoint[] = [];
  for (const provider of providers) {
    const series = getTimeSeries(provider.$id, period.startDate, period.endDate);
    allPoints.push(...series);
  }

  const timeSeries = aggregateTimeSeries(allPoints, period.granularity);

  // Analyze trends
  const trends = analyzeAllTrends(timeSeries);

  // Get top performers
  const rankings = generateProviderRankings(providers, 'composite');
  const topPerformers = rankings.slice(0, 5).map((r) => ({
    providerUrn: r.providerUrn,
    composite: r.composite,
    trend: r.trend,
  }));

  // Identify attention areas
  const attentionAreas: string[] = [];
  const compositeTrend = trends.find((t) => t.metric === 'composite');
  if (compositeTrend && compositeTrend.direction === 'declining') {
    attentionAreas.push(`Overall composite score declining (${(compositeTrend.percentChange * 100).toFixed(1)}%)`);
  }

  const qualityTrend = trends.find((t) => t.metric === 'quality');
  if (qualityTrend && qualityTrend.endValue < 0.75) {
    attentionAreas.push(`Average quality below target (${(qualityTrend.endValue * 100).toFixed(0)}%)`);
  }

  const belowAverageCount = rankings.filter((r) => r.composite < 0.7).length;
  if (belowAverageCount > n * 0.2) {
    attentionAreas.push(`${belowAverageCount} providers (${((belowAverageCount / n) * 100).toFixed(0)}%) below average performance`);
  }

  // Generate forecasts
  const forecasts = [
    generateForecast(timeSeries, 'quality', 3, period.granularity),
    generateForecast(timeSeries, 'composite', 3, period.granularity),
  ];

  const report: AnalyticsReport = {
    reportId,
    reportType,
    generatedAt: now,
    period,
    summary: {
      averageQuality: avgQuality,
      averageCost: avgCost,
      averageSpeed: avgSpeed,
      averageComposite: avgComposite,
      totalWorkPackets: workPackets.length,
      totalProviders: providers.length,
    },
    timeSeries,
    trends,
    topPerformers,
    attentionAreas,
    forecasts,
  };

  reportStore.set(reportId, report);
  return report;
}

/**
 * Get a report by ID
 */
export function getReport(reportId: string): AnalyticsReport | undefined {
  return reportStore.get(reportId);
}

/**
 * Get all reports
 */
export function getAllReports(): AnalyticsReport[] {
  return Array.from(reportStore.values());
}

// ============================================================================
// Service Export
// ============================================================================

export const USFHistoricalAnalyticsService = {
  // Time series
  recordTimeSeriesPoint,
  getTimeSeries,
  aggregateTimeSeries,

  // Trend analysis
  analyzeTrend,
  analyzeAllTrends,
  classifyTrendDirection,

  // Performance snapshots
  createPerformanceSnapshot,
  getProviderSnapshots,
  classifyPerformanceTier,

  // Forecasting
  generateForecast,

  // Benchmarking
  compareAgainstBenchmark,
  generateProviderRankings,

  // Reports
  generateAnalyticsReport,
  getReport,
  getAllReports,

  // Helpers
  getPeriodLabel,

  // ID generators
  generateSnapshotId,
  generateReportId,
  setAnalyticsIdCounter,

  // Constants
  TREND_THRESHOLDS,
  PERFORMANCE_TIER_THRESHOLDS,
  FORECAST_CONFIDENCE_THRESHOLDS,
  MOVING_AVERAGE_WINDOWS,
};

export default USFHistoricalAnalyticsService;
