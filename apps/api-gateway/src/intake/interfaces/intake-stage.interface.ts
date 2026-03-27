/**
 * @fileoverview IIntakeStage — the unit of execution in the
 * Project Intake Pipeline.
 *
 * Contract guarantees:
 *   - execute() is idempotent: running twice on the same context
 *     produces identical DB state
 *   - execute() writes exactly one IntakeLogEntry per call
 *   - On failure, throws IntakeStageError — does not corrupt prior stages
 *   - context.tenantId is set before any stage after TENANT runs
 *   - context.projectId is set before any stage after PROJECT runs
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part I
 */

import type { IntakeBundle, IntakeStageId } from './bundle.types';
import type { ElementManifest } from './ifc-extraction.interface';

export interface TaktZoneMap {
  [zoneId: string]: {
    status: string;
    z_min: number; z_max: number;
    x_min?: number; x_max?: number;
    y_min?: number; y_max?: number;
  };
}

/** Minimal logger interface — implemented by the pipeline orchestrator. */
export interface IntakeLogger {
  info(stageId: IntakeStageId, message: string): void;
  warn(stageId: IntakeStageId, message: string): void;
  error(stageId: IntakeStageId, message: string, err?: unknown): void;
}

/**
 * Shared context object passed through all pipeline stages.
 * Mutated in place as each stage completes.
 */
export interface IntakeContext {
  bundleId: string;
  bundleVersion: string;
  bundle: IntakeBundle;
  /** Set by TENANT stage. Required by all subsequent stages. */
  tenantId?: string;
  /** Set by PROJECT stage. Required by stages 3-7. */
  projectId?: string;
  /** Set by IFC_INGESTION stage. */
  voxelGridId?: string;
  /** Set by IFC_INGESTION stage. One manifest per IFC discipline. */
  elementManifests?: ElementManifest[];
  /** Set by CONTRACT_TAKT stage. */
  taktZoneMap?: TaktZoneMap;
  /** Prisma client scoped to the tenant's DB (or shared DB with RLS). */
  db: unknown;
  /** DO Spaces client. */
  spaces: unknown;
  log: IntakeLogger;
}

export interface StageResult {
  stageId: IntakeStageId;
  success: boolean;
  rowsAffected: number;
  durationMs: number;
  /**
   * Deterministic hash of affected row PKs.
   * Identical value on re-run confirms idempotency.
   */
  idempotencyKey: string;
  warnings: string[];
}

export interface IIntakeStage {
  readonly stageId: IntakeStageId;
  readonly stageName: string;
  /**
   * Execute this stage against the provided context.
   * Mutates context to expose outputs for downstream stages.
   * @throws {IntakeStageError} on failure
   */
  execute(context: IntakeContext): Promise<StageResult>;
}

export class IntakeStageError extends Error {
  constructor(
    public readonly stageId: IntakeStageId,
    public readonly reason: string,
    public readonly cause?: unknown,
  ) {
    super(`IntakeStage '${stageId}' failed: ${reason}`);
    this.name = 'IntakeStageError';
  }
}
