/**
 * Context Assembly and Citation Tracking
 *
 * Assembles retrieved chunks into a coherent context for Claude,
 * with citation tracking for source attribution.
 *
 * @module rag/context-assembly
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  RetrievedChunk,
  Citation,
  AssembledContextResult,
  AuthorityLevel,
  ContextAssemblyOptions,
  CollectionName,
  SearchMetrics,
  RetrievalStrategy,
} from './types.js';

// Re-export for backward compatibility
export type { SearchMetrics, RetrievalStrategy };

// Local type alias for readability
type AssembledContext = AssembledContextResult;

// SearchResult interface for this module
interface SearchResult {
  contextId: string;
  query: string;
  projectId: string | undefined;
  tenantId: string;
  retrievalStrategy: RetrievalStrategy;
  chunks: RetrievedChunk[];
  assembledContext: string;
  tokenCount: number;
  tokenBudget: number;
  reranked: boolean;
  citations: Citation[];
  searchMetrics: SearchMetrics;
  createdAt: string;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_OPTIONS: ContextAssemblyOptions = {
  includeMetadata: true,
  includeCitations: true,
  formatForClaude: true,
  maxTokens: 4000,
};

/**
 * Token budgets by authority level
 */
const AUTHORITY_TOKEN_BUDGETS: Record<AuthorityLevel, number> = {
  0: 1000, // Field Worker
  1: 2000, // Foreman
  2: 3000, // Superintendent
  3: 4000, // Project Manager
  4: 5000, // Construction Manager
  5: 6000, // Executive
  6: 8000, // Regulatory Authority
};

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get token budget for authority level
 */
export function getTokenBudget(authorityLevel: AuthorityLevel): number {
  return AUTHORITY_TOKEN_BUDGETS[authorityLevel] || 4000;
}

// ============================================================================
// Citation Generation
// ============================================================================

/**
 * Generate citation from a retrieved chunk
 */
function generateCitation(
  chunk: RetrievedChunk,
  index: number
): Citation {
  // Create excerpt (first 100 chars or up to first sentence)
  let excerpt = chunk.content.slice(0, 150);
  const sentenceEnd = excerpt.indexOf('.');
  if (sentenceEnd > 30) {
    excerpt = excerpt.slice(0, sentenceEnd + 1);
  } else {
    excerpt = `${excerpt.slice(0, 100) }...`;
  }

  return {
    index,
    sourceUrn: chunk.sourceUrn,
    title: chunk.metadata.documentTitle || 'Untitled Document',
    excerpt: excerpt.trim(),
    documentType: chunk.metadata.documentType,
    relevanceScore: chunk.fusedScore,
  };
}

/**
 * Build URN for a citation
 */
export function buildCitationUrn(
  tenantId: string,
  documentId: string,
  chunkIndex?: number
): string {
  if (chunkIndex !== undefined) {
    return `urn:luhtech:${tenantId}:chunk:${documentId}:${chunkIndex}`;
  }
  return `urn:luhtech:${tenantId}:document:${documentId}`;
}

// ============================================================================
// Context Assembly
// ============================================================================

/**
 * Assemble retrieved chunks into a coherent context string
 */
export function assembleContext(
  chunks: RetrievedChunk[],
  options: Partial<ContextAssemblyOptions> = {}
): AssembledContext {
  const opts: ContextAssemblyOptions = { ...DEFAULT_OPTIONS, ...options };
  const contextId = uuidv4();

  if (chunks.length === 0) {
    return {
      contextId,
      text: '',
      tokenCount: 0,
      citations: [],
      sourceChunks: [],
    };
  }

  const citations: Citation[] = [];
  const includedChunks: RetrievedChunk[] = [];
  const contextParts: string[] = [];
  let currentTokens = 0;

  // Sort by fused score
  const sortedChunks = [...chunks].sort((a, b) => b.fusedScore - a.fusedScore);

  // Build context within token budget
  for (const chunk of sortedChunks) {
    const chunkTokens = estimateTokens(chunk.content);

    // Check if adding this chunk would exceed budget
    const maxTokens = opts.maxTokens ?? 4000;
    if (currentTokens + chunkTokens > maxTokens) {
      // Try to fit a truncated version
      const remainingTokens = maxTokens - currentTokens;
      if (remainingTokens > 50) {
        const truncatedChars = remainingTokens * 4;
        const truncatedContent = `${chunk.content.slice(0, truncatedChars) }...`;
        contextParts.push(formatChunkForContext(chunk, citations.length + 1, truncatedContent, opts));
        citations.push(generateCitation({ ...chunk, content: truncatedContent }, citations.length + 1));
        includedChunks.push(chunk);
        currentTokens += remainingTokens;
      }
      break;
    }

    // Add full chunk
    contextParts.push(formatChunkForContext(chunk, citations.length + 1, chunk.content, opts));
    citations.push(generateCitation(chunk, citations.length + 1));
    includedChunks.push(chunk);
    currentTokens += chunkTokens;
  }

  // Assemble final context string
  let assembledText: string;

  if (opts.formatForClaude) {
    assembledText = formatForClaude(contextParts, citations, opts);
  } else {
    assembledText = contextParts.join('\n\n---\n\n');
  }

  return {
    contextId,
    text: assembledText,
    tokenCount: estimateTokens(assembledText),
    citations,
    sourceChunks: includedChunks,
  };
}

/**
 * Format a single chunk for inclusion in context
 */
function formatChunkForContext(
  chunk: RetrievedChunk,
  citationIndex: number,
  content: string,
  options: ContextAssemblyOptions
): string {
  const parts: string[] = [];

  // Citation reference
  parts.push(`[${citationIndex}]`);

  // Metadata header if enabled
  if (options.includeMetadata) {
    const metaParts: string[] = [];

    if (chunk.metadata.documentTitle) {
      metaParts.push(`"${chunk.metadata.documentTitle}"`);
    }

    if (chunk.metadata.documentType) {
      metaParts.push(`(${chunk.metadata.documentType})`);
    }

    if (chunk.metadata.zone) {
      metaParts.push(`Zone: ${chunk.metadata.zone}`);
    }

    if (metaParts.length > 0) {
      parts.push(metaParts.join(' | '));
    }
  }

  // Content
  parts.push(content);

  return parts.join('\n');
}

/**
 * Format context specifically for Claude
 */
function formatForClaude(
  contextParts: string[],
  citations: Citation[],
  options: ContextAssemblyOptions
): string {
  const sections: string[] = [];

  // Header
  sections.push('# Retrieved Context');
  sections.push('');
  sections.push('The following information has been retrieved from project documents to help answer your query. Citations are provided for source attribution.');
  sections.push('');

  // Context chunks
  sections.push('## Relevant Information');
  sections.push('');
  sections.push(contextParts.join('\n\n'));

  // Citation list if enabled
  if (options.includeCitations && citations.length > 0) {
    sections.push('');
    sections.push('## Sources');
    sections.push('');

    for (const citation of citations) {
      sections.push(`[${citation.index}] ${citation.title} (${citation.documentType}) - Relevance: ${(citation.relevanceScore * 100).toFixed(0)}%`);
    }
  }

  sections.push('');
  sections.push('---');
  sections.push('');

  return sections.join('\n');
}

// ============================================================================
// Search Result to Context
// ============================================================================

/**
 * Build a complete search result with assembled context
 */
export function buildSearchResult(
  query: string,
  tenantId: string,
  projectId: string | undefined,
  chunks: RetrievedChunk[],
  metrics: import('./types.js').SearchMetrics,
  authorityLevel: AuthorityLevel,
  strategy: import('./types.js').RetrievalStrategy
): SearchResult {
  const tokenBudget = getTokenBudget(authorityLevel);

  const assembled = assembleContext(chunks, {
    maxTokens: tokenBudget,
    includeMetadata: true,
    includeCitations: true,
    formatForClaude: true,
  });

  return {
    contextId: assembled.contextId,
    query,
    projectId,
    tenantId,
    retrievalStrategy: strategy,
    chunks,
    assembledContext: assembled.text,
    tokenCount: assembled.tokenCount,
    tokenBudget,
    reranked: true,
    citations: assembled.citations,
    searchMetrics: metrics,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// Context Summarization
// ============================================================================

/**
 * Summarize context for display (non-Claude use)
 */
export function summarizeContext(
  chunks: RetrievedChunk[],
  maxLength: number = 500
): string {
  if (chunks.length === 0) {
    return 'No relevant context found.';
  }

  const summary: string[] = [];
  summary.push(`Found ${chunks.length} relevant document(s):`);
  summary.push('');

  let currentLength = summary.join('\n').length;

  for (const chunk of chunks) {
    const line = `• ${chunk.metadata.documentTitle || 'Document'} (${chunk.metadata.documentType}) - Relevance: ${(chunk.fusedScore * 100).toFixed(0)}%`;

    if (currentLength + line.length + 2 > maxLength) {
      summary.push('...');
      break;
    }

    summary.push(line);
    currentLength += line.length + 1;
  }

  return summary.join('\n');
}

// ============================================================================
// Context Deduplication
// ============================================================================

/**
 * Remove duplicate or highly similar chunks
 */
export function deduplicateChunks(
  chunks: RetrievedChunk[],
  similarityThreshold: number = 0.9
): RetrievedChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const unique: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    // Check if this chunk is too similar to any already included
    const isDuplicate = unique.some((existing) => {
      // Same document, adjacent chunks are likely duplicates
      if (existing.metadata.documentId === chunk.metadata.documentId) {
        const chunkIndex1 = parseInt(chunk.chunkId.split('_chunk_')[1] || '0', 10);
        const chunkIndex2 = parseInt(existing.chunkId.split('_chunk_')[1] || '0', 10);
        if (Math.abs(chunkIndex1 - chunkIndex2) <= 1) {
          return true;
        }
      }

      // Content similarity check (simple Jaccard)
      const similarity = calculateContentSimilarity(existing.content, chunk.content);
      return similarity >= similarityThreshold;
    });

    if (!isDuplicate) {
      unique.push(chunk);
    }
  }

  return unique;
}

/**
 * Calculate simple content similarity (Jaccard index on words)
 */
function calculateContentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

// ============================================================================
// Context Grouping
// ============================================================================

/**
 * Group chunks by collection
 */
export function groupChunksByCollection(
  chunks: RetrievedChunk[]
): Map<CollectionName, RetrievedChunk[]> {
  const groups = new Map<CollectionName, RetrievedChunk[]>();

  for (const chunk of chunks) {
    const existing = groups.get(chunk.collection) || [];
    existing.push(chunk);
    groups.set(chunk.collection, existing);
  }

  return groups;
}

/**
 * Group chunks by document
 */
export function groupChunksByDocument(
  chunks: RetrievedChunk[]
): Map<string, RetrievedChunk[]> {
  const groups = new Map<string, RetrievedChunk[]>();

  for (const chunk of chunks) {
    const docId = chunk.metadata.documentId;
    const existing = groups.get(docId) || [];
    existing.push(chunk);
    groups.set(docId, existing);
  }

  return groups;
}

// ============================================================================
// Citation Formatting
// ============================================================================

/**
 * Format citations for display
 */
export function formatCitations(
  citations: Citation[],
  format: 'inline' | 'endnotes' | 'numbered' = 'numbered'
): string {
  if (citations.length === 0) {
    return '';
  }

  switch (format) {
    case 'inline':
      return citations
        .map((c) => `[${c.index}] ${c.title}: "${c.excerpt}"`)
        .join('\n');

    case 'endnotes':
      return citations
        .map((c) => `${c.index}. ${c.title} (${c.documentType}) - ${c.sourceUrn}`)
        .join('\n');

    case 'numbered':
    default:
      return citations
        .map((c) => `[${c.index}] ${c.title}`)
        .join('\n');
  }
}

/**
 * Extract citation references from text
 */
export function extractCitationReferences(text: string): number[] {
  const matches = text.match(/\[(\d+)\]/g) || [];
  return matches.map((m) => parseInt(m.slice(1, -1), 10));
}
