/**
 * Conversation State Machine
 *
 * Multi-turn conversation state management for SMS/Voice interactions.
 * Implements the SEPPA phone agent conversation flow.
 *
 * @module phone-agent/conversation-state-machine
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  STATE_TRANSITIONS,
  buildSmsSessionUrn,
  DEFAULT_TIMEOUT_SETTINGS,
  type ConversationState,
  type StateTransition,
  type SmsConversation,
  type SmsMessage,
  type ExtractedEntities,
  type UserIntent,
  type AuthorityLevel,
  type RagContext,
  type PendingAction,
  type ActionResult,
} from './types.js';

// ============================================================================
// Redis-backed Storage (when available)
// ============================================================================

const SESSION_PREFIX = 'phone:session:';
const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes

// In-memory fallback storage
const memoryStore = new Map<string, SmsConversation>();

// Optional Redis client (imported dynamically if available)
let redisClient: {
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, ttl: number, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
  keys: (pattern: string) => Promise<string[]>;
} | null = null;

/**
 * Initialize Redis client for session storage
 */
export async function initializeSessionStore(client: typeof redisClient): Promise<void> {
  redisClient = client;
  console.log('[State Machine] Session store initialized with Redis');
}

/**
 * Check if using Redis storage
 */
export function isUsingRedis(): boolean {
  return redisClient !== null;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new conversation session
 */
export async function createSession(
  phoneNumber: string,
  twilioNumber: string,
  tenantId?: string
): Promise<SmsConversation> {
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  const session: SmsConversation = {
    sessionId,
    $id: tenantId ? buildSmsSessionUrn(tenantId, sessionId) : undefined,
    phoneNumber,
    twilioNumber,
    tenantId,
    state: 'IDLE',
    previousStates: [],
    entities: {},
    missingEntities: [],
    messages: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await saveSession(session);
  return session;
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<SmsConversation | null> {
  if (redisClient) {
    const data = await redisClient.get(`${SESSION_PREFIX}${sessionId}`);
    if (!data) {return null;}

    const session = JSON.parse(data) as SmsConversation;

    // Check if session has expired
    if (new Date(session.expiresAt) < new Date()) {
      await deleteSession(sessionId);
      return null;
    }

    return session;
  }

  const session = memoryStore.get(sessionId);
  if (!session) {return null;}

  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    memoryStore.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Get or create session for a phone number
 */
export async function getOrCreateSession(
  phoneNumber: string,
  twilioNumber: string,
  tenantId?: string
): Promise<SmsConversation> {
  // Try to find existing active session for this phone number
  const existingSession = await findActiveSessionByPhone(phoneNumber, twilioNumber);
  if (existingSession) {
    return existingSession;
  }

  // Create new session
  return createSession(phoneNumber, twilioNumber, tenantId);
}

/**
 * Find active session by phone number
 */
export async function findActiveSessionByPhone(
  phoneNumber: string,
  twilioNumber: string
): Promise<SmsConversation | null> {
  if (redisClient) {
    // In Redis, we'd need a secondary index or scan
    // For now, use phone number as key prefix for lookup
    const keys = await redisClient.keys(`${SESSION_PREFIX}*`);
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const session = JSON.parse(data) as SmsConversation;
        if (
          session.phoneNumber === phoneNumber &&
          session.twilioNumber === twilioNumber &&
          new Date(session.expiresAt) > new Date()
        ) {
          return session;
        }
      }
    }
    return null;
  }

  // In-memory search
  for (const session of memoryStore.values()) {
    if (
      session.phoneNumber === phoneNumber &&
      session.twilioNumber === twilioNumber &&
      new Date(session.expiresAt) > new Date()
    ) {
      return session;
    }
  }

  return null;
}

/**
 * Save session
 */
export async function saveSession(session: SmsConversation): Promise<void> {
  session.updatedAt = new Date().toISOString();

  if (redisClient) {
    const ttl = Math.max(
      1,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
    );
    await redisClient.setEx(
      `${SESSION_PREFIX}${session.sessionId}`,
      ttl,
      JSON.stringify(session)
    );
  } else {
    memoryStore.set(session.sessionId, session);
  }
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (redisClient) {
    await redisClient.del(`${SESSION_PREFIX}${sessionId}`);
  } else {
    memoryStore.delete(sessionId);
  }
}

/**
 * Extend session expiration
 */
export async function extendSession(
  sessionId: string,
  additionalMinutes: number = 30
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {return;}

  const newExpiry = new Date(
    Math.max(
      new Date(session.expiresAt).getTime(),
      Date.now() + additionalMinutes * 60 * 1000
    )
  );

  session.expiresAt = newExpiry.toISOString();
  await saveSession(session);
}

// ============================================================================
// State Transitions
// ============================================================================

/**
 * Check if state transition is valid
 */
export function isValidTransition(
  fromState: ConversationState,
  toState: ConversationState
): boolean {
  const validTargets = STATE_TRANSITIONS[fromState];
  return validTargets.includes(toState);
}

/**
 * Transition session to new state
 */
export async function transitionState(
  sessionId: string,
  newState: ConversationState,
  reason: string
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Validate transition
  if (!isValidTransition(session.state, newState)) {
    throw new Error(
      `Invalid state transition: ${session.state} -> ${newState}`
    );
  }

  // Record previous state
  const transition: StateTransition = {
    state: session.state,
    timestamp: new Date().toISOString(),
    transitionReason: reason,
  };

  session.previousStates.push(transition);
  session.state = newState;

  // Extend session on activity
  session.expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000
  ).toISOString();

  await saveSession(session);
  return session;
}

/**
 * Force transition (bypasses validation, for error recovery)
 */
export async function forceTransition(
  sessionId: string,
  newState: ConversationState,
  reason: string
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const transition: StateTransition = {
    state: session.state,
    timestamp: new Date().toISOString(),
    transitionReason: `FORCED: ${reason}`,
  };

  session.previousStates.push(transition);
  session.state = newState;

  await saveSession(session);
  return session;
}

// ============================================================================
// Session Updates
// ============================================================================

/**
 * Update session user identity
 */
export async function updateSessionIdentity(
  sessionId: string,
  userId: string,
  projectId: string,
  authorityLevel: AuthorityLevel
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.userId = userId;
  session.projectId = projectId;
  session.authorityLevel = authorityLevel;

  await saveSession(session);
  return session;
}

/**
 * Update session intent
 */
export async function updateSessionIntent(
  sessionId: string,
  intent: UserIntent
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.intent = intent;

  await saveSession(session);
  return session;
}

/**
 * Update session entities
 */
export async function updateSessionEntities(
  sessionId: string,
  entities: Partial<ExtractedEntities>,
  missingEntities?: string[]
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.entities = {
    ...session.entities,
    ...entities,
  };

  if (missingEntities !== undefined) {
    session.missingEntities = missingEntities;
  }

  await saveSession(session);
  return session;
}

/**
 * Update RAG context
 */
export async function updateSessionRagContext(
  sessionId: string,
  ragContext: RagContext
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.ragContext = ragContext;

  await saveSession(session);
  return session;
}

/**
 * Set pending action
 */
export async function setPendingAction(
  sessionId: string,
  action: PendingAction
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.pendingAction = action;

  await saveSession(session);
  return session;
}

/**
 * Clear pending action
 */
export async function clearPendingAction(
  sessionId: string
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.pendingAction = undefined;

  await saveSession(session);
  return session;
}

/**
 * Set action result
 */
export async function setActionResult(
  sessionId: string,
  result: ActionResult
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.result = result;
  session.pendingAction = undefined;

  await saveSession(session);
  return session;
}

/**
 * Add message to session
 */
export async function addMessageToSession(
  sessionId: string,
  message: SmsMessage
): Promise<SmsConversation> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.messages.push(message);

  // Extend session on new message
  session.expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000
  ).toISOString();

  await saveSession(session);
  return session;
}

// ============================================================================
// State Machine Logic
// ============================================================================

/**
 * Process inbound message and determine next state
 */
export async function processInboundMessage(
  session: SmsConversation,
  message: SmsMessage
): Promise<{
  nextState: ConversationState;
  reason: string;
}> {
  const currentState = session.state;

  switch (currentState) {
    case 'IDLE':
      // New conversation starts with user identification
      return {
        nextState: 'IDENTIFY_USER',
        reason: 'New inbound message received',
      };

    case 'IDENTIFY_USER':
      if (session.userId) {
        return {
          nextState: 'CLASSIFY_INTENT',
          reason: 'User identified successfully',
        };
      }
      return {
        nextState: 'ERROR',
        reason: 'Failed to identify user from phone number',
      };

    case 'CLASSIFY_INTENT':
      if (session.intent && session.intent !== 'unknown') {
        return {
          nextState: 'EXTRACT_ENTITIES',
          reason: `Intent classified: ${session.intent}`,
        };
      }
      // If intent unknown, still try to extract entities
      return {
        nextState: 'EXTRACT_ENTITIES',
        reason: 'Proceeding to entity extraction',
      };

    case 'EXTRACT_ENTITIES':
      if (session.missingEntities.length > 0) {
        return {
          nextState: 'COLLECT_DATA',
          reason: `Missing entities: ${session.missingEntities.join(', ')}`,
        };
      }
      return {
        nextState: 'VALIDATE',
        reason: 'All entities extracted',
      };

    case 'COLLECT_DATA':
      // Check if we now have all required entities
      if (session.missingEntities.length === 0) {
        return {
          nextState: 'VALIDATE',
          reason: 'All required data collected',
        };
      }
      // Stay in COLLECT_DATA if still missing
      return {
        nextState: 'COLLECT_DATA',
        reason: `Still missing: ${session.missingEntities.join(', ')}`,
      };

    case 'VALIDATE':
      // Check authority level for action
      if (session.pendingAction) {
        return {
          nextState: 'CONFIRM',
          reason: 'Action prepared, awaiting confirmation',
        };
      }
      return {
        nextState: 'ESCALATE',
        reason: 'Validation failed or escalation required',
      };

    case 'CONFIRM':
      const confirmText = message.body.toLowerCase().trim();
      if (
        confirmText === 'yes' ||
        confirmText === 'y' ||
        confirmText === 'confirm' ||
        confirmText === 'ok'
      ) {
        return {
          nextState: 'EXECUTE',
          reason: 'User confirmed action',
        };
      }
      if (
        confirmText === 'no' ||
        confirmText === 'n' ||
        confirmText === 'cancel'
      ) {
        return {
          nextState: 'IDLE',
          reason: 'User cancelled action',
        };
      }
      // Didn't understand confirmation response
      return {
        nextState: 'CONFIRM',
        reason: 'Awaiting clear confirmation (yes/no)',
      };

    case 'EXECUTE':
      return {
        nextState: 'RESPOND',
        reason: 'Action executed',
      };

    case 'RESPOND':
      return {
        nextState: 'IDLE',
        reason: 'Response sent, session idle',
      };

    case 'ERROR':
      return {
        nextState: 'IDLE',
        reason: 'Error handled, returning to idle',
      };

    case 'ESCALATE':
      return {
        nextState: 'IDLE',
        reason: 'Escalation initiated',
      };

    default:
      return {
        nextState: 'IDLE',
        reason: 'Unknown state, resetting to idle',
      };
  }
}

/**
 * Get required entities for an intent
 */
export function getRequiredEntitiesForIntent(intent: UserIntent): string[] {
  const requirements: Record<UserIntent, string[]> = {
    report_completion: ['voxelId', 'status'],
    request_decision: ['description'],
    query_status: [], // No required entities
    approve_decision: ['decisionId'],
    escalate_decision: ['decisionId', 'description'],
    capture_evidence: ['voxelId'],
    schedule_inspection: ['date'],
    unknown: [],
  };

  return requirements[intent] || [];
}

/**
 * Calculate missing entities
 */
export function calculateMissingEntities(
  intent: UserIntent,
  entities: ExtractedEntities
): string[] {
  const required = getRequiredEntitiesForIntent(intent);
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in entities) || entities[field as keyof ExtractedEntities] === undefined) {
      missing.push(field);
    }
  }

  return missing;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get active session count
 */
export async function getActiveSessionCount(): Promise<number> {
  if (redisClient) {
    const keys = await redisClient.keys(`${SESSION_PREFIX}*`);
    return keys.length;
  }

  // Clean expired sessions and count
  const now = new Date();
  let count = 0;
  for (const [key, session] of memoryStore) {
    if (new Date(session.expiresAt) > now) {
      count++;
    } else {
      memoryStore.delete(key);
    }
  }
  return count;
}

/**
 * Get session statistics
 */
export async function getSessionStats(): Promise<{
  activeSessions: number;
  byState: Record<ConversationState, number>;
}> {
  const byState: Record<ConversationState, number> = {
    IDLE: 0,
    IDENTIFY_USER: 0,
    CLASSIFY_INTENT: 0,
    EXTRACT_ENTITIES: 0,
    COLLECT_DATA: 0,
    VALIDATE: 0,
    CONFIRM: 0,
    EXECUTE: 0,
    RESPOND: 0,
    ERROR: 0,
    ESCALATE: 0,
  };

  const now = new Date();
  let activeSessions = 0;

  if (redisClient) {
    const keys = await redisClient.keys(`${SESSION_PREFIX}*`);
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const session = JSON.parse(data) as SmsConversation;
        if (new Date(session.expiresAt) > now) {
          activeSessions++;
          byState[session.state]++;
        }
      }
    }
  } else {
    for (const session of memoryStore.values()) {
      if (new Date(session.expiresAt) > now) {
        activeSessions++;
        byState[session.state]++;
      }
    }
  }

  return { activeSessions, byState };
}
