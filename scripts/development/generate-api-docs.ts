#!/usr/bin/env tsx

/**
 * API Documentation Generation - Enterprise Grade
 *
 * Automatically generates comprehensive API documentation by analyzing
 * route files and extracting endpoint information, request/response schemas,
 * and examples for all services in the Ectropy platform.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';

interface Endpoint {
  path: string;
  method: string;
  description: string;
  service: string;
  port: number;
  request?: {
    body?: object;
    params?: object;
    query?: object;
    headers?: object;
  };
  response?: {
    success?: object;
    error?: object;
  };
  example?: {
    request: string;
    response: string;
  };
  authentication?: boolean;
  rateLimit?: string;
}

interface ServiceConfig {
  name: string;
  port: number;
  description: string;
  baseUrl: string;
  routesPath: string;
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'API Gateway',
    port: 4000,
    description:
      'Main API gateway handling authentication, routing, and core business logic',
    baseUrl: 'http://localhost:4000',
    routesPath: 'apps/api-gateway/src/routes',
  },
  {
    name: 'MCP Server',
    port: 3001,
    description:
      'Model Context Protocol server for AI agent orchestration and management',
    baseUrl: 'http://localhost:3001',
    routesPath: 'apps/mcp-server/src/routes',
  },
  {
    name: 'Edge Server',
    port: 3002,
    description:
      'Edge computing service for IoT device integration and real-time data processing',
    baseUrl: 'http://localhost:3002',
    routesPath: 'apps/edge-server/src/routes',
  },
];

class APIDocumentationGenerator {
  private endpoints: Endpoint[] = [];
  private servicesFound: Set<string> = new Set();

  async generateDocumentation(): Promise<void> {
    console.log('📚 Generating comprehensive API documentation...\n');

    // Extract endpoints from all services
    for (const service of SERVICES) {
      console.log(`🔍 Analyzing ${service.name} (${service.baseUrl})`);
      await this.extractEndpoints(service);
    }

    // Generate markdown documentation
    const markdown = this.generateMarkdown();
    const docPath = 'docs/API_DOCUMENTATION.md';

    writeFileSync(docPath, markdown);
    console.log(`\n📄 API documentation generated: ${docPath}`);

    // Generate JSON schema for tooling
    const jsonSchema = this.generateJSONSchema();
    const schemaPath = 'docs/api-schema.json';

    writeFileSync(schemaPath, JSON.stringify(jsonSchema, null, 2));
    console.log(`📋 API schema generated: ${schemaPath}`);

    // Generate OpenAPI spec
    const openApiSpec = this.generateOpenAPISpec();
    const openApiPath = 'docs/openapi.yml';

    writeFileSync(openApiPath, this.jsonToYaml(openApiSpec));
    console.log(`🌐 OpenAPI specification: ${openApiPath}`);

    console.log(`\n✅ Documentation complete:`);
    console.log(`   - ${this.endpoints.length} endpoints documented`);
    console.log(`   - ${this.servicesFound.size} services analyzed`);
    console.log(`   - Formats: Markdown, JSON Schema, OpenAPI`);
  }

  private findRouteFiles(dir: string): string[] {
    const files: string[] = [];

    if (!existsSync(dir)) return files;

    const items = readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dir, item.name);

      if (item.isDirectory() && !item.name.includes('node_modules')) {
        files.push(...this.findRouteFiles(fullPath));
      } else if (item.isFile()) {
        const ext = extname(item.name);
        if (
          ['.ts', '.js'].includes(ext) &&
          !item.name.includes('.test.') &&
          !item.name.includes('.spec.')
        ) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  private async extractEndpoints(service: ServiceConfig): Promise<void> {
    const routesPath = join(process.cwd(), service.routesPath);

    if (!existsSync(routesPath)) {
      console.log(`   ⚠️  Routes directory not found: ${routesPath}`);
      return;
    }

    this.servicesFound.add(service.name);

    // Find route files recursively without glob
    const routeFiles = this.findRouteFiles(routesPath);

    console.log(`   📁 Found ${routeFiles.length} route files`);

    for (const file of routeFiles) {
      try {
        const content = readFileSync(file, 'utf-8');
        const endpoints = this.parseRouteFile(content, service, file);
        this.endpoints.push(...endpoints);

        if (endpoints.length > 0) {
          console.log(
            `     📄 ${file.replace(process.cwd(), '.')}: ${endpoints.length} endpoints`
          );
        }
      } catch (error) {
        console.log(`     ⚠️  Error parsing ${file}: ${error.message}`);
      }
    }
  }

  private parseRouteFile(
    content: string,
    service: ServiceConfig,
    filePath: string
  ): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const fileName =
      filePath
        .split('/')
        .pop()
        ?.replace(/\.(ts|js)$/, '') || 'unknown';

    // Extract route definitions using regex patterns
    const routePatterns = [
      // Express.js router patterns
      /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]\s*,([^}]+)}/gi,
      // App route patterns
      /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]\s*,([^}]+)}/gi,
      // Fastify patterns
      /fastify\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]\s*,([^}]+)}/gi,
    ];

    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const [, method, path, handlerContent] = match;

        const endpoint: Endpoint = {
          path: this.normalizePath(path),
          method: method.toUpperCase(),
          description: this.extractDescription(handlerContent, fileName),
          service: service.name,
          port: service.port,
          authentication: this.extractAuthRequirement(handlerContent),
          rateLimit: this.extractRateLimit(handlerContent),
        };

        // Extract request/response schemas
        endpoint.request = this.extractRequestSchema(handlerContent);
        endpoint.response = this.extractResponseSchema(handlerContent);
        endpoint.example = this.generateExample(endpoint);

        endpoints.push(endpoint);
      }
    }

    // Add common health and info endpoints if this is a main route file
    if (fileName === 'health' || fileName === 'index') {
      endpoints.push({
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint for service monitoring',
        service: service.name,
        port: service.port,
        response: {
          success: {
            status: 'healthy',
            uptime: 'number',
            timestamp: 'string',
            version: 'string',
          },
        },
        example: {
          request: `GET ${service.baseUrl}/health`,
          response: JSON.stringify(
            {
              status: 'healthy',
              uptime: 12345,
              timestamp: '2024-01-01T00:00:00Z',
              version: '1.0.0',
            },
            null,
            2
          ),
        },
      });
    }

    return endpoints;
  }

  private normalizePath(path: string): string {
    // Convert Express parameter syntax to OpenAPI format
    return path
      .replace(/:([^/]+)/g, '{$1}') // :id -> {id}
      .replace(/\*/g, '{proxy+}'); // * -> {proxy+}
  }

  private extractDescription(content: string, fileName: string): string {
    // Look for JSDoc comments or inline comments
    const commentMatches = content.match(/\/\*\*([^*]|\*(?!\/))*\*\//g) || [];
    const lineCommentMatches = content.match(/\/\/\s*(.+)/g) || [];

    if (commentMatches.length > 0) {
      return commentMatches[0]
        .replace(/\/\*\*|\*\/|\*/g, '')
        .trim()
        .split('\n')[0]
        .trim();
    }

    if (lineCommentMatches.length > 0) {
      return lineCommentMatches[0].replace('//', '').trim();
    }

    // Generate description based on file name and HTTP method
    const fileDescriptions: Record<string, string> = {
      auth: 'Authentication and authorization endpoints',
      user: 'User management and profile operations',
      project: 'Project management and collaboration',
      health: 'Service health and monitoring endpoints',
      agents: 'AI agent management and execution',
      metrics: 'Performance metrics and analytics',
      admin: 'Administrative operations',
      ifc: 'IFC file processing and BIM operations',
      element: 'Construction element management',
    };

    return fileDescriptions[fileName] || `${fileName} operations`;
  }

  private extractAuthRequirement(content: string): boolean {
    // Look for authentication middleware patterns
    const authPatterns = [
      /requireAuth/i,
      /authenticate/i,
      /auth\.required/i,
      /verifyToken/i,
      /isAuthenticated/i,
    ];

    return authPatterns.some((pattern) => pattern.test(content));
  }

  private extractRateLimit(content: string): string | undefined {
    const rateLimitMatch = content.match(/rateLimit\(['"`]([^'"`]+)['"`]\)/);
    return rateLimitMatch?.[1];
  }

  private extractRequestSchema(content: string): Endpoint['request'] {
    const schema: Endpoint['request'] = {};

    // Look for validation schemas or TypeScript interfaces
    if (content.includes('body')) {
      schema.body = this.extractBodySchema(content);
    }

    if (content.includes('params')) {
      schema.params = this.extractParamsSchema(content);
    }

    if (content.includes('query')) {
      schema.query = this.extractQuerySchema(content);
    }

    return Object.keys(schema).length > 0 ? schema : undefined;
  }

  private extractResponseSchema(content: string): Endpoint['response'] {
    // Look for response patterns
    const successMatch = content.match(/res\.json\(([^)]+)\)/);
    const errorMatch = content.match(/res\.status\(4\d\d\)\.json\(([^)]+)\)/);

    const response: Endpoint['response'] = {};

    if (successMatch) {
      response.success = { data: 'object', message: 'string' };
    }

    if (errorMatch) {
      response.error = { error: 'string', message: 'string' };
    }

    return Object.keys(response).length > 0 ? response : undefined;
  }

  private extractBodySchema(content: string): object {
    // Simple body schema extraction
    if (content.includes('email') && content.includes('password')) {
      return { email: 'string', password: 'string' };
    }
    return { data: 'object' };
  }

  private extractParamsSchema(content: string): object {
    // Extract path parameters
    const paramMatches = content.match(/req\.params\.(\w+)/g) || [];
    const params: Record<string, string> = {};

    paramMatches.forEach((match) => {
      const param = match.replace('req.params.', '');
      params[param] = 'string';
    });

    return Object.keys(params).length > 0 ? params : { id: 'string' };
  }

  private extractQuerySchema(content: string): object {
    // Extract query parameters
    const queryMatches = content.match(/req\.query\.(\w+)/g) || [];
    const query: Record<string, string> = {};

    queryMatches.forEach((match) => {
      const param = match.replace('req.query.', '');
      query[param] = 'string';
    });

    return Object.keys(query).length > 0
      ? query
      : { limit: 'number', offset: 'number' };
  }

  private generateExample(endpoint: Endpoint): Endpoint['example'] {
    const baseUrl =
      SERVICES.find((s) => s.name === endpoint.service)?.baseUrl ||
      'http://localhost:3000';
    const fullUrl = `${baseUrl}${endpoint.path}`;

    let requestExample = `${endpoint.method} ${fullUrl}`;

    // Add headers for authenticated endpoints
    if (endpoint.authentication) {
      requestExample += '\nAuthorization: Bearer <your-jwt-token>';
    }

    // Add body example for POST/PUT requests
    if (
      ['POST', 'PUT', 'PATCH'].includes(endpoint.method) &&
      endpoint.request?.body
    ) {
      requestExample += '\nContent-Type: application/json\n\n';
      requestExample += JSON.stringify(
        this.generateExampleData(endpoint.request.body),
        null,
        2
      );
    }

    const responseExample = endpoint.response?.success
      ? JSON.stringify(
          this.generateExampleData(endpoint.response.success),
          null,
          2
        )
      : JSON.stringify({ status: 'success', data: {} }, null, 2);

    return {
      request: requestExample,
      response: responseExample,
    };
  }

  private generateExampleData(schema: any): any {
    if (typeof schema !== 'object') return schema;

    const example: any = {};

    for (const [key, type] of Object.entries(schema)) {
      switch (type) {
        case 'string':
          example[key] = key.includes('email')
            ? 'user@example.com'
            : key.includes('password')
              ? 'securePassword123'
              : key.includes('id')
                ? 'abc123'
                : `example_${key}`;
          break;
        case 'number':
          example[key] =
            key.includes('count') || key.includes('limit') ? 10 : 123;
          break;
        case 'boolean':
          example[key] = true;
          break;
        case 'object':
          example[key] = {};
          break;
        default:
          example[key] = `example_${key}`;
      }
    }

    return example;
  }

  private generateMarkdown(): string {
    let markdown = '# Ectropy Platform API Documentation\n\n';
    markdown += 'Complete API endpoint documentation for all services.\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n\n`;

    // Table of contents
    markdown += '## Table of Contents\n\n';
    for (const service of SERVICES) {
      if (this.servicesFound.has(service.name)) {
        markdown += `- [${service.name}](#${service.name.toLowerCase().replace(/\s+/g, '-')})\n`;
      }
    }
    markdown += '\n';

    // Service documentation
    for (const service of SERVICES) {
      if (!this.servicesFound.has(service.name)) continue;

      const serviceEndpoints = this.endpoints.filter(
        (e) => e.service === service.name
      );

      markdown += `## ${service.name}\n\n`;
      markdown += `**Base URL:** \`${service.baseUrl}\`\n\n`;
      markdown += `${service.description}\n\n`;

      // Group endpoints by path for better organization
      const groupedEndpoints = this.groupEndpointsByPath(serviceEndpoints);

      for (const [basePath, endpoints] of Object.entries(groupedEndpoints)) {
        markdown += `### ${basePath || 'Root'}\n\n`;

        for (const endpoint of endpoints) {
          markdown += `#### ${endpoint.method} ${endpoint.path}\n\n`;
          markdown += `${endpoint.description}\n\n`;

          if (endpoint.authentication) {
            markdown += '**Authentication:** Required\n\n';
          }

          if (endpoint.rateLimit) {
            markdown += `**Rate Limit:** ${endpoint.rateLimit}\n\n`;
          }

          if (endpoint.request) {
            markdown += '**Request:**\n\n';

            if (endpoint.request.params) {
              markdown += 'Path Parameters:\n```json\n';
              markdown += JSON.stringify(endpoint.request.params, null, 2);
              markdown += '\n```\n\n';
            }

            if (endpoint.request.body) {
              markdown += 'Request Body:\n```json\n';
              markdown += JSON.stringify(endpoint.request.body, null, 2);
              markdown += '\n```\n\n';
            }

            if (endpoint.request.query) {
              markdown += 'Query Parameters:\n```json\n';
              markdown += JSON.stringify(endpoint.request.query, null, 2);
              markdown += '\n```\n\n';
            }
          }

          if (endpoint.response) {
            markdown += '**Response:**\n\n';

            if (endpoint.response.success) {
              markdown += 'Success Response:\n```json\n';
              markdown += JSON.stringify(endpoint.response.success, null, 2);
              markdown += '\n```\n\n';
            }

            if (endpoint.response.error) {
              markdown += 'Error Response:\n```json\n';
              markdown += JSON.stringify(endpoint.response.error, null, 2);
              markdown += '\n```\n\n';
            }
          }

          if (endpoint.example) {
            markdown += '**Example:**\n\n';
            markdown += 'Request:\n```http\n';
            markdown += endpoint.example.request;
            markdown += '\n```\n\n';
            markdown += 'Response:\n```json\n';
            markdown += endpoint.example.response;
            markdown += '\n```\n\n';
          }

          markdown += '---\n\n';
        }
      }
    }

    return markdown;
  }

  private groupEndpointsByPath(
    endpoints: Endpoint[]
  ): Record<string, Endpoint[]> {
    const groups: Record<string, Endpoint[]> = {};

    for (const endpoint of endpoints) {
      const basePath = endpoint.path.split('/')[1] || 'root';
      if (!groups[basePath]) {
        groups[basePath] = [];
      }
      groups[basePath].push(endpoint);
    }

    return groups;
  }

  private generateJSONSchema(): object {
    return {
      openapi: '3.0.0',
      info: {
        title: 'Ectropy Platform API',
        version: '1.0.0',
        description: 'Enterprise federated construction platform API',
      },
      servers: SERVICES.filter((s) => this.servicesFound.has(s.name)).map(
        (service) => ({
          url: service.baseUrl,
          description: service.description,
        })
      ),
      paths: this.endpoints.reduce((paths, endpoint) => {
        const pathKey = endpoint.path;
        if (!paths[pathKey]) {
          paths[pathKey] = {};
        }

        paths[pathKey][endpoint.method.toLowerCase()] = {
          summary: endpoint.description,
          tags: [endpoint.service],
          security: endpoint.authentication ? [{ bearerAuth: [] }] : [],
          requestBody: endpoint.request?.body
            ? {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: endpoint.request.body,
                    },
                  },
                },
              }
            : undefined,
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: endpoint.response?.success
                    ? {
                        type: 'object',
                        properties: endpoint.response.success,
                      }
                    : { type: 'object' },
                },
              },
            },
            '400': {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: endpoint.response?.error
                    ? {
                        type: 'object',
                        properties: endpoint.response.error,
                      }
                    : { type: 'object' },
                },
              },
            },
          },
        };

        return paths;
      }, {} as any),
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    };
  }

  private generateOpenAPISpec(): object {
    return this.generateJSONSchema();
  }

  private jsonToYaml(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      yaml += `${spaces}${key}:`;

      if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += '\n' + this.jsonToYaml(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += '\n';
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}- \n${this.jsonToYaml(item, indent + 1)}`;
          } else {
            yaml += `${spaces}- ${item}\n`;
          }
        }
      } else {
        yaml += ` ${typeof value === 'string' ? `"${value}"` : value}\n`;
      }
    }

    return yaml;
  }
}

// CLI interface
async function main(): Promise<void> {
  console.log('📚 Ectropy Platform - API Documentation Generator');
  console.log('===============================================\n');

  const generator = new APIDocumentationGenerator();
  await generator.generateDocumentation();

  console.log('\n🎯 Next Steps:');
  console.log(
    '   1. Review generated documentation: docs/API_DOCUMENTATION.md'
  );
  console.log('   2. Validate endpoints: npm run validate:endpoints');
  console.log('   3. Serve interactive docs: npm run docs:serve');
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { APIDocumentationGenerator, SERVICES };
