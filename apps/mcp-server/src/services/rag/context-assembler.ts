/**
 * Context Assembly Service
 *
 * Assembles context from retrieved chunks based on authority level token budgets.
 *
 * @module services/rag/context-assembler
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  RagChunk,
  RagCitation,
  AssembledContext,
  ContextAssemblyRequest,
  AUTHORITY_TOKEN_BUDGETS,
  buildRagCitationUrn,
} from './types.js';
import { estimateTokens, truncateToTokenBudget } from './chunk-service.js';

// ==============================================================================
// Context Assembly
// ==============================================================================

/**
 * Assemble context from chunks within token budget
 */
export function assembleContext(request: ContextAssemblyRequest): AssembledContext {
  const { chunks, query, authorityLevel } = request;

  // Get token budget for authority level
  const tokenBudget = AUTHORITY_TOKEN_BUDGETS[authorityLevel] || AUTHORITY_TOKEN_BUDGETS[0];
  const maxTokens = request.maxTokens || tokenBudget.tokens;

  // Sort chunks by score (highest first)
  const sortedChunks = [...chunks].sort((a, b) => b.score - a.score);

  // Build context within token budget
  const includedChunks: RagChunk[] = [];
  const citations: RagCitation[] = [];
  let currentTokens = 0;
  let context = '';
  let truncated = false;

  for (const chunk of sortedChunks) {
    const chunkTokens = estimateTokens(chunk.content);

    if (currentTokens + chunkTokens > maxTokens) {
      // Check if we can fit a partial chunk
      const remainingTokens = maxTokens - currentTokens;
      if (remainingTokens > 100) {
        const truncatedContent = truncateToTokenBudget(chunk.content, remainingTokens);
        context += formatChunkForContext(chunk, truncatedContent, includedChunks.length + 1);
        currentTokens += estimateTokens(truncatedContent);
        truncated = true;

        // Add citation for partial chunk
        citations.push(createCitation(chunk, truncatedContent));
        includedChunks.push({ ...chunk, content: truncatedContent });
      }
      break;
    }

    // Add full chunk
    context += formatChunkForContext(chunk, chunk.content, includedChunks.length + 1);
    currentTokens += chunkTokens;
    includedChunks.push(chunk);

    // Create citation
    citations.push(createCitation(chunk, chunk.content));
  }

  // Add context header
  const contextHeader = buildContextHeader(query, authorityLevel, tokenBudget.role);
  const fullContext = contextHeader + context;

  return {
    context: fullContext,
    citations,
    tokensUsed: currentTokens + estimateTokens(contextHeader),
    chunksIncluded: includedChunks.length,
    truncated,
  };
}

// ==============================================================================
// Context Formatting
// ==============================================================================

function buildContextHeader(query: string, authorityLevel: number, role: string): string {
  return `## Retrieved Context for: "${query}"
**Authority Level:** ${authorityLevel} (${role})
---

`;
}

function formatChunkForContext(chunk: RagChunk, content: string, index: number): string {
  const source = chunk.metadata.sourceName || chunk.metadata.sourceType;
  const docType = chunk.metadata.documentType || 'document';

  return `### [${index}] ${source} (${docType})
${content}

`;
}

// ==============================================================================
// Citation Generation
// ==============================================================================

function createCitation(chunk: RagChunk, excerpt: string): RagCitation {
  const id = uuidv4();

  return {
    id,
    urn: buildRagCitationUrn(chunk.metadata.tenantId, id),
    sourceUrn: chunk.metadata.sourceUrn,
    sourceName: chunk.metadata.sourceName || chunk.metadata.sourceType,
    sourceType: chunk.metadata.sourceType,
    excerpt: excerpt.slice(0, 200) + (excerpt.length > 200 ? '...' : ''),
    relevanceScore: chunk.score,
    chunkIds: [chunk.id],
    metadata: {
      section: `Chunk ${chunk.metadata.chunkIndex + 1} of ${chunk.metadata.totalChunks}`,
      timestamp: chunk.metadata.createdAt,
    },
  };
}

// ==============================================================================
// Contextual Summarization
// ==============================================================================

/**
 * Create a summary of assembled context
 */
export function summarizeContext(assembled: AssembledContext): string {
  const { citations, tokensUsed, chunksIncluded, truncated } = assembled;

  const sources = [...new Set(citations.map(c => c.sourceName))];
  const sourceTypes = [...new Set(citations.map(c => c.sourceType))];

  return `Context assembled from ${chunksIncluded} chunks (${tokensUsed} tokens${truncated ? ', truncated' : ''}).
Sources: ${sources.join(', ') || 'N/A'}
Document types: ${sourceTypes.join(', ') || 'N/A'}`;
}

// ==============================================================================
// Authority-Based Context Filtering
// ==============================================================================

/**
 * Filter chunks based on authority level access
 */
export function filterChunksByAuthority(chunks: RagChunk[], authorityLevel: number): RagChunk[] {
  // Higher authority levels can see more sensitive information
  // This is a simple implementation - could be enhanced with document-level permissions

  const sensitiveTypes = ['budget', 'financial', 'contract', 'executive'];
  const mediumTypes = ['schedule', 'cost', 'change_order'];

  return chunks.filter(chunk => {
    const docType = chunk.metadata.documentType?.toLowerCase() || '';

    // Level 0-1: No sensitive documents
    if (authorityLevel <= 1) {
      return !sensitiveTypes.some(t => docType.includes(t)) && !mediumTypes.some(t => docType.includes(t));
    }

    // Level 2-3: Can see medium sensitivity
    if (authorityLevel <= 3) {
      return !sensitiveTypes.some(t => docType.includes(t));
    }

    // Level 4+: Can see everything
    return true;
  });
}

// ==============================================================================
// Context Deduplication
// ==============================================================================

/**
 * Remove duplicate or highly similar chunks
 */
export function deduplicateChunks(chunks: RagChunk[], similarityThreshold: number = 0.9): RagChunk[] {
  const unique: RagChunk[] = [];

  for (const chunk of chunks) {
    // Check if similar chunk already exists
    const isDuplicate = unique.some(existing => {
      // Check content hash first (exact match)
      if (existing.contentHash === chunk.contentHash) {return true;}

      // Check content similarity
      const similarity = calculateTextSimilarity(existing.content, chunk.content);
      return similarity >= similarityThreshold;
    });

    if (!isDuplicate) {
      unique.push(chunk);
    }
  }

  return unique;
}

/**
 * Simple text similarity using Jaccard index on word sets
 */
function calculateTextSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ==============================================================================
// Context Enhancement
// ==============================================================================

/**
 * Enhance context with additional signals
 */
export function enhanceContext(
  assembled: AssembledContext,
  options: {
    includeTimeline?: boolean;
    includeRelatedDecisions?: boolean;
    includeSafetyAlerts?: boolean;
  } = {}
): AssembledContext {
  let enhancedContext = assembled.context;

  if (options.includeTimeline) {
    const timeline = buildTimeline(assembled.citations);
    if (timeline) {
      enhancedContext += `\n## Timeline\n${timeline}\n`;
    }
  }

  if (options.includeSafetyAlerts) {
    const safetyAlerts = extractSafetyAlerts(assembled);
    if (safetyAlerts) {
      enhancedContext = `## Safety Alerts\n${safetyAlerts}\n\n${ enhancedContext}`;
    }
  }

  return {
    ...assembled,
    context: enhancedContext,
    tokensUsed: estimateTokens(enhancedContext),
  };
}

function buildTimeline(citations: RagCitation[]): string | null {
  const withDates = citations
    .filter(c => c.metadata.timestamp)
    .sort((a, b) => new Date(a.metadata.timestamp!).getTime() - new Date(b.metadata.timestamp!).getTime());

  if (withDates.length === 0) {return null;}

  return withDates
    .map(c => `- ${new Date(c.metadata.timestamp!).toLocaleDateString()}: ${c.sourceName}`)
    .join('\n');
}

function extractSafetyAlerts(assembled: AssembledContext): string | null {
  const safetyKeywords = ['safety', 'hazard', 'danger', 'warning', 'caution', 'alert', 'emergency'];

  const safetyChunks = assembled.citations.filter(c =>
    safetyKeywords.some(keyword => c.sourceType.toLowerCase().includes(keyword) || c.excerpt.toLowerCase().includes(keyword))
  );

  if (safetyChunks.length === 0) {return null;}

  return safetyChunks.map(c => `⚠️ ${c.excerpt}`).join('\n');
}

export default {
  assembleContext,
  summarizeContext,
  filterChunksByAuthority,
  deduplicateChunks,
  enhanceContext,
};
