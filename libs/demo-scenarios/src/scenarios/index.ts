/**
 * ============================================================================
 * ECTROPY DEMO SCENARIOS - SCENARIO EXPORTS
 * ============================================================================
 * Central export point for all scenario definitions.
 *
 * @module @ectropy/demo-scenarios/scenarios
 * ============================================================================
 */

export {
  createHappyPathScenario,
  default as happyPathScenario,
} from './happy-path.scenario.js';
export {
  createRFIStormScenario,
  default as rfiStormScenario,
} from './rfi-storm.scenario.js';
export {
  createMultiTradeScenario,
  multiTradeScenario,
} from './multi-trade.scenario.js';

import { createHappyPathScenario } from './happy-path.scenario.js';
import { createRFIStormScenario } from './rfi-storm.scenario.js';
import { createMultiTradeScenario } from './multi-trade.scenario.js';
import type { DemoScenario, BuildingType } from '../types/index.js';

/**
 * Available scenario IDs
 */
export type ScenarioId =
  | 'happy-path'
  | 'rfi-storm'
  | 'multi-trade-coordination';

/**
 * Registry of all available scenarios
 */
export const scenarioRegistry: Record<
  ScenarioId,
  {
    name: string;
    description: string;
    buildingType: BuildingType;
    complexity: 'low' | 'medium' | 'high';
    durationWeeks: number;
    factory: (projectId: string) => DemoScenario;
  }
> = {
  'happy-path': {
    name: 'Happy Path - Single Family Home',
    description: 'Ideal construction workflow with smooth approvals',
    buildingType: 'house',
    complexity: 'low',
    durationWeeks: 8,
    factory: createHappyPathScenario,
  },
  'rfi-storm': {
    name: 'RFI Storm - Duplex Coordination',
    description:
      'Problem resolution when 12 RFIs flood in during critical phase',
    buildingType: 'duplex',
    complexity: 'medium',
    durationWeeks: 10,
    factory: createRFIStormScenario,
  },
  'multi-trade-coordination': {
    name: 'Multi-Trade Coordination - Commercial Office',
    description:
      'Complex MEP coordination with conflict detection and resolution',
    buildingType: 'office',
    complexity: 'high',
    durationWeeks: 6,
    factory: createMultiTradeScenario,
  },
};

/**
 * Gets a scenario by ID
 */
export function getScenario(id: ScenarioId, projectId: string): DemoScenario {
  const entry = scenarioRegistry[id];
  if (!entry) {
    throw new Error(`Unknown scenario: ${id}`);
  }
  return entry.factory(projectId);
}

/**
 * Lists all available scenarios
 */
export function listScenarios(): Array<{
  id: ScenarioId;
  name: string;
  description: string;
  buildingType: BuildingType;
  complexity: 'low' | 'medium' | 'high';
  durationWeeks: number;
}> {
  return Object.entries(scenarioRegistry)
    .map(([id, entry]) => ({
      id: id as ScenarioId,
      ...entry,
      factory: undefined, // Don't expose factory in list
    }))
    .map(({ factory, ...rest }) => rest) as Array<{
    id: ScenarioId;
    name: string;
    description: string;
    buildingType: BuildingType;
    complexity: 'low' | 'medium' | 'high';
    durationWeeks: number;
  }>;
}
