/**
 * @fileoverview Stage 6 DecisionService contract tests.
 * Validates BOX cell resolution by coordinate proximity and decision upsert.
 *
 * @see apps/api-gateway/src/intake/interfaces/intake-stage.interface.ts
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part V
 */

import type { IIntakeStage, IntakeContext } from '../interfaces';

describe('Stage6DecisionService — contract tests', () => {
  let stage: IIntakeStage;
  let ctx: IntakeContext;

  beforeEach(() => {
    // TODO: inject Stage6DecisionService with in-memory DB fixture
    // containing at least one BOX cell within HVAC-B3-CLASH-001 bounds
    stage = {} as IIntakeStage;
    ctx = {} as IntakeContext;
  });

  describe('stageId', () => {
    it.todo('stageId is DECISIONS');
  });

  describe('execute() — BOX cell resolution', () => {
    it.todo('resolves primary_voxel_urn by proximity query to clash coordinates');
    it.todo('selects the BOX cell closest to clash centroid when multiple cells are in range');
    it.todo('throws IntakeStageError when no BOX cell exists within clash_location bounds');
  });

  describe('execute() — decision upsert', () => {
    it.todo('creates a pm_decisions row on first run');
    it.todo('does not create a duplicate row on second run (upsert)');
    it.todo('ai_analysis JSONB is set from decisions.json — not computed live');
    it.todo('authority_required is set from the decision definition');
    it.todo('primary_voxel_urn follows pattern urn:ectropy:{projectId}:voxel:{voxelId}');
  });

  describe('execute() — audit', () => {
    it.todo('writes exactly one IntakeLogEntry with stageId=DECISIONS per call');
  });

  describe('execute() — flag guard', () => {
    it.todo('skips all DB writes when pipeline_flags.seed_decisions is false');
  });
});
