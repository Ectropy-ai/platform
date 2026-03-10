/*
 * =============================================================================
 * MOCK MANUFACTURER API SERVER - DEMONSTRATION & TESTING
 * =============================================================================
 *
 * PURPOSE:
 * Simulates real manufacturer APIs (Kingspan, Guardian Glass, CEMEX) to
 * demonstrate template-governed data access and product integration workflows.
 *
 * CAPABILITIES:
 * - Multi-tier product data simulation (public/technical/commercial/restricted)
 * - Real-time availability and pricing updates
 * - Role-based API responses
 * - Performance metrics simulation
 * =============================================================================
 */
import express from 'express';
import cors from 'cors';
const app = express();
app.use(cors());
app.use(express.json());
// Mock product databases for different manufacturers
const manufacturerProducts = {
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
            requirements: [
              'Vapor barrier',
              'Mechanical fixings',
              'Sealed joints',
            ],
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
            replacementParts: [],
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
            ],
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
            ],
          },
          procurement: {
            preferredSuppliers: ['travis-perkins', 'jewson'],
            minimumOrderValue: 500,
            paymentTerms: '30 days net',
            shippingOptions: [
              { method: 'Standard delivery', cost: 45, estimatedDays: 3 },
              { method: 'Next day delivery', cost: 120, estimatedDays: 1 },
            ],
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
                validUntil: new Date('2025-12-31'),
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
            supplyRiskFactors: [
              'Energy price volatility',
              'Transportation costs',
            ],
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
          description:
            'Advanced low-emissivity coated glass for energy efficiency',
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
          },
          compliance: {
            standards: ['ASTM C1376', 'EN 1096', 'IGCC'],
            certifications: [
              {
                name: 'NFRC',
                number: 'NFRC-4567',
                validUntil: new Date('2026-12-31'),
              },
            ],
            regions: ['North America', 'Europe', 'Asia Pacific'],
          },
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
              thermalConductivity: 1.0,
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
            listPrice: 85.0,
            currency: 'USD',
            priceValidUntil: new Date('2025-06-30'),
            minimumOrderQuantity: 100,
            volumeDiscounts: [
              { quantity: 500, discountPercent: 8 },
              { quantity: 1000, discountPercent: 15 },
            ],
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
            ],
          },
        },
        restrictedData: {
          costAnalysis: {
            manufacturingCost: 52.0,
            marginPercent: 38.8,
            competitorPricing: [
              { competitorId: 'pilkington', price: 88.0, marketShare: 35 },
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
          description:
            'Fast-setting high-strength concrete for critical applications',
          imageUrls: ['https://cemex.com/images/rapidset-1.jpg'],
          certifications: ['BS EN 206', 'CARES', 'ISO 9001'],
        },
        publicData: {
          specifications: {
            dimensions: {
              width: 0,
              height: 0,
              depth: 0,
              weight: 2400,
              units: 'kg/m³',
            },
            materials: ['Portland cement', 'Aggregates', 'Chemical admixtures'],
            finishes: ['Smooth finish', 'Power float', 'Exposed aggregate'],
            colors: ['Natural grey', 'White cement option'],
          },
          compliance: {
            standards: ['BS EN 206', 'BS 8500'],
            certifications: [
              {
                name: 'CARES',
                number: 'CARES-789',
                validUntil: new Date('2025-09-30'),
              },
            ],
            regions: ['UK', 'Ireland', 'Europe'],
          },
          sustainability: {
            recycledContent: 30,
            embodiedCarbon: 280,
            energyRating: 'Standard',
            epdUrl: 'https://cemex.com/epd/rapid-c40',
          },
        },
        technicalData: {
          performance: {
            structural: {
              compressionStrength: 40,
              tensileStrength: 4.5,
              elasticModulus: 34000,
            },
          },
          installation: {
            requirements: ['Formwork', 'Reinforcement', 'Curing compound'],
            tools: ['Concrete pump', 'Vibrators', 'Screeds'],
            skillLevel: 'advanced',
            estimatedTime: 60,
            specialConsiderations: [
              'Working time 20 minutes',
              'Temperature dependent',
            ],
          },
        },
        commercialData: {
          pricing: {
            listPrice: 95.0,
            currency: 'GBP',
            priceValidUntil: new Date('2025-04-30'),
            minimumOrderQuantity: 6,
            volumeDiscounts: [
              { quantity: 20, discountPercent: 5 },
              { quantity: 50, discountPercent: 12 },
            ],
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
                region: 'UK',
                contactInfo: '+44-800-667-827',
                stockLevel: 'high',
              },
            ],
          },
        },
        restrictedData: {
          costAnalysis: {
            manufacturingCost: 58.0,
            marginPercent: 38.9,
            competitorPricing: [
              { competitorId: 'hanson', price: 98.0, marketShare: 28 },
            ],
          },
        },
        lastUpdated: new Date(),
        cacheTtl: 1800,
      },
    ],
  },
};
// API Routes
// =============================================
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    manufacturers: Object.keys(manufacturerProducts),
  });
});
// Get manufacturer information
app.get('/api/manufacturers', (req, res) => {
  const manufacturers = Object.entries(manufacturerProducts).map(
    ([id, data]) => ({
      manufacturerId: id,
      name: data.name,
      productCount: data.products.length,
      categories: [...new Set(data.products.map((p) => p.category))],
    })
  );
  res.json({ manufacturers });
});
// Search products across manufacturers with role-based filtering
app.post('/api/products/search', (req, res) => {
  const {
    query,
    category,
    manufacturer,
    allowedTiers = ['public'],
    limit = 20,
    offset = 0,
  } = req.body;
  const allProducts = [];
  // Search across specified manufacturers or all
  const searchManufacturers = manufacturer
    ? [manufacturer]
    : Object.keys(manufacturerProducts);
  for (const mfgId of searchManufacturers) {
    if (!manufacturerProducts[mfgId]) {
      continue;
    }
    const mfgProducts = manufacturerProducts[mfgId].products
      .filter((product) => {
        // Category filter
        if (category && product.category !== category) {
          return false;
        }
        // Text search filter
        if (query) {
          const searchText =
            `${product.basicInfo.name} ${product.basicInfo.description}`.toLowerCase();
          if (!searchText.includes(query.toLowerCase())) {
            return false;
          }
        }
        return true;
      })
      .map((product) => filterProductByTiers(product, allowedTiers, mfgId));
    allProducts.push(...mfgProducts);
  }
  // Sort by relevance (mock scoring)
  allProducts.sort((_a, _b) => Math.random() - 0.5);
  // Paginate results
  const paginatedResults = allProducts.slice(offset, offset + limit);
  res.json({
    totalResults: allProducts.length,
    offset,
    limit,
    searchTime: Math.random() * 100 + 50, // Mock search time
    products: paginatedResults,
    facets: generateFacets(allProducts),
  });
});
// Get specific product with role-based data filtering
app.get('/api/products/:productId', (req, res) => {
  const { productId } = req.params;
  const allowedTiers = req.query.allowedTiers
    ? req.query.allowedTiers.split(',')
    : ['public'];
  // Find product across all manufacturers
  let foundProduct = null;
  let manufacturerId = null;
  for (const [mfgId, mfgData] of Object.entries(manufacturerProducts)) {
    const product = mfgData.products.find((p) => p.productId === productId);
    if (product) {
      foundProduct = product;
      manufacturerId = mfgId;
      break;
    }
  }
  if (!foundProduct) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const filteredProduct = filterProductByTiers(
    foundProduct,
    allowedTiers,
    manufacturerId
  );
  res.json(filteredProduct);
});
// Get product recommendations
app.post('/api/products/recommend', (req, res) => {
  const {
    requirements: _requirements,
    projectContext: _projectContext,
    allowedTiers = ['public'],
    limit = 10,
  } = req.body;
  // Simple recommendation logic
  const allProducts = Object.entries(manufacturerProducts).flatMap(
    ([mfgId, mfgData]) =>
      mfgData.products.map((product) => ({
        ...filterProductByTiers(product, allowedTiers, mfgId),
        score: Math.random(), // Mock scoring
        reasons: [
          {
            type: 'specification_match',
            description: 'Meets technical requirements',
            weight: 0.4,
          },
          {
            type: 'cost_efficiency',
            description: 'Good value proposition',
            weight: 0.3,
          },
        ],
        alternatives: [],
      }))
  );
  // Sort by score and limit
  const recommendations = allProducts
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  res.json({ recommendations });
});
// Manufacturer-specific endpoints
Object.keys(manufacturerProducts).forEach((manufacturerId) => {
  const basePath = `/api/${manufacturerId}`;
  // Get manufacturer products
  app.get(`${basePath}/products`, (req, res) => {
    const allowedTiers = req.query.allowedTiers
      ? req.query.allowedTiers.split(',')
      : ['public'];
    const products = manufacturerProducts[manufacturerId].products.map(
      (product) => filterProductByTiers(product, allowedTiers, manufacturerId)
    );
    res.json({
      manufacturer: manufacturerProducts[manufacturerId].name,
      products,
    });
  });
  // Search within manufacturer
  app.post(`${basePath}/products/search`, (req, res) => {
    const { query, category, allowedTiers = ['public'] } = req.body;
    const products = manufacturerProducts[manufacturerId].products
      .filter((product) => {
        if (category && product.category !== category) {
          return false;
        }
        if (query) {
          const searchText =
            `${product.basicInfo.name} ${product.basicInfo.description}`.toLowerCase();
          if (!searchText.includes(query.toLowerCase())) {
            return false;
          }
        }
        return true;
      })
      .map((product) =>
        filterProductByTiers(product, allowedTiers, manufacturerId)
      );
    res.json({ products });
  });
});
// Utility Functions
// =============================================
function filterProductByTiers(product, allowedTiers, manufacturerId) {
  const filtered = {
    productId: product.productId,
    manufacturerId,
    category: product.category,
    basicInfo: product.basicInfo,
    lastUpdated: product.lastUpdated,
    cacheTtl: product.cacheTtl,
  };
  // Add data based on allowed tiers
  if (allowedTiers.includes('public')) {
    filtered.publicData = product.publicData;
  }
  if (allowedTiers.includes('technical')) {
    filtered.technicalData = product.technicalData;
  }
  if (allowedTiers.includes('commercial')) {
    filtered.commercialData = product.commercialData;
  }
  if (allowedTiers.includes('restricted')) {
    filtered.restrictedData = product.restrictedData;
  }
  return filtered;
}
function generateFacets(products) {
  const categories = {};
  const manufacturers = {};
  products.forEach((product) => {
    // Count categories
    categories[product.category] = (categories[product.category] || 0) + 1;
    // Count manufacturers
    manufacturers[product.manufacturerId] =
      (manufacturers[product.manufacturerId] || 0) + 1;
  });
  return {
    categories: Object.entries(categories).map(([category, count]) => ({
      category,
      count,
    })),
    manufacturers: Object.entries(manufacturers).map(
      ([manufacturerId, count]) => ({
        manufacturerId,
        name: manufacturerProducts[manufacturerId]?.name || manufacturerId,
        count,
      })
    ),
    priceRanges: [
      { min: 0, max: 50, count: Math.floor(products.length * 0.3) },
      { min: 50, max: 100, count: Math.floor(products.length * 0.5) },
      { min: 100, max: 500, count: Math.floor(products.length * 0.2) },
    ],
  };
}
// Start server
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`🏭 Mock Manufacturer API Server running on port ${PORT}`);
  console.log(
    `📊 Available manufacturers: ${Object.keys(manufacturerProducts).join(', ')}`
  );
  console.log(`🔍 API endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/manufacturers`);
  console.log(`   POST /api/products/search`);
  console.log(`   GET  /api/products/:productId`);
  console.log(`   POST /api/products/recommend`);
  Object.keys(manufacturerProducts).forEach((mfg) => {
    console.log(`   GET  /api/${mfg}/products`);
    console.log(`   POST /api/${mfg}/products/search`);
  });
});
export default app;
//# sourceMappingURL=mock-manufacturer-api.js.map
