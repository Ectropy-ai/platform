/**
 * MCP Integration Test Script
 * Validates core MCP functionality including semantic search, document analysis, and embeddings
 */

import { fileURLToPath } from 'url';

/**
 * Simple MCP Client for testing core functionality
 */
class MCPClient {
  constructor(config) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Test semantic search functionality
   */
  async semanticSearch(params) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
        },
        body: JSON.stringify({
          tool: 'semantic_search',
          parameters: {
            query: params.query,
            limit: params.limit || 5,
            threshold: params.threshold || 0.7,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        error: error.message,
        results: [],
      };
    }
  }

  /**
   * Test document analysis functionality
   */
  async analyzeDocument(params) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
        },
        body: JSON.stringify({
          tool: 'document_analysis',
          parameters: {
            document_path: params.path,
            analysis_type: params.analysisType,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        error: error.message,
      };
    }
  }

  /**
   * Test embeddings generation
   */
  async getEmbeddings(params) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
        },
        body: JSON.stringify({
          tool: 'generate_embeddings',
          parameters: {
            text: params.text,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result.embeddings || [];
    } catch (error) {
      console.error('Embeddings generation failed:', error);
      return [];
    }
  }

  /**
   * Test health endpoint
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(`${this.config.endpoint}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          status: `HTTP ${response.status}: ${response.statusText}`,
          healthy: false,
        };
      }

      const health = await response.json();
      return {
        status: health.status || 'unknown',
        healthy: health.status === 'healthy',
        details: health,
      };
    } catch (error) {
      return {
        status: error.message,
        healthy: false,
      };
    }
  }

  /**
   * Test metrics endpoint
   */
  async getMetrics() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(`${this.config.endpoint}/metrics`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          available: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const metrics = await response.text();
      return {
        available: true,
        metrics:
          metrics.substring(0, 500) + (metrics.length > 500 ? '...' : ''),
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
      };
    }
  }

  /**
   * Get relevant context for a query (convenience method for AI agents)
   */
  async getContext(query, contextSize = 5) {
    const response = await this.semanticSearch({ query, limit: contextSize });

    if (!response.results || response.error) {
      return `Context retrieval failed: ${response.error || 'Unknown error'}`;
    }

    if (!response.results || response.results.length === 0) {
      return 'No relevant context found.';
    }

    const contextParts = [];
    for (const result of response.results) {
      const filePath = result.metadata?.file_path || 'Unknown';
      const content = (result.content || '').substring(0, 500);
      const score = result.score || 0;

      contextParts.push(
        `File: ${filePath} (Score: ${score.toFixed(2)})\n${content}...`
      );
    }

    return contextParts.join('\n\n');
  }
}

/**
 * Main validation function
 */
async function validateMCP() {
  console.log('🔍 MCP Integration Test Suite');
  console.log('='.repeat(50));

  const endpoint = process.env.MCP_ENDPOINT || 'http://localhost:3001';
  const apiKey = process.env.MCP_API_KEY;

  console.log(`📡 Testing endpoint: ${endpoint}`);
  if (apiKey) {
    console.log('🔑 Using API key authentication');
  } else {
    console.log('🔓 No API key provided - testing without authentication');
  }

  const client = new MCPClient({
    endpoint,
    apiKey,
    timeout: 30000,
  });

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Health Check
  console.log('\n🏥 Testing Health Endpoint...');
  totalTests++;
  try {
    const health = await client.checkHealth();
    if (health.healthy) {
      console.log('✅ Health check passed');
      console.log(`   Status: ${health.status}`);
      if (health.details) {
        console.log(`   Uptime: ${health.details.uptime}s`);
        console.log(`   Environment: ${health.details.env}`);
      }
      passedTests++;
    } else {
      console.log(`❌ Health check failed: ${health.status}`);
    }
  } catch (error) {
    console.log(`❌ Health check error: ${error}`);
  }

  // Test 2: Metrics Endpoint
  console.log('\n📊 Testing Metrics Endpoint...');
  totalTests++;
  try {
    const metrics = await client.getMetrics();
    if (metrics.available) {
      console.log('✅ Metrics endpoint available');
      if (metrics.metrics) {
        console.log('   Sample metrics:');
        console.log(`   ${metrics.metrics.split('\n')[0]}`);
      }
      passedTests++;
    } else {
      console.log(`❌ Metrics endpoint failed: ${metrics.error}`);
    }
  } catch (error) {
    console.log(`❌ Metrics error: ${error}`);
  }

  // Test 3: Semantic Search
  console.log('\n🔍 Testing Semantic Search...');
  totalTests++;
  try {
    const searchResults = await client.semanticSearch({
      query: 'authentication implementation',
      limit: 5,
    });

    if (searchResults.error) {
      console.log(`❌ Semantic search failed: ${searchResults.error}`);
    } else {
      console.log(`✅ Semantic search completed`);
      console.log(`   Results: ${searchResults.results?.length || 0}`);
      console.log(
        `   Execution time: ${searchResults.execution_time_ms || 'N/A'}ms`
      );

      if (searchResults.results && searchResults.results.length > 0) {
        console.log(
          `   Sample result: ${searchResults.results[0].content.substring(0, 100)}...`
        );
      }
      passedTests++;
    }
  } catch (error) {
    console.log(`❌ Semantic search error: ${error}`);
  }

  // Test 4: Document Analysis
  console.log('\n📄 Testing Document Analysis...');
  totalTests++;
  try {
    const analysis = await client.analyzeDocument({
      path: 'README.md',
      analysisType: 'summary',
    });

    if (analysis.error) {
      console.log(`❌ Document analysis failed: ${analysis.error}`);
    } else {
      console.log('✅ Document analysis completed');
      console.log(`   Analysis type: summary`);
      if (analysis.results) {
        console.log(
          `   Result preview: ${JSON.stringify(analysis.results).substring(0, 100)}...`
        );
      }
      passedTests++;
    }
  } catch (error) {
    console.log(`❌ Document analysis error: ${error}`);
  }

  // Test 5: Embeddings Generation
  console.log('\n🧮 Testing Embeddings Generation...');
  totalTests++;
  try {
    const embeddings = await client.getEmbeddings({
      text: 'test query for embeddings',
    });

    if (embeddings.length > 0) {
      console.log('✅ Embeddings generation completed');
      console.log(`   Dimensions: ${embeddings.length}`);
      console.log(
        `   Sample values: [${embeddings
          .slice(0, 3)
          .map((v) => v.toFixed(4))
          .join(', ')}...]`
      );
      passedTests++;
    } else {
      console.log('❌ Embeddings generation failed - no embeddings returned');
    }
  } catch (error) {
    console.log(`❌ Embeddings generation error: ${error}`);
  }

  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests} tests`);

  const successRate = Math.round((passedTests / totalTests) * 100);
  console.log(`📈 Success Rate: ${successRate}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED - MCP server is fully functional!');
    process.exit(0);
  } else if (passedTests >= totalTests * 0.6) {
    console.log(
      '\n⚠️ PARTIAL SUCCESS - Some features may not be fully operational'
    );
    process.exit(0);
  } else {
    console.log('\n❌ TESTS FAILED - MCP server has significant issues');
    process.exit(1);
  }
}

/**
 * Factory function to create MCP client
 */
export function createMCPClient() {
  const endpoint = process.env.MCP_ENDPOINT || 'http://localhost:3001';
  const token = process.env.MCP_AGENT_TOKEN;

  if (!token) {
    console.log('⚠️ MCP_AGENT_TOKEN not set - testing without authentication');
  }

  return new MCPClient({ endpoint, apiKey: token });
}

// Run validation if called directly
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  validateMCP().catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export { MCPClient, validateMCP };
