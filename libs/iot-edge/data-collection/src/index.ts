/**
 * Utilities for collecting data from IoT sensors.
 */
import { SensorDriver, SensorReading } from '../../sensor-drivers';

/**
 * Gather a snapshot of readings from the provided sensors.
 */
export function collectReadings(drivers: SensorDriver[]): SensorReading[] {
  return drivers.map((driver) => driver.read());
}
