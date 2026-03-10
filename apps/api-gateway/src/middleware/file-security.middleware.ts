/**
 * ================================================
 * ENTERPRISE FILE SECURITY MIDDLEWARE
 * ================================================
 * Purpose: Prevent path traversal, validate file types, sanitize filenames
 * Security Standards: OWASP Top 10 (2021) - A03:2021 Injection
 * Author: Claude (Enterprise Integration)
 * Date: 2025-11-14
 * ================================================
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Allowed file extensions with MIME type mapping
 * IFC: Industry Foundation Classes (BIM standard)
 */
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  ifc: ['model/ifc', 'application/x-step', 'application/octet-stream'],
  // Future: Add support for other BIM formats
  // rvt: ['application/octet-stream'], // Revit
  // dwg: ['application/acad', 'application/x-autocad'], // AutoCAD
};

/**
 * Maximum filename length (prevent DoS via long filenames)
 */
const MAX_FILENAME_LENGTH = 255;

/**
 * Sanitize filename to prevent path traversal and injection attacks
 *
 * Security Measures:
 * 1. Remove directory traversal sequences (../, ..\)
 * 2. Remove path separators (/, \)
 * 3. Remove null bytes
 * 4. Remove control characters
 * 5. Limit to safe character set [a-zA-Z0-9._-]
 * 6. Enforce maximum length
 * 7. Preserve file extension
 *
 * @param filename - Original filename from upload
 * @returns Sanitized filename safe for file system operations
 */
export function sanitizeFilename(filename: string): string {
  // Step 1: Extract extension before sanitization
  const ext = path.extname(filename).toLowerCase();
  let basename = path.basename(filename, ext);

  // Step 2: Remove directory traversal sequences
  basename = basename.replace(/\.\./g, '');

  // Step 3: Remove path separators and null bytes
  basename = basename.replace(/[\/\\:\x00]/g, '');

  // Step 4: Remove control characters (0x00-0x1F, 0x7F)
  basename = basename.replace(/[\x00-\x1F\x7F]/g, '');

  // Step 5: Replace unsafe characters with underscores
  // Allow: alphanumeric, dot, hyphen, underscore
  basename = basename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Step 6: Remove leading/trailing dots and hyphens
  basename = basename.replace(/^[.-]+|[.-]+$/g, '');

  // Step 7: Collapse multiple underscores
  basename = basename.replace(/_+/g, '_');

  // Step 8: Ensure non-empty filename
  if (basename.length === 0) {
    basename = 'unnamed';
  }

  // Step 9: Truncate if too long (leave room for extension)
  const maxBaseLength = MAX_FILENAME_LENGTH - ext.length - 10; // Reserve space for timestamp
  if (basename.length > maxBaseLength) {
    basename = basename.substring(0, maxBaseLength);
  }

  // Step 10: Add timestamp prefix to ensure uniqueness
  const timestamp = Date.now();
  const sanitized = `${timestamp}_${basename}${ext}`;

  return sanitized;
}

/**
 * Generate cryptographically secure random filename
 * Use this when filename doesn't need to preserve original name
 *
 * @param extension - File extension (e.g., '.ifc')
 * @returns Random filename with timestamp and crypto hash
 */
export function generateSecureFilename(extension: string): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  return `upload_${timestamp}_${randomBytes}${extension}`;
}

/**
 * Validate file extension against whitelist
 *
 * @param filename - Filename to validate
 * @param allowedTypes - Array of allowed extensions (e.g., ['ifc'])
 * @returns true if extension is allowed, false otherwise
 */
export function validateFileExtension(
  filename: string,
  allowedTypes: string[] = ['ifc']
): boolean {
  const ext = path.extname(filename).toLowerCase().substring(1); // Remove leading dot
  return allowedTypes.includes(ext);
}

/**
 * Validate MIME type against whitelist
 * Note: MIME type can be spoofed, so this is a secondary check
 *
 * @param mimeType - MIME type from multer
 * @param extension - File extension
 * @returns true if MIME type is allowed for this extension
 */
export function validateMimeType(
  mimeType: string,
  extension: string
): boolean {
  const allowedMimes = ALLOWED_EXTENSIONS[extension.toLowerCase()];
  if (!allowedMimes) {
    return false;
  }
  return allowedMimes.includes(mimeType.toLowerCase());
}

/**
 * Express middleware for file upload security
 * Apply this AFTER multer middleware but BEFORE processing
 *
 * Validates:
 * - File exists
 * - Extension is whitelisted
 * - MIME type matches extension
 * - Filename is safe
 *
 * @example
 * router.post('/upload',
 *   upload.single('file'),
 *   fileSecurityMiddleware(['ifc']),
 *   async (req, res) => { ... }
 * );
 */
export function fileSecurityMiddleware(
  allowedExtensions: string[] = ['ifc']
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a file in the request',
      });
    }

    const file = req.file;

    // Validate file extension
    if (!validateFileExtension(file.originalname, allowedExtensions)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: `Only ${allowedExtensions.join(', ').toUpperCase()} files are supported`,
        allowedTypes: allowedExtensions,
      });
    }

    const ext = path.extname(file.originalname).toLowerCase().substring(1);

    // Validate MIME type
    if (!validateMimeType(file.mimetype, ext)) {
      return res.status(400).json({
        error: 'Invalid MIME type',
        message: `File MIME type (${file.mimetype}) does not match extension (.${ext})`,
        expectedMimeTypes: ALLOWED_EXTENSIONS[ext],
      });
    }

    // Sanitize filename and store in request
    const sanitizedFilename = sanitizeFilename(file.originalname);
    (req as any).sanitizedFilename = sanitizedFilename;

    // Log security event (for audit trail)
    logger.info('File upload security check passed:', {
      originalName: file.originalname,
      sanitizedName: sanitizedFilename,
      mimeType: file.mimetype,
      size: file.size,
      user: (req as any).user?.id || 'unknown',
    });

    next();
  };
}

/**
 * Express middleware for file size validation
 * Use this to enforce stricter limits than multer's default
 *
 * @param maxSizeBytes - Maximum file size in bytes
 * @param friendlySize - Human-readable size for error messages (e.g., '100MB')
 */
export function fileSizeMiddleware(
  maxSizeBytes: number,
  friendlySize: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a file in the request',
      });
    }

    if (req.file.size > maxSizeBytes) {
      return res.status(413).json({
        error: 'File too large',
        message: `File size (${Math.round(req.file.size / 1024 / 1024)}MB) exceeds maximum allowed size of ${friendlySize}`,
        maxSize: friendlySize,
        actualSize: `${Math.round(req.file.size / 1024 / 1024)}MB`,
      });
    }

    next();
  };
}

/**
 * Magic number (file signature) validation for IFC files
 * Validates actual file content, not just extension or MIME type
 *
 * IFC file signatures:
 * - IFC-STEP (.ifc): Starts with "ISO-10303-21;"
 * - IFC-XML (.ifcxml): Starts with "<?xml" and contains "<ifcXML"
 *
 * OWASP recommendation: Always validate file content to prevent:
 * - Malicious files renamed with safe extensions
 * - MIME type spoofing
 * - Polyglot attacks (files with multiple valid formats)
 */
export function validateMagicNumber(buffer: Buffer, extension: string): boolean {
  if (extension === 'ifc') {
    // IFC-STEP files must start with ISO-10303-21 header
    const header = buffer.toString('utf-8', 0, 100);
    return header.includes('ISO-10303-21');
  } else if (extension === 'ifcxml') {
    // IFC-XML files must be valid XML with ifcXML namespace
    const header = buffer.toString('utf-8', 0, 200);
    return header.includes('<?xml') && header.toLowerCase().includes('ifcxml');
  }
  return false;
}

/**
 * Express middleware for magic number validation
 * Validates actual file content (not just extension/MIME)
 *
 * CRITICAL: This prevents attackers from uploading malicious files
 * renamed with .ifc extension
 */
export function magicNumberMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a file in the request',
      });
    }

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase().substring(1);

    // Read file buffer (handle both multer storage types)
    let buffer: Buffer;
    if (file.buffer) {
      buffer = file.buffer;
    } else if (file.path) {
      const fs = require('fs');
      buffer = fs.readFileSync(file.path);
    } else {
      return res.status(500).json({
        error: 'File processing error',
        message: 'Could not read file content',
      });
    }

    // Validate magic number
    if (!validateMagicNumber(buffer, ext)) {
      // Log security violation
      logger.error('Magic number validation failed:', {
        filename: file.originalname,
        extension: ext,
        mimeType: file.mimetype,
        size: file.size,
        user: (req as any).user?.id || 'unknown',
        headerBytes: buffer.toString('hex', 0, 20), // First 20 bytes for forensics
      });

      return res.status(400).json({
        error: 'Invalid file format',
        message: `File content does not match .${ext} format. The file may be corrupted or renamed.`,
        expectedFormat: ext === 'ifc' ? 'IFC-STEP (ISO-10303-21)' : 'IFC-XML',
      });
    }

    next();
  };
}

/**
 * Virus scanning middleware placeholder
 * In production, integrate with ClamAV or similar
 *
 * @example Integration with ClamAV:
 * import NodeClam from 'clamscan';
 * const clamscan = await new NodeClam().init({...});
 * const {isInfected, file, viruses} = await clamscan.isInfected(filePath);
 */
export function virusScanMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // TODO: Integrate virus scanning in production
    // For now, log a warning
    logger.warn(
      'Virus scanning not implemented - integrate ClamAV for production'
    );

    // In production, uncomment and implement:
    /*
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const { isInfected, viruses } = await scanFile(req.file.buffer);
      if (isInfected) {
        logger.error('Virus detected:', viruses);
        return res.status(400).json({
          error: 'File contains malware',
          message: 'The uploaded file was rejected by virus scanner',
        });
      }
    } catch (error) {
      logger.error('Virus scan failed:', error);
      return res.status(500).json({
        error: 'Security check failed',
        message: 'Could not complete virus scan',
      });
    }
    */

    next();
  };
}

// Export all functions
export default {
  validateMagicNumber,
  magicNumberMiddleware,
  sanitizeFilename,
  generateSecureFilename,
  validateFileExtension,
  validateMimeType,
  fileSecurityMiddleware,
  fileSizeMiddleware,
  virusScanMiddleware,
};
