/**
 * Phone Agent Types Unit Tests
 *
 * Tests for type utilities, phone formatting, and SMS segmentation.
 *
 * @module tests/unit/phone-agent/types.test
 */

import { describe, it, expect } from 'vitest';
import {
  ROLE_AUTHORITY_MAP,
  AUTHORITY_ROLE_NAMES,
  STATE_TRANSITIONS,
  DEFAULT_RESPONSE_SETTINGS,
  DEFAULT_TIMEOUT_SETTINGS,
  DEFAULT_RATE_LIMITS,
  SMS_SEGMENT_SIZE,
  SMS_UNICODE_SEGMENT_SIZE,
  E164_REGEX,
  isValidE164,
  formatToE164,
  maskPhoneNumber,
  calculateSmsSegments,
  splitIntoSegments,
  formatSmsResponse,
  buildSmsMessageUrn,
  buildSmsSessionUrn,
  buildPhoneConfigUrn,
  buildVoiceCallUrn,
} from '../../../services/phone-agent/types.js';

// ============================================================================
// Authority Mapping Tests
// ============================================================================

describe('ROLE_AUTHORITY_MAP', () => {
  it('should have 7 role mappings', () => {
    expect(Object.keys(ROLE_AUTHORITY_MAP)).toHaveLength(7);
  });

  it('should map field_worker to level 0', () => {
    expect(ROLE_AUTHORITY_MAP.field_worker).toBe(0);
  });

  it('should map project_manager to level 3', () => {
    expect(ROLE_AUTHORITY_MAP.project_manager).toBe(3);
  });

  it('should map inspector to level 6', () => {
    expect(ROLE_AUTHORITY_MAP.inspector).toBe(6);
  });
});

describe('AUTHORITY_ROLE_NAMES', () => {
  it('should have names for all 7 levels', () => {
    expect(Object.keys(AUTHORITY_ROLE_NAMES)).toHaveLength(7);
  });

  it('should have correct name for level 0', () => {
    expect(AUTHORITY_ROLE_NAMES[0]).toBe('Field Worker');
  });

  it('should have correct name for level 3', () => {
    expect(AUTHORITY_ROLE_NAMES[3]).toBe('Project Manager');
  });

  it('should have correct name for level 6', () => {
    expect(AUTHORITY_ROLE_NAMES[6]).toBe('Inspector');
  });
});

// ============================================================================
// State Transitions Tests
// ============================================================================

describe('STATE_TRANSITIONS', () => {
  it('should have transitions from IDLE', () => {
    expect(STATE_TRANSITIONS.IDLE).toContain('IDENTIFY_USER');
  });

  it('should have transitions from IDENTIFY_USER', () => {
    expect(STATE_TRANSITIONS.IDENTIFY_USER).toContain('CLASSIFY_INTENT');
    expect(STATE_TRANSITIONS.IDENTIFY_USER).toContain('ERROR');
  });

  it('should have transitions from CONFIRM to EXECUTE or IDLE', () => {
    expect(STATE_TRANSITIONS.CONFIRM).toContain('EXECUTE');
    expect(STATE_TRANSITIONS.CONFIRM).toContain('IDLE');
  });

  it('should have transitions from RESPOND back to IDLE', () => {
    expect(STATE_TRANSITIONS.RESPOND).toContain('IDLE');
  });

  it('should cover all states', () => {
    const states = [
      'IDLE', 'IDENTIFY_USER', 'CLASSIFY_INTENT', 'EXTRACT_ENTITIES',
      'COLLECT_DATA', 'VALIDATE', 'CONFIRM', 'EXECUTE', 'RESPOND',
      'ERROR', 'ESCALATE',
    ];
    for (const state of states) {
      expect(STATE_TRANSITIONS[state as keyof typeof STATE_TRANSITIONS]).toBeDefined();
    }
  });
});

// ============================================================================
// Default Settings Tests
// ============================================================================

describe('DEFAULT_RESPONSE_SETTINGS', () => {
  it('should have maxResponseLength of 160', () => {
    expect(DEFAULT_RESPONSE_SETTINGS.maxResponseLength).toBe(160);
  });

  it('should allow multi-segment by default', () => {
    expect(DEFAULT_RESPONSE_SETTINGS.multiSegmentAllowed).toBe(true);
  });

  it('should have maxSegments of 3', () => {
    expect(DEFAULT_RESPONSE_SETTINGS.maxSegments).toBe(3);
  });

  it('should require confirmation by default', () => {
    expect(DEFAULT_RESPONSE_SETTINGS.confirmationRequired).toBe(true);
  });

  it('should default to English', () => {
    expect(DEFAULT_RESPONSE_SETTINGS.language).toBe('en');
  });
});

describe('DEFAULT_TIMEOUT_SETTINGS', () => {
  it('should have 30 minute session timeout', () => {
    expect(DEFAULT_TIMEOUT_SETTINGS.sessionTimeoutMinutes).toBe(30);
  });

  it('should have 5 minute confirmation timeout', () => {
    expect(DEFAULT_TIMEOUT_SETTINGS.confirmationTimeoutMinutes).toBe(5);
  });
});

describe('DEFAULT_RATE_LIMITS', () => {
  it('should have 100 messages per user per day', () => {
    expect(DEFAULT_RATE_LIMITS.messagesPerUserPerDay).toBe(100);
  });

  it('should have 1000 messages per project per day', () => {
    expect(DEFAULT_RATE_LIMITS.messagesPerProjectPerDay).toBe(1000);
  });
});

// ============================================================================
// SMS Segment Constants Tests
// ============================================================================

describe('SMS Segment Constants', () => {
  it('should have SMS_SEGMENT_SIZE of 160', () => {
    expect(SMS_SEGMENT_SIZE).toBe(160);
  });

  it('should have SMS_UNICODE_SEGMENT_SIZE of 70', () => {
    expect(SMS_UNICODE_SEGMENT_SIZE).toBe(70);
  });
});

// ============================================================================
// E.164 Validation Tests
// ============================================================================

describe('E164_REGEX', () => {
  it('should match valid E.164 numbers', () => {
    expect(E164_REGEX.test('+14155551234')).toBe(true);
    expect(E164_REGEX.test('+442071234567')).toBe(true);
    expect(E164_REGEX.test('+8613912345678')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(E164_REGEX.test('4155551234')).toBe(false);
    expect(E164_REGEX.test('(415) 555-1234')).toBe(false);
    expect(E164_REGEX.test('+0123456789')).toBe(false);
  });
});

describe('isValidE164', () => {
  it('should return true for valid E.164 numbers', () => {
    expect(isValidE164('+14155551234')).toBe(true);
    expect(isValidE164('+12025551234')).toBe(true);
  });

  it('should return false for invalid numbers', () => {
    expect(isValidE164('4155551234')).toBe(false);
    expect(isValidE164('+1-415-555-1234')).toBe(false);
  });
});

describe('formatToE164', () => {
  it('should format 10-digit US numbers', () => {
    expect(formatToE164('4155551234')).toBe('+14155551234');
    expect(formatToE164('2025551234')).toBe('+12025551234');
  });

  it('should handle 11-digit numbers starting with 1', () => {
    expect(formatToE164('14155551234')).toBe('+14155551234');
  });

  it('should strip formatting characters', () => {
    expect(formatToE164('(415) 555-1234')).toBe('+14155551234');
    expect(formatToE164('415.555.1234')).toBe('+14155551234');
  });

  it('should throw for invalid numbers', () => {
    expect(() => formatToE164('123')).toThrow();
    expect(() => formatToE164('abc')).toThrow();
  });
});

describe('maskPhoneNumber', () => {
  it('should mask all but last 4 digits', () => {
    expect(maskPhoneNumber('+14155551234')).toBe('***-***-1234');
  });

  it('should handle short numbers', () => {
    expect(maskPhoneNumber('123')).toBe('123');
  });
});

// ============================================================================
// SMS Segmentation Tests
// ============================================================================

describe('calculateSmsSegments', () => {
  it('should return 1 for short messages', () => {
    expect(calculateSmsSegments('Hello')).toBe(1);
    expect(calculateSmsSegments('A'.repeat(160))).toBe(1);
  });

  it('should return 2 for messages over 160 chars', () => {
    expect(calculateSmsSegments('A'.repeat(161))).toBe(2);
    expect(calculateSmsSegments('A'.repeat(320))).toBe(2);
  });

  it('should use smaller segment size for unicode', () => {
    // 70 chars + emoji = 2 segments (unicode uses 70 char segments)
    expect(calculateSmsSegments('Hello 😀 '.repeat(10))).toBeGreaterThanOrEqual(2);
  });
});

describe('splitIntoSegments', () => {
  it('should return single segment for short message', () => {
    const segments = splitIntoSegments('Hello world');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe('Hello world');
  });

  it('should split long messages', () => {
    const longMessage = 'This is a test message. '.repeat(20);
    const segments = splitIntoSegments(longMessage, 3);
    expect(segments.length).toBeLessThanOrEqual(3);
  });

  it('should try to break at word boundaries', () => {
    const message = 'word '.repeat(40);
    const segments = splitIntoSegments(message);
    // Each segment should not break mid-word
    for (const segment of segments) {
      expect(segment.endsWith('word') || segment.endsWith('word...')).toBe(true);
    }
  });

  it('should add ellipsis when truncating', () => {
    const longMessage = 'A'.repeat(600);
    const segments = splitIntoSegments(longMessage, 2);
    expect(segments[segments.length - 1]).toContain('...');
  });
});

describe('formatSmsResponse', () => {
  it('should truncate single-segment responses', () => {
    const settings = { ...DEFAULT_RESPONSE_SETTINGS, multiSegmentAllowed: false };
    const response = formatSmsResponse('A'.repeat(200), settings);
    expect(response).toHaveLength(1);
    expect(response[0].length).toBeLessThanOrEqual(160);
  });

  it('should split multi-segment responses', () => {
    const longMessage = 'This is a test. '.repeat(30);
    const response = formatSmsResponse(longMessage);
    expect(response.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// URN Builder Tests
// ============================================================================

describe('buildSmsMessageUrn', () => {
  it('should build correct URN', () => {
    const urn = buildSmsMessageUrn('tenant-123', 'msg-456');
    expect(urn).toBe('urn:luhtech:tenant-123:sms-message:msg-456');
  });
});

describe('buildSmsSessionUrn', () => {
  it('should build correct URN', () => {
    const urn = buildSmsSessionUrn('tenant-123', 'session-456');
    expect(urn).toBe('urn:luhtech:tenant-123:sms-session:session-456');
  });
});

describe('buildPhoneConfigUrn', () => {
  it('should build correct URN', () => {
    const urn = buildPhoneConfigUrn('tenant-123', 'config-789');
    expect(urn).toBe('urn:luhtech:tenant-123:phone-config:config-789');
  });
});

describe('buildVoiceCallUrn', () => {
  it('should build correct URN', () => {
    const urn = buildVoiceCallUrn('tenant-123', 'call-abc');
    expect(urn).toBe('urn:luhtech:tenant-123:voice-call:call-abc');
  });
});
