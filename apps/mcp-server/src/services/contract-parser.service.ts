/**
 * Contract Parser Service - CO-M2
 *
 * Parses construction contracts (PDF/DOCX) and extracts structured data.
 * Uses pattern matching and configurable extraction rules.
 *
 * Extraction Pipeline:
 * 1. Text extraction from document (pdf-parse for PDF, mammoth for DOCX)
 * 2. Contract type detection
 * 3. Template-driven field extraction
 * 4. Confidence scoring
 * 5. Review flagging for low-confidence fields
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.1.0 - Production PDF/DOCX extraction
 */

// PDF and DOCX extraction libraries
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractExtractionResult,
  type ParseContractInput,
  type ParseContractResult,
  type ContractTemplateURN,
  type ExtractedParty,
  type ExtractedFinancialTerms,
  type ExtractedDates,
  type ExtractedGovernance,
  type ExtractionRule,
  type ExtractedField,
  type ReviewItem,
  type SourceLocation,
  CONFIDENCE_THRESHOLDS,
  DEFAULT_AUTHORITY_MAPPINGS,
} from '../types/contract.types.js';

import { AuthorityLevel } from '../types/pm.types.js';

import {
  detectContractType,
  getSuggestedTemplate,
} from './contract-template.service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Text extraction result
 */
export interface TextExtractionResult {
  success: boolean;
  text: string;
  pageCount: number;
  errors: string[];
}

/**
 * Field confidence calculation input
 */
export interface ConfidenceInput {
  matchType: 'exact' | 'fuzzy' | 'llm';
  sourceCount: number;
  patternStrength: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Review decision input
 */
export interface ReviewDecisionInput {
  decision: 'approved' | 'modified' | 'rejected';
  modifiedValue?: unknown;
  reviewerId: string;
}

// ============================================================================
// Document Type Detection
// ============================================================================

/**
 * Detect document type from filename and content type
 *
 * @param filename - Document filename
 * @param contentType - MIME type
 * @returns Document type
 */
export function detectDocumentType(
  filename: string,
  contentType?: string
): 'pdf' | 'docx' | 'text' {
  if (contentType === 'application/pdf' || filename.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    contentType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.endsWith('.docx')
  ) {
    return 'docx';
  }
  return 'text';
}

// ============================================================================
// Text Extraction
// ============================================================================

/**
 * Extract text from PDF using pdf-parse
 *
 * Production implementation with comprehensive error handling.
 * Supports multi-page documents with page count tracking.
 *
 * @param base64Content - Base64 encoded PDF content
 * @returns Extracted text with page count and any errors
 */
export async function extractTextFromPDF(
  base64Content: string
): Promise<TextExtractionResult> {
  try {
    // Decode base64 to buffer
    const pdfBuffer = Buffer.from(base64Content, 'base64');

    // Validate minimum PDF size (PDF header is at least 8 bytes)
    if (pdfBuffer.length < 8) {
      return {
        success: false,
        text: '',
        pageCount: 0,
        errors: ['Invalid PDF: file too small'],
      };
    }

    // Verify PDF magic number (%PDF-)
    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      return {
        success: false,
        text: '',
        pageCount: 0,
        errors: ['Invalid PDF: missing PDF header signature'],
      };
    }

    // Parse PDF with pdf-parse
    const pdfData = await pdfParse(pdfBuffer, {
      // Limit to 500 pages to prevent memory issues
      max: 500,
    });

    // Validate extraction produced text
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      return {
        success: false,
        text: '',
        pageCount: pdfData.numpages || 0,
        errors: [
          'PDF contains no extractable text (may be scanned/image-based)',
        ],
      };
    }

    // Clean extracted text (normalize whitespace, remove control chars)
    const cleanedText = pdfData.text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      success: true,
      text: cleanedText,
      pageCount: pdfData.numpages || 1,
      errors: [],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown PDF parsing error';
    return {
      success: false,
      text: '',
      pageCount: 0,
      errors: [`PDF extraction failed: ${errorMessage}`],
    };
  }
}

/**
 * Extract text from DOCX using mammoth
 *
 * Production implementation with comprehensive error handling.
 * Extracts plain text from Word documents with style preservation hints.
 *
 * @param base64Content - Base64 encoded DOCX content
 * @returns Extracted text with estimated page count
 */
export async function extractTextFromDOCX(
  base64Content: string
): Promise<TextExtractionResult> {
  try {
    // Decode base64 to buffer
    const docxBuffer = Buffer.from(base64Content, 'base64');

    // Validate minimum DOCX size (ZIP header + minimal content)
    if (docxBuffer.length < 100) {
      return {
        success: false,
        text: '',
        pageCount: 0,
        errors: ['Invalid DOCX: file too small'],
      };
    }

    // Verify ZIP magic number (DOCX is a ZIP archive)
    const zipMagic = docxBuffer.subarray(0, 4);
    if (
      zipMagic[0] !== 0x50 ||
      zipMagic[1] !== 0x4b ||
      zipMagic[2] !== 0x03 ||
      zipMagic[3] !== 0x04
    ) {
      return {
        success: false,
        text: '',
        pageCount: 0,
        errors: ['Invalid DOCX: not a valid ZIP/DOCX archive'],
      };
    }

    // Extract text using mammoth with style mapping
    const result = await mammoth.extractRawText({
      buffer: docxBuffer,
    });

    // Check for extraction warnings
    const warnings = result.messages
      .filter((msg) => msg.type === 'warning')
      .map((msg) => msg.message);

    // Validate extraction produced text
    if (!result.value || result.value.trim().length === 0) {
      return {
        success: false,
        text: '',
        pageCount: 0,
        errors: ['DOCX contains no extractable text', ...warnings],
      };
    }

    // Clean extracted text
    const cleanedText = result.value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Estimate page count (approx 3000 chars per page for contracts)
    const estimatedPages = Math.max(1, Math.ceil(cleanedText.length / 3000));

    return {
      success: true,
      text: cleanedText,
      pageCount: estimatedPages,
      errors: warnings.length > 0 ? warnings : [],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown DOCX parsing error';
    return {
      success: false,
      text: '',
      pageCount: 0,
      errors: [`DOCX extraction failed: ${errorMessage}`],
    };
  }
}

/**
 * Extract text from any document type
 */
async function extractTextFromDocument(
  content: string,
  docType: 'pdf' | 'docx' | 'text'
): Promise<TextExtractionResult> {
  switch (docType) {
    case 'pdf':
      return extractTextFromPDF(content);
    case 'docx':
      return extractTextFromDOCX(content);
    case 'text':
      // Plain text - just decode base64
      return {
        success: true,
        text: Buffer.from(content, 'base64').toString('utf-8'),
        pageCount: 1,
        errors: [],
      };
    default:
      return {
        success: false,
        text: '',
        pageCount: 0,
        errors: ['Unsupported document type'],
      };
  }
}

// ============================================================================
// Party Extraction
// ============================================================================

/**
 * Party role patterns
 */
const PARTY_ROLE_PATTERNS: Record<ContractPartyRole, RegExp[]> = {
  [ContractPartyRole.OWNER]: [/\bOWNER\b/i, /\bClient\b/i, /\bPropriétaire\b/i],
  [ContractPartyRole.ARCHITECT]: [
    /\bARCHITECT\b/i,
    /\bArchitecture\b/i,
    /\bDesigner\b/i,
  ],
  [ContractPartyRole.CONTRACTOR]: [
    /\bCONTRACTOR\b/i,
    /\bGeneral Contractor\b/i,
    /\bBuilder\b/i,
  ],
  [ContractPartyRole.CONSULTANT]: [/\bCONSULTANT\b/i, /\bEngineer\b/i],
  [ContractPartyRole.KEY_PARTICIPANT]: [/\bKey Participant\b/i],
  [ContractPartyRole.DESIGN_BUILDER]: [
    /\bDesign-Builder\b/i,
    /\bDesign Builder\b/i,
  ],
  [ContractPartyRole.CM_AT_RISK]: [/\bCM at Risk\b/i, /\bCMAR\b/i],
  [ContractPartyRole.SUBCONTRACTOR]: [/\bSubcontractor\b/i],
};

/**
 * Extract parties from contract text
 *
 * @param text - Contract text
 * @param family - Contract family
 * @returns Extracted parties
 */
export async function extractParties(
  text: string,
  family: ContractFamily
): Promise<ExtractedParty[]> {
  const parties: ExtractedParty[] = [];

  // Split text into sections for each party
  const partyPatterns = [
    /(?:BETWEEN|AND)\s+(?:the\s+)?(\w+)[:\s]*\n([^]*?)(?=(?:AND\s+(?:the\s+)?|\n(?:ARTICLE|SECTION|\d+\.))|$)/gi,
    /(\w+):\s*\n?\s*([^\n]+(?:\n[^\n]+){0,5})/gi,
  ];

  // Extract by role keywords
  for (const [role, patterns] of Object.entries(PARTY_ROLE_PATTERNS)) {
    for (const pattern of patterns) {
      const roleMatch = text.match(pattern);
      if (roleMatch) {
        // Find the context around this role mention
        const roleIndex = text.search(pattern);
        if (roleIndex === -1) {
          continue;
        }

        const contextStart = Math.max(0, roleIndex - 50);
        const contextEnd = Math.min(text.length, roleIndex + 500);
        const context = text.substring(contextStart, contextEnd);

        // Extract company name (typically follows the role)
        const nameMatch = context.match(
          new RegExp(
            `${role}[:\\s]*\\n?\\s*([A-Z][A-Za-z\\s&.,]+(?:Inc\\.|LLC|Corp\\.|Corporation|Ltd\\.|P\\.C\\.)?)`,
            'i'
          )
        );

        if (nameMatch) {
          // Check for duplicate
          if (parties.some((p) => p.name.value === nameMatch[1].trim())) {
            continue;
          }

          // Extract email
          const emailMatch = context.match(/[\w.-]+@[\w.-]+\.\w+/);

          // Extract address
          const addressMatch = context.match(
            /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Way|Road|Rd)[^,\n]*/i
          );

          const party: ExtractedParty = {
            name: {
              value: nameMatch[1].trim(),
              confidence: 0.85,
              sources: [{ page: 1, snippet: context.substring(0, 100) }],
              method: 'pattern',
              needsReview: false,
            },
            role: {
              value: role as ContractPartyRole,
              confidence: 0.9,
              sources: [{ page: 1, snippet: roleMatch[0] }],
              method: 'pattern',
              needsReview: false,
            },
            email: emailMatch
              ? {
                  value: emailMatch[0],
                  confidence: 0.88,
                  sources: [{ page: 1, snippet: emailMatch[0] }],
                  method: 'pattern',
                  needsReview: false,
                }
              : undefined,
            address: addressMatch
              ? {
                  value: addressMatch[0],
                  confidence: 0.8,
                  sources: [{ page: 1, snippet: addressMatch[0] }],
                  method: 'pattern',
                  needsReview: false,
                }
              : undefined,
            mappedAuthorityLevel:
              DEFAULT_AUTHORITY_MAPPINGS[role as ContractPartyRole] ??
              AuthorityLevel.PM,
          };

          // Check for IPD configuration
          if (
            text.includes('PMT') ||
            text.includes('Project Management Team')
          ) {
            party.ipdConfig = {
              pmtMember: {
                value: true,
                confidence: 0.8,
                sources: [],
                method: 'pattern',
                needsReview: false,
              },
              petMember: {
                value:
                  text.includes('PET') ||
                  text.includes('Project Executive Team'),
                confidence: 0.8,
                sources: [],
                method: 'pattern',
                needsReview: false,
              },
            };

            // Extract savings share
            const savingsMatch = text.match(
              new RegExp(`${role}[^]*?([\\d]+)\\s*%`, 'i')
            );
            if (savingsMatch) {
              party.ipdConfig.savingsShare = {
                value: parseInt(savingsMatch[1], 10),
                confidence: 0.75,
                sources: [],
                method: 'pattern',
                needsReview: false,
              };
            }
          }

          parties.push(party);
        }
      }
    }
  }

  return parties;
}

/**
 * Normalize party name by removing common suffixes
 *
 * @param name - Party name
 * @returns Normalized name
 */
export function normalizePartyName(name: string): string {
  return name
    .trim()
    .replace(/\s+(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?)$/i, '')
    .replace(/,\s*P\.C\.$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Financial Terms Extraction
// ============================================================================

/**
 * Word-to-number mapping
 */
const WORD_NUMBERS: Record<string, number> = {
  million: 1000000,
  billion: 1000000000,
  thousand: 1000,
  hundred: 100,
};

/**
 * Parse monetary amount from text
 *
 * @param text - Text containing amount
 * @returns Parsed amount or null
 */
export function parseAmount(text: string): number | null {
  // Try word format first: Fifty Million Dollars (more specific)
  const wordNum: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
    hundred: 100,
  };

  const wordMatch = text
    .toLowerCase()
    .match(/(\w+)\s+(million|billion|thousand)/i);
  if (wordMatch) {
    const base = wordNum[wordMatch[1]] || parseInt(wordMatch[1], 10);
    const multiplier = WORD_NUMBERS[wordMatch[2].toLowerCase()] || 1;

    if (!isNaN(base) && base > 0) {
      return base * multiplier;
    }
  }

  // Try numeric format: $50,000,000.00 (must be at least 4 digits to be meaningful)
  const numericMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (numericMatch) {
    const cleanValue = numericMatch[1].replace(/,/g, '');
    // Only accept if it looks like a significant amount (at least 1000)
    if (cleanValue.length >= 4 || cleanValue.includes('.')) {
      const value = parseFloat(cleanValue);
      if (!isNaN(value) && value >= 1000) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Extract financial terms from contract text
 *
 * @param text - Contract text
 * @param family - Contract family
 * @returns Extracted financial terms
 */
export async function extractFinancialTerms(
  text: string,
  family: ContractFamily
): Promise<ExtractedFinancialTerms> {
  const terms: ExtractedFinancialTerms = {
    currency: {
      value: text.includes('CAD') ? 'CAD' : 'USD',
      confidence: 0.95,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
  };

  // Extract target cost (IPD) - try multiple patterns
  // Pattern 1: "Target Cost is Fifty Million Dollars ($50,000,000.00)"
  const targetCostWordMatch = text.match(
    /Target\s+Cost[^\n]*?(\w+)\s+(Million|Billion|Thousand)\s+Dollars/i
  );
  // Pattern 2: "Target Cost ... $50,000,000"
  const targetCostNumericMatch = text.match(
    /Target\s+Cost[^$\n]*\$\s*([\d,]+(?:\.\d{2})?)/i
  );

  if (targetCostWordMatch) {
    const value = parseAmount(targetCostWordMatch[0]);
    if (value) {
      terms.targetCost = {
        value,
        confidence: 0.92,
        sources: [{ page: 1, snippet: targetCostWordMatch[0] }],
        method: 'pattern',
        needsReview: false,
      };
    }
  } else if (targetCostNumericMatch) {
    const cleanValue = targetCostNumericMatch[1].replace(/,/g, '');
    const value = parseFloat(cleanValue);
    if (!isNaN(value) && value >= 1000) {
      terms.targetCost = {
        value,
        confidence: 0.9,
        sources: [{ page: 1, snippet: targetCostNumericMatch[0] }],
        method: 'pattern',
        needsReview: false,
      };
    }
  }

  // Extract contract price (Stipulated Sum)
  const contractPriceMatch = text.match(
    /Contract\s+Price[^$]*\$\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (contractPriceMatch) {
    const value = parseAmount(contractPriceMatch[0]);
    if (value) {
      terms.contractValue = {
        value,
        confidence: 0.9,
        sources: [{ page: 1, snippet: contractPriceMatch[0] }],
        method: 'pattern',
        needsReview: false,
      };
    }
  }

  // Extract GMP
  const gmpMatch = text.match(
    /(?:GMP|Guaranteed Maximum Price)[^$]*\$\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (gmpMatch) {
    const value = parseAmount(gmpMatch[0]);
    if (value) {
      terms.gmp = {
        value,
        confidence: 0.88,
        sources: [{ page: 1, snippet: gmpMatch[0] }],
        method: 'pattern',
        needsReview: false,
      };
    }
  }

  // Extract savings distribution
  // Use patterns that match the specific "- Party: X%" format for savings
  const savingsPatterns = [
    { key: '-\\s*Owner', field: 'ownerShare' },
    { key: '-\\s*(?:Architect|Design Team)', field: 'designTeamShare' },
    {
      key: '-\\s*(?:Contractor|Construction Team)',
      field: 'constructionTeamShare',
    },
  ];

  let hasSavings = false;
  const savingsDistribution: ExtractedFinancialTerms['savingsDistribution'] = {
    ownerShare: {
      value: 0,
      confidence: 0,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
    designTeamShare: {
      value: 0,
      confidence: 0,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
    constructionTeamShare: {
      value: 0,
      confidence: 0,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
  };

  for (const { key, field } of savingsPatterns) {
    // Match pattern: "- Owner: 40%" or "- Architect: 30%"
    const match = text.match(new RegExp(`${key}[:\\s]+(\\d+)\\s*%`, 'i'));
    if (match) {
      hasSavings = true;
      (savingsDistribution as any)[field] = {
        value: parseInt(match[1], 10),
        confidence: 0.85,
        sources: [{ page: 1, snippet: match[0] }],
        method: 'pattern',
        needsReview: false,
      };
    }
  }

  if (hasSavings) {
    terms.savingsDistribution = savingsDistribution;
  }

  return terms;
}

// ============================================================================
// Date Extraction
// ============================================================================

/**
 * Month name to number mapping
 */
const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/**
 * Parse date from text
 *
 * @param text - Text containing date
 * @returns ISO date string or null
 */
export function parseDate(text: string): string | null {
  // Already ISO format
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Month name format: March 1, 2026
  const monthNameMatch = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (monthNameMatch) {
    const month = MONTHS[monthNameMatch[1].toLowerCase()];
    if (month) {
      const day = monthNameMatch[2].padStart(2, '0');
      return `${monthNameMatch[3]}-${month}-${day}`;
    }
  }

  // Numeric format: 03/01/2026 or 3/1/2026
  const numericMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numericMatch) {
    const month = numericMatch[1].padStart(2, '0');
    const day = numericMatch[2].padStart(2, '0');
    return `${numericMatch[3]}-${month}-${day}`;
  }

  return null;
}

/**
 * Extract dates from contract text
 *
 * @param text - Contract text
 * @returns Extracted dates
 */
export async function extractDates(text: string): Promise<ExtractedDates> {
  const dates: ExtractedDates = {};

  // Commencement date - allow commas in dates like "March 1, 2026"
  const commencementMatch = text.match(
    /Commencement\s+Date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (commencementMatch) {
    const parsed = parseDate(commencementMatch[1]);
    if (parsed) {
      dates.commencementDate = {
        value: parsed,
        confidence: 0.9,
        sources: [{ page: 1, snippet: commencementMatch[0] }],
        method: 'date',
        needsReview: false,
      };
    }
  }

  // Substantial completion
  const substantialMatch = text.match(
    /Substantial\s+(?:Completion|Performance)[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (substantialMatch) {
    const parsed = parseDate(substantialMatch[1]);
    if (parsed) {
      dates.substantialCompletion = {
        value: parsed,
        confidence: 0.88,
        sources: [{ page: 1, snippet: substantialMatch[0] }],
        method: 'date',
        needsReview: false,
      };
    }
  }

  // Final completion
  const finalMatch = text.match(
    /Final\s+Completion[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (finalMatch) {
    const parsed = parseDate(finalMatch[1]);
    if (parsed) {
      dates.finalCompletion = {
        value: parsed,
        confidence: 0.85,
        sources: [{ page: 1, snippet: finalMatch[0] }],
        method: 'date',
        needsReview: false,
      };
    }
  }

  return dates;
}

/**
 * Apply date extraction with article hints
 *
 * @param text - Contract text
 * @param keyword - Keyword to find date near
 * @param articleHints - Article/section hints
 * @returns Extracted date field
 */
export function applyDateExtraction(
  text: string,
  keyword: string,
  articleHints: string[]
): ExtractedField<string | null> {
  const keywordIndex = text.indexOf(keyword);
  if (keywordIndex === -1) {
    return {
      value: null,
      confidence: 0,
      sources: [],
      method: 'date',
      needsReview: true,
    };
  }

  const context = text.substring(keywordIndex, keywordIndex + 200);
  const dateMatch = context.match(
    /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/
  );

  if (dateMatch) {
    const parsed = parseDate(dateMatch[0]);
    return {
      value: parsed,
      confidence: 0.85,
      sources: [{ page: 1, snippet: context.substring(0, 100) }],
      method: 'date',
      needsReview: false,
    };
  }

  return {
    value: null,
    confidence: 0,
    sources: [],
    method: 'date',
    needsReview: true,
  };
}

// ============================================================================
// Governance Extraction
// ============================================================================

/**
 * Extract governance structure from contract text
 *
 * @param text - Contract text
 * @returns Extracted governance
 */
export async function extractGovernance(
  text: string
): Promise<ExtractedGovernance> {
  const hasPMT = /PMT|Project\s+Management\s+Team/i.test(text);
  const hasPET = /PET|Project\s+Executive\s+Team/i.test(text);

  const governance: ExtractedGovernance = {
    hasPMT: {
      value: hasPMT,
      confidence: hasPMT ? 0.95 : 0.9,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
    hasPET: {
      value: hasPET,
      confidence: hasPET ? 0.93 : 0.9,
      sources: [],
      method: 'pattern',
      needsReview: false,
    },
  };

  if (hasPMT) {
    // Extract voting rules
    const quorumMatch = text.match(
      /(?:decisions|vote)[^.]*?(majority|unanimous|supermajority)/i
    );
    const windowMatch = text.match(/within\s+(\d+)\s+hours/i);
    const thresholdMatch = text.match(/exceeding\s+\$\s*([\d,]+)/i);

    governance.pmtVoting = {
      quorum: {
        value:
          (quorumMatch?.[1]?.toLowerCase() as
            | 'majority'
            | 'unanimous'
            | 'supermajority') ?? 'majority',
        confidence: quorumMatch ? 0.85 : 0.6,
        sources: [],
        method: 'pattern',
        needsReview: !quorumMatch,
      },
      votingWindowHours: {
        value: windowMatch ? parseInt(windowMatch[1], 10) : 72,
        confidence: windowMatch ? 0.88 : 0.6,
        sources: [],
        method: 'pattern',
        needsReview: !windowMatch,
      },
      decisionThreshold: {
        value: thresholdMatch
          ? (parseAmount(thresholdMatch[0]) ?? 100000)
          : 100000,
        confidence: thresholdMatch ? 0.85 : 0.5,
        sources: [],
        method: 'pattern',
        needsReview: !thresholdMatch,
      },
    };
  }

  return governance;
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Apply regex extraction
 *
 * @param text - Text to search
 * @param pattern - Regex pattern
 * @returns Extracted value and confidence
 */
export function applyRegexExtraction(
  text: string,
  pattern: string
): { value: string | null; confidence: number } {
  try {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);

    if (match) {
      return {
        value: match[1] ?? match[0],
        confidence: 0.85,
      };
    }
  } catch (e) {
    // Invalid regex
  }

  return { value: null, confidence: 0 };
}

/**
 * Apply pattern extraction (keyword-based)
 *
 * @param text - Text to search
 * @param keyword - Keyword to find value near
 * @param valuePattern - Pattern for value
 * @returns Extracted value and confidence
 */
export function applyPatternExtraction(
  text: string,
  keyword: string,
  valuePattern: string
): { value: string | null; confidence: number } {
  const keywordIndex = text.indexOf(keyword);
  if (keywordIndex === -1) {
    return { value: null, confidence: 0 };
  }

  const context = text.substring(keywordIndex, keywordIndex + 500);
  const match = context.match(new RegExp(valuePattern, 'i'));

  if (match) {
    return {
      value: match[0],
      confidence: 0.8,
    };
  }

  return { value: null, confidence: 0 };
}

/**
 * Apply extraction rule
 *
 * @param text - Contract text
 * @param rule - Extraction rule
 * @returns Extracted field
 */
export async function applyExtractionRule(
  text: string,
  rule: ExtractionRule
): Promise<ExtractedField> {
  // Convert pattern to string if it's a RegExp
  const patternStr =
    rule.pattern instanceof RegExp ? rule.pattern.source : rule.pattern!;

  switch (rule.method) {
    case 'regex': {
      const result = applyRegexExtraction(text, patternStr);
      return {
        value: result.value,
        confidence: result.confidence,
        sources: [],
        method: 'regex',
        needsReview: result.confidence < rule.confidenceThreshold,
      };
    }

    case 'pattern': {
      const result = applyPatternExtraction(text, patternStr, '.*');
      return {
        value: result.value,
        confidence: result.confidence,
        sources: [],
        method: 'pattern',
        needsReview: result.confidence < rule.confidenceThreshold,
      };
    }

    case 'date': {
      const result = applyDateExtraction(
        text,
        patternStr,
        rule.articleHint ?? []
      );
      return result;
    }

    case 'llm': {
      // In production, this would call Claude API
      // For now, return placeholder
      return {
        value: null,
        confidence: 0.7,
        sources: [],
        method: 'llm',
        needsReview: true,
      };
    }

    default:
      return {
        value: null,
        confidence: 0,
        sources: [],
        method: rule.method,
        needsReview: true,
      };
  }
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Calculate field confidence score
 *
 * @param input - Confidence calculation input
 * @returns Confidence score (0-1)
 */
export function calculateFieldConfidence(input: ConfidenceInput): number {
  const { matchType, sourceCount, patternStrength } = input;

  // Base confidence from match type
  let baseConfidence = 0;
  switch (matchType) {
    case 'exact':
      baseConfidence = 0.85;
      break;
    case 'fuzzy':
      baseConfidence = 0.55;
      break;
    case 'llm':
      baseConfidence = 0.7;
      break;
  }

  // Boost from multiple sources (ensures multiple > single)
  const sourceBoost = Math.min((sourceCount - 1) * 0.05, 0.1);

  // Pattern strength contribution (reduced to prevent fuzzy exceeding threshold)
  const patternContribution = patternStrength * 0.1;

  return Math.min(baseConfidence + sourceBoost + patternContribution, 0.99);
}

/**
 * Calculate overall extraction confidence
 *
 * @param fieldConfidences - Per-field confidence scores
 * @param requiredFields - Fields that are required
 * @returns Overall confidence score
 */
export function calculateOverallConfidence(
  fieldConfidences: Record<string, number>,
  requiredFields: string[] = []
): number {
  const fields = Object.entries(fieldConfidences);
  if (fields.length === 0) {
    return 0;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [field, confidence] of fields) {
    // Required fields have higher weight
    const weight = requiredFields.includes(field) ? 2 : 1;
    weightedSum += confidence * weight;
    totalWeight += weight;
  }

  return weightedSum / totalWeight;
}

/**
 * Flag fields below confidence threshold
 *
 * @param fieldConfidences - Per-field confidence scores
 * @param threshold - Threshold below which to flag
 * @returns Array of flagged field paths
 */
export function flagLowConfidenceFields(
  fieldConfidences: Record<string, number>,
  threshold: number
): string[] {
  return Object.entries(fieldConfidences)
    .filter(([_, confidence]) => confidence < threshold)
    .map(([field]) => field);
}

// ============================================================================
// Review Management
// ============================================================================

/**
 * Create review items from extraction
 *
 * @param extraction - Extraction result
 * @returns Review items
 */
export function createReviewItems(
  extraction: ContractExtractionResult
): ReviewItem[] {
  const items: ReviewItem[] = [];

  // Check parties
  extraction.parties?.forEach((party, index) => {
    if (party.name.needsReview) {
      items.push({
        id: `review-party-${index}-name`,
        fieldPath: `parties[${index}].name`,
        currentValue: party.name.value,
        confidence: party.name.confidence,
        sources: party.name.sources,
        reason: 'Low confidence party name extraction',
        status: 'pending',
      });
    }
  });

  return items;
}

/**
 * Apply review decision to an item
 *
 * @param item - Review item
 * @param decision - Decision input
 * @returns Updated review item
 */
export function applyReviewDecision(
  item: ReviewItem,
  decision: ReviewDecisionInput
): ReviewItem {
  return {
    ...item,
    status: decision.decision,
    modifiedValue:
      decision.decision === 'modified' ? decision.modifiedValue : undefined,
    reviewer: {
      userId: decision.reviewerId,
      name: decision.reviewerId, // Would look up name in production
      reviewedAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate required fields are present
 *
 * @param extraction - Extraction result
 * @returns Validation result
 */
export function validateRequiredFields(
  extraction: ContractExtractionResult
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!extraction.parties || extraction.parties.length === 0) {
    errors.push('At least one party is required');
  }

  if (!extraction.contractInfo?.family?.value) {
    errors.push('Contract family is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate complete extraction
 *
 * @param extraction - Extraction result
 * @returns Validation result
 */
export function validateExtraction(
  extraction: ContractExtractionResult
): ValidationResult {
  const requiredResult = validateRequiredFields(extraction);

  const errors = [...requiredResult.errors];
  const warnings = [...requiredResult.warnings];

  // Check confidence
  if (extraction.confidence.overall < CONFIDENCE_THRESHOLDS.REJECT_THRESHOLD) {
    errors.push('Overall extraction confidence too low');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Core Parsing Functions
// ============================================================================

/**
 * Parse contract from plain text
 *
 * @param text - Contract text
 * @param templateUrn - Template to use
 * @returns Parse result
 */
export async function parseContractText(
  text: string,
  templateUrn: ContractTemplateURN
): Promise<ParseContractResult> {
  const startTime = Date.now();

  try {
    // Detect contract type
    const detection = detectContractType(text);

    // Extract parties
    const parties = await extractParties(text, detection.family);

    // Extract financial terms
    const financialTerms = await extractFinancialTerms(text, detection.family);

    // Extract dates
    const dates = await extractDates(text);

    // Extract governance
    const governance = await extractGovernance(text);

    // Calculate confidence
    const fieldConfidences: Record<string, number> = {};
    parties.forEach((party, i) => {
      fieldConfidences[`parties[${i}].name`] = party.name.confidence;
      fieldConfidences[`parties[${i}].role`] = party.role.confidence;
    });

    if (financialTerms.targetCost) {
      fieldConfidences['financialTerms.targetCost'] =
        financialTerms.targetCost.confidence;
    }

    const overallConfidence = calculateOverallConfidence(fieldConfidences);
    const flaggedFields = flagLowConfidenceFields(
      fieldConfidences,
      CONFIDENCE_THRESHOLDS.REVIEW_THRESHOLD
    );

    const extraction: ContractExtractionResult = {
      extractionId: `ext-${Date.now()}`,
      sourceDocument: {
        filename: 'parsed-text',
        mimeType: 'text/plain',
        pageCount: 1,
        sha256Hash: '',
      },
      templateUsed: templateUrn,
      contractInfo: {
        family: {
          value: detection.family,
          confidence: detection.confidence,
          sources: [],
          method: 'pattern',
          needsReview:
            detection.confidence < CONFIDENCE_THRESHOLDS.REVIEW_THRESHOLD,
        },
        type: {
          value: detection.contractType ?? ContractType.STIPULATED_SUM,
          confidence: detection.contractType ? 0.85 : 0.5,
          sources: [],
          method: 'pattern',
          needsReview: !detection.contractType,
        },
        deliveryMethod: {
          value: detection.isIPD ? DeliveryMethod.IPD : DeliveryMethod.DBB,
          confidence: 0.8,
          sources: [],
          method: 'pattern',
          needsReview: false,
        },
      },
      parties,
      financialTerms,
      dates,
      governance,
      confidence: {
        overall: overallConfidence,
        fields: fieldConfidences,
        flaggedFields,
        flagReasons: Object.fromEntries(
          flaggedFields.map((f) => [f, 'Below confidence threshold'])
        ),
      },
      reviewItems: [],
      timestamps: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      },
    };

    // Create review items
    extraction.reviewItems = createReviewItems(extraction);

    return {
      success: true,
      extraction,
      suggestedTemplate: templateUrn,
      templateConfidence: 0.85,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      errors: [(error as Error).message],
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Parse contract from input
 *
 * @param input - Parse contract input
 * @returns Parse result
 */
export async function parseContract(
  input: ParseContractInput
): Promise<ParseContractResult> {
  // Use performance.now() for sub-millisecond precision
  const startTime = performance.now();

  try {
    // Detect document type
    const docType = detectDocumentType(input.filename, input.mimeType);

    // Extract text
    const textResult = await extractTextFromDocument(input.content, docType);

    if (!textResult.success) {
      return {
        success: false,
        errors: textResult.errors,
        durationMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }

    // Get template
    let templateUrn = input.templateUrn;
    let templateConfidence = 1;

    if (!templateUrn) {
      const suggestion = getSuggestedTemplate(textResult.text);
      templateUrn = suggestion.templateUrn;
      templateConfidence = suggestion.confidence;
    }

    // Parse the text
    const result = await parseContractText(
      textResult.text,
      templateUrn ??
        ('urn:luhtech:ectropy:contract-template:UNKNOWN' as ContractTemplateURN)
    );

    // Ensure durationMs is at least 1 for valid timing
    const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

    return {
      ...result,
      suggestedTemplate: templateUrn,
      templateConfidence,
      durationMs: elapsedMs,
    };
  } catch (error) {
    return {
      success: false,
      errors: [(error as Error).message],
      durationMs: Math.max(1, Math.round(performance.now() - startTime)),
    };
  }
}

/**
 * Extract from text using template (alias for parseContractText)
 */
export const extractFromText = parseContractText;

// ============================================================================
// Service Export
// ============================================================================

/**
 * Contract Parser Service namespace
 */
export const ContractParserService = {
  // Core parsing
  parseContract,
  parseContractText,
  extractFromText,

  // Text extraction
  extractTextFromPDF,
  extractTextFromDOCX,
  detectDocumentType,

  // Field extraction
  extractParties,
  extractFinancialTerms,
  extractDates,
  extractGovernance,

  // Pattern matching
  applyExtractionRule,
  applyRegexExtraction,
  applyPatternExtraction,
  applyDateExtraction,

  // Confidence
  calculateFieldConfidence,
  calculateOverallConfidence,
  flagLowConfidenceFields,

  // Review
  createReviewItems,
  applyReviewDecision,

  // Validation
  validateExtraction,
  validateRequiredFields,

  // Utilities
  normalizePartyName,
  parseAmount,
  parseDate,
};

export default ContractParserService;
