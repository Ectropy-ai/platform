/**
 * OpenTelemetry Instrumentation for Ectropy Platform
 * Enterprise-grade observability and monitoring
 */

export class EctropyTelemetry {
  constructor(serviceName: string = "ectropy-platform", serviceVersion: string = "1.0.0") {
    console.warn(`OpenTelemetry not available for ${serviceName} v${serviceVersion} - install dependencies`);
  }

  async initialize(): Promise<void> {
    console.log("OpenTelemetry stub initialized");
  }

  start(): void {
    console.log("OpenTelemetry stub started");
  }

  async shutdown(): Promise<void> {
    console.log("OpenTelemetry stub shutdown");
  }
}

export const telemetry = new EctropyTelemetry();
