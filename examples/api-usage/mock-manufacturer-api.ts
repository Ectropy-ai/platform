/*
 * =============================================================================
 * MOCK MANUFACTURER API SERVER - DEMONSTRATION & TESTING
 *
 * PURPOSE:
 * Simulates real manufacturer APIs (Kingspan, Guardian Glass, CEMEX) to
 * demonstrate template-governed data access and product integration workflows.
 * CAPABILITIES:
 * - Multi-tier product data simulation (public/technical/commercial/restricted)
 * - Real-time availability and pricing updates
 * - Role-based API responses
 * - Performance metrics simulation
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

type ProductTier = 'public' | 'technical' | 'commercial' | 'restricted';

type PricingTier = {
  method: string;
  cost: number;
  estimatedDays: number;
};

type VolumeDiscount = {
  quantity: number;
  discountPercent: number;
};

type Distributor = {
  distributorId: string;
  name: string;
  region?: string;
  contactInfo: string;
  stockLevel?: 'low' | 'medium' | 'high';
};

type Certification = {
  name: string;
  number: string;
  validUntil: Date;
};

type RecommendationReason = {
  type: string;
  description: string;
  weight: number;
};

const PRODUCT_TIERS: readonly ProductTier[] = [
  'public',
  'technical',
  'commercial',
  'restricted',
] as const;

const normalizeTiers = (
  value: unknown,
  fallback: ProductTier[] = ['public'],
): ProductTier[] => {
  if (!value) {
    return fallback;
  }

  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [value];

  const normalized = entries
    .map((entry) => (typeof entry === 'string' ? entry : entry?.toString() ?? ''))
    .map((entry) => entry.trim())
    .filter((entry): entry is ProductTier =>
      Boolean(entry) && (PRODUCT_TIERS as readonly string[]).includes(entry),
    );

  return normalized.length ? normalized : fallback;
};

interface BaseProductData {
  productId: string;
  category: string;
  basicInfo: {
    name: string;
    model: string;
    description: string;
    imageUrls: string[];
    certifications: string[];
  };
  publicData?: Record<string, unknown>;
  technicalData?: Record<string, unknown>;
  commercialData?: Record<string, unknown>;
  restrictedData?: Record<string, unknown>;
  lastUpdated: Date;
  cacheTtl: number;
}

interface ManufacturerInventory {
  name: string;
  products: BaseProductData[];
}

interface FilteredProduct {
  productId: string;
  manufacturerId: string;
  category: string;
  basicInfo: BaseProductData['basicInfo'];
  lastUpdated: string;
  cacheTtl: number;
  publicData?: Record<string, unknown>;
  technicalData?: Record<string, unknown>;
  commercialData?: Record<string, unknown>;
  restrictedData?: Record<string, unknown>;
  score?: number;
  reasons?: RecommendationReason[];
  alternatives?: FilteredProduct[];
}

interface SearchRequestBody {
  query?: string;
  category?: string;
  manufacturer?: string;
  allowedTiers?: ProductTier[];
  limit?: number;
  offset?: number;
}

interface RecommendationRequestBody {
  allowedTiers?: ProductTier[];
  requirements?: Record<string, unknown>;
  projectContext?: Record<string, unknown>;
  limit?: number;
}

const app = express();
app.use(cors());
app.use(express.json());

const manufacturerProducts: Record<string, ManufacturerInventory> = {
  kingspan: {
    name: 'Kingspan Insulation',
    products: [
      {
        productId: 'KS-THERMA-TW55',
        category: 'insulation',
        basicInfo: {
          name: 'Therma TW55 Cavity Wall Insulation',
          model: 'TW55',
          description: 'High-performance rigid thermoset insulation board',
          imageUrls: ['https://kingspan.com/images/tw55-1.jpg'],
          certifications: ['CE Mark', 'BBA Certificate', 'ISO 14001'],
        },
        publicData: {
          specifications: {
            dimensions: {
              width: 1200,
              height: 2400,
              depth: 75,
              weight: 2.1,
              units: 'mm/kg',
            },
            materials: ['Thermoset polyisocyanurate'],
            finishes: ['Aluminium foil facings'],
            colors: ['Silver', 'White'],
          },
          compliance: {
            standards: ['EN 13165', 'BS 5250'],
            certifications: [
              {
                name: 'CE Mark',
                number: 'CE-123456',
                validUntil: new Date('2025-12-31'),
              },
              {
                name: 'BBA Certificate',
                number: 'BBA-98/4356',
                validUntil: new Date('2026-06-30'),
              },
            ],
            regions: ['UK', 'EU', 'Ireland'],
          },
          sustainability: {
            recycledContent: 15,
            embodiedCarbon: 2.1,
            energyRating: 'A+',
            epdUrl: 'https://kingspan.com/epd/tw55',
          },
        },
        technicalData: {
          performance: {
            thermal: {
              rValue: 3.5,
              uValue: 0.028,
              thermalConductivity: 0.021,
              thermalMass: 85,
            },
            fire: {
              fireRating: 'Class B-s3,d0',
              flameSpread: 25,
              smokeGeneration: 'Very Low',
            },
          },
          installation: {
            requirements: ['Vapor barrier', 'Mechanical fixings', 'Sealed joints'],
            tools: ['Saw', 'Knife', 'Drill', 'Spirit level'],
            skillLevel: 'intermediate',
            estimatedTime: 45,
            specialConsiderations: [
              'Weather protection required',
              'Joint sealing critical',
            ],
          },
          maintenance: {
            schedule: [
              {
                frequency: 'Annual',
                tasks: ['Visual inspection', 'Joint checking'],
              },
            ],
            expectedLifespan: 50,
            warrantyPeriod: 25,
          },
        },
        commercialData: {
          pricing: {
            listPrice: 18.5,
            currency: 'GBP',
            priceValidUntil: new Date('2025-03-31'),
            minimumOrderQuantity: 50,
            volumeDiscounts: [
              { quantity: 100, discountPercent: 5 },
              { quantity: 500, discountPercent: 12 },
              { quantity: 1000, discountPercent: 18 },
            ] as VolumeDiscount[],
          },
          availability: {
            inStock: true,
            quantity: 2500,
            leadTime: 3,
            backorderAllowed: true,
            distributors: [
              {
                distributorId: 'travis-perkins',
                name: 'Travis Perkins',
                region: 'UK',
                contactInfo: '+44-800-123-4567',
                stockLevel: 'high',
              },
              {
                distributorId: 'jewson',
                name: 'Jewson',
                region: 'UK',
                contactInfo: '+44-800-765-4321',
                stockLevel: 'medium',
              },
            ] as Distributor[],
          },
          procurement: {
            preferredSuppliers: ['travis-perkins', 'jewson'],
            minimumOrderValue: 500,
            paymentTerms: '30 days net',
            shippingOptions: [
              { method: 'Standard delivery', cost: 45, estimatedDays: 3 },
              { method: 'Next day delivery', cost: 120, estimatedDays: 1 },
            ] as PricingTier[],
          },
        },
        restrictedData: {
          costAnalysis: {
            manufacturingCost: 11.2,
            marginPercent: 39.5,
            competitorPricing: [
              { competitorId: 'rockwool', price: 19.8, marketShare: 25 },
              { competitorId: 'celotex', price: 17.9, marketShare: 30 },
            ],
            priceHistory: [
              { date: new Date('2024-01-01'), price: 16.5 },
              { date: new Date('2024-06-01'), price: 17.8 },
              { date: new Date('2024-12-01'), price: 18.5 },
            ],
          },
          strategic: {
            productLifecycle: 'maturity',
            plannedObsolescence: new Date('2027-12-31'),
            replacementProducts: ['TW60-ULTRA'],
            exclusivityAgreements: [
              {
                partner: 'major-contractor-1',
                exclusivityLevel: 'preferred',
              },
            ],
          },
          supplyChain: {
            primarySuppliers: [
              {
                supplierId: 'basf-chemicals',
                name: 'BASF Chemicals',
                country: 'Germany',
                riskLevel: 'low',
                alternativeSuppliers: ['dow-chemical'],
              },
            ],
            criticalMaterials: ['Polyisocyanurate resin', 'Aluminium foil'],
            supplyRiskFactors: ['Energy price volatility', 'Transportation costs'],
          },
        },
        lastUpdated: new Date(),
        cacheTtl: 3600,
      },
    ],
  },
  guardian_glass: {
    name: 'Guardian Glass',
    products: [
      {
        productId: 'GG-SUNGRD-SPEC',
        category: 'windows_doors',
        basicInfo: {
          name: 'SunGuard Spectrum Selective Low-E Glass',
          model: 'Spectrum',
          description: 'Advanced low-emissivity coated glass for energy efficiency',
          imageUrls: ['https://guardian.com/images/spectrum-1.jpg'],
          certifications: ['IGCC', 'NFRC', 'Energy Star'],
        },
        publicData: {
          specifications: {
            dimensions: {
              width: 3200,
              height: 2140,
              depth: 6,
              weight: 15,
              units: 'mm/kg',
            },
            materials: ['Low-iron float glass', 'Silver-based coating'],
            finishes: ['Clear', 'Low-iron'],
            colors: ['Neutral', 'Blue', 'Green tint'],
            standards: ['ASTM C1376', 'EN 1096', 'IGCC'],
          },
          certifications: [
            {
              name: 'NFRC',
              number: 'NFRC-4567',
              validUntil: new Date('2026-12-31'),
            },
          ] as Certification[],
          sustainability: {
            recycledContent: 25,
            embodiedCarbon: 1.8,
            energyRating: 'Energy Star',
            epdUrl: 'https://guardian.com/epd/spectrum',
          },
        },
        technicalData: {
          performance: {
            thermal: {
              uValue: 1.1,
              solarHeatGainCoefficient: 0.28,
            },
            acoustic: {
              soundTransmissionClass: 32,
              noiseReductionCoefficient: 0.15,
            },
          },
          installation: {
            requirements: [
              'Structural glazing system',
              'Weather sealing',
              'Thermal break',
            ],
            tools: ['Glass handling equipment', 'Sealant application tools'],
            skillLevel: 'specialist',
            estimatedTime: 120,
            specialConsiderations: [
              'Handle with care',
              'Coating side identification critical',
            ],
          },
        },
        commercialData: {
          pricing: {
            listPrice: 85,
            currency: 'USD',
            priceValidUntil: new Date('2025-06-30'),
            minimumOrderQuantity: 100,
            volumeDiscounts: [
              { quantity: 500, discountPercent: 8 },
              { quantity: 1000, discountPercent: 15 },
            ] as VolumeDiscount[],
          },
          availability: {
            inStock: true,
            quantity: 800,
            leadTime: 14,
            backorderAllowed: true,
            distributors: [
              {
                distributorId: 'pilkington',
                name: 'Pilkington Distribution',
                region: 'Global',
                contactInfo: '+1-800-555-0123',
                stockLevel: 'medium',
              },
            ] as Distributor[],
          },
        },
        restrictedData: {
          costAnalysis: {
            manufacturingCost: 52,
            marginPercent: 38.8,
            competitorPricing: [
              { competitorId: 'pilkington', price: 88, marketShare: 35 },
            ],
          },
        },
        lastUpdated: new Date(),
        cacheTtl: 7200,
      },
    ],
  },
  cemex: {
    name: 'CEMEX',
    products: [
      {
        productId: 'CX-RAPID-C40',
        category: 'concrete_products',
        basicInfo: {
          name: 'Rapid Set C40/50 High Strength Concrete',
          model: 'RAPID-C40',
          description: 'Fast-setting high-strength concrete for critical applications',
          imageUrls: ['https://cemex.com/images/rapidset-1.jpg'],
          certifications: ['BS EN 206', 'CARES', 'ISO 9001'],
        },
        publicData: {
          specifications: {
            density: 2400,
            slump: '150mm',
            aggregateSize: '20mm',
          },
          compliance: {
            standards: ['BS EN 206', 'BS 8500'],
            certifications: [
              {
                name: 'CARES',
                number: 'CARES-789',
                validUntil: new Date('2025-09-30'),
              },
            ] as Certification[],
          },
          sustainability: {
            recycledContent: 30,
            embodiedCarbon: 280,
            energyRating: 'Standard',
            epdUrl: 'https://cemex.com/epd/rapid-c40',
          },
        },
        technicalData: {
          structural: {
            compressionStrength: 40,
            tensileStrength: 4.5,
            elasticModulus: 34000,
          },
          installation: {
            requirements: ['Formwork', 'Reinforcement', 'Curing compound'],
            tools: ['Concrete pump', 'Vibrators', 'Screeds'],
            skillLevel: 'advanced',
            estimatedTime: 60,
            specialConsiderations: ['Working time 20 minutes', 'Temperature dependent'],
          },
        },
        commercialData: {
          pricing: {
            listPrice: 95,
            currency: 'GBP',
            priceValidUntil: new Date('2025-04-30'),
            minimumOrderQuantity: 6,
            volumeDiscounts: [
              { quantity: 20, discountPercent: 5 },
              { quantity: 50, discountPercent: 12 },
            ] as VolumeDiscount[],
          },
          availability: {
            inStock: true,
            quantity: 500,
            leadTime: 1,
            backorderAllowed: false,
            distributors: [
              {
                distributorId: 'cemex-direct',
                name: 'CEMEX Direct',
                contactInfo: '+44-800-667-827',
                stockLevel: 'high',
              },
            ] as Distributor[],
          },
        },
        restrictedData: {
          costAnalysis: {
            manufacturingCost: 58,
            marginPercent: 38.9,
            competitorPricing: [
              { competitorId: 'hanson', price: 98, marketShare: 28 },
            ],
          },
        },
        lastUpdated: new Date(),
        cacheTtl: 1800,
      },
    ],
  },
};

const filterProductByTiers = (
  product: BaseProductData,
  allowedTiers: ProductTier[],
  manufacturerId: string,
): FilteredProduct => {
  const filtered: FilteredProduct = {
    productId: product.productId,
    manufacturerId,
    category: product.category,
    basicInfo: product.basicInfo,
    lastUpdated: product.lastUpdated.toISOString(),
    cacheTtl: product.cacheTtl,
  };

  if (allowedTiers.includes('public') && product.publicData) {
    filtered.publicData = product.publicData;
  }
  if (allowedTiers.includes('technical') && product.technicalData) {
    filtered.technicalData = product.technicalData;
  }
  if (allowedTiers.includes('commercial') && product.commercialData) {
    filtered.commercialData = product.commercialData;
  }
  if (allowedTiers.includes('restricted') && product.restrictedData) {
    filtered.restrictedData = product.restrictedData;
  }

  return filtered;
};

const generateFacets = (products: FilteredProduct[]) => {
  const categoryCounts = new Map<string, number>();
  const manufacturerCounts = new Map<string, number>();

  products.forEach((product) => {
    categoryCounts.set(
      product.category,
      (categoryCounts.get(product.category) ?? 0) + 1,
    );
    manufacturerCounts.set(
      product.manufacturerId,
      (manufacturerCounts.get(product.manufacturerId) ?? 0) + 1,
    );
  });

  return {
    categories: Object.fromEntries(categoryCounts.entries()),
    manufacturers: Object.fromEntries(manufacturerCounts.entries()),
  };
};

// API Routes
// =============================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    manufacturers: Object.keys(manufacturerProducts),
  });
});

app.get('/api/manufacturers', (_req: Request, res: Response) => {
  const manufacturers = Object.entries(manufacturerProducts).map(
    ([id, data]) => ({
      manufacturerId: id,
      name: data.name,
      productCount: data.products.length,
      categories: [...new Set(data.products.map((p) => p.category))],
    }),
  );

  res.json({
    requestId: uuidv4(),
    manufacturers,
  });
});

app.post(
  '/api/products/search',
  (req: Request<unknown, unknown, SearchRequestBody>, res: Response) => {
    const {
      query,
      category,
      manufacturer,
      allowedTiers: rawAllowedTiers = ['public'],
      limit = 20,
      offset = 0,
    } = req.body ?? {};

    const allowedTiers = normalizeTiers(rawAllowedTiers);

    const allProducts: FilteredProduct[] = [];

    const searchManufacturers = manufacturer
      ? [manufacturer]
      : Object.keys(manufacturerProducts);

    searchManufacturers.forEach((manufacturerId) => {
      const inventory = manufacturerProducts[manufacturerId];
      if (!inventory) {
        return;
      }

      const matched = inventory.products
        .filter((product) => {
          if (category && product.category !== category) {
            return false;
          }

          if (query) {
            const text = `${product.basicInfo.name} ${product.basicInfo.description}`.toLowerCase();
            return text.includes(query.toLowerCase());
          }

          return true;
        })
        .map((product) => filterProductByTiers(product, allowedTiers, manufacturerId));

      allProducts.push(...matched);
    });

    const paginatedResults = allProducts
      .sort(() => Math.random() - 0.5)
      .slice(offset, offset + limit);

    res.json({
      requestId: uuidv4(),
      totalResults: allProducts.length,
      offset,
      limit,
      searchTime: Math.random() * 100 + 50,
      products: paginatedResults,
      facets: generateFacets(allProducts),
    });
  },
);

app.get(
  '/api/products/:productId',
  (req: Request<{ productId: string }, unknown, unknown, { allowedTiers?: string }>, res: Response) => {
    const { productId } = req.params;
    const allowedTiers = normalizeTiers(req.query.allowedTiers);

    for (const [manufacturerId, inventory] of Object.entries(manufacturerProducts)) {
      const product = inventory.products.find((item) => item.productId === productId);
      if (product) {
        return res.json(filterProductByTiers(product, allowedTiers, manufacturerId));
      }
    }

    return res.status(404).json({
      requestId: uuidv4(),
      error: 'Product not found',
    });
  },
);

app.post(
  '/api/products/recommend',
  (req: Request<unknown, unknown, RecommendationRequestBody>, res: Response) => {
    const { allowedTiers: rawAllowedTiers = ['public'], limit = 10 } = req.body ?? {};

    const allowedTiers = normalizeTiers(rawAllowedTiers);

    const recommendations = Object.entries(manufacturerProducts)
      .flatMap(([manufacturerId, inventory]) =>
        inventory.products.map((product) => {
          const filtered = filterProductByTiers(product, allowedTiers, manufacturerId);
          filtered.score = Math.random();
          filtered.reasons = [
            {
              type: 'specification_match',
              description: 'Meets technical requirements',
              weight: 0.4,
            },
            {
              type: 'cost_efficiency',
              description: 'Competitive pricing versus peers',
              weight: 0.3,
            },
          ];
          filtered.alternatives = [];
          return filtered;
        }),
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);

    res.json({
      requestId: uuidv4(),
      recommendations,
    });
  },
);

Object.keys(manufacturerProducts).forEach((manufacturerId) => {
  const basePath = `/api/${manufacturerId}`;

  app.get(`${basePath}/products`, (req: Request, res: Response) => {
    const allowedTiers = normalizeTiers(req.query.allowedTiers);

    const products = manufacturerProducts[manufacturerId].products.map((product) =>
      filterProductByTiers(product, allowedTiers, manufacturerId),
    );

    res.json({
      requestId: uuidv4(),
      manufacturer: manufacturerProducts[manufacturerId].name,
      products,
    });
  });

  app.post(
    `${basePath}/products/search`,
    (req: Request<unknown, unknown, SearchRequestBody>, res: Response) => {
      const { query, category, allowedTiers: rawAllowedTiers = ['public'] } = req.body ?? {};

      const allowedTiers = normalizeTiers(rawAllowedTiers);

      const products = manufacturerProducts[manufacturerId].products
        .filter((product) => {
          if (category && product.category !== category) {
            return false;
          }
          if (query) {
            const text = `${product.basicInfo.name} ${product.basicInfo.description}`.toLowerCase();
            return text.includes(query.toLowerCase());
          }
          return true;
        })
        .map((product) => filterProductByTiers(product, allowedTiers, manufacturerId));

      res.json({
        requestId: uuidv4(),
        manufacturer: manufacturerProducts[manufacturerId].name,
        products,
      });
    },
  );
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4001);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Mock manufacturer API listening on port ${port}`);
  });
}

export default app;
