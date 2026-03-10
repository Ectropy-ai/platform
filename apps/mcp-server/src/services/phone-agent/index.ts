/**
 * Phone Agent Service Exports
 *
 * Central export point for all phone agent service components.
 *
 * @module phone-agent
 * @version 1.0.0
 */

// Main service
export {
  initializePhoneAgentService,
  isPhoneAgentInitialized,
  handleInboundSms,
  handleInboundVoiceCall,
  handleVoiceGather,
  handleVoiceCallEnd,
  getPhoneAgentStatus,
  healthCheck,
  sendSms,
  sendSmsFrom,
  getSession,
  createSession,
  getActiveSessionCount,
} from './phone-agent.service.js';

// Types
export type {
  AuthorityLevel,
  CommunicationChannel,
  PhoneNumberType,
  MessageDirection,
  MessageStatus,
  ConversationState,
  StateTransition,
  UserIntent,
  IntentClassification,
  ExtractedEntities,
  SmsMessage,
  TwilioMessageData,
  SendMessageRequest,
  SendMessageResponse,
  SmsConversation,
  RagContext,
  PendingAction,
  ActionResult,
  PhoneNumberConfig,
  AuthorityMapping,
  ResponseSettings,
  TimeoutSettings,
  RateLimits,
  EscalationPhone,
  EscalationConfig,
  PhoneAgentConfig,
  VoiceCallStatus,
  VoiceCall,
  TwimlAction,
  TwimlOptions,
  SpeechRecognitionResult,
  TtsRequest,
  TtsResponse,
  TwilioConfig,
  PhoneAgentStatus,
  HealthCheckResponse,
} from './types.js';

// Type constants and utilities
export {
  ROLE_AUTHORITY_MAP,
  AUTHORITY_ROLE_NAMES,
  STATE_TRANSITIONS,
  DEFAULT_RESPONSE_SETTINGS,
  DEFAULT_TIMEOUT_SETTINGS,
  DEFAULT_RATE_LIMITS,
  DEFAULT_TWILIO_CONFIG,
  SMS_SEGMENT_SIZE,
  SMS_UNICODE_SEGMENT_SIZE,
  MAX_MMS_MEDIA,
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
} from './types.js';

// Twilio client
export {
  isTwilioConfigured,
  getTwilioConfig,
  isOwnedPhoneNumber,
  validateTwilioSignature,
  parseWebhookParams,
  getMessageStatus,
  initiateCall,
  getCallStatus,
  endCall,
  generateTwiml,
  generateConversationTwiml,
  generateWelcomeTwiml,
  checkTwilioHealth,
} from './twilio-client.js';

// Conversation state machine
export {
  initializeSessionStore,
  isUsingRedis,
  getOrCreateSession,
  saveSession,
  deleteSession,
  extendSession,
  findActiveSessionByPhone,
  isValidTransition,
  transitionState,
  forceTransition,
  updateSessionIdentity,
  updateSessionIntent,
  updateSessionEntities,
  updateSessionRagContext,
  setPendingAction,
  clearPendingAction,
  setActionResult,
  addMessageToSession,
  processInboundMessage,
  getRequiredEntitiesForIntent,
  calculateMissingEntities,
  getSessionStats,
} from './conversation-state-machine.js';

// Intent classifier
export {
  isClassifierConfigured,
  classifyIntent,
  classifyIntentRuleBased,
  extractEntitiesRuleBased,
  INTENT_CONFIDENCE_THRESHOLDS,
  isConfidentClassification,
  getIntentDescription,
  enhanceEntitiesWithContext,
  validateEntities,
} from './intent-classifier.js';

// User resolver
export {
  resolveUserFromPhone,
  resolveUserForProject,
  getAuthorityLevel,
  hasMinimumAuthority,
  getEscalationTargets,
  lookupProjectByTwilioNumber,
  validateTwilioNumberForProject,
  registerPhoneNumber,
  unregisterPhoneNumber,
  importAuthorityMappings,
  exportAuthorityMappings,
  clearUserCache,
  clearAllUserCache,
} from './user-resolver.js';

// Voice processor
export {
  createVoiceSession,
  getVoiceSession,
  updateVoiceSession,
  addTranscript,
  endVoiceSession,
  parseTwilioSpeechResult,
  generateSpeechGatherTwiml,
  generateDtmfGatherTwiml,
  generateHybridGatherTwiml,
  POLLY_VOICES,
  generateSayTwiml,
  generatePlayTwiml,
  formatForSpeech,
  generateSsml,
  generateWelcomeGreeting,
  generateHelpMenu,
  generateConfirmationPrompt,
  generateTransferTwiml,
  generateGoodbyeTwiml,
  generateErrorTwiml,
  generateIntentResponse,
  calculateCallDuration,
  getVoiceSessionStats,
  parseDtmfInput,
  mapDtmfToOption,
} from './voice-processor.js';

// Re-export resolver types
export type {
  ResolvedUser,
  ResolvedProject,
  UserResolutionResult,
} from './user-resolver.js';
