/**
 * Edge processing algorithms for sensor data.
 */

export interface ProcessedStats {
  average: number;
  min: number;
  max: number;
}

/**
 * Calculate simple statistics (min, max, average) for a set of numeric readings.
 * Non-numeric inputs return zeroed statistics.
 */
export function processSensorData(data: number[]): ProcessedStats {
  if (!Array.isArray(data) || data.length === 0) {
    return { average: 0, min: 0, max: 0 };
  }
  const sum = data.reduce((acc, val) => acc + val, 0);
  return {
    average: sum / data.length,
    min: Math.min(...data),
    max: Math.max(...data),
  };
}
