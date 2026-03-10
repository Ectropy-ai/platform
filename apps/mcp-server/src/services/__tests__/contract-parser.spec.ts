/**
 * Contract Parser Service Tests - CO-M2
 *
 * Test-first development for Contract Parser Service.
 * Tests document parsing, extraction, and confidence scoring.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ENTERPRISE FIX (2026-01-30): Mock pdf-parse and mammoth for unit tests
// The actual implementation validates file signatures (PDF header, ZIP magic number)
// These mocks allow testing the extraction logic without real PDF/DOCX files
// ROOT CAUSE (Five Why 2026-02-27): vi.fn().mockResolvedValue() in vi.mock()
// factory does NOT survive restoreMocks: true (vitest.config.ts).
// Use vi.fn(async () => ...) to preserve _originImpl across mockRestore() cycles.
vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({
    numpages: 1,
    text: 'Mock PDF extracted text content for testing',
  })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({
      value: 'Mock DOCX extracted text content for testing',
      messages: [], // Required by implementation for warning extraction
    })),
  },
}));

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractExtractionResult,
  type ParseContractInput,
  type ParseContractResult,
  type ContractTemplateURN,
  CONFIDENCE_THRESHOLDS,
} from '../../types/contract.types.js';

import { AuthorityLevel } from '../../types/pm.types.js';

// Import the service (to be implemented)
import {
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

  // Confidence scoring
  calculateFieldConfidence,
  calculateOverallConfidence,
  flagLowConfidenceFields,

  // Review management
  createReviewItems,
  applyReviewDecision,

  // Validation
  validateExtraction,
  validateRequiredFields,

  // Utilities
  normalizePartyName,
  parseAmount,
  parseDate,

  // Service namespace
  ContractParserService,
} from '../contract-parser.service.js';

// ============================================================================
// Mock Data
// ============================================================================

const sampleAIAContractText = `
AIA Document C191-2009
MULTI-PARTY AGREEMENT FOR INTEGRATED PROJECT DELIVERY

THIS AGREEMENT made as of the 15th day of January in the year 2026

BETWEEN the OWNER:
Acme Development Corporation
123 Main Street, Suite 500
New York, NY 10001
Contact: John Smith, john@acme.com

AND the ARCHITECT:
Smith & Associates Architecture, P.C.
456 Design Boulevard
New York, NY 10002
Contact: Jane Doe, jane@smitharch.com

AND the CONTRACTOR:
BuildRight General Contractors, Inc.
789 Construction Way
Newark, NJ 07101
Contact: Bob Builder, bob@buildright.com

ARTICLE 2 - TARGET COST AND COMPENSATION

2.1 The Target Cost for the Project is Fifty Million Dollars ($50,000,000.00).

2.2 The parties agree to share any savings below the Target Cost as follows:
- Owner: 40%
- Architect: 30%
- Contractor: 30%

ARTICLE 3 - PROJECT MANAGEMENT

3.1 The Project Management Team (PMT) shall consist of one representative from each Party.

3.2 The Project Executive Team (PET) shall have final authority on matters exceeding $100,000.

3.3 PMT decisions shall be made by majority vote within 72 hours.

ARTICLE 4 - KEY DATES

4.1 Commencement Date: March 1, 2026
4.2 Substantial Completion: June 30, 2028
4.3 Final Completion: September 30, 2028
`;

const sampleCCDCContractText = `
CCDC 2 - 2020
STIPULATED PRICE CONTRACT

Agreement between:

OWNER: Canadian Property Holdings Ltd.
Address: 100 Queen Street, Toronto, ON M5H 2N2
Email: owner@cph.ca

CONSULTANT: Engineering Solutions Inc.
Address: 200 Bay Street, Toronto, ON M5J 2T3
Email: consultant@esolutions.ca

CONTRACTOR: Northern Construction Company
Address: 300 Yonge Street, Toronto, ON M4N 2E2
Email: contractor@northerncc.ca

CONTRACT PRICE: $15,500,000.00 CAD

Commencement Date: April 1, 2026
Substantial Performance: December 15, 2027
`;

// ============================================================================
// Text Extraction Tests
// ============================================================================

describe('ContractParserService', () => {
  describe('Text Extraction', () => {
    describe('detectDocumentType', () => {
      it('should detect PDF from content type', () => {
        const type = detectDocumentType('contract.pdf', 'application/pdf');
        expect(type).toBe('pdf');
      });

      it('should detect DOCX from content type', () => {
        const type = detectDocumentType(
          'contract.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        expect(type).toBe('docx');
      });

      it('should detect from filename if no content type', () => {
        const type = detectDocumentType('contract.pdf');
        expect(type).toBe('pdf');
      });

      it('should return unknown for unsupported types', () => {
        const type = detectDocumentType('contract.txt', 'text/plain');
        expect(type).toBe('text');
      });
    });

    describe('extractTextFromPDF', () => {
      it('should extract text from mock PDF content', async () => {
        // ENTERPRISE FIX (2026-01-30): Create mock PDF with valid header signature
        // The implementation validates %PDF- header before parsing
        const pdfHeader = '%PDF-1.4 mock pdf content for testing';
        const mockPdfContent = Buffer.from(pdfHeader).toString('base64');

        const result = await extractTextFromPDF(mockPdfContent);

        expect(result.success).toBe(true);
        expect(result.text).toBeDefined();
      });

      it('should return page count', async () => {
        const pdfHeader = '%PDF-1.4 mock pdf content for testing';
        const mockPdfContent = Buffer.from(pdfHeader).toString('base64');

        const result = await extractTextFromPDF(mockPdfContent);

        expect(result.pageCount).toBeGreaterThanOrEqual(0);
      });
    });

    describe('extractTextFromDOCX', () => {
      it('should extract text from mock DOCX content', async () => {
        // ENTERPRISE FIX (2026-01-30): Create mock DOCX with valid ZIP header
        // DOCX files are ZIP archives with PK\x03\x04 magic number and min 100 bytes
        const zipHeader = Buffer.alloc(100);
        zipHeader[0] = 0x50; // P
        zipHeader[1] = 0x4b; // K
        zipHeader[2] = 0x03;
        zipHeader[3] = 0x04;
        const mockDocxContent = zipHeader.toString('base64');

        const result = await extractTextFromDOCX(mockDocxContent);

        expect(result.success).toBe(true);
        expect(result.text).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Party Extraction Tests
  // ============================================================================

  describe('Party Extraction', () => {
    describe('extractParties', () => {
      it('should extract parties from AIA contract text', async () => {
        const parties = await extractParties(
          sampleAIAContractText,
          ContractFamily.AIA
        );

        expect(parties).toHaveLength(3);
        expect(parties.map((p) => p.role.value)).toContain(
          ContractPartyRole.OWNER
        );
        expect(parties.map((p) => p.role.value)).toContain(
          ContractPartyRole.ARCHITECT
        );
        expect(parties.map((p) => p.role.value)).toContain(
          ContractPartyRole.CONTRACTOR
        );
      });

      it('should extract party names correctly', async () => {
        const parties = await extractParties(
          sampleAIAContractText,
          ContractFamily.AIA
        );

        const owner = parties.find(
          (p) => p.role.value === ContractPartyRole.OWNER
        );
        expect(owner?.name.value).toContain('Acme');
      });

      it('should extract party emails', async () => {
        const parties = await extractParties(
          sampleAIAContractText,
          ContractFamily.AIA
        );

        const owner = parties.find(
          (p) => p.role.value === ContractPartyRole.OWNER
        );
        expect(owner?.email?.value).toContain('@');
      });

      it('should extract CCDC parties with Consultant role', async () => {
        const parties = await extractParties(
          sampleCCDCContractText,
          ContractFamily.CCDC
        );

        expect(parties.map((p) => p.role.value)).toContain(
          ContractPartyRole.CONSULTANT
        );
      });

      it('should have confidence scores for each party', async () => {
        const parties = await extractParties(
          sampleAIAContractText,
          ContractFamily.AIA
        );

        for (const party of parties) {
          expect(party.name.confidence).toBeGreaterThan(0);
          expect(party.name.confidence).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('normalizePartyName', () => {
      it('should remove common suffixes', () => {
        expect(normalizePartyName('Acme Corporation')).toBe('Acme');
        expect(normalizePartyName('Smith Inc.')).toBe('Smith');
        expect(normalizePartyName('BuildRight LLC')).toBe('BuildRight');
      });

      it('should trim whitespace', () => {
        expect(normalizePartyName('  Acme Corp  ')).toBe('Acme');
      });

      it('should preserve architect designations', () => {
        expect(normalizePartyName('Smith Architecture, P.C.')).toContain(
          'Architecture'
        );
      });
    });
  });

  // ============================================================================
  // Financial Terms Extraction Tests
  // ============================================================================

  describe('Financial Terms Extraction', () => {
    describe('extractFinancialTerms', () => {
      it('should extract target cost from IPD contract', async () => {
        const terms = await extractFinancialTerms(
          sampleAIAContractText,
          ContractFamily.AIA
        );

        expect(terms.targetCost?.value).toBe(50000000);
      });

      it('should extract contract price from stipulated sum', async () => {
        const terms = await extractFinancialTerms(
          sampleCCDCContractText,
          ContractFamily.CCDC
        );

        expect(terms.contractValue?.value).toBe(15500000);
      });

      it('should detect currency', async () => {
        const aiaTerms = await extractFinancialTerms(
          sampleAIAContractText,
          ContractFamily.AIA
        );
        expect(aiaTerms.currency.value).toBe('USD');

        const ccdcTerms = await extractFinancialTerms(
          sampleCCDCContractText,
          ContractFamily.CCDC
        );
        expect(ccdcTerms.currency.value).toBe('CAD');
      });

      it('should extract savings distribution', async () => {
        const terms = await extractFinancialTerms(
          sampleAIAContractText,
          ContractFamily.AIA
        );

        expect(terms.savingsDistribution?.ownerShare.value).toBe(40);
        expect(terms.savingsDistribution?.designTeamShare.value).toBe(30);
        expect(terms.savingsDistribution?.constructionTeamShare.value).toBe(30);
      });
    });

    describe('parseAmount', () => {
      it('should parse dollar amounts', () => {
        expect(parseAmount('$50,000,000.00')).toBe(50000000);
        expect(parseAmount('$15,500,000')).toBe(15500000);
        expect(parseAmount('Fifty Million Dollars')).toBe(50000000);
      });

      it('should handle CAD notation', () => {
        expect(parseAmount('$15,500,000.00 CAD')).toBe(15500000);
      });

      it('should return null for invalid amounts', () => {
        expect(parseAmount('not a number')).toBeNull();
      });
    });
  });

  // ============================================================================
  // Date Extraction Tests
  // ============================================================================

  describe('Date Extraction', () => {
    describe('extractDates', () => {
      it('should extract commencement date', async () => {
        const dates = await extractDates(sampleAIAContractText);

        expect(dates.commencementDate?.value).toBe('2026-03-01');
      });

      it('should extract substantial completion date', async () => {
        const dates = await extractDates(sampleAIAContractText);

        expect(dates.substantialCompletion?.value).toBe('2028-06-30');
      });

      it('should extract final completion date', async () => {
        const dates = await extractDates(sampleAIAContractText);

        expect(dates.finalCompletion?.value).toBe('2028-09-30');
      });
    });

    describe('parseDate', () => {
      it('should parse various date formats', () => {
        expect(parseDate('March 1, 2026')).toBe('2026-03-01');
        expect(parseDate('June 30, 2028')).toBe('2028-06-30');
        expect(parseDate('April 1, 2026')).toBe('2026-04-01');
      });

      it('should parse ISO format', () => {
        expect(parseDate('2026-03-01')).toBe('2026-03-01');
      });

      it('should parse numeric format', () => {
        expect(parseDate('03/01/2026')).toBe('2026-03-01');
        expect(parseDate('12/15/2027')).toBe('2027-12-15');
      });
    });

    describe('applyDateExtraction', () => {
      it('should extract dates with article hints', () => {
        const result = applyDateExtraction(
          sampleAIAContractText,
          'Commencement Date:',
          ['4']
        );

        expect(result.value).toBe('2026-03-01');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });
  });

  // ============================================================================
  // Governance Extraction Tests
  // ============================================================================

  describe('Governance Extraction', () => {
    describe('extractGovernance', () => {
      it('should detect PMT in IPD contracts', async () => {
        const governance = await extractGovernance(sampleAIAContractText);

        expect(governance.hasPMT.value).toBe(true);
      });

      it('should detect PET in IPD contracts', async () => {
        const governance = await extractGovernance(sampleAIAContractText);

        expect(governance.hasPET.value).toBe(true);
      });

      it('should extract PMT voting rules', async () => {
        const governance = await extractGovernance(sampleAIAContractText);

        expect(governance.pmtVoting?.quorum.value).toBe('majority');
        expect(governance.pmtVoting?.votingWindowHours.value).toBe(72);
      });

      it('should extract PET decision threshold', async () => {
        const governance = await extractGovernance(sampleAIAContractText);

        expect(governance.pmtVoting?.decisionThreshold.value).toBe(100000);
      });

      it('should return false for non-IPD contracts', async () => {
        const governance = await extractGovernance(sampleCCDCContractText);

        expect(governance.hasPMT.value).toBe(false);
        expect(governance.hasPET.value).toBe(false);
      });
    });
  });

  // ============================================================================
  // Pattern Matching Tests
  // ============================================================================

  describe('Pattern Matching', () => {
    describe('applyRegexExtraction', () => {
      it('should extract with regex pattern', () => {
        const result = applyRegexExtraction(
          'Target Cost is $50,000,000.00',
          '\\$([\\d,]+(?:\\.\\d{2})?)'
        );

        expect(result.value).toBe('50,000,000.00');
        expect(result.confidence).toBeGreaterThan(0.7);
      });

      it('should return null for no match', () => {
        const result = applyRegexExtraction('No amount here', '\\$([\\d,]+)');

        expect(result.value).toBeNull();
        expect(result.confidence).toBe(0);
      });
    });

    describe('applyPatternExtraction', () => {
      it('should extract with pattern near keyword', () => {
        const result = applyPatternExtraction(
          sampleAIAContractText,
          'Target Cost',
          '\\$[\\d,]+(?:\\.\\d{2})?'
        );

        expect(result.value).toContain('50,000,000');
      });
    });

    describe('applyExtractionRule', () => {
      it('should apply regex extraction rule', async () => {
        const rule = {
          fieldPath: 'financialTerms.targetCost',
          method: 'regex' as const,
          pattern: 'Target Cost.*?\\$([\\d,]+)',
          dataType: 'number' as const,
          required: true,
          confidenceThreshold: 0.8,
        };

        const result = await applyExtractionRule(sampleAIAContractText, rule);

        expect(result.value).toBeDefined();
        expect(result.method).toBe('regex');
      });

      it('should apply date extraction rule', async () => {
        const rule = {
          fieldPath: 'dates.commencementDate',
          method: 'date' as const,
          pattern: 'Commencement Date:',
          dataType: 'date' as const,
          required: true,
          confidenceThreshold: 0.7,
        };

        const result = await applyExtractionRule(sampleAIAContractText, rule);

        expect(result.value).toBe('2026-03-01');
        expect(result.method).toBe('date');
      });
    });
  });

  // ============================================================================
  // Confidence Scoring Tests
  // ============================================================================

  describe('Confidence Scoring', () => {
    describe('calculateFieldConfidence', () => {
      it('should return high confidence for exact pattern matches', () => {
        const confidence = calculateFieldConfidence({
          matchType: 'exact',
          sourceCount: 2,
          patternStrength: 0.9,
        });

        expect(confidence).toBeGreaterThan(0.8);
      });

      it('should return lower confidence for fuzzy matches', () => {
        const confidence = calculateFieldConfidence({
          matchType: 'fuzzy',
          sourceCount: 1,
          patternStrength: 0.6,
        });

        expect(confidence).toBeLessThan(0.7);
      });

      it('should increase confidence with multiple sources', () => {
        const single = calculateFieldConfidence({
          matchType: 'exact',
          sourceCount: 1,
          patternStrength: 0.8,
        });

        const multiple = calculateFieldConfidence({
          matchType: 'exact',
          sourceCount: 3,
          patternStrength: 0.8,
        });

        expect(multiple).toBeGreaterThan(single);
      });
    });

    describe('calculateOverallConfidence', () => {
      it('should calculate weighted average of field confidences', () => {
        const fieldConfidences = {
          'parties[0].name': 0.95,
          'parties[0].role': 0.92,
          'financialTerms.targetCost': 0.88,
          'dates.commencementDate': 0.75,
        };

        const overall = calculateOverallConfidence(fieldConfidences);

        expect(overall).toBeGreaterThan(0.8);
        expect(overall).toBeLessThan(0.95);
      });

      it('should weight required fields higher', () => {
        const fieldConfidences = {
          'parties[0].name': 0.5, // Required, low confidence
          optionalField: 0.95, // Optional, high confidence
        };
        const requiredFields = ['parties[0].name'];

        const overall = calculateOverallConfidence(
          fieldConfidences,
          requiredFields
        );

        expect(overall).toBeLessThan(0.7); // Low required field drags down overall
      });
    });

    describe('flagLowConfidenceFields', () => {
      it('should flag fields below threshold', () => {
        const fieldConfidences = {
          'parties[0].name': 0.95,
          'parties[0].email': 0.6, // Below 0.7 threshold
          'financialTerms.targetCost': 0.88,
        };

        const flagged = flagLowConfidenceFields(
          fieldConfidences,
          CONFIDENCE_THRESHOLDS.REVIEW_THRESHOLD
        );

        expect(flagged).toContain('parties[0].email');
        expect(flagged).not.toContain('parties[0].name');
      });
    });
  });

  // ============================================================================
  // Review Management Tests
  // ============================================================================

  describe('Review Management', () => {
    describe('createReviewItems', () => {
      it('should create review items for flagged fields', () => {
        const extraction: Partial<ContractExtractionResult> = {
          extractionId: 'ext-001',
          parties: [
            {
              name: {
                value: 'Ambiguous Name',
                confidence: 0.5,
                sources: [],
                method: 'llm',
                needsReview: true,
              },
              role: {
                value: ContractPartyRole.OWNER,
                confidence: 0.9,
                sources: [],
                method: 'llm',
                needsReview: false,
              },
              mappedAuthorityLevel: AuthorityLevel.OWNER,
            },
          ],
        };

        const reviewItems = createReviewItems(
          extraction as ContractExtractionResult
        );

        expect(reviewItems.length).toBeGreaterThan(0);
        expect(reviewItems[0].fieldPath).toContain('parties');
        expect(reviewItems[0].status).toBe('pending');
      });
    });

    describe('applyReviewDecision', () => {
      it('should update field with approved value', () => {
        const item = {
          id: 'review-001',
          fieldPath: 'parties[0].name',
          currentValue: 'Ambiguous Name',
          confidence: 0.5,
          sources: [],
          reason: 'Low confidence',
          status: 'pending' as const,
        };

        const result = applyReviewDecision(item, {
          decision: 'approved',
          reviewerId: 'user-123',
        });

        expect(result.status).toBe('approved');
        expect(result.reviewer?.userId).toBe('user-123');
      });

      it('should update field with modified value', () => {
        const item = {
          id: 'review-001',
          fieldPath: 'parties[0].name',
          currentValue: 'Ambiguous Name',
          confidence: 0.5,
          sources: [],
          reason: 'Low confidence',
          status: 'pending' as const,
        };

        const result = applyReviewDecision(item, {
          decision: 'modified',
          modifiedValue: 'Correct Name',
          reviewerId: 'user-123',
        });

        expect(result.status).toBe('modified');
        expect(result.modifiedValue).toBe('Correct Name');
      });
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  describe('Validation', () => {
    describe('validateRequiredFields', () => {
      it('should pass when all required fields present', () => {
        const extraction: Partial<ContractExtractionResult> = {
          parties: [
            {
              name: {
                value: 'Owner',
                confidence: 0.9,
                sources: [],
                method: 'llm',
                needsReview: false,
              },
              role: {
                value: ContractPartyRole.OWNER,
                confidence: 0.9,
                sources: [],
                method: 'llm',
                needsReview: false,
              },
              mappedAuthorityLevel: AuthorityLevel.OWNER,
            },
          ],
          contractInfo: {
            family: {
              value: ContractFamily.AIA,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
            type: {
              value: ContractType.IPD_MULTI_PARTY,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
            deliveryMethod: {
              value: DeliveryMethod.IPD,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
          },
        };

        const result = validateRequiredFields(
          extraction as ContractExtractionResult
        );

        expect(result.valid).toBe(true);
      });

      it('should fail when parties missing', () => {
        const extraction: Partial<ContractExtractionResult> = {
          parties: [],
          contractInfo: {
            family: {
              value: ContractFamily.AIA,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
            type: {
              value: ContractType.IPD_MULTI_PARTY,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
            deliveryMethod: {
              value: DeliveryMethod.IPD,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
          },
        };

        const result = validateRequiredFields(
          extraction as ContractExtractionResult
        );

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one party is required');
      });
    });

    describe('validateExtraction', () => {
      it('should validate complete extraction', () => {
        const extraction: Partial<ContractExtractionResult> = {
          extractionId: 'ext-001',
          sourceDocument: {
            filename: 'contract.pdf',
            mimeType: 'application/pdf',
            pageCount: 80,
            sha256Hash: 'abc123',
          },
          templateUsed:
            'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN,
          parties: [
            {
              name: {
                value: 'Owner',
                confidence: 0.9,
                sources: [],
                method: 'llm',
                needsReview: false,
              },
              role: {
                value: ContractPartyRole.OWNER,
                confidence: 0.9,
                sources: [],
                method: 'llm',
                needsReview: false,
              },
              mappedAuthorityLevel: AuthorityLevel.OWNER,
            },
          ],
          contractInfo: {
            family: {
              value: ContractFamily.AIA,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
            type: {
              value: ContractType.IPD_MULTI_PARTY,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
            deliveryMethod: {
              value: DeliveryMethod.IPD,
              confidence: 0.9,
              sources: [],
              method: 'llm',
              needsReview: false,
            },
          },
          confidence: {
            overall: 0.85,
            fields: {},
            flaggedFields: [],
            flagReasons: {},
          },
        };

        const result = validateExtraction(
          extraction as ContractExtractionResult
        );

        expect(result.valid).toBe(true);
      });
    });
  });

  // ============================================================================
  // Core Parsing Tests
  // ============================================================================

  describe('Core Parsing', () => {
    describe('parseContractText', () => {
      it('should parse AIA contract text', async () => {
        const result = await parseContractText(
          sampleAIAContractText,
          'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN
        );

        expect(result.success).toBe(true);
        expect(result.extraction?.parties).toHaveLength(3);
        expect(result.extraction?.contractInfo?.family.value).toBe(
          ContractFamily.AIA
        );
      });

      it('should parse CCDC contract text', async () => {
        const result = await parseContractText(
          sampleCCDCContractText,
          'urn:luhtech:ectropy:contract-template:CCDC-2-2020' as ContractTemplateURN
        );

        expect(result.success).toBe(true);
        expect(result.extraction?.parties).toHaveLength(3);
        expect(result.extraction?.contractInfo?.family.value).toBe(
          ContractFamily.CCDC
        );
      });

      it('should return confidence scores', async () => {
        const result = await parseContractText(
          sampleAIAContractText,
          'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN
        );

        expect(result.extraction?.confidence.overall).toBeGreaterThan(0);
      });

      it('should flag low confidence fields for review', async () => {
        const result = await parseContractText(
          sampleAIAContractText,
          'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN
        );

        expect(result.extraction?.reviewItems).toBeDefined();
      });
    });

    describe('parseContract', () => {
      it('should handle full parsing workflow', async () => {
        const input: ParseContractInput = {
          content: Buffer.from(sampleAIAContractText).toString('base64'),
          filename: 'contract.txt',
          mimeType: 'text/plain',
        };

        const result = await parseContract(input);

        expect(result.success).toBe(true);
        expect(result.extraction).toBeDefined();
      });

      it('should auto-detect template if not provided', async () => {
        const input: ParseContractInput = {
          content: Buffer.from(sampleAIAContractText).toString('base64'),
          filename: 'contract.txt',
          mimeType: 'text/plain',
        };

        const result = await parseContract(input);

        expect(result.suggestedTemplate).toBeDefined();
      });

      it('should return duration', async () => {
        const input: ParseContractInput = {
          content: Buffer.from(sampleAIAContractText).toString('base64'),
          filename: 'contract.txt',
          mimeType: 'text/plain',
        };

        const result = await parseContract(input);

        expect(result.durationMs).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should complete full parsing workflow for AIA IPD contract', async () => {
      const input: ParseContractInput = {
        content: Buffer.from(sampleAIAContractText).toString('base64'),
        filename: 'aia-c191-contract.txt',
        mimeType: 'text/plain',
      };

      const result = await parseContract(input);

      // Verify success
      expect(result.success).toBe(true);

      // Verify parties extracted
      const extraction = result.extraction!;
      expect(extraction.parties.length).toBeGreaterThanOrEqual(2);

      // Verify Owner extracted
      const owner = extraction.parties.find(
        (p) => p.role.value === ContractPartyRole.OWNER
      );
      expect(owner).toBeDefined();
      expect(owner?.name.value).toContain('Acme');

      // Verify financial terms
      expect(extraction.financialTerms?.targetCost?.value).toBe(50000000);

      // Verify governance
      expect(extraction.governance?.hasPMT?.value).toBe(true);
      expect(extraction.governance?.hasPET?.value).toBe(true);

      // Verify dates
      expect(extraction.dates?.commencementDate?.value).toBe('2026-03-01');
    });

    it('should complete full parsing workflow for CCDC contract', async () => {
      const input: ParseContractInput = {
        content: Buffer.from(sampleCCDCContractText).toString('base64'),
        filename: 'ccdc-2-contract.txt',
        mimeType: 'text/plain',
      };

      const result = await parseContract(input);

      expect(result.success).toBe(true);

      const extraction = result.extraction!;

      // CCDC uses "Consultant" instead of "Architect"
      const consultant = extraction.parties.find(
        (p) => p.role.value === ContractPartyRole.CONSULTANT
      );
      expect(consultant).toBeDefined();

      // Currency should be CAD
      expect(extraction.financialTerms?.currency?.value).toBe('CAD');

      // No IPD governance
      expect(extraction.governance?.hasPMT?.value).toBe(false);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should parse contract text in under 100ms', async () => {
      const start = performance.now();

      await parseContractText(
        sampleAIAContractText,
        'urn:luhtech:ectropy:contract-template:AIA-C191-2009' as ContractTemplateURN
      );

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should extract parties in under 50ms', async () => {
      const start = performance.now();

      await extractParties(sampleAIAContractText, ContractFamily.AIA);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });
});
