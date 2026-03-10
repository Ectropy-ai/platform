/**
 * IoT Sensor Drivers - Basic Interface and Implementations
 * Provides abstraction layer for IoT sensor data collection
 */

/**
 * Represents a reading from a sensor
 */
export interface SensorReading {
  /** Unique identifier for the sensor */
  sensorId: string;
  /** Type of measurement (temperature, humidity, pressure, etc.) */
  type: string;
  /** The measured value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Timestamp when the reading was taken */
  timestamp: Date;
  /** Optional metadata about the reading */
  metadata?: Record<string, any>;
}

/**
 * Base interface for all sensor drivers
 */
export interface SensorDriver {
  /** Unique identifier for this sensor instance */
  id: string;
  /** Human-readable name for the sensor */
  name: string;
  /** Type of sensor (temperature, humidity, etc.) */
  type: string;

  /**
   * Take a reading from the sensor
   * @returns Current sensor reading
   */
  read(): SensorReading;

  /**
   * Initialize the sensor connection
   */
  initialize(): Promise<void>;

  /**
   * Clean up sensor resources
   */
  dispose(): Promise<void>;
}

/**
 * production temperature sensor driver for development/testing
 */
export class MockTemperatureSensor implements SensorDriver {
  readonly id: string;
  readonly name: string;
  readonly type = 'temperature';
  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
  read(): SensorReading {
    // Generate realistic temperature data (18-25°C)
    const baseTemp = 21.5;
    const variation = (Math.random() - 0.5) * 4; // ±2°C variation
    return {
      sensorId: this.id,
      type: this.type,
      value: Math.round((baseTemp + variation) * 100) / 100, // Round to 2 decimal places
      unit: '°C',
      timestamp: new Date(),
      metadata: {
        sensorName: this.name,
        location: 'construction_site',
      },
    };
  }

  async initialize(): Promise<void> {
    // production initialization - could connect to actual hardware
  }

  async dispose(): Promise<void> {
    // production cleanup
  }
}

/**
 * production humidity sensor driver for development/testing
 */
export class MockHumiditySensor implements SensorDriver {
  readonly id: string;
  readonly name: string;
  readonly type = 'humidity';

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  read(): SensorReading {
    // Generate realistic humidity data (40-70%)
    const baseHumidity = 55;
    const variation = (Math.random() - 0.5) * 30; // ±15% variation
    return {
      sensorId: this.id,
      type: this.type,
      value: Math.max(0, Math.min(100, Math.round(baseHumidity + variation))), // Clamp to 0-100%
      unit: '%',
      timestamp: new Date(),
      metadata: {
        sensorName: this.name,
        location: 'construction_site',
      },
    };
  }

  async initialize(): Promise<void> {
  }

  async dispose(): Promise<void> {
  }
}

/**
 * Factory function to create sensor drivers based on configuration
 */
export function createSensorDriver(config: {
  id: string;
  name: string;
  type: string;
}): SensorDriver {
  switch (config.type.toLowerCase()) {
    case 'temperature':
      return new MockTemperatureSensor(config.id, config.name);
    case 'humidity':
      return new MockHumiditySensor(config.id, config.name);
    default:
      throw new Error(`Unsupported sensor type: ${config.type}`);
  }
}
