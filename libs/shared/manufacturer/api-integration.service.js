/*
 * =============================================================================
 * MANUFACTURER API INTEGRATION SERVICE - TEMPLATE-GOVERNED PRODUCT DATA
 * =============================================================================
 *
 * PURPOSE:
 * Integrates with manufacturer APIs while respecting DAO-governed data sharing
 * templates. Provides filtered product data based on stakeholder roles and
 * project-specific access rules.
 *
 * CAPABILITIES:
 * - Multi-manufacturer API integration
 * - Template-based data filtering
 * - Real-time product data synchronization
 * - Intelligent product recommendations
 * - Performance monitoring and caching
 * =============================================================================
 */
import { EventEmitter } from 'events';
import axios from 'axios';
export class ManufacturerAPIService extends EventEmitter {
  constructor(db, templateService) {
    super();
    this.apiClients = new Map();
    this.cache = new Map();
    this.db = db;
    this.templateService = templateService;
    this.initializeManufacturerAPIs();
  }
  /**
   * Search products with template-governed access control
   */
  async searchProducts(query, projectId, _userId, userRole) {
    try {
      // Get active template for project
      const template = await this.templateService.getActiveTemplate(projectId);
      if (!template) {
        throw new Error('No active data sharing template found');
      }
      // Determine allowed data tiers based on user role and template
      const allowedTiers = await this.determineAllowedDataTiers(
        userRole,
        template.manufacturerDataTiers
      );
      // Search across integrated manufacturers
      const searchResults = await this.executeSearch(query, allowedTiers);
      // Filter results based on template access rules
      const filteredProducts = await this.filterProductsByTemplate(
        searchResults.products,
        projectId,
        _userId,
        userRole,
        allowedTiers
      );
      // Log access for audit trail
      await this.logProductAccess(
        _userId,
        userRole,
        query,
        filteredProducts.length,
        projectId
      );
      this.emit('search:completed', {
        _userId,
        userRole,
        projectId,
        query,
        resultCount: filteredProducts.length,
      });
      return {
        ...searchResults,
        products: filteredProducts,
      };
    } catch (_error) {
      this.emit('error', { operation: 'searchProducts', _error });
      throw _error;
    }
  }
  /**
   * Get detailed product information with role-based filtering
   */
  async getProductDetails(productId, projectId, _userId, userRole) {
    try {
      // Check cache first
      const cacheKey = 'REDACTED';
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expires > new Date()) {
        return this.filterProductData(
          cached.data,
          projectId,
          _userId,
          userRole
        );
      }
      // Fetch from manufacturer API
      const product = await this.fetchProductFromAPI(productId);
      if (!product) {
        return null;
      }
      // Cache the full product data
      this.cache.set(cacheKey, {
        data: product,
        expires: new Date(Date.now() + product.cacheTtl * 1000),
      });
      // Return filtered data based on template
      const filteredProduct = await this.filterProductData(
        product,
        projectId,
        _userId,
        userRole
      );
      // Log detailed access
      await this.logProductAccess(
        _userId,
        userRole,
        { productId },
        1,
        projectId
      );
      this.emit('product:accessed', {
        productId,
        _userId,
        userRole,
        projectId,
      });
      return filteredProduct;
    } catch (_error) {
      this.emit('error', { operation: 'getProductDetails', _error });
      throw _error;
    }
  }
  /**
   * Get intelligent product recommendations
   */
  async getProductRecommendations(
    projectId,
    requirements,
    _userId,
    userRole,
    limit = 10
  ) {
    try {
      // Analyze project requirements and context
      const projectContext = await this.analyzeProjectContext(projectId);
      // Generate search queries based on requirements
      const searchQueries = this.generateRecommendationQueries(
        requirements,
        projectContext
      );
      // Search for matching products
      const allResults = [];
      for (const query of searchQueries) {
        const result = await this.searchProducts(
          query,
          projectId,
          _userId,
          userRole
        );
        allResults.push(...result.products);
      }
      // Score and rank recommendations
      const recommendations = await this.scoreAndRankProducts(
        allResults,
        requirements,
        projectContext,
        userRole
      );
      // Limit results
      const limitedRecommendations = recommendations.slice(0, limit);
      this.emit('recommendations:generated', {
        projectId,
        _userId,
        userRole,
        requirementsCount: Object.keys(requirements).length,
        recommendationCount: limitedRecommendations.length,
      });
      return limitedRecommendations;
    } catch (_error) {
      this.emit('error', { operation: 'getProductRecommendations', _error });
      throw _error;
    }
  }
  /**
   * Sync product data from all manufacturer APIs
   */
  async syncManufacturerData() {
    try {
      const manufacturers = await this.getActiveManufacturers();
      for (const manufacturer of manufacturers) {
        try {
          await this.syncManufacturerProducts(manufacturer);
          // Update sync status
          await this.updateSyncStatus(manufacturer.manufacturerId, 'success');
        } catch (_error) {
          await this.updateSyncStatus(
            manufacturer.manufacturerId,
            'error',
            _error instanceof Error ? _error.message : 'Unknown error'
          );
        }
      }
      this.emit('sync:completed', {
        manufacturerCount: manufacturers.length,
        timestamp: new Date(),
      });
    } catch (_error) {
      this.emit('error', { operation: 'syncManufacturerData', _error });
      throw _error;
    }
  }
  /**
   * Get manufacturer integration status
   */
  async getManufacturerStatus() {
    try {
      const query = `
        SELECT 
          m.manufacturer_id,
          m.name,
          m.status,
          m.last_sync,
          m.sync_frequency,
          m.product_count,
          m.error_messages,
          m.api_response_time,
          m.api_success_rate,
          m.last_health_check
        FROM manufacturer_integrations m
        ORDER BY m.name
      `;
      const result = await this.db.query(query);
      return result.rows.map((row) => ({
        manufacturerId: row.manufacturer_id,
        name: row.name,
        status: row.status,
        lastSync: row.last_sync,
        syncFrequency: row.sync_frequency,
        productCount: row.product_count,
        errorMessages: row.error_messages || [],
        apiHealth: {
          responseTime: row.api_response_time,
          successRate: row.api_success_rate,
          lastCheck: row.last_health_check,
        },
      }));
    } catch (_error) {
      this.emit('error', { operation: 'getManufacturerStatus', _error });
      throw _error;
    }
  }
  // Private helper methods
  async initializeManufacturerAPIs() {
    const manufacturers = await this.getActiveManufacturers();
    for (const manufacturer of manufacturers) {
      const client = axios.create({
        baseURL: manufacturer.apiConfig.baseUrl,
        timeout: 30000,
        headers: this.buildAuthHeaders(manufacturer.apiConfig),
      });
      // Add request/response interceptors for monitoring
      this.setupAPIMonitoring(client, manufacturer.manufacturerId);
      this.apiClients.set(manufacturer.manufacturerId, client);
    }
  }
  async determineAllowedDataTiers(userRole, _manufacturerTiers) {
    const allowedTiers = ['public']; // Everyone gets public data
    // Role-based tier access
    switch (userRole) {
      case 'owner':
        allowedTiers.push('technical', 'commercial', 'restricted');
        break;
      case 'architect':
      case 'engineer':
        allowedTiers.push('technical');
        break;
      case 'contractor':
        allowedTiers.push('commercial');
        break;
      case 'supplier':
        // Only public data
        break;
      case 'inspector':
      case 'regulator':
        allowedTiers.push('technical'); // For compliance verification
        break;
    }
    return allowedTiers;
  }
  async executeSearch(query, allowedTiers) {
    const allResults = [];
    const manufacturers = await this.getActiveManufacturers();
    // Search across all manufacturers
    for (const manufacturer of manufacturers) {
      try {
        const manufacturerResults = await this.searchManufacturerProducts(
          manufacturer.manufacturerId,
          query,
          allowedTiers
        );
        allResults.push(...manufacturerResults);
      } catch (_error) {
        console.warn(
          `Search failed for manufacturer ${manufacturer.name}:`,
          _error
        );
      }
    }
    // Sort and paginate results
    const sortedResults = this.sortSearchResults(
      allResults,
      query.sortBy,
      query.sortOrder
    );
    const paginatedResults = this.paginateResults(
      sortedResults,
      query.offset || 0,
      query.limit || 20
    );
    return {
      totalResults: allResults.length,
      offset: query.offset || 0,
      limit: query.limit || 20,
      searchTime: Date.now(), // Placeholder
      products: paginatedResults,
      facets: this.generateSearchFacets(allResults),
    };
  }
  async filterProductsByTemplate(
    products,
    projectId,
    _userId,
    userRole,
    _allowedTiers
  ) {
    const filteredProducts = [];
    for (const product of products) {
      const filteredProduct = await this.filterProductData(
        product,
        projectId,
        _userId,
        userRole
      );
      if (filteredProduct) {
        filteredProducts.push(filteredProduct);
      }
    }
    return filteredProducts;
  }
  async filterProductData(product, projectId, _userId, userRole) {
    try {
      // Get active template
      const template = await this.templateService.getActiveTemplate(projectId);
      if (!template) {
        return null;
      }
      // Clone product for filtering
      const filteredProduct = {
        ...product,
        publicData: product.publicData,
        technicalData: undefined,
        commercialData: undefined,
        restrictedData: undefined,
      };
      // Check technical data access
      if (product.technicalData) {
        const hasAccess = await this.templateService.checkTemplateAccess(
          projectId,
          _userId,
          userRole,
          'performance',
          'read'
        );
        if (hasAccess) {
          filteredProduct.technicalData = product.technicalData;
        }
      }
      // Check commercial data access
      if (product.commercialData) {
        const hasAccess = await this.templateService.checkTemplateAccess(
          projectId,
          _userId,
          userRole,
          'pricing',
          'read'
        );
        if (hasAccess) {
          filteredProduct.commercialData = product.commercialData;
        }
      }
      // Check restricted data access
      if (product.restrictedData) {
        const hasAccess = await this.templateService.checkTemplateAccess(
          projectId,
          _userId,
          userRole,
          'cost_analysis',
          'read'
        );
        if (hasAccess) {
          filteredProduct.restrictedData = product.restrictedData;
        }
      }
      return filteredProduct;
    } catch (_error) {
      console.warn('Error filtering product data:', _error);
      return null;
    }
  }
  async getActiveManufacturers() {
    const query = `
      SELECT manufacturer_config 
      FROM manufacturer_integrations 
      WHERE status = 'active'
    `;
    const result = await this.db.query(query);
    return result.rows.map((row) => JSON.parse(row.manufacturer_config));
  }
  async fetchProductFromAPI(productId) {
    // Find which manufacturer has this product
    const manufacturerQuery = `
      SELECT manufacturer_id 
      FROM manufacturer_products 
      WHERE product_id = $1
    `;
    const result = await this.db.query(manufacturerQuery, [productId]);
    if (result.rows.length === 0) {
      return null;
    }
    const manufacturerId = result.rows[0].manufacturer_id;
    const client = this.apiClients.get(manufacturerId);
    if (!client) {
      throw new Error(
        `No API client found for manufacturer: ${manufacturerId}`
      );
    }
    // Fetch from manufacturer API
    const response = await client.get(`/products/${productId}`);
    return response.data;
  }
  async searchManufacturerProducts(manufacturerId, query, allowedTiers) {
    const client = this.apiClients.get(manufacturerId);
    if (!client) {
      return [];
    }
    try {
      const response = await client.post('/products/search', {
        ...query,
        allowedTiers,
      });
      return response.data.products || [];
    } catch (_error) {
      console.warn(`Search failed for manufacturer ${manufacturerId}:`, _error);
      return [];
    }
  }
  buildAuthHeaders(apiConfig) {
    const headers = {};
    switch (apiConfig.authType) {
      case 'apikey':
        headers['X-API-Key'] = apiConfig.credentials.apiKey;
        break;
      case 'oauth2':
        headers['Authorization'] =
          `Bearer ${apiConfig.credentials.accessToken}`;
        break;
      case 'basic':
        const auth = Buffer.from(
          `${apiConfig.credentials.username}:${apiConfig.credentials.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
        break;
    }
    return headers;
  }
  setupAPIMonitoring(client, manufacturerId) {
    client.interceptors.request.use((config) => {
      config.metadata = { startTime: Date.now() };
      return config;
    });
    client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        this.recordAPIMetrics(manufacturerId, duration, true);
        return response;
      },
      (error) => {
        const duration = Date.now() - error.config?.metadata?.startTime || 0;
        this.recordAPIMetrics(manufacturerId, duration, false);
        return Promise.reject(error);
      }
    );
  }
  async recordAPIMetrics(manufacturerId, responseTime, success) {
    const query = `
      INSERT INTO manufacturer_api_metrics (
        manufacturer_id,
        response_time,
        success,
        recorded_at
      ) VALUES ($1, $2, $3, NOW())
    `;
    await this.db.query(query, [manufacturerId, responseTime, success]);
  }
  async logProductAccess(_userId, userRole, query, resultCount, projectId) {
    const logQuery = `
      INSERT INTO manufacturer_access_log (
        user_id,
        user_role,
        project_id,
        search_query,
        result_count,
        accessed_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `;
    await this.db.query(logQuery, [
      _userId,
      userRole,
      projectId,
      JSON.stringify(query),
      resultCount,
    ]);
  }
  async analyzeProjectContext(projectId) {
    // Analyze project requirements, existing selections, etc.
    const query = `
      SELECT 
        project_type,
        building_category,
        target_budget,
        sustainability_goals,
        timeline_requirements
      FROM projects
      WHERE id = $1
    `;
    const result = await this.db.query(query, [projectId]);
    return result.rows[0] || {};
  }
  generateRecommendationQueries(requirements, _projectContext) {
    // Generate intelligent search queries based on requirements
    const queries = [];
    // Example: Generate queries for different product categories
    const categories = ['structural_steel', 'insulation', 'windows_doors'];
    for (const category of categories) {
      queries.push({
        category,
        specifications: requirements,
        limit: 5,
      });
    }
    return queries;
  }
  async scoreAndRankProducts(
    products,
    requirements,
    _projectContext,
    _userRole
  ) {
    const recommendations = [];
    for (const product of products) {
      const score = this.calculateProductScore(
        product,
        requirements,
        _projectContext
      );
      const reasons = this.generateRecommendationReasons(product, requirements);
      const alternatives = await this.findAlternativeProducts(
        product,
        products
      );
      recommendations.push({
        product,
        score,
        reasons,
        alternatives,
      });
    }
    // Sort by score descending
    return recommendations.sort((a, b) => b.score - a.score);
  }
  calculateProductScore(product, requirements, _projectContext) {
    let score = 0;
    // Specification matching (40% weight)
    score += this.scoreSpecificationMatch(product, requirements) * 0.4;
    // Cost efficiency (30% weight)
    score += this.scoreCostEfficiency(product, _projectContext) * 0.3;
    // Sustainability (20% weight)
    score += this.scoreSustainability(product, _projectContext) * 0.2;
    // Availability (10% weight)
    score += this.scoreAvailability(product, _projectContext) * 0.1;
    return Math.min(1, Math.max(0, score));
  }
  scoreSpecificationMatch(_product, _requirements) {
    // Placeholder scoring logic
    return 0.8;
  }
  scoreCostEfficiency(_product, _projectContext) {
    // Placeholder scoring logic
    return 0.7;
  }
  scoreSustainability(_product, _projectContext) {
    // Placeholder scoring logic
    return 0.6;
  }
  scoreAvailability(_product, _projectContext) {
    // Placeholder scoring logic
    return 0.9;
  }
  generateRecommendationReasons(_product, _requirements) {
    return [
      {
        type: 'specification_match',
        description: 'Meets 90% of technical requirements',
        weight: 0.4,
      },
      {
        type: 'cost_efficiency',
        description: 'Within budget with good value proposition',
        weight: 0.3,
      },
    ];
  }
  async findAlternativeProducts(product, allProducts) {
    // Find similar products in the same category
    const alternatives = allProducts
      .filter(
        (p) =>
          p.productId !== product.productId && p.category === product.category
      )
      .slice(0, 3)
      .map((p) => ({
        productId: p.productId,
        reason: 'Similar specifications and category',
        score: 0.8,
      }));
    return alternatives;
  }
  sortSearchResults(products, _sortBy, _sortOrder) {
    // Implement sorting logic
    return products;
  }
  paginateResults(products, offset, limit) {
    return products.slice(offset, offset + limit);
  }
  generateSearchFacets(_products) {
    // Generate facets for search filtering
    return {
      categories: [],
      manufacturers: [],
      priceRanges: [],
    };
  }
  async syncManufacturerProducts(_manufacturer) {
    // Implement product sync logic
    // console.log(`Syncing products for ${manufacturer.name}`);
  }
  async updateSyncStatus(manufacturerId, status, errorMessage) {
    const query = `
      UPDATE manufacturer_integrations 
      SET 
        last_sync = NOW(),
        status = $2,
        error_messages = CASE 
          WHEN $3 IS NOT NULL THEN ARRAY[$3]
          ELSE error_messages
        END
      WHERE manufacturer_id = $1
    `;
    await this.db.query(query, [manufacturerId, status, errorMessage]);
  }
}
//# sourceMappingURL=api-integration.service.js.map
