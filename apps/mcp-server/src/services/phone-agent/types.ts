/**
 * Phone Agent Service Types
 *
 * Type definitions for SMS/Voice phone agent service including
 * Twilio integration, conversation state machine, and message handling.
 *
 * @module phone-agent/types
 * @version 1.0.0
 */

// ============================================================================
// Authority & Role Types
// ============================================================================

/**
 * Authority levels for phone agent interactions (0-6)
 */
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Role definitions mapped to authority levels
 */
export const ROLE_AUTHORITY_MAP: Record<string, AuthorityLevel> = {
  'field_worker': 0,
  'foreman': 1,
  'superintendent': 2,
  'project_manager': 3,
  'architect': 4,
  'owner': 5,
  'inspector': 6,
} as const;

/**
 * Human-readable role names
 */
export const AUTHORITY_ROLE_NAMES: Record<AuthorityLevel, string> = {
  0: 'Field Worker',
  1: 'Foreman',
  2: 'Superintendent',
  3: 'Project Manager',
  4: 'Architect',
  5: 'Owner',
  6: 'Inspector',
} as const;

// ============================================================================
// Channel Types
// ============================================================================

/**
 * Communication channels supported by Phone Agent
 */
export type CommunicationChannel = 'sms' | 'voice' | 'teams' | 'slack' | 'email';

/**
 * Phone number types
 */
export type PhoneNumberType = 'sms' | 'voice' | 'both';

/**
 * Message direction
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Message delivery status
 */
export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'received'
  | 'read'
  | 'undelivered';

// ============================================================================
// Conversation State Machine
// ============================================================================

/**
 * Conversation state machine states
 */
export type ConversationState =
  | 'IDLE'
  | 'IDENTIFY_USER'
  | 'CLASSIFY_INTENT'
  | 'EXTRACT_ENTITIES'
  | 'COLLECT_DATA'
  | 'VALIDATE'
  | 'CONFIRM'
  | 'EXECUTE'
  | 'RESPOND'
  | 'ERROR'
  | 'ESCALATE';

/**
 * Valid state transitions
 */
export const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  IDLE: ['IDENTIFY_USER'],
  IDENTIFY_USER: ['CLASSIFY_INTENT', 'ERROR'],
  CLASSIFY_INTENT: ['EXTRACT_ENTITIES'],
  EXTRACT_ENTITIES: ['COLLECT_DATA', 'VALIDATE'],
  COLLECT_DATA: ['VALIDATE'],
  VALIDATE: ['CONFIRM', 'ESCALATE'],
  CONFIRM: ['EXECUTE', 'IDLE'],
  EXECUTE: ['RESPOND'],
  RESPOND: ['IDLE'],
  ERROR: ['IDLE'],
  ESCALATE: ['IDLE', 'RESPOND'],
} as const;

/**
 * State transition record
 */
export interface StateTransition {
  state: ConversationState;
  timestamp: string;
  transitionReason: string;
}

// ============================================================================
// Intent Types
// ============================================================================

/**
 * User intent types
 */
export type UserIntent =
  | 'report_completion'
  | 'request_decision'
  | 'query_status'
  | 'approve_decision'
  | 'escalate_decision'
  | 'capture_evidence'
  | 'schedule_inspection'
  | 'unknown';

/**
 * Intent classification result
 */
export interface IntentClassification {
  intent: UserIntent;
  confidence: number;
  entities: ExtractedEntities;
  rawText: string;
}

/**
 * Extracted entities from message
 */
export interface ExtractedEntities {
  voxelId?: string;
  zone?: string;
  trade?: string;
  amount?: number;
  date?: string;
  decisionId?: string;
  status?: string;
  description?: string;
}

// ============================================================================
// SMS Message Types
// ============================================================================

/**
 * SMS message structure
 */
export interface SmsMessage {
  messageId: string;
  $id?: string; // URN identifier
  sessionId?: string;
  direction: MessageDirection;
  phoneNumber: string; // E.164 format
  twilioNumber: string; // E.164 format
  body: string;
  mediaUrls?: string[];
  mediaContentTypes?: string[];
  numSegments?: number;
  status: MessageStatus;
  twilioData?: TwilioMessageData;
  parsedIntent?: IntentClassification;
  userId?: string;
  projectId?: string;
  tenantId?: string;
  timestamp: string;
  processedAt?: string;
}

/**
 * Twilio webhook message data
 */
export interface TwilioMessageData {
  messageSid: string;
  accountSid: string;
  from: string;
  to: string;
  fromCity?: string;
  fromState?: string;
  fromCountry?: string;
  body?: string;
  numMedia?: number;
  mediaContentType0?: string;
  mediaUrl0?: string;
}

/**
 * Outbound message request
 */
export interface SendMessageRequest {
  to: string; // E.164 format
  body: string;
  mediaUrl?: string;
  projectId?: string;
  tenantId?: string;
  sessionId?: string;
}

/**
 * Outbound message response
 */
export interface SendMessageResponse {
  messageId: string;
  status: MessageStatus;
  segments: number;
  sentAt: string;
}

// ============================================================================
// SMS Conversation Types
// ============================================================================

/**
 * SMS conversation session
 */
export interface SmsConversation {
  sessionId: string;
  $id?: string; // URN identifier
  phoneNumber: string; // E.164 format
  twilioNumber: string;
  userId?: string;
  projectId?: string;
  tenantId?: string;
  state: ConversationState;
  previousStates: StateTransition[];
  intent?: UserIntent;
  entities: ExtractedEntities;
  missingEntities: string[];
  authorityLevel?: AuthorityLevel;
  ragContext?: RagContext;
  pendingAction?: PendingAction;
  result?: ActionResult;
  messages: SmsMessage[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * RAG context for conversation
 */
export interface RagContext {
  recentDecisions?: string[];
  activeZone?: string;
  todaysTasks?: string[];
  contextId?: string;
  tokenCount?: number;
}

/**
 * Pending action awaiting confirmation
 */
export interface PendingAction {
  tool: string;
  input: ExtractedEntities;
  description: string;
}

/**
 * Result of executed action
 */
export interface ActionResult {
  success: boolean;
  createdUrns?: string[];
  error?: string;
}

// ============================================================================
// Phone Agent Configuration
// ============================================================================

/**
 * Phone number configuration
 */
export interface PhoneNumberConfig {
  number: string; // E.164 format
  type: PhoneNumberType;
  label?: string;
  forwardTo?: string;
}

/**
 * Authority mapping entry
 */
export interface AuthorityMapping {
  phoneNumber: string;
  userId: string;
  authorityLevel: AuthorityLevel;
  role: string;
}

/**
 * Response settings
 */
export interface ResponseSettings {
  maxResponseLength: number;
  multiSegmentAllowed: boolean;
  maxSegments: number;
  confirmationRequired: boolean;
  language: string;
}

/**
 * Timeout settings
 */
export interface TimeoutSettings {
  sessionTimeoutMinutes: number;
  confirmationTimeoutMinutes: number;
}

/**
 * Rate limits
 */
export interface RateLimits {
  messagesPerUserPerDay: number;
  messagesPerProjectPerDay: number;
}

/**
 * Escalation phone number
 */
export interface EscalationPhone {
  level: number;
  phoneNumber: string;
  name: string;
}

/**
 * Escalation configuration
 */
export interface EscalationConfig {
  enabled: boolean;
  escalationPhoneNumbers: EscalationPhone[];
  notifyOnEscalation: boolean;
}

/**
 * Phone agent project configuration
 */
export interface PhoneAgentConfig {
  configId: string;
  $id?: string;
  projectId: string;
  tenantId: string;
  phoneNumbers: PhoneNumberConfig[];
  channels: {
    sms: boolean;
    voice: boolean;
    teams: boolean;
    slack: boolean;
    email: boolean;
  };
  authorityMapping: AuthorityMapping[];
  responseSettings: ResponseSettings;
  timeoutSettings: TimeoutSettings;
  rateLimits: RateLimits;
  escalationConfig: EscalationConfig;
  integrations: {
    twilioAccountSid?: string;
    teamsWebhook?: string;
    slackWebhook?: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Voice Types
// ============================================================================

/**
 * Voice call status
 */
export type VoiceCallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no-answer'
  | 'canceled';

/**
 * Voice call record
 */
export interface VoiceCall {
  callSid: string;
  $id?: string;
  sessionId: string;
  from: string;
  to: string;
  status: VoiceCallStatus;
  direction: MessageDirection;
  duration?: number;
  recordingUrl?: string;
  transcription?: string;
  userId?: string;
  projectId?: string;
  tenantId?: string;
  startedAt: string;
  endedAt?: string;
}

/**
 * TwiML voice action
 */
export type TwimlAction =
  | 'say'
  | 'play'
  | 'gather'
  | 'record'
  | 'dial'
  | 'hangup'
  | 'pause'
  | 'redirect';

/**
 * TwiML response builder options
 */
export interface TwimlOptions {
  voice?: 'alice' | 'man' | 'woman' | 'Polly.Joanna' | 'Polly.Matthew';
  language?: string;
  loop?: number;
  timeout?: number;
  speechTimeout?: string;
  input?: 'speech' | 'dtmf' | 'speech dtmf';
  action?: string;
  method?: 'GET' | 'POST';
  hints?: string;
  profanityFilter?: boolean;
}

/**
 * Speech recognition result
 */
export interface SpeechRecognitionResult {
  confidence: number;
  transcript: string;
  isFinal: boolean;
  alternatives?: Array<{
    transcript: string;
    confidence: number;
  }>;
}

/**
 * Text-to-speech request
 */
export interface TtsRequest {
  text: string;
  voice?: string;
  language?: string;
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
}

/**
 * Text-to-speech response
 */
export interface TtsResponse {
  audioContent: Buffer;
  audioEncoding: 'mp3' | 'wav' | 'ogg' | 'mulaw';
  durationMs: number;
}

// ============================================================================
// Twilio Configuration
// ============================================================================

/**
 * Twilio configuration
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumbers: string[];
  webhookBaseUrl: string;
  statusCallbackUrl?: string;
}

/**
 * Default Twilio configuration
 */
export const DEFAULT_TWILIO_CONFIG: Partial<TwilioConfig> = {
  webhookBaseUrl: '/api/phone/v1/webhooks/twilio',
};

// ============================================================================
// Default Configuration Values
// ============================================================================

/**
 * Default response settings
 */
export const DEFAULT_RESPONSE_SETTINGS: ResponseSettings = {
  maxResponseLength: 160,
  multiSegmentAllowed: true,
  maxSegments: 3,
  confirmationRequired: true,
  language: 'en',
};

/**
 * Default timeout settings
 */
export const DEFAULT_TIMEOUT_SETTINGS: TimeoutSettings = {
  sessionTimeoutMinutes: 30,
  confirmationTimeoutMinutes: 5,
};

/**
 * Default rate limits
 */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  messagesPerUserPerDay: 100,
  messagesPerProjectPerDay: 1000,
};

/**
 * SMS segment size
 */
export const SMS_SEGMENT_SIZE = 160;

/**
 * SMS unicode segment size (when using special characters)
 */
export const SMS_UNICODE_SEGMENT_SIZE = 70;

/**
 * Maximum media attachments per MMS
 */
export const MAX_MMS_MEDIA = 10;

// ============================================================================
// URN Builders
// ============================================================================

/**
 * Build SMS message URN
 */
export function buildSmsMessageUrn(tenantId: string, messageId: string): string {
  return `urn:luhtech:${tenantId}:sms-message:${messageId}`;
}

/**
 * Build SMS session URN
 */
export function buildSmsSessionUrn(tenantId: string, sessionId: string): string {
  return `urn:luhtech:${tenantId}:sms-session:${sessionId}`;
}

/**
 * Build phone config URN
 */
export function buildPhoneConfigUrn(tenantId: string, configId: string): string {
  return `urn:luhtech:${tenantId}:phone-config:${configId}`;
}

/**
 * Build voice call URN
 */
export function buildVoiceCallUrn(tenantId: string, callSid: string): string {
  return `urn:luhtech:${tenantId}:voice-call:${callSid}`;
}

// ============================================================================
// Phone Number Utilities
// ============================================================================

/**
 * E.164 phone number regex
 */
export const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Validate E.164 phone number format
 */
export function isValidE164(phoneNumber: string): boolean {
  return E164_REGEX.test(phoneNumber);
}

/**
 * Format phone number to E.164
 */
export function formatToE164(phoneNumber: string, defaultCountry: string = '1'): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // If already has country code (starts with country code)
  if (digits.length >= 11 && digits.startsWith(defaultCountry)) {
    return `+${digits}`;
  }

  // If 10 digits (US/Canada format), add country code
  if (digits.length === 10) {
    return `+${defaultCountry}${digits}`;
  }

  // If 11 digits starting with 1, format directly
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Return as-is with + prefix if has country code
  if (digits.length > 10) {
    return `+${digits}`;
  }

  throw new Error(`Invalid phone number format: ${phoneNumber}`);
}

/**
 * Mask phone number for display (show last 4 digits)
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length < 4) {return phoneNumber;}
  return `***-***-${phoneNumber.slice(-4)}`;
}

// ============================================================================
// Message Formatting Utilities
// ============================================================================

/**
 * Calculate number of SMS segments for a message
 */
export function calculateSmsSegments(message: string): number {
  // Check if message contains unicode characters
  const hasUnicode = /[^\x00-\x7F]/.test(message);
  const segmentSize = hasUnicode ? SMS_UNICODE_SEGMENT_SIZE : SMS_SEGMENT_SIZE;

  return Math.ceil(message.length / segmentSize);
}

/**
 * Split message into SMS segments
 */
export function splitIntoSegments(
  message: string,
  maxSegments: number = 3
): string[] {
  const hasUnicode = /[^\x00-\x7F]/.test(message);
  const segmentSize = hasUnicode ? SMS_UNICODE_SEGMENT_SIZE : SMS_SEGMENT_SIZE;

  const segments: string[] = [];
  let remaining = message;

  while (remaining.length > 0 && segments.length < maxSegments) {
    if (remaining.length <= segmentSize) {
      segments.push(remaining);
      break;
    }

    // Try to break at a word boundary
    let breakPoint = segmentSize;
    const lastSpace = remaining.lastIndexOf(' ', segmentSize);
    if (lastSpace > segmentSize * 0.7) {
      breakPoint = lastSpace;
    }

    segments.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  // If message was truncated, add indicator to last segment
  if (remaining.length > 0 && segments.length === maxSegments) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment.length > segmentSize - 3) {
      segments[segments.length - 1] = `${lastSegment.slice(0, -3) }...`;
    } else {
      segments[segments.length - 1] = `${lastSegment }...`;
    }
  }

  return segments;
}

/**
 * Format response for SMS (160-char aware)
 */
export function formatSmsResponse(
  response: string,
  settings: ResponseSettings = DEFAULT_RESPONSE_SETTINGS
): string[] {
  if (!settings.multiSegmentAllowed) {
    // Truncate to single segment
    if (response.length > settings.maxResponseLength) {
      return [`${response.slice(0, settings.maxResponseLength - 3) }...`];
    }
    return [response];
  }

  return splitIntoSegments(response, settings.maxSegments);
}

// ============================================================================
// Service Status Types
// ============================================================================

/**
 * Phone agent service status
 */
export interface PhoneAgentStatus {
  status: 'operational' | 'degraded' | 'unavailable';
  twilio: {
    connected: boolean;
    accountSid?: string;
    phoneNumbers: string[];
  };
  sms: {
    enabled: boolean;
    messagesProcessed24h: number;
  };
  voice: {
    enabled: boolean;
    callsProcessed24h: number;
  };
  conversations: {
    active: number;
    totalToday: number;
  };
  lastHealthCheck: string;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  healthy: boolean;
  twilio: boolean;
  redis: boolean;
  database: boolean;
}
