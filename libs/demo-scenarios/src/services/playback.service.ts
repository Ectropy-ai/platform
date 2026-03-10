/**
 * ============================================================================
 * DEMO PLAYBACK SERVICE
 * ============================================================================
 * Controls timeline playback for demo scenarios, supporting real-time,
 * accelerated, and milestone navigation modes.
 *
 * @module @ectropy/demo-scenarios/services
 * @version 1.0.0
 * ============================================================================
 */

import type {
  DemoScenario,
  ScenarioInstance,
  // ScenarioEvent, // Unused import
  // ScenarioMilestone, // Unused import
  TimelinePosition,
  PlaybackSpeed,
  PlaybackState,
  PlaybackUpdate,
} from '../types/index.js';
import { getDemoScenarioService } from './scenario.service.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Playback event handler
 */
export type PlaybackEventHandler = (update: PlaybackUpdate) => void;

/**
 * Playback controller for a single scenario instance
 */
export interface PlaybackController {
  instanceId: string;
  play: () => void;
  pause: () => void;
  stop: () => void;
  reset: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  jumpToMilestone: (milestoneId: string) => void;
  jumpToPosition: (position: TimelinePosition) => void;
  getState: () => PlaybackState;
  onEvent: (handler: PlaybackEventHandler) => () => void;
  destroy: () => void;
}

// ============================================================================
// PLAYBACK CONTROLLER IMPLEMENTATION
// ============================================================================

/**
 * Creates a playback controller for a scenario instance
 */
export function createPlaybackController(
  scenario: DemoScenario,
  instance: ScenarioInstance
): PlaybackController {
  // Internal state
  let currentPosition: TimelinePosition = { ...instance.currentPosition };
  let isPlaying = false;
  let speed: PlaybackSpeed = 10;
  let startedAt: Date | null = null;
  let elapsedMs = 0;
  let executedEvents: Set<string> = new Set();
  let intervalId: NodeJS.Timeout | null = null;
  const eventHandlers: Set<PlaybackEventHandler> = new Set();

  // Scenario service reference
  const scenarioService = getDemoScenarioService();

  /**
   * Emits a playback update to all handlers
   */
  function emit(update: PlaybackUpdate): void {
    eventHandlers.forEach((handler) => {
      try {
        handler(update);
      } catch (err) {
        console.error('[Playback] Event handler error:', err);
      }
    });
  }

  /**
   * Gets the current playback state
   */
  function getState(): PlaybackState {
    const nextEvent = scenarioService.getNextEvent(scenario, currentPosition);

    return {
      instanceId: instance.id,
      position: { ...currentPosition },
      speed,
      isPlaying,
      nextEvent,
      executedEvents: Array.from(executedEvents),
      startedAt: startedAt?.toISOString(),
      elapsedMs,
    };
  }

  /**
   * Processes events at the current position
   */
  function processCurrentPosition(): void {
    // Find all events at current position that haven't been executed
    const eventsAtPosition = scenario.timeline!.filter((event) => {
      if (executedEvents.has(event.id)) return false;

      return (
        event.position.week === currentPosition.week &&
        event.position.day === currentPosition.day &&
        event.position.hour === currentPosition.hour
      );
    });

    // Execute each event
    eventsAtPosition.forEach((event) => {
      executedEvents.add(event.id);

      emit({
        type: 'event_executed',
        instanceId: instance.id,
        timestamp: new Date().toISOString(),
        data: {
          event,
          position: { ...currentPosition },
        },
      });
    });

    // Check for milestone
    const milestone = scenario.milestones!.find(
      (m) =>
        m.position.week === currentPosition.week &&
        m.position.day === currentPosition.day &&
        m.position.hour === currentPosition.hour
    );

    if (milestone) {
      emit({
        type: 'milestone_reached',
        instanceId: instance.id,
        timestamp: new Date().toISOString(),
        data: {
          milestone,
          position: { ...currentPosition },
        },
      });
    }
  }

  /**
   * Advances the timeline by one hour
   */
  function advanceHour(): void {
    currentPosition.hour += 1;

    // Handle hour overflow
    if (currentPosition.hour >= 24) {
      currentPosition.hour = 0;
      currentPosition.day += 1;
    }

    // Handle day overflow (7 days per week for construction)
    if (currentPosition.day > 7) {
      currentPosition.day = 1;
      currentPosition.week += 1;
    }

    // Check if we've reached the end
    if (currentPosition.week > scenario.duration.weeks) {
      stop();
      emit({
        type: 'state_changed',
        instanceId: instance.id,
        timestamp: new Date().toISOString(),
        data: { state: 'completed' },
      });
      return;
    }

    // Emit position change
    emit({
      type: 'position_changed',
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      data: { position: { ...currentPosition } },
    });

    // Process events at new position
    processCurrentPosition();

    // Update service
    scenarioService.updateInstancePosition(instance.id, currentPosition);
  }

  /**
   * Starts playback
   */
  function play(): void {
    if (isPlaying) return;

    isPlaying = true;
    startedAt = new Date();

    // Calculate interval based on speed
    // At speed 1x, 1 hour = 1 minute real time
    // At speed 10x, 1 hour = 6 seconds real time
    const msPerHour = (60 * 1000) / speed;

    intervalId = setInterval(() => {
      elapsedMs += msPerHour;
      advanceHour();
    }, msPerHour);

    // Process initial position
    processCurrentPosition();

    scenarioService.updateInstanceState(instance.id, 'playing');

    emit({
      type: 'state_changed',
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      data: { state: 'playing', speed },
    });
  }

  /**
   * Pauses playback
   */
  function pause(): void {
    if (!isPlaying) return;

    isPlaying = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    scenarioService.updateInstanceState(instance.id, 'paused');

    emit({
      type: 'state_changed',
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      data: { state: 'paused' },
    });
  }

  /**
   * Stops playback and resets to beginning
   */
  function stop(): void {
    pause();
    reset();
  }

  /**
   * Resets playback to beginning
   */
  function reset(): void {
    currentPosition = { week: 1, day: 1, hour: 0 };
    executedEvents.clear();
    elapsedMs = 0;
    startedAt = null;

    scenarioService.updateInstancePosition(instance.id, currentPosition);
    scenarioService.updateInstanceState(instance.id, 'ready');

    emit({
      type: 'state_changed',
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      data: { state: 'ready', position: { ...currentPosition } },
    });
  }

  /**
   * Sets playback speed
   */
  function setSpeed(newSpeed: PlaybackSpeed): void {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();

    speed = newSpeed;

    if (wasPlaying) play();

    emit({
      type: 'state_changed',
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      data: { speed: newSpeed },
    });
  }

  /**
   * Jumps to a specific milestone
   */
  function jumpToMilestone(milestoneId: string): void {
    const milestone = scenario.milestones!.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }

    jumpToPosition(milestone.position);
  }

  /**
   * Jumps to a specific timeline position
   */
  function jumpToPosition(position: TimelinePosition): void {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();

    // Mark all events before this position as executed
    executedEvents.clear();
    scenario.timeline!.forEach((event) => {
      if (
        event.position.week < position.week ||
        (event.position.week === position.week &&
          event.position.day < position.day) ||
        (event.position.week === position.week &&
          event.position.day === position.day &&
          event.position.hour < position.hour)
      ) {
        executedEvents.add(event.id);
      }
    });

    currentPosition = { ...position };
    scenarioService.updateInstancePosition(instance.id, currentPosition);

    emit({
      type: 'position_changed',
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      data: { position: { ...currentPosition }, jumped: true },
    });

    // Process events at new position
    processCurrentPosition();

    if (wasPlaying) play();
  }

  /**
   * Registers an event handler
   */
  function onEvent(handler: PlaybackEventHandler): () => void {
    eventHandlers.add(handler);
    return () => eventHandlers.delete(handler);
  }

  /**
   * Destroys the controller and cleans up resources
   */
  function destroy(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    eventHandlers.clear();
  }

  return {
    instanceId: instance.id,
    play,
    pause,
    stop,
    reset,
    setSpeed,
    jumpToMilestone,
    jumpToPosition,
    getState,
    onEvent,
    destroy,
  };
}

// ============================================================================
// PLAYBACK MANAGER
// ============================================================================

/**
 * Manages multiple playback controllers
 */
export class PlaybackManager {
  private controllers = new Map<string, PlaybackController>();

  /**
   * Creates and registers a playback controller
   */
  createController(
    scenario: DemoScenario,
    instance: ScenarioInstance
  ): PlaybackController {
    // Clean up existing controller if any
    this.destroyController(instance.id);

    const controller = createPlaybackController(scenario, instance);
    this.controllers.set(instance.id, controller);
    return controller;
  }

  /**
   * Gets an existing controller
   */
  getController(instanceId: string): PlaybackController | undefined {
    return this.controllers.get(instanceId);
  }

  /**
   * Destroys a controller
   */
  destroyController(instanceId: string): void {
    const controller = this.controllers.get(instanceId);
    if (controller) {
      controller.destroy();
      this.controllers.delete(instanceId);
    }
  }

  /**
   * Destroys all controllers
   */
  destroyAll(): void {
    this.controllers.forEach((controller) => controller.destroy());
    this.controllers.clear();
  }

  /**
   * Gets all active controllers
   */
  getActiveControllers(): PlaybackController[] {
    return Array.from(this.controllers.values());
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let managerInstance: PlaybackManager | null = null;

/**
 * Gets the playback manager singleton
 */
export function getPlaybackManager(): PlaybackManager {
  if (!managerInstance) {
    managerInstance = new PlaybackManager();
  }
  return managerInstance;
}

/**
 * Resets the playback manager singleton (for testing)
 */
export function resetPlaybackManager(): void {
  if (managerInstance) {
    managerInstance.destroyAll();
  }
  managerInstance = null;
}
