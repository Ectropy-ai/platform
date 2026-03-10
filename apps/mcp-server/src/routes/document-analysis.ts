import { Router } from 'express';
import { rateLimiter } from '../middleware/rate-limiter.js';
// TODO: Import database pool once available
// import { pool } from '@ectropy/database';
import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
// TODO: Import IFC processing once available
// import { IFCProcessingService } from '@ectropy/ifc-processing';
import { enhancedDocumentProcessingService } from '../services/enhanced-document-processing.js';

export const documentAnalysisRouter: Router = Router();

documentAnalysisRouter.post('/', rateLimiter, async (req, res) => {
  try {
    const { documentPath, analysisType = 'summary' } = req.body;

    let analysis: any;
    let content = '';

    if (documentPath.endsWith('.ifc')) {
      // TODO: Implement IFC processing once service is available
      // const service = new IFCProcessingService(pool);
      // analysis = await service.processIFCFile(
      //   documentPath,
      //   'analysis-project',
      //   'system'
      // );
      analysis = { error: 'IFC processing not yet implemented' }; // Stub
      content = JSON.stringify(analysis);
    } else {
      const fileBuffer = await fs.readFile(documentPath);
      if (documentPath.endsWith('.pdf')) {
        const pdfData = await pdfParse(fileBuffer);
        content = pdfData.text;
      } else {
        content = fileBuffer.toString('utf8');
      }
      analysis = await analyzeContent(content, analysisType);
    }

    // TODO: Store results in database once pool is available
    // await pool.query(
    //   `
    //   INSERT INTO document_analyses (document_path, analysis_type, results, created_at)
    //   VALUES ($1, $2, $3, NOW())
    // `,
    //   [documentPath, analysisType, JSON.stringify(analysis)]
    // );

    return res.json({
      success: true,
      analysis,
      metadata: { documentPath, analysisType, contentLength: content.length },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Document analysis failed',
    });
  }
});

// Enhanced document processing endpoints for Task 3.3

// Process PDF documents
documentAnalysisRouter.post('/process/pdf', rateLimiter, async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required',
      });
    }

    const result = await enhancedDocumentProcessingService.processPDF(
      filePath,
      options
    );

    return res.json({
      success: result.success,
      documentType: 'pdf',
      data: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'PDF processing failed',
    });
  }
});

// Process IFC documents
documentAnalysisRouter.post('/process/ifc', rateLimiter, async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required',
      });
    }

    const result = await enhancedDocumentProcessingService.processIFC(
      filePath,
      options
    );

    return res.json({
      success: result.success,
      documentType: 'ifc',
      data: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'IFC processing failed',
    });
  }
});

// Process DWG/DXF documents
documentAnalysisRouter.post('/process/dwg', rateLimiter, async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required',
      });
    }

    const result = await enhancedDocumentProcessingService.processDWG(
      filePath,
      options
    );

    return res.json({
      success: result.success,
      documentType: 'dwg',
      data: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'DWG processing failed',
    });
  }
});

// Auto-detect and process any supported document
documentAnalysisRouter.post('/process/auto', rateLimiter, async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required',
      });
    }

    const result = await enhancedDocumentProcessingService.processDocumentFile(
      filePath,
      options
    );

    return res.json({
      success: result.success,
      documentType: result.documentType,
      data: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Document processing failed',
    });
  }
});

// Health check for enhanced document processing
documentAnalysisRouter.get('/health', async (req, res) => {
  try {
    const health = await enhancedDocumentProcessingService.getServiceHealth();
    return res.json(health);
  } catch (error) {
    return res.status(500).json({
      service: 'enhanced-document-processing',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function analyzeContent(content: string, type: string) {
  switch (type) {
    case 'summary':
      return generateSummary(content);
    case 'entities':
      return extractEntities(content);
    case 'compliance':
      return checkCompliance(content);
    default:
      return { type, result: 'Analysis type not implemented' };
  }
}

async function generateSummary(content: string) {
  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarize the provided document text.' },
          { role: 'user', content },
        ],
        max_tokens: 200,
      });
      return { summary: completion.choices[0].message.content };
    } catch (err) {
    }
  }
  return { summary: content.slice(0, 200) };
}

async function extractEntities(content: string) {
  const entities = Array.from(content.matchAll(/\b[A-Z][a-zA-Z]+\b/g)).map(
    (m) => m[0]
  );
  return { entities };
}

async function checkCompliance(content: string) {
  const keywords = ['safety', 'regulation', 'compliance'];
  const found = keywords.filter((k) => content.toLowerCase().includes(k));
  return { compliant: found.length > 0, keywords: found };
}
