/**
 * ============================================================================
 * ECTROPY DEMO SCENARIOS
 * ============================================================================
 * Enterprise synthetic demo data generation and scenario playback library
 * for the Ectropy construction platform.
 *
 * Features:
 * - Pre-built scenario templates (Happy Path, RFI Storm, etc.)
 * - Persona behavior modeling for realistic interactions
 * - Voxel-based spatial data generation
 * - Decision lifecycle event generation
 * - Inspection and consequence modeling
 * - Timeline playback support
 *
 * @module @ectropy/demo-scenarios
 * @version 1.0.0
 * @author Ectropy Team
 * ============================================================================
 */

// Types
export * from './types/index.js';

// Personas
export * from './personas/index.js';

// Scenarios
export * from './scenarios/index.js';

// Generators
export * from './generators/index.js';

// Services
export * from './services/index.js';

// Re-export commonly used items at top level for convenience
export {
  createHappyPathScenario,
  createRFIStormScenario,
  getScenario,
  listScenarios,
  scenarioRegistry,
} from './scenarios/index.js';

export {
  createDemoCast,
  createArchitectPersona,
  createEngineerPersona,
  createContractorPersona,
  createOwnerPersona,
} from './personas/index.js';

export {
  generateDecision,
  generateRandomDecisionForPhase,
  decisionTemplates,
} from './generators/decision.generator.js';

export {
  generateBuildingVoxels,
  buildingProfiles,
} from './generators/voxel.generator.js';

export {
  generateInspectionRequest,
  generateInspectionResult,
  inspectionTemplates,
} from './generators/inspection.generator.js';

export {
  DemoScenarioService,
  getDemoScenarioService,
  resetDemoScenarioService,
} from './services/scenario.service.js';

export {
  createPlaybackController,
  PlaybackManager,
  getPlaybackManager,
  resetPlaybackManager,
  type PlaybackController,
  type PlaybackEventHandler,
} from './services/playback.service.js';

// Re-export common types for convenience
export type { PlaybackSpeed } from './types/index.js';
