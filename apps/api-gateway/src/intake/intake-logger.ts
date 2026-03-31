/**
 * @fileoverview ConsoleIntakeLogger — implementation of IntakeLogger
 * for use in production and tests.
 *
 * Each log entry includes: timestamp, stageId, and message.
 * In tests, use MockIntakeLogger to capture entries for assertion.
 */

import type { IntakeLogger } from './interfaces/intake-stage.interface';
import type { IntakeStageId } from './interfaces/bundle.types';

export class ConsoleIntakeLogger implements IntakeLogger {
  private readonly prefix: string;

  constructor(bundleId: string, bundleVersion: string) {
    this.prefix = `[intake:${bundleId}@${bundleVersion}]`;
  }

  info(stageId: IntakeStageId, message: string): void {
    console.log(`${new Date().toISOString()} ${this.prefix} [${stageId}] INFO  ${message}`);
  }

  warn(stageId: IntakeStageId, message: string): void {
    console.warn(`${new Date().toISOString()} ${this.prefix} [${stageId}] WARN  ${message}`);
  }

  error(stageId: IntakeStageId, message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? ` — ${err.message}` : '';
    console.error(`${new Date().toISOString()} ${this.prefix} [${stageId}] ERROR ${message}${errMsg}`);
  }
}

/**
 * MockIntakeLogger — captures log entries for test assertions.
 */
export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  stageId: IntakeStageId;
  message: string;
  err?: unknown;
}

export class MockIntakeLogger implements IntakeLogger {
  readonly entries: LogEntry[] = [];

  info(stageId: IntakeStageId, message: string): void {
    this.entries.push({ level: 'info', stageId, message });
  }

  warn(stageId: IntakeStageId, message: string): void {
    this.entries.push({ level: 'warn', stageId, message });
  }

  error(stageId: IntakeStageId, message: string, err?: unknown): void {
    this.entries.push({ level: 'error', stageId, message, err });
  }

  forStage(stageId: IntakeStageId): LogEntry[] {
    return this.entries.filter(e => e.stageId === stageId);
  }

  reset(): void {
    this.entries.length = 0;
  }
}
