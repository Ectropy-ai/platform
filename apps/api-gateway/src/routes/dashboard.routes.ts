/**
 * Dashboard Route - Authenticated landing page
 * Returns user profile and dashboard data with guaranteed complete structure
 */

import express, { Router, Request, Response } from 'express';
import { getPrismaClient } from '../database/prisma.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Ensure analysis object always has required structure
 */
function normalizeAnalysis(analysis: any) {
  return {
    costReduction: analysis?.costReduction ?? 0,
    optimizationScore: analysis?.optimizationScore ?? 0,
    carbonSavings: analysis?.carbonSavings ?? 0,
    recommendations: analysis?.recommendations ?? [],
    lastUpdated: analysis?.lastUpdated ?? new Date().toISOString(),
  };
}

export class DashboardRoutes {
  private router: Router;
  private prisma: ReturnType<typeof getPrismaClient>;

  constructor() {
    this.router = express.Router();
    // Use shared Prisma Client singleton to prevent connection pool exhaustion
    this.prisma = getPrismaClient();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Authenticated dashboard endpoint with user profile
    this.router.get('/', async (req: Request, res: Response) => {
      try {
        // Check for session authentication (set by OAuth callback)
        const session = (req as any).session;

        if (!session?.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please sign in with OAuth provider',
            loginUrl: '/auth/login',
          });
        }

        // Get user from database
        const userId = session.user.id;
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            full_name: true,
            picture: true,
            provider: true,
            role: true,
            company: true,
            is_active: true,
            last_login: true,
            created_at: true,
          },
        });

        if (!user) {
          return res.status(404).json({
            error: 'User not found',
            message: 'User profile not found in database',
          });
        }

        // Return user profile JSON with safe dashboard data structure
        res.json({
          user,
          message: 'Authenticated successfully',
          session: {
            authenticated: true,
            provider: session.user.provider,
            expiresAt: session.user.expiresAt,
          },
          // Include basic dashboard structure with safe defaults
          projects: [],
          totalCostReduction: 0,
          totalCarbonSavings: 0,
          overallScore: 0,
        });
      } catch (error) {
        logger.error('Dashboard error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to retrieve user profile',
          // Return safe defaults even on error
          projects: [],
          totalCostReduction: 0,
          totalCarbonSavings: 0,
          overallScore: 0,
        });
      }
    });

    // Dashboard data endpoint with complete project information
    this.router.get('/data', async (req: Request, res: Response) => {
      try {
        const session = (req as any).session;

        if (!session?.user) {
          return res.status(401).json({
            error: 'Authentication required',
            projects: [],
            totalCostReduction: 0,
            totalCarbonSavings: 0,
            overallScore: 0,
          });
        }

        const userId = session.user.id;

        // Fetch projects with project roles
        const projects = await this.prisma.project
          .findMany({
            where: {
              OR: [
                { owner_id: userId },
                { project_roles: { some: { user_id: userId } } },
              ],
            },
            include: {
              owner: true,
              project_roles: true,
            },
          })
          .catch(() => []);

        // Normalize all project data to ensure complete structure
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizedProjects = projects.map((project: any) => ({
          id: project.id,
          name: project.name || 'Unnamed Project',
          status: project.status ?? 'planning',
          budget: Number(project.total_budget ?? 0),
          spent: 0, // Not tracked in current schema
          analysis: normalizeAnalysis(null), // Analysis not in schema yet
        }));

        // Calculate totals with safe defaults
        const totalCostReduction = normalizedProjects.reduce(
          (sum: number, p: { analysis?: { costReduction?: number } }) =>
            sum + (p.analysis?.costReduction ?? 0),
          0
        );

        const totalCarbonSavings = normalizedProjects.reduce(
          (sum: number, p: { analysis?: { carbonSavings?: number } }) =>
            sum + (p.analysis?.carbonSavings ?? 0),
          0
        );

        const overallScore =
          projects.length > 0
            ? normalizedProjects.reduce(
                (
                  sum: number,
                  p: { analysis?: { optimizationScore?: number } }
                ) => sum + (p.analysis?.optimizationScore ?? 0),
                0
              ) / projects.length
            : 0;

        res.json({
          projects: normalizedProjects,
          totalCostReduction,
          totalCarbonSavings,
          overallScore,
        });
      } catch (error) {
        logger.error('Dashboard data API error:', error);
        res.status(500).json({
          error: 'Failed to fetch dashboard data',
          projects: [],
          totalCostReduction: 0,
          totalCarbonSavings: 0,
          overallScore: 0,
        });
      }
    });

    // Health check for dashboard route
    this.router.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'dashboard',
        timestamp: new Date().toISOString(),
      });
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}
