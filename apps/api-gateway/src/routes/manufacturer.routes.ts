/**
 * Manufacturer Routes - Enterprise Product Management
 * Endpoints for manufacturer and supplier product operations
 *
 * @enterprise-category procurement
 * @version 1.0.0
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
  type IRouter,
} from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../../../../libs/shared/errors/src/error-handler.js';

/**
 * Mock product data for development/testing
 * TODO: Connect to real database when manufacturer tables are created
 */
const mockProducts = [
  {
    id: 'prod-001',
    name: 'Structural Steel Beam H200',
    manufacturer: 'SteelCorp Industries',
    category: 'structural',
    specifications: {
      material: 'S355 Steel',
      dimensions: '200x200mm',
      weight: '61.3 kg/m',
    },
    certifications: ['ISO-9001', 'CE-marked'],
    availability: 'in-stock',
    leadTime: '5-7 business days',
  },
  {
    id: 'prod-002',
    name: 'Reinforced Concrete Column C300',
    manufacturer: 'ConcreteMax Ltd',
    category: 'structural',
    specifications: {
      material: 'C40/50 Concrete',
      dimensions: '300x300mm',
      reinforcement: '8x16mm bars',
    },
    certifications: ['ISO-14001', 'LEED-certified'],
    availability: 'made-to-order',
    leadTime: '10-14 business days',
  },
  {
    id: 'prod-003',
    name: 'Aluminum Curtain Wall Panel',
    manufacturer: 'GlassTech Systems',
    category: 'facade',
    specifications: {
      material: 'Anodized Aluminum 6063-T6',
      uValue: '1.2 W/m2K',
      dimensions: '1200x2400mm',
    },
    certifications: ['ISO-9001', 'Energy Star'],
    availability: 'in-stock',
    leadTime: '3-5 business days',
  },
];

/**
 * ManufacturerRoutes - Enterprise product and supplier management
 */
export class ManufacturerRoutes {
  private router: IRouter;
  private db: Pool;

  constructor(db: Pool) {
    this.router = express.Router();
    this.db = db;
    this.setupRoutes();
  }

  /**
   * Setup all manufacturer endpoints
   */
  private setupRoutes(): void {
    // Product search endpoint
    this.router.get('/products/search', this.createProductSearchHandler());

    // Get product by ID
    this.router.get('/products/:id', this.createGetProductHandler());

    // List all products
    this.router.get('/products', this.createListProductsHandler());

    // Get manufacturers list
    this.router.get('/', this.createListManufacturersHandler());
  }

  /**
   * Search products endpoint
   * GET /api/v1/manufacturer/products/search?q=<query>&category=<category>
   */
  private createProductSearchHandler() {
    return asyncHandler(
      async (req: Request, res: Response, _next: NextFunction) => {
        const { q, category, manufacturer } = req.query;
        const searchQuery = (q as string || '').toLowerCase();

        // Filter mock products (replace with real DB query in production)
        let results = mockProducts;

        if (searchQuery) {
          results = results.filter(
            (p) =>
              p.name.toLowerCase().includes(searchQuery) ||
              p.manufacturer.toLowerCase().includes(searchQuery) ||
              p.category.toLowerCase().includes(searchQuery)
          );
        }

        if (category) {
          results = results.filter((p) => p.category === category);
        }

        if (manufacturer) {
          results = results.filter(
            (p) => p.manufacturer.toLowerCase().includes((manufacturer as string).toLowerCase())
          );
        }

        res.json({
          success: true,
          data: {
            products: results,
            total: results.length,
            query: searchQuery || null,
            filters: {
              category: category || null,
              manufacturer: manufacturer || null,
            },
          },
          message: `Found ${results.length} products`,
        });
      }
    );
  }

  /**
   * Get product by ID
   * GET /api/v1/manufacturer/products/:id
   */
  private createGetProductHandler() {
    return asyncHandler(
      async (req: Request, res: Response, _next: NextFunction) => {
        const { id } = req.params;

        const product = mockProducts.find((p) => p.id === id);

        if (!product) {
          return res.status(404).json({
            success: false,
            error: 'Product not found',
            productId: id,
          });
        }

        res.json({
          success: true,
          data: product,
        });
      }
    );
  }

  /**
   * List all products
   * GET /api/v1/manufacturer/products
   */
  private createListProductsHandler() {
    return asyncHandler(
      async (_req: Request, res: Response, _next: NextFunction) => {
        res.json({
          success: true,
          data: {
            products: mockProducts,
            total: mockProducts.length,
          },
        });
      }
    );
  }

  /**
   * List manufacturers
   * GET /api/v1/manufacturer
   */
  private createListManufacturersHandler() {
    return asyncHandler(
      async (_req: Request, res: Response, _next: NextFunction) => {
        // Extract unique manufacturers from products
        const manufacturers = [...new Set(mockProducts.map((p) => p.manufacturer))];

        res.json({
          success: true,
          data: {
            manufacturers: manufacturers.map((name) => ({
              name,
              productCount: mockProducts.filter((p) => p.manufacturer === name).length,
            })),
            total: manufacturers.length,
          },
        });
      }
    );
  }

  /**
   * Get the Express router
   */
  public getRouter(): IRouter {
    return this.router;
  }
}

export default ManufacturerRoutes;
