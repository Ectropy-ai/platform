/*
 * =============================================================================
 * MANUFACTURER API INTEGRATION TYPES - FEDERATED PRODUCT DATA
 *
 * PURPOSE:
 * Type definitions for integrating with manufacturer APIs while respecting
 * DAO-governed data sharing templates. Supports tiered access control and
 * real-time product data synchronization.
 * CAPABILITIES:
 * - Multi-tier product data access (public/technical/commercial/restricted)
 * - Template-governed data filtering
 * - Real-time product availability and pricing
 * - Sustainability and compliance data integration
 */

export interface ManufacturerAPI {
  manufacturerId: string;
  name: string;
  apiConfig: {
    baseUrl: string;
    authType: 'apikey' | 'oauth2' | 'basic';
    credentials: Record<string, string>;
    rateLimits: {
      requestsPerMinute: number;
      requestsPerDay: number;
    };
  };
  supportedCategories: ProductCategory[];
  dataTierMappings: Record<DataTier, string[]>;
  status: 'active' | 'inactive' | 'maintenance';
}

export type ProductCategory =
  | 'structural_steel'
  | 'concrete_products'
  | 'insulation'
  | 'windows_doors'
  | 'roofing'
  | 'flooring'
  | 'mechanical_systems'
  | 'electrical_systems'
  | 'plumbing'
  | 'finishes'
  | 'specialty_products';

export type DataTier = 'public' | 'technical' | 'commercial' | 'restricted';

export interface ProductData {
  productId: string;
  category: ProductCategory;
  basicInfo: {
    name: string;
    model: string;
    description: string;
    imageUrls: string[];
    certifications: string[];
  };
  publicData?: PublicProductData;
  technicalData?: TechnicalProductData;
  commercialData?: CommercialProductData;
  restrictedData?: RestrictedProductData;
  lastUpdated: Date;
  cacheTtl: number;
}

export interface PublicProductData {
  specifications: {
    dimensions: {
      width: number;
      height: number;
      depth: number;
      weight: number;
      units: string;
    };
    materials: string[];
    finishes: string[];
    colors: string[];
  };
  compliance: {
    standards: string[];
    certifications: {
      name: string;
      number: string;
      validUntil?: Date;
    }[];
    regions: string[];
  };
  sustainability: {
    recycledContent?: number;
    embodiedCarbon?: number;
    energyRating?: string;
    epdUrl?: string;
  };
}

export interface TechnicalProductData {
  performance: {
    structural: {
      loadBearing?: number;
      compressionStrength?: number;
      tensileStrength?: number;
      elasticModulus?: number;
    };
    thermal: {
      rValue?: number;
      uValue?: number;
      thermalConductivity?: number;
      thermalMass?: number;
    };
    acoustic: {
      soundTransmissionClass?: number;
      noiseReductionCoefficient?: number;
      impactInsulationClass?: number;
    };
    fire: {
      fireRating?: string;
      flameSpread?: number;
      smokeGeneration?: number;
    };
  };
  installation: {
    requirements: string[];
    tools: string[];
    skillLevel: 'basic' | 'intermediate' | 'advanced' | 'specialist';
    estimatedTime: number;
    specialConsiderations: string[];
  };
  maintenance: {
    schedule: {
      frequency: string;
      tasks: string[];
    };
    expectedLifespan: number;
    warrantyPeriod: number;
    replacementParts: {
      partId: string;
      description: string;
      expectedReplacementInterval: number;
    }[];
  };
}

export interface CommercialProductData {
  pricing: {
    listPrice: number;
    currency: string;
    priceValidUntil: Date;
    minimumOrderQuantity: number;
    volumeDiscounts: {
      quantity: number;
      discountPercent: number;
    }[];
    regionalPricing?: {
      region: string;
      price: number;
      currency: string;
    }[];
  };
  availability: {
    inStock: boolean;
    quantity: number;
    leadTime: number;
    backorderAllowed: boolean;
    distributors: {
      distributorId: string;
      contactInfo: string;
      stockLevel: 'high' | 'medium' | 'low' | 'out';
    }[];
  };
  procurement: {
    preferredSuppliers: string[];
    minimumOrderValue: number;
    paymentTerms: string;
    shippingOptions: {
      method: string;
      cost: number;
      estimatedDays: number;
    }[];
  };
}

export interface RestrictedProductData {
  costAnalysis: {
    manufacturingCost: number;
    marginPercent: number;
    competitorPricing: {
      competitorId: string;
      marketShare: number;
    }[];
    priceHistory: {
      date: Date;
      price: number;
    }[];
  };
  strategic: {
    productLifecycle: 'introduction' | 'growth' | 'maturity' | 'decline';
    plannedObsolescence?: Date;
    replacementProducts?: string[];
    exclusivityAgreements?: {
      partner: string;
      exclusivityLevel: string;
      validUntil: Date;
    }[];
  };
  supplyChain: {
    primarySuppliers: {
      supplierId: string;
      country: string;
      riskLevel: 'low' | 'medium' | 'high';
      alternativeSuppliers: string[];
    }[];
    criticalMaterials: string[];
    supplyRiskFactors: string[];
  };
}

export interface ProductSearchQuery {
  query?: string;
  category?: ProductCategory;
  manufacturer?: string;
  specifications?: Record<string, any>;
  priceRange?: {
    min: number;
    max: number;
  };
  availability?: {
    requiredBy: Date;
    region: string;
  };
  sustainability?: {
    minRecycledContent?: number;
    maxEmbodiedCarbon?: number;
    requiredCertifications?: string[];
  };
  offset?: number;
  limit?: number;
  sortBy?: 'relevance' | 'price' | 'availability' | 'sustainability';
  sortOrder?: 'asc' | 'desc';
}

export interface ProductSearchResult {
  totalResults: number;
  offset: number;
  limit: number;
  searchTime: number;
  products: ProductData[];
  facets: {
    categories: { category: ProductCategory; count: number }[];
    manufacturers: { manufacturerId: string; name: string; count: number }[];
    priceRanges: { min: number; max: number; count: number }[];
  };
}

export interface ManufacturerIntegrationStatus {
  status: 'connected' | 'disconnected' | 'error' | 'rate_limited';
  lastSync: Date;
  syncFrequency: number;
  productCount: number;
  errorMessages: string[];
  apiHealth: {
    responseTime: number;
    successRate: number;
    lastCheck: Date;
  };
}

export interface ProductRecommendation {
  product: ProductData;
  score: number;
  reasons: {
    type:
      | 'specification_match'
      | 'cost_efficiency'
      | 'sustainability'
      | 'availability';
    weight: number;
  }[];
  alternatives: {
    productId: string;
    reason: string;
    score: number;
  }[];
}
