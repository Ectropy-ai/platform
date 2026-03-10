/**
 * Document Chunking Service
 *
 * Splits documents into semantically meaningful chunks for embedding.
 *
 * @module services/rag/chunk-service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { EMBEDDING_CONFIG, ChunkMetadata, DocumentType, buildRagChunkUrn } from './types.js';
import { generateContentHash } from './embeddings-service.js';

// ==============================================================================
// Chunking Configuration
// ==============================================================================

interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  minChunkSize: number;
  preserveSentences: boolean;
  preserveParagraphs: boolean;
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: EMBEDDING_CONFIG.CHUNK_SIZE,
  chunkOverlap: EMBEDDING_CONFIG.CHUNK_OVERLAP,
  minChunkSize: 50,
  preserveSentences: true,
  preserveParagraphs: true,
};

// ==============================================================================
// Chunk Types
// ==============================================================================

export interface DocumentChunk {
  id: string;
  urn: string;
  content: string;
  contentHash: string;
  chunkIndex: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  metadata: Partial<ChunkMetadata>;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  totalChunks: number;
  totalCharacters: number;
  averageChunkSize: number;
}

// ==============================================================================
// Main Chunking Function
// ==============================================================================

/**
 * Chunk a document into smaller pieces for embedding
 */
export function chunkDocument(
  content: string,
  options: {
    projectId: string;
    tenantId: string;
    sourceUrn: string;
    sourceName: string;
    sourceType: string;
    documentType?: DocumentType;
    config?: Partial<ChunkingConfig>;
    additionalMetadata?: Record<string, unknown>;
  }
): ChunkingResult {
  const config = { ...DEFAULT_CHUNKING_CONFIG, ...options.config };

  // Clean and normalize content
  const cleanedContent = normalizeContent(content);

  // Split into chunks based on document type
  const rawChunks = splitContent(cleanedContent, config, options.documentType);

  // Create chunk objects with metadata
  const now = new Date();
  const chunks: DocumentChunk[] = rawChunks.map((chunk, index) => {
    const id = uuidv4();
    return {
      id,
      urn: buildRagChunkUrn(options.tenantId, options.sourceType, id),
      content: chunk.content,
      contentHash: generateContentHash(chunk.content),
      chunkIndex: index,
      totalChunks: rawChunks.length,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      metadata: {
        sourceUrn: options.sourceUrn,
        sourceType: options.sourceType,
        sourceName: options.sourceName,
        projectId: options.projectId,
        tenantId: options.tenantId,
        chunkIndex: index,
        totalChunks: rawChunks.length,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        documentType: options.documentType,
        createdAt: now,
        updatedAt: now,
        customMetadata: options.additionalMetadata,
      },
    };
  });

  // Calculate statistics
  const totalCharacters = chunks.reduce((sum, c) => sum + c.content.length, 0);
  const averageChunkSize = chunks.length > 0 ? totalCharacters / chunks.length : 0;

  return {
    chunks,
    totalChunks: chunks.length,
    totalCharacters,
    averageChunkSize,
  };
}

// ==============================================================================
// Content Normalization
// ==============================================================================

function normalizeContent(content: string): string {
  return content
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Collapse multiple newlines to two
    .replace(/\n{3,}/g, '\n\n')
    // Remove excessive whitespace
    .replace(/[ \t]+/g, ' ')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

// ==============================================================================
// Content Splitting
// ==============================================================================

interface RawChunk {
  content: string;
  startOffset: number;
  endOffset: number;
}

function splitContent(
  content: string,
  config: ChunkingConfig,
  documentType?: DocumentType
): RawChunk[] {
  // Use specialized splitter based on document type
  switch (documentType) {
    case 'specification':
    case 'contract':
      return splitBySection(content, config);
    case 'conversation':
      return splitByTurn(content, config);
    case 'safety_document':
      return splitBySection(content, config);
    default:
      return splitBySentence(content, config);
  }
}

/**
 * Split by sentences with overlap
 */
function splitBySentence(content: string, config: ChunkingConfig): RawChunk[] {
  const chunks: RawChunk[] = [];

  // Split into sentences
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
  let currentChunk = '';
  let currentStart = 0;
  let position = 0;

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) {continue;}

    // Check if adding this sentence exceeds chunk size
    if (currentChunk.length + trimmedSentence.length > config.chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        startOffset: currentStart,
        endOffset: position,
      });

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - config.chunkOverlap);
      const overlap = currentChunk.slice(overlapStart);
      currentChunk = `${overlap } ${ trimmedSentence}`;
      currentStart = position - overlap.length;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }

    position += sentence.length;
  }

  // Add final chunk
  if (currentChunk.trim().length >= config.minChunkSize) {
    chunks.push({
      content: currentChunk.trim(),
      startOffset: currentStart,
      endOffset: content.length,
    });
  }

  return chunks.length > 0 ? chunks : [{ content: content.trim(), startOffset: 0, endOffset: content.length }];
}

/**
 * Split by section headers (for specifications, contracts)
 */
function splitBySection(content: string, config: ChunkingConfig): RawChunk[] {
  const chunks: RawChunk[] = [];

  // Match section headers (numbered sections, all-caps headers, markdown headers)
  const sectionPattern = /(?:^|\n)((?:\d+(?:\.\d+)*\.?\s+[A-Z]|#{1,6}\s+|[A-Z][A-Z\s]+:|\*\*[^*]+\*\*).*?)(?=\n(?:\d+(?:\.\d+)*\.?\s+[A-Z]|#{1,6}\s+|[A-Z][A-Z\s]+:|\*\*[^*]+\*\*)|$)/gs;

  let match;
  let lastEnd = 0;
  const sections: { content: string; start: number; end: number }[] = [];

  while ((match = sectionPattern.exec(content)) !== null) {
    if (lastEnd < match.index) {
      // Add any content before this section
      const preContent = content.slice(lastEnd, match.index).trim();
      if (preContent) {
        sections.push({ content: preContent, start: lastEnd, end: match.index });
      }
    }
    sections.push({ content: match[1].trim(), start: match.index, end: match.index + match[1].length });
    lastEnd = match.index + match[0].length;
  }

  // Add remaining content
  if (lastEnd < content.length) {
    const remaining = content.slice(lastEnd).trim();
    if (remaining) {
      sections.push({ content: remaining, start: lastEnd, end: content.length });
    }
  }

  // If no sections found, fall back to sentence splitting
  if (sections.length === 0) {
    return splitBySentence(content, config);
  }

  // Merge small sections and split large ones
  let currentContent = '';
  let currentStart = 0;

  for (const section of sections) {
    if (currentContent.length + section.content.length <= config.chunkSize) {
      currentContent += (currentContent ? '\n\n' : '') + section.content;
      if (!currentStart) {currentStart = section.start;}
    } else {
      // Save current and start new
      if (currentContent) {
        chunks.push({
          content: currentContent,
          startOffset: currentStart,
          endOffset: section.start,
        });
      }

      // If this section itself is too large, split it
      if (section.content.length > config.chunkSize) {
        const subChunks = splitBySentence(section.content, config);
        chunks.push(
          ...subChunks.map(sc => ({
            ...sc,
            startOffset: sc.startOffset + section.start,
            endOffset: sc.endOffset + section.start,
          }))
        );
        currentContent = '';
        currentStart = 0;
      } else {
        currentContent = section.content;
        currentStart = section.start;
      }
    }
  }

  // Add final chunk
  if (currentContent && currentContent.length >= config.minChunkSize) {
    chunks.push({
      content: currentContent,
      startOffset: currentStart,
      endOffset: content.length,
    });
  }

  return chunks;
}

/**
 * Split conversation by turns
 */
function splitByTurn(content: string, config: ChunkingConfig): RawChunk[] {
  const chunks: RawChunk[] = [];

  // Match conversation turns (User:, Assistant:, Speaker:, etc.)
  const turnPattern = /(?:^|\n)((?:User|Assistant|Human|AI|Speaker\s*\d*|[A-Z][a-z]+)\s*:.*?)(?=\n(?:User|Assistant|Human|AI|Speaker\s*\d*|[A-Z][a-z]+)\s*:|$)/gs;

  let match;
  let currentChunk = '';
  let currentStart = 0;
  let lastEnd = 0;

  while ((match = turnPattern.exec(content)) !== null) {
    const turn = match[1].trim();

    if (currentChunk.length + turn.length > config.chunkSize && currentChunk) {
      chunks.push({
        content: currentChunk,
        startOffset: currentStart,
        endOffset: match.index,
      });
      currentChunk = turn;
      currentStart = match.index;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + turn;
      if (!currentStart) {currentStart = match.index;}
    }
    lastEnd = match.index + match[0].length;
  }

  // Add remaining content
  if (currentChunk && currentChunk.length >= config.minChunkSize) {
    chunks.push({
      content: currentChunk,
      startOffset: currentStart,
      endOffset: content.length,
    });
  }

  // If no turns found, fall back to sentence splitting
  return chunks.length > 0 ? chunks : splitBySentence(content, config);
}

// ==============================================================================
// Token Estimation
// ==============================================================================

/**
 * Estimate token count for text (rough approximation)
 * Average of ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {return text;}

  // Try to truncate at sentence boundary
  const truncated = text.slice(0, maxChars);
  const lastSentenceEnd = truncated.lastIndexOf('.');
  if (lastSentenceEnd > maxChars * 0.7) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.8) {
    return `${truncated.slice(0, lastSpace) }...`;
  }

  return `${truncated }...`;
}

export default {
  chunkDocument,
  estimateTokens,
  truncateToTokenBudget,
};
