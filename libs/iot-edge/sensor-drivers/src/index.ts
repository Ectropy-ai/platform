/**
 * Basic sensor driver interfaces and sample implementations.
 */

/** Generic shape of a sensor reading */
export type SensorReading = Record<string, unknown>;

/** Interface all sensor drivers should implement */
export interface SensorDriver {
  read(): SensorReading;
}

/**
 * Simple temperature sensor that returns a random value.
 * This is useful for testing data collection without hardware.
 */
export class MockTemperatureSensor implements SensorDriver {
  read(): SensorReading {
    return {
      temperature: 20 + Math.random() * 5,
      timestamp: Date.now(),
    };
  }
}
