/**
 * Conversation State Machine Unit Tests
 *
 * Tests for conversation state management and transitions.
 *
 * @module tests/unit/phone-agent/conversation-state-machine.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidTransition,
  getRequiredEntitiesForIntent,
  calculateMissingEntities,
} from '../../../services/phone-agent/conversation-state-machine.js';
import type {
  ConversationState,
  UserIntent,
  ExtractedEntities,
} from '../../../services/phone-agent/types.js';

// ============================================================================
// State Transition Validation Tests
// ============================================================================

describe('isValidTransition', () => {
  describe('from IDLE', () => {
    it('should allow transition to IDENTIFY_USER', () => {
      expect(isValidTransition('IDLE', 'IDENTIFY_USER')).toBe(true);
    });

    it('should not allow direct transition to EXECUTE', () => {
      expect(isValidTransition('IDLE', 'EXECUTE')).toBe(false);
    });
  });

  describe('from IDENTIFY_USER', () => {
    it('should allow transition to CLASSIFY_INTENT', () => {
      expect(isValidTransition('IDENTIFY_USER', 'CLASSIFY_INTENT')).toBe(true);
    });

    it('should allow transition to ERROR', () => {
      expect(isValidTransition('IDENTIFY_USER', 'ERROR')).toBe(true);
    });

    it('should not allow transition to CONFIRM', () => {
      expect(isValidTransition('IDENTIFY_USER', 'CONFIRM')).toBe(false);
    });
  });

  describe('from CLASSIFY_INTENT', () => {
    it('should allow transition to EXTRACT_ENTITIES', () => {
      expect(isValidTransition('CLASSIFY_INTENT', 'EXTRACT_ENTITIES')).toBe(true);
    });
  });

  describe('from EXTRACT_ENTITIES', () => {
    it('should allow transition to COLLECT_DATA', () => {
      expect(isValidTransition('EXTRACT_ENTITIES', 'COLLECT_DATA')).toBe(true);
    });

    it('should allow transition to VALIDATE', () => {
      expect(isValidTransition('EXTRACT_ENTITIES', 'VALIDATE')).toBe(true);
    });
  });

  describe('from COLLECT_DATA', () => {
    it('should allow transition to VALIDATE', () => {
      expect(isValidTransition('COLLECT_DATA', 'VALIDATE')).toBe(true);
    });
  });

  describe('from VALIDATE', () => {
    it('should allow transition to CONFIRM', () => {
      expect(isValidTransition('VALIDATE', 'CONFIRM')).toBe(true);
    });

    it('should allow transition to ESCALATE', () => {
      expect(isValidTransition('VALIDATE', 'ESCALATE')).toBe(true);
    });
  });

  describe('from CONFIRM', () => {
    it('should allow transition to EXECUTE', () => {
      expect(isValidTransition('CONFIRM', 'EXECUTE')).toBe(true);
    });

    it('should allow transition to IDLE (cancel)', () => {
      expect(isValidTransition('CONFIRM', 'IDLE')).toBe(true);
    });
  });

  describe('from EXECUTE', () => {
    it('should allow transition to RESPOND', () => {
      expect(isValidTransition('EXECUTE', 'RESPOND')).toBe(true);
    });
  });

  describe('from RESPOND', () => {
    it('should allow transition to IDLE', () => {
      expect(isValidTransition('RESPOND', 'IDLE')).toBe(true);
    });
  });

  describe('from ERROR', () => {
    it('should allow transition to IDLE', () => {
      expect(isValidTransition('ERROR', 'IDLE')).toBe(true);
    });
  });

  describe('from ESCALATE', () => {
    it('should allow transition to IDLE', () => {
      expect(isValidTransition('ESCALATE', 'IDLE')).toBe(true);
    });

    it('should allow transition to RESPOND', () => {
      expect(isValidTransition('ESCALATE', 'RESPOND')).toBe(true);
    });
  });
});

// ============================================================================
// Required Entities Tests
// ============================================================================

describe('getRequiredEntitiesForIntent', () => {
  it('should require voxelId and status for report_completion', () => {
    const required = getRequiredEntitiesForIntent('report_completion');
    expect(required).toContain('voxelId');
    expect(required).toContain('status');
  });

  it('should require description for request_decision', () => {
    const required = getRequiredEntitiesForIntent('request_decision');
    expect(required).toContain('description');
  });

  it('should require decisionId for approve_decision', () => {
    const required = getRequiredEntitiesForIntent('approve_decision');
    expect(required).toContain('decisionId');
  });

  it('should require date for schedule_inspection', () => {
    const required = getRequiredEntitiesForIntent('schedule_inspection');
    expect(required).toContain('date');
  });

  it('should require nothing for query_status', () => {
    const required = getRequiredEntitiesForIntent('query_status');
    expect(required).toHaveLength(0);
  });

  it('should require nothing for unknown', () => {
    const required = getRequiredEntitiesForIntent('unknown');
    expect(required).toHaveLength(0);
  });
});

// ============================================================================
// Missing Entities Calculation Tests
// ============================================================================

describe('calculateMissingEntities', () => {
  it('should return all required entities when none provided', () => {
    const missing = calculateMissingEntities('report_completion', {});
    expect(missing).toContain('voxelId');
    expect(missing).toContain('status');
  });

  it('should return only missing entities', () => {
    const entities: ExtractedEntities = { voxelId: 'VOX-123' };
    const missing = calculateMissingEntities('report_completion', entities);
    expect(missing).not.toContain('voxelId');
    expect(missing).toContain('status');
  });

  it('should return empty array when all entities present', () => {
    const entities: ExtractedEntities = {
      voxelId: 'VOX-123',
      status: 'complete',
    };
    const missing = calculateMissingEntities('report_completion', entities);
    expect(missing).toHaveLength(0);
  });

  it('should return empty for query_status regardless of entities', () => {
    const missing = calculateMissingEntities('query_status', {});
    expect(missing).toHaveLength(0);
  });

  it('should handle approve_decision', () => {
    const missing = calculateMissingEntities('approve_decision', {});
    expect(missing).toContain('decisionId');

    const withDecision = calculateMissingEntities('approve_decision', {
      decisionId: 'DEC-123',
    });
    expect(withDecision).toHaveLength(0);
  });

  it('should handle escalate_decision', () => {
    const missing = calculateMissingEntities('escalate_decision', {});
    expect(missing).toContain('decisionId');
    expect(missing).toContain('description');

    const withAll = calculateMissingEntities('escalate_decision', {
      decisionId: 'DEC-123',
      description: 'Urgent issue',
    });
    expect(withAll).toHaveLength(0);
  });
});

// ============================================================================
// State Flow Integration Tests
// ============================================================================

describe('Complete State Flow', () => {
  it('should support happy path flow', () => {
    const happyPath: ConversationState[] = [
      'IDLE',
      'IDENTIFY_USER',
      'CLASSIFY_INTENT',
      'EXTRACT_ENTITIES',
      'VALIDATE',
      'CONFIRM',
      'EXECUTE',
      'RESPOND',
      'IDLE',
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(isValidTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('should support collect data flow', () => {
    const collectDataPath: ConversationState[] = [
      'IDLE',
      'IDENTIFY_USER',
      'CLASSIFY_INTENT',
      'EXTRACT_ENTITIES',
      'COLLECT_DATA',
      'VALIDATE',
      'CONFIRM',
      'EXECUTE',
      'RESPOND',
      'IDLE',
    ];

    for (let i = 0; i < collectDataPath.length - 1; i++) {
      expect(isValidTransition(collectDataPath[i], collectDataPath[i + 1])).toBe(true);
    }
  });

  it('should support error recovery flow', () => {
    expect(isValidTransition('IDENTIFY_USER', 'ERROR')).toBe(true);
    expect(isValidTransition('ERROR', 'IDLE')).toBe(true);
  });

  it('should support escalation flow', () => {
    expect(isValidTransition('VALIDATE', 'ESCALATE')).toBe(true);
    expect(isValidTransition('ESCALATE', 'IDLE')).toBe(true);
  });

  it('should support cancellation flow', () => {
    expect(isValidTransition('CONFIRM', 'IDLE')).toBe(true);
  });
});
