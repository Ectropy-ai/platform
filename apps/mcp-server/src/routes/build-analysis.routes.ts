/**
 * Build Analysis Routes
 * Endpoints for analyzing TypeScript build failures
 */

import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { BuildAnalyzer } from '../services/build-analyzer.js';
import { DependencyTracer } from '../services/dependency-tracer.js';
import { RootCauseAnalyzer } from '../services/root-cause-analyzer.js';
import path from 'path';

export const buildAnalysisRouter: ExpressRouter = Router();

const buildAnalyzer = new BuildAnalyzer();
const rootCauseAnalyzer = new RootCauseAnalyzer();

/**
 * POST /api/mcp/parse-build-output
 * Parse TypeScript build output and extract structured errors
 * 
 * Request body:
 * {
 *   "output": string,      // Raw build output
 *   "app": string          // Optional: application name
 * }
 * 
 * Response:
 * {
 *   "app": string,
 *   "success": boolean,
 *   "errors": BuildError[],
 *   "duration": number,
 *   "timestamp": string
 * }
 */
buildAnalysisRouter.post('/parse-build-output', async (req: Request, res: Response) => {
  try {
    const { output, app = 'unknown' } = req.body;

    if (!output || typeof output !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "output" field in request body',
        expected: 'string',
      });
    }

    const analysis = buildAnalyzer.parse(output, app);

    return res.json(analysis);
  } catch (error) {
    console.error('Error parsing build output:', error);
    return res.status(500).json({
      error: 'Failed to parse build output',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/trace-dependencies
 * Trace import chains and identify missing or circular dependencies
 * 
 * Request body:
 * {
 *   "file": string,        // File path to analyze
 *   "rootPath": string     // Optional: project root path
 * }
 * 
 * Response:
 * {
 *   "targetFile": string,
 *   "importChain": ImportChain,
 *   "buildOrder": string[],
 *   "blockedBy": string[]
 * }
 */
buildAnalysisRouter.post('/trace-dependencies', async (req: Request, res: Response) => {
  try {
    const { file, rootPath } = req.body;

    if (!file || typeof file !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "file" field in request body',
        expected: 'string',
      });
    }

    const tracer = new DependencyTracer(rootPath || process.cwd());
    const analysis = await tracer.trace(file);

    // Convert Map to object for JSON serialization
    const serializedAnalysis = {
      ...analysis,
      importChain: {
        ...analysis.importChain,
        resolvedPaths: Object.fromEntries(analysis.importChain.resolvedPaths),
      },
    };

    return res.json(serializedAnalysis);
  } catch (error) {
    console.error('Error tracing dependencies:', error);
    return res.status(500).json({
      error: 'Failed to trace dependencies',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/mcp/analyze-build-failure
 * Comprehensive analysis combining error parsing, dependency tracing, and root cause determination
 * 
 * Request body:
 * {
 *   "app": string,           // Application name
 *   "buildOutput": string,   // Raw build output
 *   "entryFile": string      // Optional: entry file path (default: apps/{app}/src/main.ts)
 * }
 * 
 * Response:
 * {
 *   "app": string,
 *   "buildErrors": BuildAnalysis,
 *   "dependencyAnalysis": DependencyAnalysis,
 *   "rootCause": RootCause,
 *   "timestamp": string
 * }
 */
buildAnalysisRouter.post('/analyze-build-failure', async (req: Request, res: Response) => {
  try {
    const { app, buildOutput, entryFile } = req.body;

    if (!app || typeof app !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "app" field in request body',
        expected: 'string',
      });
    }

    if (!buildOutput || typeof buildOutput !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "buildOutput" field in request body',
        expected: 'string',
      });
    }

    // 1. Parse build errors
    const buildErrors = buildAnalyzer.parse(buildOutput, app);

    // 2. Trace dependencies for entry file
    const defaultEntryFile = entryFile || `apps/${app}/src/main.ts`;
    const tracer = new DependencyTracer(process.cwd());
    const depAnalysis = await tracer.trace(defaultEntryFile);

    // 3. Analyze root cause
    const rootCause = rootCauseAnalyzer.analyze(buildErrors.errors, depAnalysis);

    // Serialize for JSON response
    const response = {
      app,
      buildErrors,
      dependencyAnalysis: {
        ...depAnalysis,
        importChain: {
          ...depAnalysis.importChain,
          resolvedPaths: Object.fromEntries(depAnalysis.importChain.resolvedPaths),
        },
      },
      rootCause,
      timestamp: new Date().toISOString(),
    };

    return res.json(response);
  } catch (error) {
    console.error('Error analyzing build failure:', error);
    return res.status(500).json({
      error: 'Failed to analyze build failure',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
