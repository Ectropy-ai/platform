/**
 * Document Chunking Pipeline
 *
 * Splits documents into semantic chunks for vector indexing.
 * Preserves document structure and maintains overlap for context continuity.
 *
 * @module rag/chunker
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  DocumentChunk,
  DocumentMetadata,
  ChunkingConfig,
  DEFAULT_CHUNKING_CONFIG,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: ChunkingConfig = {
  chunkSize: 512,
  chunkOverlap: 64,
  preserveStructure: true,
};

// ============================================================================
// Text Splitting Utilities
// ============================================================================

/**
 * Split text by paragraphs
 */
function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Split text by sentences (approximate)
 */
function splitBySentences(text: string): string[] {
  // Split on sentence boundaries while preserving them
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Split text by words
 */
function splitByWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate character count from token budget
 */
function tokensToChars(tokens: number): number {
  return tokens * 4;
}

// ============================================================================
// Recursive Character Text Splitter
// ============================================================================

/**
 * Recursively split text using a hierarchy of separators
 * This preserves document structure as much as possible
 */
function recursiveSplit(
  text: string,
  maxChunkSize: number,
  separators: string[] = ['\n\n', '\n', '. ', ' ', '']
): string[] {
  const chunks: string[] = [];

  // If text fits in one chunk, return it
  if (estimateTokens(text) <= maxChunkSize) {
    return [text];
  }

  // Try each separator in order
  for (const separator of separators) {
    if (separator === '' || text.includes(separator)) {
      const parts =
        separator === ''
          ? text.split('')
          : text.split(separator).filter((p) => p.length > 0);

      // If we can split meaningfully
      if (parts.length > 1) {
        let currentChunk = '';

        for (const part of parts) {
          const partWithSep = separator === '' ? part : part + separator;
          const combined = currentChunk + partWithSep;

          if (estimateTokens(combined) <= maxChunkSize) {
            currentChunk = combined;
          } else {
            // Save current chunk if it has content
            if (currentChunk.length > 0) {
              chunks.push(currentChunk.trim());
            }

            // If part itself is too large, recursively split it
            if (estimateTokens(partWithSep) > maxChunkSize) {
              const subChunks = recursiveSplit(
                partWithSep,
                maxChunkSize,
                separators.slice(separators.indexOf(separator) + 1)
              );
              chunks.push(...subChunks);
              currentChunk = '';
            } else {
              currentChunk = partWithSep;
            }
          }
        }

        // Don't forget the last chunk
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
        }

        return chunks;
      }
    }
  }

  // Fallback: split by character count
  const charLimit = tokensToChars(maxChunkSize);
  for (let i = 0; i < text.length; i += charLimit) {
    chunks.push(text.slice(i, i + charLimit));
  }

  return chunks;
}

// ============================================================================
// Chunk Generation
// ============================================================================

/**
 * Add overlap between chunks for context continuity
 */
function addOverlap(
  chunks: string[],
  overlapTokens: number
): string[] {
  if (chunks.length <= 1 || overlapTokens <= 0) {
    return chunks;
  }

  const overlapChars = tokensToChars(overlapTokens);
  const overlappedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Add overlap from previous chunk
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      const overlapText = prevChunk.slice(-overlapChars);
      // Find a good break point (word boundary)
      const breakPoint = overlapText.lastIndexOf(' ');
      if (breakPoint > 0) {
        chunk = `${overlapText.slice(breakPoint + 1) } ${ chunk}`;
      }
    }

    overlappedChunks.push(chunk.trim());
  }

  return overlappedChunks;
}

/**
 * Generate unique chunk ID
 */
function generateChunkId(documentId: string, chunkIndex: number): string {
  return `${documentId}_chunk_${chunkIndex.toString().padStart(4, '0')}`;
}

// ============================================================================
// Main Chunking Function
// ============================================================================

/**
 * Chunk a document into smaller pieces for indexing
 */
export function chunkDocument(
  content: string,
  metadata: DocumentMetadata,
  config: Partial<ChunkingConfig> = {}
): DocumentChunk[] {
  const finalConfig: ChunkingConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Clean the content
  const cleanContent = content
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .trim();

  if (cleanContent.length === 0) {
    return [];
  }

  // Split into raw chunks
  let rawChunks: string[];

  if (finalConfig.preserveStructure) {
    // Use recursive splitter to preserve structure
    rawChunks = recursiveSplit(cleanContent, finalConfig.chunkSize);
  } else {
    // Simple word-based splitting
    const words = splitByWords(cleanContent);
    const wordsPerChunk = Math.floor(finalConfig.chunkSize * 0.75); // Leave room
    rawChunks = [];

    for (let i = 0; i < words.length; i += wordsPerChunk) {
      rawChunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
  }

  // Add overlap
  const overlappedChunks = addOverlap(rawChunks, finalConfig.chunkOverlap);

  // Convert to DocumentChunk objects
  const documentChunks: DocumentChunk[] = overlappedChunks.map(
    (content, index) => ({
      chunkId: generateChunkId(metadata.documentId, index),
      documentId: metadata.documentId,
      content,
      chunkIndex: index,
      totalChunks: overlappedChunks.length,
      metadata,
    })
  );

  return documentChunks;
}

/**
 * Chunk multiple documents
 */
export function chunkDocuments(
  documents: Array<{ content: string; metadata: DocumentMetadata }>,
  config?: Partial<ChunkingConfig>
): DocumentChunk[] {
  const allChunks: DocumentChunk[] = [];

  for (const doc of documents) {
    const chunks = chunkDocument(doc.content, doc.metadata, config);
    allChunks.push(...chunks);
  }

  return allChunks;
}

// ============================================================================
// Specialized Chunkers
// ============================================================================

/**
 * Chunk a construction specification document
 * Preserves section structure
 */
export function chunkSpecification(
  content: string,
  metadata: DocumentMetadata,
  config?: Partial<ChunkingConfig>
): DocumentChunk[] {
  // Specifications often have numbered sections
  // Try to keep sections together when possible

  const sections = content.split(/(?=\d+\.\d+\s)/);
  const chunks: string[] = [];
  let currentChunk = '';
  const maxSize = config?.chunkSize || DEFAULT_CONFIG.chunkSize;

  for (const section of sections) {
    const combined = currentChunk + section;

    if (estimateTokens(combined) <= maxSize) {
      currentChunk = combined;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }

      // If section itself is too large, split it further
      if (estimateTokens(section) > maxSize) {
        const subChunks = recursiveSplit(section, maxSize);
        chunks.push(...subChunks);
        currentChunk = '';
      } else {
        currentChunk = section;
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Add overlap and convert to DocumentChunk
  const overlapped = addOverlap(chunks, config?.chunkOverlap || DEFAULT_CONFIG.chunkOverlap);

  return overlapped.map((content, index) => ({
    chunkId: generateChunkId(metadata.documentId, index),
    documentId: metadata.documentId,
    content,
    chunkIndex: index,
    totalChunks: overlapped.length,
    metadata,
  }));
}

/**
 * Chunk a decision record
 * Keeps decision context together
 */
export function chunkDecisionRecord(
  content: string,
  metadata: DocumentMetadata,
  config?: Partial<ChunkingConfig>
): DocumentChunk[] {
  // Decisions should generally be kept whole if possible
  // Only split if they exceed the max size

  const maxSize = config?.chunkSize || DEFAULT_CONFIG.chunkSize;

  if (estimateTokens(content) <= maxSize) {
    return [
      {
        chunkId: generateChunkId(metadata.documentId, 0),
        documentId: metadata.documentId,
        content: content.trim(),
        chunkIndex: 0,
        totalChunks: 1,
        metadata,
      },
    ];
  }

  // If too large, use standard chunking but with larger overlap
  // to preserve context
  return chunkDocument(content, metadata, {
    ...config,
    chunkOverlap: Math.max(config?.chunkOverlap || 64, 100),
  });
}

/**
 * Chunk a safety protocol document
 * Preserves procedure steps
 */
export function chunkSafetyProtocol(
  content: string,
  metadata: DocumentMetadata,
  config?: Partial<ChunkingConfig>
): DocumentChunk[] {
  // Safety protocols often have numbered steps
  // Try to keep step sequences together

  // Look for step patterns like "Step 1:", "1.", "a)", etc.
  const stepPattern = /(?=(?:Step\s+\d+|^\d+\.|^[a-z]\)|\bWARNING\b|\bCAUTION\b|\bDANGER\b))/im;

  const sections = content.split(stepPattern);
  const maxSize = config?.chunkSize || DEFAULT_CONFIG.chunkSize;

  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of sections) {
    if (section.trim().length === 0) {continue;}

    const combined = currentChunk + section;

    if (estimateTokens(combined) <= maxSize) {
      currentChunk = combined;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = section;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Add overlap
  const overlapped = addOverlap(chunks, config?.chunkOverlap || DEFAULT_CONFIG.chunkOverlap);

  return overlapped.map((content, index) => ({
    chunkId: generateChunkId(metadata.documentId, index),
    documentId: metadata.documentId,
    content,
    chunkIndex: index,
    totalChunks: overlapped.length,
    metadata,
  }));
}

// ============================================================================
// Chunk Analysis Utilities
// ============================================================================

/**
 * Analyze chunk distribution
 */
export function analyzeChunks(chunks: DocumentChunk[]): {
  totalChunks: number;
  totalTokens: number;
  averageTokens: number;
  minTokens: number;
  maxTokens: number;
  byDocument: Map<string, number>;
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      totalTokens: 0,
      averageTokens: 0,
      minTokens: 0,
      maxTokens: 0,
      byDocument: new Map(),
    };
  }

  const tokenCounts = chunks.map((c) => estimateTokens(c.content));
  const totalTokens = tokenCounts.reduce((sum, t) => sum + t, 0);

  const byDocument = new Map<string, number>();
  for (const chunk of chunks) {
    const count = byDocument.get(chunk.documentId) || 0;
    byDocument.set(chunk.documentId, count + 1);
  }

  return {
    totalChunks: chunks.length,
    totalTokens,
    averageTokens: Math.round(totalTokens / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    byDocument,
  };
}

/**
 * Get chunk context (surrounding chunks for context)
 */
export function getChunkContext(
  chunks: DocumentChunk[],
  chunkIndex: number,
  contextSize: number = 1
): {
  before: DocumentChunk[];
  current: DocumentChunk;
  after: DocumentChunk[];
} {
  const current = chunks[chunkIndex];
  const documentChunks = chunks.filter(
    (c) => c.documentId === current.documentId
  );

  const currentInDoc = documentChunks.findIndex(
    (c) => c.chunkId === current.chunkId
  );

  const before = documentChunks.slice(
    Math.max(0, currentInDoc - contextSize),
    currentInDoc
  );

  const after = documentChunks.slice(
    currentInDoc + 1,
    currentInDoc + 1 + contextSize
  );

  return { before, current, after };
}

// ============================================================================
// Export chunk factory by document type
// ============================================================================

/**
 * Get the appropriate chunker for a document type
 */
export function getChunkerForType(
  documentType: string
): (
  content: string,
  metadata: DocumentMetadata,
  config?: Partial<ChunkingConfig>
) => DocumentChunk[] {
  switch (documentType.toLowerCase()) {
    case 'specification':
    case 'spec':
      return chunkSpecification;
    case 'decision':
      return chunkDecisionRecord;
    case 'safety':
    case 'safety_protocol':
      return chunkSafetyProtocol;
    default:
      return chunkDocument;
  }
}
