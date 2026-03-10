/**
 * Intent Classification Service
 *
 * AI-powered intent classification and entity extraction for SMS/Voice messages.
 * Uses Claude to understand user requests in the construction context.
 *
 * @module phone-agent/intent-classifier
 * @version 1.0.0
 */

import {
  AUTHORITY_ROLE_NAMES,
  type UserIntent,
  type IntentClassification,
  type ExtractedEntities,
  type AuthorityLevel,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLASSIFICATION_MODEL = 'claude-3-5-haiku-20241022';

/**
 * Check if classifier is configured
 */
export function isClassifierConfigured(): boolean {
  return !!ANTHROPIC_API_KEY;
}

// ============================================================================
// Intent Classification
// ============================================================================

/**
 * Classify user intent from message
 */
export async function classifyIntent(
  messageText: string,
  context?: {
    userId?: string;
    projectId?: string;
    authorityLevel?: AuthorityLevel;
    previousIntent?: UserIntent;
    conversationHistory?: string[];
  }
): Promise<IntentClassification> {
  if (!isClassifierConfigured()) {
    // Fallback to rule-based classification
    return classifyIntentRuleBased(messageText);
  }

  try {
    const prompt = buildClassificationPrompt(messageText, context);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLASSIFICATION_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[Intent Classifier] API error:', response.status);
      return classifyIntentRuleBased(messageText);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return classifyIntentRuleBased(messageText);
    }

    return parseClassificationResponse(content, messageText);
  } catch (error) {
    console.error('[Intent Classifier] Error:', error);
    return classifyIntentRuleBased(messageText);
  }
}

/**
 * Build classification prompt
 */
function buildClassificationPrompt(
  messageText: string,
  context?: {
    userId?: string;
    projectId?: string;
    authorityLevel?: AuthorityLevel;
    previousIntent?: UserIntent;
    conversationHistory?: string[];
  }
): string {
  const roleName = context?.authorityLevel !== undefined
    ? AUTHORITY_ROLE_NAMES[context.authorityLevel]
    : 'Unknown';

  let conversationContext = '';
  if (context?.conversationHistory && context.conversationHistory.length > 0) {
    conversationContext = `\n\nRecent conversation:\n${context.conversationHistory.slice(-3).join('\n')}`;
  }

  return `You are an intent classifier for a construction project management SMS system. Classify the following message from a ${roleName}.

MESSAGE: "${messageText}"
${conversationContext}

Classify into ONE of these intents:
- report_completion: User is reporting that work/task is complete
- request_decision: User needs a decision or approval from someone
- query_status: User is asking about status of something
- approve_decision: User is approving a pending decision
- escalate_decision: User wants to escalate to higher authority
- capture_evidence: User is sending photos/evidence
- schedule_inspection: User wants to schedule an inspection
- unknown: Cannot determine intent

Also extract any entities:
- voxelId: A voxel/zone identifier (e.g., "VOX-123", "zone A")
- zone: Project zone or area name
- trade: Trade type (e.g., "concrete", "electrical", "plumbing")
- amount: Any numerical amount or quantity
- date: Any date reference
- decisionId: Decision identifier (e.g., "DEC-456")
- status: Status value (e.g., "complete", "in progress")
- description: Brief description of the issue/request

Respond in this exact JSON format:
{
  "intent": "<intent_type>",
  "confidence": <0.0-1.0>,
  "entities": {
    "voxelId": "<value or null>",
    "zone": "<value or null>",
    "trade": "<value or null>",
    "amount": <number or null>,
    "date": "<value or null>",
    "decisionId": "<value or null>",
    "status": "<value or null>",
    "description": "<value or null>"
  }
}`;
}

/**
 * Parse classification response from Claude
 */
function parseClassificationResponse(
  response: string,
  originalText: string
): IntentClassification {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return classifyIntentRuleBased(originalText);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate intent
    const validIntents: UserIntent[] = [
      'report_completion',
      'request_decision',
      'query_status',
      'approve_decision',
      'escalate_decision',
      'capture_evidence',
      'schedule_inspection',
      'unknown',
    ];

    const intent: UserIntent = validIntents.includes(parsed.intent)
      ? parsed.intent
      : 'unknown';

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    const entities: ExtractedEntities = {};

    if (parsed.entities) {
      if (parsed.entities.voxelId) {entities.voxelId = String(parsed.entities.voxelId);}
      if (parsed.entities.zone) {entities.zone = String(parsed.entities.zone);}
      if (parsed.entities.trade) {entities.trade = String(parsed.entities.trade);}
      if (typeof parsed.entities.amount === 'number') {entities.amount = parsed.entities.amount;}
      if (parsed.entities.date) {entities.date = String(parsed.entities.date);}
      if (parsed.entities.decisionId) {entities.decisionId = String(parsed.entities.decisionId);}
      if (parsed.entities.status) {entities.status = String(parsed.entities.status);}
      if (parsed.entities.description) {entities.description = String(parsed.entities.description);}
    }

    return {
      intent,
      confidence,
      entities,
      rawText: originalText,
    };
  } catch {
    return classifyIntentRuleBased(originalText);
  }
}

// ============================================================================
// Rule-Based Fallback Classification
// ============================================================================

/**
 * Rule-based intent classification (fallback)
 */
export function classifyIntentRuleBased(messageText: string): IntentClassification {
  const text = messageText.toLowerCase().trim();
  const entities: ExtractedEntities = extractEntitiesRuleBased(messageText);

  // Check for completion reports
  if (
    text.includes('complete') ||
    text.includes('done') ||
    text.includes('finished') ||
    text.includes('completed')
  ) {
    return {
      intent: 'report_completion',
      confidence: 0.8,
      entities,
      rawText: messageText,
    };
  }

  // Check for decision requests
  if (
    text.includes('need decision') ||
    text.includes('need approval') ||
    text.includes('please approve') ||
    text.includes('can we') ||
    text.includes('should we') ||
    text.includes('what should')
  ) {
    return {
      intent: 'request_decision',
      confidence: 0.75,
      entities,
      rawText: messageText,
    };
  }

  // Check for approvals
  if (
    text.includes('approved') ||
    text.includes('i approve') ||
    text.includes('yes approve') ||
    text.startsWith('approve')
  ) {
    return {
      intent: 'approve_decision',
      confidence: 0.85,
      entities,
      rawText: messageText,
    };
  }

  // Check for status queries
  if (
    text.includes('status') ||
    text.includes('update') ||
    text.includes('what is') ||
    text.includes("what's") ||
    text.includes('how is') ||
    text.startsWith('?')
  ) {
    return {
      intent: 'query_status',
      confidence: 0.7,
      entities,
      rawText: messageText,
    };
  }

  // Check for escalation
  if (
    text.includes('escalate') ||
    text.includes('need help') ||
    text.includes('urgent') ||
    text.includes('emergency') ||
    text.includes('cannot wait')
  ) {
    return {
      intent: 'escalate_decision',
      confidence: 0.8,
      entities,
      rawText: messageText,
    };
  }

  // Check for inspection scheduling
  if (
    text.includes('inspection') ||
    text.includes('schedule') ||
    text.includes('inspector')
  ) {
    return {
      intent: 'schedule_inspection',
      confidence: 0.75,
      entities,
      rawText: messageText,
    };
  }

  // Check for evidence/photo capture
  if (
    text.includes('photo') ||
    text.includes('picture') ||
    text.includes('attached') ||
    text.includes('see image')
  ) {
    return {
      intent: 'capture_evidence',
      confidence: 0.7,
      entities,
      rawText: messageText,
    };
  }

  // Unknown intent
  return {
    intent: 'unknown',
    confidence: 0.3,
    entities,
    rawText: messageText,
  };
}

/**
 * Rule-based entity extraction
 */
export function extractEntitiesRuleBased(messageText: string): ExtractedEntities {
  const entities: ExtractedEntities = {};
  const text = messageText;

  // Extract voxel/zone IDs (VOX-123, ZONE-A, etc.)
  const voxelMatch = text.match(/\b(VOX|ZONE|AREA|UNIT)[-_]?(\d+[A-Z]?|[A-Z]\d*)\b/i);
  if (voxelMatch) {
    entities.voxelId = voxelMatch[0].toUpperCase();
  }

  // Extract zone names
  const zoneMatch = text.match(/\b(?:zone|area)\s+([A-Za-z0-9]+)\b/i);
  if (zoneMatch) {
    entities.zone = zoneMatch[1];
  }

  // Extract trade types
  const trades = [
    'concrete',
    'electrical',
    'plumbing',
    'hvac',
    'framing',
    'drywall',
    'roofing',
    'flooring',
    'painting',
    'masonry',
    'steel',
    'carpentry',
  ];
  for (const trade of trades) {
    if (text.toLowerCase().includes(trade)) {
      entities.trade = trade;
      break;
    }
  }

  // Extract amounts/quantities
  const amountMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:ft|feet|yards?|lbs?|tons?|gallons?|units?|pieces?|hours?)\b/i);
  if (amountMatch) {
    entities.amount = parseFloat(amountMatch[1]);
  }

  // Extract dates
  const dateMatch = text.match(
    /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i
  );
  if (dateMatch) {
    entities.date = dateMatch[0].toLowerCase();
  }

  // Extract decision IDs (DEC-123)
  const decisionMatch = text.match(/\b(DEC|DECISION)[-_]?(\d+)\b/i);
  if (decisionMatch) {
    entities.decisionId = `DEC-${decisionMatch[2]}`;
  }

  // Extract status
  const statuses = ['complete', 'in progress', 'pending', 'blocked', 'on hold', 'started'];
  for (const status of statuses) {
    if (text.toLowerCase().includes(status)) {
      entities.status = status;
      break;
    }
  }

  // Extract description (take remaining meaningful text)
  if (!entities.description && text.length > 0) {
    // Remove extracted entities from text to get description
    let description = text;
    if (entities.voxelId) {description = description.replace(new RegExp(entities.voxelId, 'gi'), '');}
    if (entities.decisionId) {description = description.replace(new RegExp(entities.decisionId, 'gi'), '');}
    if (entities.trade) {description = description.replace(new RegExp(entities.trade, 'gi'), '');}
    if (entities.status) {description = description.replace(new RegExp(entities.status, 'gi'), '');}
    if (entities.date) {description = description.replace(new RegExp(entities.date, 'gi'), '');}

    description = description.replace(/\s+/g, ' ').trim();
    if (description.length > 10) {
      entities.description = description.slice(0, 200);
    }
  }

  return entities;
}

// ============================================================================
// Intent Confidence Thresholds
// ============================================================================

/**
 * Minimum confidence thresholds for actions
 */
export const INTENT_CONFIDENCE_THRESHOLDS: Record<UserIntent, number> = {
  report_completion: 0.7,
  request_decision: 0.6,
  query_status: 0.5,
  approve_decision: 0.8,
  escalate_decision: 0.7,
  capture_evidence: 0.6,
  schedule_inspection: 0.7,
  unknown: 0,
};

/**
 * Check if intent classification is confident enough for action
 */
export function isConfidentClassification(classification: IntentClassification): boolean {
  const threshold = INTENT_CONFIDENCE_THRESHOLDS[classification.intent];
  return classification.confidence >= threshold;
}

/**
 * Get human-readable intent description
 */
export function getIntentDescription(intent: UserIntent): string {
  const descriptions: Record<UserIntent, string> = {
    report_completion: 'Report that work is complete',
    request_decision: 'Request a decision or approval',
    query_status: 'Ask about status',
    approve_decision: 'Approve a pending decision',
    escalate_decision: 'Escalate to higher authority',
    capture_evidence: 'Capture photo evidence',
    schedule_inspection: 'Schedule an inspection',
    unknown: 'Unknown request',
  };

  return descriptions[intent];
}

// ============================================================================
// Context Enhancement
// ============================================================================

/**
 * Enhance entities with project context
 */
export async function enhanceEntitiesWithContext(
  entities: ExtractedEntities,
  _projectId?: string,
  _tenantId?: string
): Promise<ExtractedEntities> {
  // This would query the database to resolve partial references
  // For example, "zone A" might resolve to specific voxel IDs
  // For now, return entities as-is
  return entities;
}

/**
 * Validate entities against project data
 */
export async function validateEntities(
  entities: ExtractedEntities,
  _projectId?: string,
  _tenantId?: string
): Promise<{
  valid: boolean;
  errors: string[];
  suggestions: string[];
}> {
  const errors: string[] = [];
  const suggestions: string[] = [];

  // Basic validation
  if (entities.voxelId && !entities.voxelId.match(/^[A-Z0-9-]+$/)) {
    errors.push('Invalid voxel ID format');
    suggestions.push('Use format like VOX-123 or ZONE-A');
  }

  if (entities.date) {
    const parsedDate = new Date(entities.date);
    if (isNaN(parsedDate.getTime()) && !['today', 'tomorrow'].includes(entities.date)) {
      errors.push('Could not parse date');
      suggestions.push('Use format MM/DD or day names');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    suggestions,
  };
}
