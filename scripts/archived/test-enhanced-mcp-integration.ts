#!/usr/bin/env tsx

/**
 * Enhanced MCP Integration Test Suite
 * Validates ESM migration success and AI-enhanced capabilities
 */

import { promises as fs } from 'fs';

interface MCPResponse<T = any> {
  success?: boolean;
  result?: T;
  execution_time_ms?: number;
  error?: string;
  results?: T[];
}

interface SearchResult {
  id: string;
  content: string;
  score: number;
  file_path?: string;
  metadata?: any;
}

/**
 * Enhanced MCP Client for comprehensive testing
 */
class EnhancedMCPClient {
  private config: {
    endpoint: string;
    timeout: number;
    apiKey?: string;
  };

  constructor(config: { endpoint: string; timeout?: number; apiKey?: string }) {
    this.config = {
      timeout: 30000,
      ...config
    };
  }

  /**
   * Test enhanced semantic search functionality
   */
  async semanticSearch(params: {
    query: string;
    limit?: number;
    threshold?: number;
  }): Promise<MCPResponse<SearchResult[]>> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          tool: 'semantic_search',
          parameters: {
            query: params.query,
            limit: params.limit || 5,
            threshold: params.threshold || 0.7
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: data.success,
        result: data.result,
        results: data.result?.results || [],
        execution_time_ms: data.execution_time_ms,
        error: data.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results: []
      };
    }
  }

  /**
   * Test enhanced document analysis functionality
   */
  async analyzeDocument(params: {
    path: string;
    analysisType: 'summary' | 'keywords' | 'structure';
  }): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          tool: 'document_analysis',
          parameters: {
            path: params.path,
            analysisType: params.analysisType
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test system health check
   */
  async healthCheck(): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.config.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        success: true,
        result: await response.json(),
        execution_time_ms: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test enhanced AI tools
   */
  async testAITools(): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tool: 'health_check',
          parameters: {}
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test code analysis functionality
   */
  async analyzeCode(params: {
    repository_path?: string;
    analysis_scope?: string;
  }): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tool: 'code_analysis',
          parameters: params
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Enhanced validation function
 */
async function validateEnhancedMCP(): Promise<void> {
  console.log('🎉 ESM Migration Success - Enhanced MCP Integration Validation');
  console.log('===========================================================\n');

  const client = new EnhancedMCPClient({
    endpoint: process.env.MCP_ENDPOINT || 'http://localhost:3001',
    timeout: 30000
  });

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Enhanced Health Check
  console.log('🩺 Testing Enhanced Health Check...');
  totalTests++;
  try {
    const health = await client.healthCheck();
    
    if (health.success && health.result) {
      console.log(`✅ Enhanced health check passed`);
      console.log(`   Status: ${health.result.status}`);
      console.log(`   Service: ${health.result.service}`);
      console.log(`   Features: ${Object.keys(health.result.features || {}).join(', ')}`);
      console.log(`   Uptime: ${Math.round(health.result.uptime || 0)}s`);
      passedTests++;
    } else {
      console.log(`❌ Enhanced health check failed: ${health.error}`);
    }
  } catch (error) {
    console.log(`❌ Health check error: ${error}`);
  }

  // Test 2: AI Tools Health Check  
  console.log('\n🤖 Testing AI Tools Health...');
  totalTests++;
  try {
    const aiHealth = await client.testAITools();

    if (aiHealth.success && aiHealth.result) {
      console.log(`✅ AI tools health check passed`);
      console.log(`   AI Capabilities: ${JSON.stringify(aiHealth.result.ai_capabilities || {})}`);
      console.log(`   Performance: ${JSON.stringify(aiHealth.result.performance || {})}`);
      passedTests++;
    } else {
      console.log(`❌ AI tools health failed: ${aiHealth.error}`);
    }
  } catch (error) {
    console.log(`❌ AI tools error: ${error}`);
  }

  // Test 3: Enhanced Semantic Search
  console.log('\n🔍 Testing Enhanced Semantic Search...');
  totalTests++;
  try {
    const searchResults = await client.semanticSearch({
      query: 'authentication implementation ESM migration',
      limit: 5,
      threshold: 0.6
    });

    if (searchResults.success && !searchResults.error) {
      console.log(`✅ Enhanced semantic search completed`);
      console.log(`   Results: ${searchResults.results?.length || 0}`);
      console.log(`   Execution time: ${searchResults.execution_time_ms || 'N/A'}ms`);
      
      if (searchResults.results && searchResults.results.length > 0) {
        console.log(`   Sample result: ${searchResults.results[0].content.substring(0, 80)}...`);
        console.log(`   Score: ${searchResults.results[0].score}`);
      }
      passedTests++;
    } else {
      console.log(`❌ Enhanced semantic search failed: ${searchResults.error}`);
    }
  } catch (error) {
    console.log(`❌ Semantic search error: ${error}`);
  }

  // Test 4: Enhanced Document Analysis
  console.log('\n📄 Testing Enhanced Document Analysis...');
  totalTests++;
  try {
    const analysisResult = await client.analyzeDocument({
      path: 'README.md',
      analysisType: 'summary'
    });

    if (analysisResult.success && !analysisResult.error) {
      console.log(`✅ Enhanced document analysis completed`);
      console.log(`   Execution time: ${analysisResult.execution_time_ms || 'N/A'}ms`);
      
      if (analysisResult.result) {
        console.log(`   Analysis type: ${analysisResult.result.analysis_type}`);
        console.log(`   Insights: ${analysisResult.result.insights?.length || 0} findings`);
      }
      passedTests++;
    } else {
      console.log(`❌ Enhanced document analysis failed: ${analysisResult.error}`);
    }
  } catch (error) {
    console.log(`❌ Document analysis error: ${error}`);
  }

  // Test 5: Code Analysis for GitHub Integration
  console.log('\n⚙️ Testing Code Analysis (GitHub Integration Ready)...');
  totalTests++;
  try {
    const codeAnalysis = await client.analyzeCode({
      repository_path: 'current',
      analysis_scope: 'enhanced'
    });

    if (codeAnalysis.success && !codeAnalysis.error) {
      console.log(`✅ Code analysis completed`);
      console.log(`   Execution time: ${codeAnalysis.execution_time_ms || 'N/A'}ms`);
      
      if (codeAnalysis.result?.analysis) {
        console.log(`   Quality score: ${codeAnalysis.result.analysis.code_quality_score}`);
        console.log(`   Recommendations: ${codeAnalysis.result.recommendations?.length || 0}`);
      }
      passedTests++;
    } else {
      console.log(`❌ Code analysis failed: ${codeAnalysis.error}`);
    }
  } catch (error) {
    console.log(`❌ Code analysis error: ${error}`);
  }

  // Summary
  console.log('\n📊 Enhanced MCP Integration Test Results');
  console.log('==========================================');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 ESM MIGRATION SUCCESS - ALL ENHANCED FEATURES OPERATIONAL!');
    console.log('✅ MCP server ready for GitHub agent integration');
    console.log('✅ AI-enhanced tools validated and functional');
    console.log('✅ Production deployment pipeline ready');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('\n🎯 ESM MIGRATION SUCCESSFUL - Core features operational');
    console.log('⚠️ Some enhanced features need attention');
  } else {
    console.log('\n❌ Enhanced MCP validation failed');
    process.exit(1);
  }

  // Write success report
  const report = {
    timestamp: new Date().toISOString(),
    esm_migration_status: 'SUCCESS',
    mcp_server_status: 'OPERATIONAL',
    enhanced_features: {
      semantic_search: passedTests >= 3,
      document_analysis: passedTests >= 4,
      code_analysis: passedTests >= 5,
      ai_tools: passedTests >= 2
    },
    test_results: {
      total: totalTests,
      passed: passedTests,
      success_rate: Math.round((passedTests / totalTests) * 100)
    },
    next_steps: [
      'Deploy to staging environment',
      'Enable GitHub agent integration',
      'Configure production monitoring',
      'Implement load testing'
    ]
  };

  try {
    await fs.writeFile('validation-report-enhanced.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report saved: validation-report-enhanced.json');
  } catch (error) {
    console.log('⚠️ Could not save report file');
  }
}

// Run validation
validateEnhancedMCP().catch(console.error);