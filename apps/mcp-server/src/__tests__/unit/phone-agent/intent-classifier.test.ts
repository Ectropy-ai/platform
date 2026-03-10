/**
 * Intent Classifier Unit Tests
 *
 * Tests for intent classification and entity extraction.
 *
 * @module tests/unit/phone-agent/intent-classifier.test
 */

import { describe, it, expect } from 'vitest';
import {
  classifyIntentRuleBased,
  extractEntitiesRuleBased,
  INTENT_CONFIDENCE_THRESHOLDS,
  isConfidentClassification,
  getIntentDescription,
} from '../../../services/phone-agent/intent-classifier.js';

// ============================================================================
// Rule-Based Intent Classification Tests
// ============================================================================

describe('classifyIntentRuleBased', () => {
  describe('report_completion intent', () => {
    it('should classify completion messages', () => {
      expect(classifyIntentRuleBased('Zone A concrete is complete').intent).toBe('report_completion');
      expect(classifyIntentRuleBased('We are done with the framing').intent).toBe('report_completion');
      expect(classifyIntentRuleBased('Finished the electrical work').intent).toBe('report_completion');
    });

    it('should have reasonable confidence', () => {
      const result = classifyIntentRuleBased('Zone A is complete');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('request_decision intent', () => {
    it('should classify decision request messages', () => {
      expect(classifyIntentRuleBased('Need decision on concrete mix').intent).toBe('request_decision');
      expect(classifyIntentRuleBased('Please approve the change').intent).toBe('request_decision');
      expect(classifyIntentRuleBased('Can we proceed with alternate?').intent).toBe('request_decision');
    });
  });

  describe('approve_decision intent', () => {
    it('should classify approval messages', () => {
      expect(classifyIntentRuleBased('Approved').intent).toBe('approve_decision');
      expect(classifyIntentRuleBased('I approve the change').intent).toBe('approve_decision');
      expect(classifyIntentRuleBased('Yes approve it').intent).toBe('approve_decision');
    });

    it('should have high confidence for clear approvals', () => {
      const result = classifyIntentRuleBased('Approved');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('query_status intent', () => {
    it('should classify status query messages', () => {
      expect(classifyIntentRuleBased('What is the status?').intent).toBe('query_status');
      expect(classifyIntentRuleBased('Give me an update').intent).toBe('query_status');
      expect(classifyIntentRuleBased("How is the project going?").intent).toBe('query_status');
    });
  });

  describe('escalate_decision intent', () => {
    it('should classify escalation messages', () => {
      expect(classifyIntentRuleBased('Escalate this to PM').intent).toBe('escalate_decision');
      expect(classifyIntentRuleBased('Need help urgently').intent).toBe('escalate_decision');
      expect(classifyIntentRuleBased('This is an emergency').intent).toBe('escalate_decision');
    });
  });

  describe('schedule_inspection intent', () => {
    it('should classify inspection scheduling messages', () => {
      expect(classifyIntentRuleBased('Schedule inspection for Friday').intent).toBe('schedule_inspection');
      expect(classifyIntentRuleBased('Need inspector on site').intent).toBe('schedule_inspection');
    });
  });

  describe('capture_evidence intent', () => {
    it('should classify evidence capture messages', () => {
      expect(classifyIntentRuleBased('See attached photo').intent).toBe('capture_evidence');
      expect(classifyIntentRuleBased('Picture of the damage').intent).toBe('capture_evidence');
    });
  });

  describe('unknown intent', () => {
    it('should return unknown for unclear messages', () => {
      expect(classifyIntentRuleBased('Hello').intent).toBe('unknown');
      expect(classifyIntentRuleBased('xyz abc 123').intent).toBe('unknown');
    });

    it('should have low confidence for unknown', () => {
      const result = classifyIntentRuleBased('Hello');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});

// ============================================================================
// Entity Extraction Tests
// ============================================================================

describe('extractEntitiesRuleBased', () => {
  describe('voxelId extraction', () => {
    it('should extract VOX format', () => {
      const entities = extractEntitiesRuleBased('VOX-123 is complete');
      expect(entities.voxelId).toBe('VOX-123');
    });

    it('should extract ZONE format', () => {
      const entities = extractEntitiesRuleBased('Zone A ready');
      expect(entities.zone).toBe('A');
    });

    it('should be case insensitive', () => {
      const entities = extractEntitiesRuleBased('vox-456 done');
      expect(entities.voxelId).toBe('VOX-456');
    });
  });

  describe('trade extraction', () => {
    it('should extract trade types', () => {
      expect(extractEntitiesRuleBased('Concrete work done').trade).toBe('concrete');
      expect(extractEntitiesRuleBased('Electrical is complete').trade).toBe('electrical');
      expect(extractEntitiesRuleBased('Plumbing inspection needed').trade).toBe('plumbing');
      expect(extractEntitiesRuleBased('HVAC system installed').trade).toBe('hvac');
    });
  });

  describe('amount extraction', () => {
    it('should extract amounts with units', () => {
      expect(extractEntitiesRuleBased('Need 50 ft of pipe').amount).toBe(50);
      expect(extractEntitiesRuleBased('Ordered 100 units').amount).toBe(100);
      expect(extractEntitiesRuleBased('Installed 25.5 yards').amount).toBe(25.5);
    });
  });

  describe('date extraction', () => {
    it('should extract day names', () => {
      expect(extractEntitiesRuleBased('Ready by Friday').date).toBe('friday');
      expect(extractEntitiesRuleBased('Schedule for Monday').date).toBe('monday');
    });

    it('should extract relative dates', () => {
      expect(extractEntitiesRuleBased('Need it today').date).toBe('today');
      expect(extractEntitiesRuleBased('Can do tomorrow').date).toBe('tomorrow');
    });

    it('should extract numeric dates', () => {
      const entities = extractEntitiesRuleBased('Inspection on 01/25');
      expect(entities.date).toBe('01/25');
    });
  });

  describe('decisionId extraction', () => {
    it('should extract DEC format', () => {
      expect(extractEntitiesRuleBased('Approve DEC-123').decisionId).toBe('DEC-123');
      expect(extractEntitiesRuleBased('Decision-456 pending').decisionId).toBe('DEC-456');
    });
  });

  describe('status extraction', () => {
    it('should extract status values', () => {
      expect(extractEntitiesRuleBased('Work is complete').status).toBe('complete');
      expect(extractEntitiesRuleBased('Still in progress').status).toBe('in progress');
      expect(extractEntitiesRuleBased('Currently pending').status).toBe('pending');
    });
  });

  describe('multiple entities', () => {
    it('should extract multiple entities from one message', () => {
      const entities = extractEntitiesRuleBased('VOX-123 concrete is complete');
      expect(entities.voxelId).toBe('VOX-123');
      expect(entities.trade).toBe('concrete');
      expect(entities.status).toBe('complete');
    });
  });
});

// ============================================================================
// Confidence Threshold Tests
// ============================================================================

describe('INTENT_CONFIDENCE_THRESHOLDS', () => {
  it('should have thresholds for all intents', () => {
    expect(INTENT_CONFIDENCE_THRESHOLDS.report_completion).toBeDefined();
    expect(INTENT_CONFIDENCE_THRESHOLDS.approve_decision).toBeDefined();
    expect(INTENT_CONFIDENCE_THRESHOLDS.unknown).toBeDefined();
  });

  it('should have higher threshold for approve_decision', () => {
    expect(INTENT_CONFIDENCE_THRESHOLDS.approve_decision).toBeGreaterThan(
      INTENT_CONFIDENCE_THRESHOLDS.query_status
    );
  });
});

describe('isConfidentClassification', () => {
  it('should return true for high confidence classification', () => {
    const classification = {
      intent: 'approve_decision' as const,
      confidence: 0.9,
      entities: {},
      rawText: 'Approved',
    };
    expect(isConfidentClassification(classification)).toBe(true);
  });

  it('should return false for low confidence classification', () => {
    const classification = {
      intent: 'approve_decision' as const,
      confidence: 0.5,
      entities: {},
      rawText: 'Maybe approved?',
    };
    expect(isConfidentClassification(classification)).toBe(false);
  });

  it('should handle query_status with lower threshold', () => {
    const classification = {
      intent: 'query_status' as const,
      confidence: 0.6,
      entities: {},
      rawText: 'What status?',
    };
    expect(isConfidentClassification(classification)).toBe(true);
  });
});

// ============================================================================
// Intent Description Tests
// ============================================================================

describe('getIntentDescription', () => {
  it('should return description for report_completion', () => {
    expect(getIntentDescription('report_completion')).toBe('Report that work is complete');
  });

  it('should return description for request_decision', () => {
    expect(getIntentDescription('request_decision')).toBe('Request a decision or approval');
  });

  it('should return description for unknown', () => {
    expect(getIntentDescription('unknown')).toBe('Unknown request');
  });

  it('should return non-empty strings for all intents', () => {
    const intents = [
      'report_completion',
      'request_decision',
      'query_status',
      'approve_decision',
      'escalate_decision',
      'capture_evidence',
      'schedule_inspection',
      'unknown',
    ] as const;

    for (const intent of intents) {
      expect(getIntentDescription(intent).length).toBeGreaterThan(0);
    }
  });
});
