/**
 * Pattern Detection Routes
 * Endpoints for analyzing commits and detecting anti-patterns
 */

import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { CommitAnalyzer } from '../services/commit-analyzer.js';
import { DocumentationAnalyzer } from '../services/documentation-analyzer.js';

export const patternDetectionRouter: ExpressRouter = Router();

const commitAnalyzer = new CommitAnalyzer();
const documentationAnalyzer = new DocumentationAnalyzer();

/**
 * POST /api/mcp/analyze-commit
 * Analyze git diff for anti-patterns without enforcement
 * 
 * Request body:
 * {
 *   "diff": string  // Unified diff format
 * }
 * 
 * Response:
 * {
 *   "filesChanged": number,
 *   "linesAdded": number,
 *   "linesRemoved": number,
 *   "patterns": PatternDetection,
 *   "violations": Violation[],
 *   "score": number,
 *   "recommendation": "approve" | "review" | "reject"
 * }
 */
patternDetectionRouter.post('/analyze-commit', (req: Request, res: Response) => {
  try {
    const { diff } = req.body;

    if (!diff || typeof diff !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "diff" field in request body',
        expected: 'string (unified diff format)',
      });
    }

    const analysis = commitAnalyzer.analyze(diff);

    return res.json(analysis);
  } catch (error) {
    console.error('Error analyzing commit:', error);
    return res.status(500).json({
      error: 'Failed to analyze commit',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/validate-commit
 * Validate commit and enforce recommendations
 * 
 * Request body:
 * {
 *   "diff": string,      // Unified diff format
 *   "message": string,   // Optional: commit message
 *   "author": string     // Optional: commit author
 * }
 * 
 * Response (200 for approve/review, 403 for reject):
 * {
 *   "filesChanged": number,
 *   "linesAdded": number,
 *   "linesRemoved": number,
 *   "patterns": PatternDetection,
 *   "violations": Violation[],
 *   "score": number,
 *   "recommendation": "approve" | "review" | "reject",
 *   "message": string,
 *   "author": string
 * }
 */
patternDetectionRouter.post('/validate-commit', (req: Request, res: Response) => {
  try {
    const { diff, message, author } = req.body;

    if (!diff || typeof diff !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "diff" field in request body',
        expected: 'string (unified diff format)',
      });
    }

    const analysis = commitAnalyzer.analyze(diff);

    // Add optional metadata to response
    const response = {
      ...analysis,
      ...(message && { message }),
      ...(author && { author }),
    };

    // Return 403 if recommendation is reject
    if (analysis.recommendation === 'reject') {
      return res.status(403).json(response);
    }

    // Return 200 for approve or review
    return res.json(response);
  } catch (error) {
    console.error('Error validating commit:', error);
    return res.status(500).json({
      error: 'Failed to validate commit',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/mcp/documentation-report
 * Scan repository for documentation violations
 * 
 * Response:
 * {
 *   "analysis": DocumentationAnalysis
 * }
 */
patternDetectionRouter.get('/documentation-report', (req: Request, res: Response) => {
  try {
    const repoRoot = process.cwd();
    const analysis = documentationAnalyzer.analyze(repoRoot);
    
    return res.json({
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating documentation report:', error);
    return res.status(500).json({
      error: 'Failed to generate documentation report',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
