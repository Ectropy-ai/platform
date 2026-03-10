// MCP Agent Configuration
// Generated on 2025-09-03T05:36:44.744Z
// Environment: development
// Pattern: dev-*

export default {
  dev: {
    mcp: {
      enabled: true,
      endpoint: 'http://localhost:3020',
      validation: 'passed',
      tools: [
        'semantic_search',
        'document_analysis',
        'code_generation',
        'health_metrics',
      ],
      retries: 3,
      timeout: 30000,
      environment: 'development',
    },
  },
  'dev-*': {
    mcp: {
      enabled: true,
      endpoint: 'http://localhost:3020',
      validation: 'passed',
      tools: ['semantic_search', 'document_analysis', 'health_metrics'],
      retries: 3,
      timeout: 30000,
      environment: 'development',
    },
  },
  compliance: {
    mcp: {
      enabled: true,
      endpoint: 'http://localhost:3020',
      validation: 'passed',
      tools: ['document_analysis', 'health_metrics'],
      environment: 'development',
    },
  },
  performance: {
    mcp: {
      enabled: true,
      endpoint: 'http://localhost:3020',
      validation: 'passed',
      tools: ['health_metrics', 'semantic_search'],
      environment: 'development',
    },
  },
  procurement: {
    mcp: {
      enabled: true,
      endpoint: 'http://localhost:3020',
      validation: 'passed',
      tools: ['document_analysis', 'semantic_search'],
      environment: 'development',
    },
  },
};
