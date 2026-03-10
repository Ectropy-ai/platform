/**
 * Contract Upload Routes - Demo 4 Implementation
 *
 * Handles contract document uploads (PDF, DOCX) for automated contract
 * parsing, authority cascade extraction, and governance configuration.
 *
 * Endpoints:
 * - POST /api/upload/contract - Upload and parse contract document
 * - GET /api/contracts/:projectId - List project contracts
 * - GET /api/contracts/:projectId/:contractId - Get contract details
 *
 * Security:
 * - File type validation (PDF, DOCX only)
 * - Magic number verification
 * - Size limits (25MB for contracts)
 * - Virus scanning (placeholder)
 *
 * @version 1.0.0
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import type { Pool } from 'pg';
import { logger } from '@ectropy/shared/utils';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  fileSecurityMiddleware,
  fileSizeMiddleware,
  magicNumberMiddleware,
  virusScanMiddleware,
} from '../middleware/file-security.middleware.js';
import { EnterpriseAuditLogger } from '@ectropy/shared/audit';

const router = Router();
const auditLogger = EnterpriseAuditLogger.getInstance();

// ============================================================================
// Types
// ============================================================================

/**
 * Contract upload status
 */
export type ContractStatus =
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'reviewed'
  | 'active'
  | 'error';

/**
 * Uploaded contract record
 */
export interface ContractDocument {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: ContractStatus;
  contentHash: string;
  base64Content?: string;
  extractedText?: string;
  extractionResult?: unknown;
  authorityCascade?: unknown;
  projectConfiguration?: unknown;
  confidence?: number;
  reviewItems?: unknown[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * Contract upload response
 */
export interface ContractUploadResponse {
  success: boolean;
  contractId?: string;
  status?: ContractStatus;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  extractionResult?: unknown;
  authorityCascade?: unknown;
  projectConfiguration?: unknown;
  confidence?: number;
  reviewItems?: unknown[];
  error?: string;
}

// ============================================================================
// In-Memory Storage (for demo - replace with Prisma in production)
// ============================================================================

const contractStorage = new Map<string, ContractDocument>();

// ============================================================================
// Multer Configuration
// ============================================================================

/**
 * Contract-specific multer configuration
 */
const contractUpload = multer({
  dest: 'uploads/contracts/',
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for contracts
  },
  fileFilter: (req, file, cb) => {
    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    const allowedExtensions = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only PDF, DOCX, and TXT files are allowed.'
        )
      );
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate SHA-256 hash of file content
 */
async function generateContentHash(buffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Detect MIME type from file signature
 */
function detectMimeType(buffer: Buffer, filename: string): string {
  // PDF magic number: %PDF
  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).toString('ascii') === '%PDF'
  ) {
    return 'application/pdf';
  }

  // DOCX/ZIP magic number: PK
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    if (filename.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
  }

  // Fallback to text
  return 'text/plain';
}

// ============================================================================
// Route Handlers
// ============================================================================

export function createContractUploadRoutes(db?: Pool): Router {
  // Ensure upload directory exists
  const uploadDir = 'uploads/contracts';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  /**
   * POST /api/upload/contract
   *
   * Upload and parse a contract document. Returns extraction results,
   * authority cascade, and suggested project configuration.
   */
  router.post(
    '/api/upload/contract',
    contractUpload.single('contract'),
    // Enterprise security middleware chain
    fileSecurityMiddleware(['pdf', 'docx', 'txt']),
    fileSizeMiddleware(25 * 1024 * 1024, '25MB'),
    magicNumberMiddleware(),
    virusScanMiddleware(),
    async (req: Request, res: Response): Promise<void> => {
      const file = req.file;
      const { projectId, tenantId } = req.body;

      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No contract file provided',
        } as ContractUploadResponse);
        return;
      }

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: 'projectId is required',
        } as ContractUploadResponse);
        return;
      }

      const contractId = uuidv4();
      let fileBuffer: Buffer;

      try {
        logger.info(
          `Processing contract file: ${file.originalname} (${file.size} bytes) for project ${projectId}`
        );

        // Read file buffer
        if (file.buffer) {
          fileBuffer = file.buffer;
        } else {
          fileBuffer = fs.readFileSync(file.path);
        }

        // Detect actual MIME type
        const mimeType = detectMimeType(fileBuffer, file.originalname);

        // Generate content hash for deduplication
        const contentHash = await generateContentHash(fileBuffer);

        // Check for duplicate uploads
        for (const [existingId, existingContract] of contractStorage) {
          if (
            existingContract.projectId === projectId &&
            existingContract.contentHash === contentHash
          ) {
            logger.warn(`Duplicate contract detected: ${contentHash}`);
            res.status(409).json({
              success: false,
              error: 'Duplicate contract - this file has already been uploaded',
              contractId: existingId,
            } as ContractUploadResponse);
            return;
          }
        }

        // Create contract record with pending status
        const contractDoc: ContractDocument = {
          id: contractId,
          projectId,
          tenantId: tenantId || 'default',
          filename: `${contractId}${path.extname(file.originalname)}`,
          originalName: file.originalname,
          mimeType,
          fileSize: file.size,
          status: 'parsing',
          contentHash,
          base64Content: fileBuffer.toString('base64'),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: (req as any).user?.id || 'anonymous',
        };

        // Store contract
        contractStorage.set(contractId, contractDoc);

        // Audit log: Contract upload started
        auditLogger.logAdminAction({
          userId: (req as any).user?.id || 'anonymous',
          sessionId: req.sessionID,
          sourceIp: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          action: 'contract_upload',
          resource: `contract:${contractId}`,
          outcome: 'success',
          metadata: {
            contractId,
            projectId,
            filename: file.originalname,
            size: file.size,
            mimeType,
            contentHash,
          },
        });

        // Parse contract asynchronously (fire and forget for quick response)
        // In production, this would be a background job
        parseContractAsync(contractId, fileBuffer, mimeType).catch((error) => {
          logger.error(
            `Background contract parsing failed for ${contractId}:`,
            error
          );
          const contract = contractStorage.get(contractId);
          if (contract) {
            contract.status = 'error';
            contract.updatedAt = new Date();
          }
        });

        // Cleanup uploaded file
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }

        // Return immediate response
        res.status(202).json({
          success: true,
          contractId,
          status: 'parsing',
          filename: file.originalname,
          fileSize: file.size,
          mimeType,
          message:
            'Contract uploaded and parsing started. Poll GET /api/contracts/:projectId/:contractId for results.',
        } as ContractUploadResponse);
      } catch (error) {
        logger.error('Contract upload processing failed:', error);

        // Update contract status to error
        const contract = contractStorage.get(contractId);
        if (contract) {
          contract.status = 'error';
          contract.updatedAt = new Date();
        }

        // Audit log: Failed upload
        auditLogger.logAdminAction({
          userId: (req as any).user?.id || 'anonymous',
          sessionId: req.sessionID,
          sourceIp: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          action: 'contract_upload',
          resource: `contract:${contractId}`,
          outcome: 'failure',
          metadata: {
            contractId,
            projectId,
            filename: file.originalname,
            size: file.size,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        // Cleanup uploaded file on error
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupError) {
            logger.warn('Failed to cleanup uploaded file:', cleanupError);
          }
        }

        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to process contract file',
        } as ContractUploadResponse);
      }
    }
  );

  /**
   * GET /api/contracts/:projectId
   *
   * List all contracts for a project
   */
  router.get(
    '/api/contracts/:projectId',
    async (req: Request, res: Response): Promise<void> => {
      const { projectId } = req.params;

      try {
        const contracts: ContractDocument[] = [];
        for (const contract of contractStorage.values()) {
          if (contract.projectId === projectId) {
            // Return contract without base64 content for list view
            const { base64Content, extractedText, ...contractSummary } =
              contract;
            contracts.push(contractSummary as ContractDocument);
          }
        }

        // Sort by creation date, newest first
        contracts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        res.json({
          success: true,
          projectId,
          contracts,
          count: contracts.length,
        });
      } catch (error) {
        logger.error('Failed to list contracts:', error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to list contracts',
        });
      }
    }
  );

  /**
   * GET /api/contracts/:projectId/:contractId
   *
   * Get contract details including extraction results
   */
  router.get(
    '/api/contracts/:projectId/:contractId',
    async (req: Request, res: Response): Promise<void> => {
      const { projectId, contractId } = req.params;

      try {
        const contract = contractStorage.get(contractId);

        if (!contract) {
          res.status(404).json({
            success: false,
            error: 'Contract not found',
          });
          return;
        }

        if (contract.projectId !== projectId) {
          res.status(403).json({
            success: false,
            error: 'Contract does not belong to this project',
          });
          return;
        }

        // Return contract without base64 content (too large)
        const { base64Content, ...contractDetails } = contract;

        res.json({
          success: true,
          contract: contractDetails,
        });
      } catch (error) {
        logger.error('Failed to get contract:', error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to get contract',
        });
      }
    }
  );

  /**
   * POST /api/contracts/:projectId/:contractId/apply
   *
   * Apply extracted contract configuration to project
   */
  router.post(
    '/api/contracts/:projectId/:contractId/apply',
    async (req: Request, res: Response): Promise<void> => {
      const { projectId, contractId } = req.params;

      try {
        const contract = contractStorage.get(contractId);

        if (!contract) {
          res.status(404).json({
            success: false,
            error: 'Contract not found',
          });
          return;
        }

        if (contract.projectId !== projectId) {
          res.status(403).json({
            success: false,
            error: 'Contract does not belong to this project',
          });
          return;
        }

        if (contract.status !== 'parsed' && contract.status !== 'reviewed') {
          res.status(400).json({
            success: false,
            error: `Cannot apply contract in status: ${contract.status}`,
          });
          return;
        }

        // Mark contract as active
        contract.status = 'active';
        contract.updatedAt = new Date();

        // Audit log: Contract applied
        auditLogger.logAdminAction({
          userId: (req as any).user?.id || 'anonymous',
          sessionId: req.sessionID,
          sourceIp: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          action: 'contract_apply',
          resource: `contract:${contractId}`,
          outcome: 'success',
          metadata: {
            contractId,
            projectId,
            authorityCascade: contract.authorityCascade,
          },
        });

        res.json({
          success: true,
          message: 'Contract configuration applied to project',
          contractId,
          projectConfiguration: contract.projectConfiguration,
        });
      } catch (error) {
        logger.error('Failed to apply contract:', error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to apply contract',
        });
      }
    }
  );

  return router;
}

// ============================================================================
// Background Contract Parsing
// ============================================================================

/**
 * Parse contract asynchronously
 *
 * This function runs in the background after the upload response is sent.
 * It uses the contract-parser.service for extraction.
 */
async function parseContractAsync(
  contractId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<void> {
  const contract = contractStorage.get(contractId);
  if (!contract) {
    throw new Error(`Contract ${contractId} not found`);
  }

  try {
    logger.info(`Starting background parsing for contract ${contractId}`);

    // Dynamic import to avoid circular dependencies
    const { parseContract } = await import(
      '@ectropy/mcp-server/services/contract-parser.service.js'
    );
    const { buildAuthorityCascade, mapAllPartiesToParticipants } = await import(
      '@ectropy/mcp-server/services/authority-mapper.service.js'
    );

    // Determine document type
    let docType: 'pdf' | 'docx' | 'text' = 'text';
    if (mimeType === 'application/pdf') {
      docType = 'pdf';
    } else if (mimeType.includes('wordprocessingml')) {
      docType = 'docx';
    }

    // Parse contract
    const parseResult = await parseContract({
      filename: contract.originalName,
      content: contract.base64Content!,
      mimeType: mimeType as
        | 'application/pdf'
        | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        | 'text/plain',
    });

    if (!parseResult.success) {
      throw new Error(parseResult.errors?.[0] || 'Contract parsing failed');
    }

    // Build authority cascade
    const contractUrn = `urn:ectropy:contract:${contractId}` as any;
    const authorityCascade = buildAuthorityCascade(
      parseResult.extraction!.parties,
      contractUrn
    );

    // Map participants
    const participants = mapAllPartiesToParticipants(
      parseResult.extraction!.parties
    );

    // Build project configuration
    const projectConfiguration = {
      authorityCascade,
      team: participants,
      governance: parseResult.extraction!.governance,
      milestones: parseResult.extraction!.dates,
      financial: parseResult.extraction!.financialTerms,
      contractInfo: {
        family: parseResult.extraction!.contractInfo.family.value,
        type: parseResult.extraction!.contractInfo.type.value,
        deliveryMethod:
          parseResult.extraction!.contractInfo.deliveryMethod.value,
      },
    };

    // Use overall confidence from extraction
    const overallConfidence = parseResult.extraction!.confidence.overall;

    // Update contract record
    contract.status = 'parsed';
    contract.extractedText = contract.originalName; // Store filename as reference
    contract.extractionResult = parseResult.extraction;
    contract.authorityCascade = authorityCascade;
    contract.projectConfiguration = projectConfiguration;
    contract.confidence = overallConfidence;
    contract.reviewItems = parseResult.extraction!.reviewItems;
    contract.updatedAt = new Date();

    logger.info(
      `Contract ${contractId} parsed successfully. Confidence: ${(overallConfidence * 100).toFixed(1)}%`
    );
  } catch (error) {
    logger.error(`Contract parsing failed for ${contractId}:`, error);

    // Update contract with error status
    contract.status = 'error';
    contract.updatedAt = new Date();

    throw error;
  }
}

// ============================================================================
// Export
// ============================================================================

// Default export for simple usage
const contractUploadRoutes = createContractUploadRoutes();
export default contractUploadRoutes;
