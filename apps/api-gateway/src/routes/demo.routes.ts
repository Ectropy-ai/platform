/**
 * Demo Routes - Provides demo/stats endpoint
 * Returns platform metrics data with safe defaults
 */

import express, { Router, Request, Response } from 'express';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export class DemoRoutes {
  private router: Router;

  constructor() {
    this.router = express.Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    /**
     * GET /api/demo/stats
     * Returns platform statistics for the landing page
     * Always returns complete data structure with safe defaults
     */
    this.router.get('/stats', (req: Request, res: Response) => {
      try {
        // Return platform metrics with guaranteed non-null values
        const stats = {
          data: {
            costReduction: 23.5,
            timeSavings: 31.2,
            searchSpeed: 26,
            uptime: 100,
          },
        };

        res.json(stats);
      } catch (error) {
        logger.error('Demo stats error:', error);
        
        // Even on error, return safe defaults
        res.status(200).json({
          data: {
            costReduction: 23.5,
            timeSavings: 31.2,
            searchSpeed: 26,
            uptime: 100,
          },
        });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}
