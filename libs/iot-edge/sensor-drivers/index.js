/**
 * IoT Sensor Drivers - Basic Interface and Implementations
 * Provides abstraction layer for IoT sensor data collection
 */
/**
 * Mock temperature sensor driver for development/testing
 */
export class MockTemperatureSensor {
  constructor(id, name) {
    this.type = 'temperature';
    this.id = id;
    this.name = name;
  }
  read() {
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
  async initialize() {
    // Mock initialization - could connect to actual hardware
    // console.log(`Initializing temperature sensor: ${this.name}`);
  }
  async dispose() {
    // Mock cleanup
    // console.log(`Disposing temperature sensor: ${this.name}`);
  }
}
/**
 * Mock humidity sensor driver for development/testing
 */
export class MockHumiditySensor {
  constructor(id, name) {
    this.type = 'humidity';
    this.id = id;
    this.name = name;
  }
  read() {
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
  async initialize() {
    // console.log(`Initializing humidity sensor: ${this.name}`);
  }
  async dispose() {
    // console.log(`Disposing humidity sensor: ${this.name}`);
  }
}
/**
 * Factory function to create sensor drivers based on configuration
 */
export function createSensorDriver(config) {
  switch (config.type.toLowerCase()) {
    case 'temperature':
      return new MockTemperatureSensor(config.id, config.name);
    case 'humidity':
      return new MockHumiditySensor(config.id, config.name);
    default:
      throw new Error(`Unsupported sensor type: ${config.type}`);
  }
}
//# sourceMappingURL=index.js.map
