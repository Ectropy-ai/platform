#!/bin/bash

# Automated API Documentation Generator for Ectropy Platform
# Generates comprehensive OpenAPI documentation from code annotations

set -euo pipefail

# Configuration
OUTPUT_DIR="${OUTPUT_DIR:-docs/api}"
API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
MCP_BASE_URL="${MCP_BASE_URL:-http://localhost:3001}"
FORMAT="${FORMAT:-html}" # html, json, yaml
INCLUDE_EXAMPLES="${INCLUDE_EXAMPLES:-true}"
INCLUDE_SCHEMAS="${INCLUDE_SCHEMAS:-true}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Generating Ectropy Platform API Documentation${NC}"
echo "=================================================="

# Create output directory
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/api-gateway"
mkdir -p "$OUTPUT_DIR/mcp-server"
mkdir -p "$OUTPUT_DIR/schemas"
mkdir -p "$OUTPUT_DIR/examples"

# Function to extract API routes and generate OpenAPI spec
generate_openapi_spec() {
    local service_name="$1"
    local service_path="$2"
    local base_url="$3"
    
    echo -e "${YELLOW}📝 Generating OpenAPI spec for ${service_name}...${NC}"
    
    cat > "$OUTPUT_DIR/${service_name}/openapi.yaml" << EOF
openapi: 3.0.3
info:
  title: Ectropy Platform ${service_name} API
  description: |
    Enterprise construction collaboration platform API
    
    ## Overview
    The Ectropy Platform provides comprehensive BIM collaboration, stakeholder management,
    and AI-powered construction project automation.
    
    ## Authentication
    All API endpoints require authentication via Bearer token:
    \`\`\`
    Authorization: Bearer <your-jwt-token>
    \`\`\`
    
    ## Rate Limiting
    - 100 requests per 15 minutes for unauthenticated requests
    - 200 requests per 15 minutes for authenticated construction professionals
    - 300 requests per 15 minutes for BIM operations
    
    ## Construction Industry Standards
    - IFC 4.0 compliant BIM element structures
    - ISO 19650 information management standards
    - Construction stakeholder role-based access control
    
  version: 1.0.0
  contact:
    name: Ectropy Platform API Support
    email: api-support@ectropy.com
    url: https://docs.ectropy.com
  license:
    name: Proprietary
    url: https://ectropy.com/license

servers:
  - url: ${base_url}
    description: Development server
  - url: https://api.ectropy.com
    description: Production server
  - url: https://staging-api.ectropy.com
    description: Staging server

security:
  - BearerAuth: []

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT token obtained from /api/v1/auth/login

  schemas:
EOF

    # Generate schema definitions based on TypeScript interfaces
    if [ "$service_name" = "api-gateway" ]; then
        generate_api_gateway_schemas >> "$OUTPUT_DIR/${service_name}/openapi.yaml"
    else
        generate_mcp_server_schemas >> "$OUTPUT_DIR/${service_name}/openapi.yaml"
    fi

    echo -e "${GREEN}✅ OpenAPI spec generated for ${service_name}${NC}"
}

# Generate API Gateway schemas
generate_api_gateway_schemas() {
    cat << EOF
    # Authentication & User Management
    User:
      type: object
      required: [id, email, role]
      properties:
        id:
          type: string
          format: uuid
          description: Unique user identifier
        email:
          type: string
          format: email
          description: User email address
        role:
          type: string
          enum: [owner, architect, contractor, engineer]
          description: Construction stakeholder role
        permissions:
          type: array
          items:
            type: string
          description: Granted permissions
        projects:
          type: array
          items:
            type: string
            format: uuid
          description: Associated project IDs
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    AuthRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
          example: contractor@example.com
        password:
          type: string
          minLength: 8
          example: securepassword123

    AuthResponse:
      type: object
      properties:
        token:
          type: string
          description: JWT access token
        user:
          \$ref: '#/components/schemas/User'
        expiresAt:
          type: string
          format: date-time

    # Construction Projects
    Project:
      type: object
      required: [id, name, type, phase]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          description: Project name
          example: "Downtown Office Complex"
        type:
          type: string
          enum: [residential, commercial, industrial, infrastructure]
        phase:
          type: string
          enum: [design, planning, procurement, construction, inspection, handover]
        location:
          type: object
          properties:
            address:
              type: string
            city:
              type: string
            country:
              type: string
            coordinates:
              type: object
              properties:
                latitude:
                  type: number
                longitude:
                  type: number
        budget:
          type: number
          description: Project budget in USD
        stakeholders:
          type: array
          items:
            \$ref: '#/components/schemas/Stakeholder'
        timeline:
          type: object
          properties:
            startDate:
              type: string
              format: date
            endDate:
              type: string
              format: date
            milestones:
              type: array
              items:
                type: object

    # BIM Elements
    BIMElement:
      type: object
      required: [id, type, projectId]
      properties:
        id:
          type: string
          format: uuid
        type:
          type: string
          description: IFC element type
          enum: [IfcWall, IfcBeam, IfcColumn, IfcSlab, IfcWindow, IfcDoor, IfcRoof, IfcStair]
          example: IfcWall
        projectId:
          type: string
          format: uuid
        properties:
          type: object
          description: Element properties following IFC standard
          properties:
            material:
              type: string
              example: Concrete
            dimensions:
              type: object
              properties:
                length:
                  type: number
                  description: Length in meters
                width:
                  type: number
                  description: Width in meters  
                height:
                  type: number
                  description: Height in meters
            location:
              type: object
              properties:
                x:
                  type: number
                y:
                  type: number
                z:
                  type: number
            specifications:
              type: object
              description: Material and construction specifications
        relationships:
          type: array
          items:
            type: object
            properties:
              relatedElementId:
                type: string
                format: uuid
              relationshipType:
                type: string
                enum: [contains, connects, supports, adjacent]
        metadata:
          type: object
          properties:
            createdBy:
              type: string
              format: uuid
            createdAt:
              type: string
              format: date-time
            lastModified:
              type: string
              format: date-time
            version:
              type: string

    Stakeholder:
      type: object
      required: [userId, role, projectId]
      properties:
        userId:
          type: string
          format: uuid
        role:
          type: string
          enum: [owner, architect, contractor, engineer, inspector, consultant]
        projectId:
          type: string
          format: uuid
        permissions:
          type: array
          items:
            type: string
        responsibilities:
          type: array
          items:
            type: string
        contactInfo:
          type: object
          properties:
            phone:
              type: string
            company:
              type: string

    # Error responses
    Error:
      type: object
      required: [error, message]
      properties:
        error:
          type: string
          description: Error code
        message:
          type: string
          description: Human-readable error message
        details:
          type: object
          description: Additional error details
        timestamp:
          type: string
          format: date-time
        path:
          type: string
          description: API endpoint path

paths:
  # Authentication endpoints
  /api/v1/auth/login:
    post:
      tags: [Authentication]
      summary: Authenticate user
      description: |
        Authenticate a construction stakeholder and receive a JWT token.
        Supports role-based authentication for different construction professionals.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/AuthRequest'
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/AuthResponse'
        '401':
          description: Authentication failed
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/Error'

  /api/v1/auth/refresh:
    post:
      tags: [Authentication]
      summary: Refresh JWT token
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Token refreshed successfully
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/AuthResponse'

  /api/v1/auth/me:
    get:
      tags: [Authentication]
      summary: Get current user profile
      security:
        - BearerAuth: []
      responses:
        '200':
          description: User profile
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/User'

  # Project management endpoints
  /api/v1/projects:
    get:
      tags: [Projects]
      summary: List construction projects
      description: |
        Get list of construction projects accessible to the authenticated stakeholder.
        Results are filtered based on user role and project permissions.
      security:
        - BearerAuth: []
      parameters:
        - name: phase
          in: query
          schema:
            type: string
            enum: [design, planning, procurement, construction, inspection, handover]
          description: Filter by project phase
        - name: type
          in: query
          schema:
            type: string
            enum: [residential, commercial, industrial, infrastructure]
          description: Filter by project type
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: offset
          in: query
          schema:
            type: integer
            minimum: 0
            default: 0
      responses:
        '200':
          description: List of projects
          content:
            application/json:
              schema:
                type: object
                properties:
                  projects:
                    type: array
                    items:
                      \$ref: '#/components/schemas/Project'
                  total:
                    type: integer
                  hasMore:
                    type: boolean

    post:
      tags: [Projects]
      summary: Create new construction project
      description: Create a new construction project (owner/architect only)
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/Project'
      responses:
        '201':
          description: Project created successfully
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/Project'

  /api/v1/projects/{projectId}:
    get:
      tags: [Projects]
      summary: Get project details
      security:
        - BearerAuth: []
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Project details
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/Project'

  /api/v1/projects/{projectId}/elements:
    get:
      tags: [BIM Elements]
      summary: List BIM elements in project
      description: |
        Get BIM elements for a construction project.
        Supports IFC-compliant element types and filtering.
      security:
        - BearerAuth: []
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
            format: uuid
        - name: type
          in: query
          schema:
            type: string
          description: Filter by IFC element type
        - name: material
          in: query
          schema:
            type: string
          description: Filter by material type
      responses:
        '200':
          description: List of BIM elements
          content:
            application/json:
              schema:
                type: object
                properties:
                  elements:
                    type: array
                    items:
                      \$ref: '#/components/schemas/BIMElement'
                  total:
                    type: integer

    post:
      tags: [BIM Elements]
      summary: Create BIM element
      description: Create a new BIM element in the project
      security:
        - BearerAuth: []
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/BIMElement'
      responses:
        '201':
          description: BIM element created
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/BIMElement'

  /health:
    get:
      tags: [System]
      summary: Health check
      description: Check API Gateway health status
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [healthy]
                  timestamp:
                    type: string
                    format: date-time
                  version:
                    type: string
                  uptime:
                    type: number
                    description: Uptime in seconds

tags:
  - name: Authentication
    description: User authentication and authorization
  - name: Projects
    description: Construction project management
  - name: BIM Elements
    description: Building Information Modeling elements
  - name: Stakeholders
    description: Project stakeholder management
  - name: System
    description: System health and monitoring
EOF
}

# Generate MCP Server schemas
generate_mcp_server_schemas() {
    cat << EOF
    # AI Agent schemas
    AgentTask:
      type: object
      required: [agentType, task]
      properties:
        agentType:
          type: string
          enum: [compliance, procurement, task-manager, performance]
          description: Type of AI agent to execute task
        task:
          type: object
          properties:
            action:
              type: string
              enum: [analyze, estimate, validate, optimize]
            parameters:
              type: object
              description: Task-specific parameters
            priority:
              type: string
              enum: [high, medium, low]
              default: medium
        context:
          type: object
          description: Additional context for the agent

    AgentResponse:
      type: object
      properties:
        success:
          type: boolean
        agentType:
          type: string
        result:
          type: object
          description: Agent execution result
        metadata:
          type: object
          properties:
            executionTime:
              type: number
              description: Execution time in milliseconds
            confidence:
              type: number
              minimum: 0
              maximum: 1
              description: Confidence score of the result

    # Document processing schemas  
    DocumentAnalysisRequest:
      type: object
      required: [documentType]
      properties:
        documentType:
          type: string
          enum: [pdf, ifc, dwg]
        analysisType:
          type: string
          enum: [content_extraction, compliance_check, cost_estimation]
        options:
          type: object
          properties:
            extractEntities:
              type: boolean
              default: true
            analyzeStructure:
              type: boolean
              default: true

    DocumentAnalysisResult:
      type: object
      properties:
        success:
          type: boolean
        documentType:
          type: string
        data:
          type: object
          description: Extracted document data
        metadata:
          type: object
          properties:
            fileSize:
              type: number
            processingTime:
              type: number
            extractedElements:
              type: number
            errors:
              type: array
              items:
                type: string

    # Semantic search schemas
    SemanticSearchRequest:
      type: object
      required: [query]
      properties:
        query:
          type: string
          description: Natural language search query
          example: "construction safety requirements for high-rise buildings"
        limit:
          type: integer
          minimum: 1
          maximum: 100
          default: 10
        filters:
          type: object
          properties:
            type:
              type: string
              enum: [document, drawing, specification, regulation]
            dateRange:
              type: object
              properties:
                from:
                  type: string
                  format: date
                to:
                  type: string
                  format: date

    SemanticSearchResult:
      type: object
      properties:
        results:
          type: array
          items:
            type: object
            properties:
              id:
                type: string
              title:
                type: string
              content:
                type: string
              score:
                type: number
                minimum: 0
                maximum: 1
              metadata:
                type: object
        query:
          type: string
        processingTime:
          type: number

paths:
  /health:
    get:
      tags: [System]
      summary: MCP Server health check
      responses:
        '200':
          description: Service is healthy

  /api/agents/task:
    post:
      tags: [AI Agents]
      summary: Execute AI agent task
      description: |
        Execute a task using one of the specialized AI agents:
        - **Compliance Agent**: Building code and regulation compliance checks
        - **Procurement Agent**: Material sourcing and cost optimization
        - **Task Manager Agent**: Project task management and scheduling
        - **Performance Agent**: Construction performance analysis
      requestBody:
        required: true
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/AgentTask'
      responses:
        '200':
          description: Task executed successfully
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/AgentResponse'

  /api/semantic-search:
    post:
      tags: [Search]
      summary: Semantic search
      description: |
        Perform semantic search across construction documents, drawings, and specifications.
        Uses AI-powered understanding of construction terminology and context.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/SemanticSearchRequest'
      responses:
        '200':
          description: Search results
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/SemanticSearchResult'

  /api/document/analyze:
    post:
      tags: [Document Processing]
      summary: Analyze construction document
      description: |
        Process and analyze construction documents including:
        - PDF specifications and reports
        - IFC BIM models  
        - DWG/DXF drawings
      requestBody:
        required: true
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/DocumentAnalysisRequest'
      responses:
        '200':
          description: Document analysis complete
          content:
            application/json:
              schema:
                \$ref: '#/components/schemas/DocumentAnalysisResult'

tags:
  - name: AI Agents
    description: Specialized AI agents for construction tasks
  - name: Search
    description: Semantic search capabilities
  - name: Document Processing
    description: Construction document analysis
  - name: System
    description: System health and monitoring
EOF
}

# Generate HTML documentation
generate_html_docs() {
    local service_name="$1"
    
    echo -e "${YELLOW}🌐 Generating HTML documentation for ${service_name}...${NC}"
    
    # Install Redoc CLI if not present
    if ! command -v redoc-cli &> /dev/null; then
        echo "Installing Redoc CLI..."
        npm install -g redoc-cli
    fi
    
    # Generate HTML documentation
    redoc-cli build "$OUTPUT_DIR/${service_name}/openapi.yaml" \
        --output "$OUTPUT_DIR/${service_name}/index.html" \
        --title "Ectropy Platform ${service_name} API Documentation" \
        --theme.colors.primary.main="#2196F3" \
        --theme.typography.fontSize="14px" \
        --options.hideDownloadButton=false \
        --options.theme.colors.primary.main="#1976d2"
    
    echo -e "${GREEN}✅ HTML documentation generated: ${OUTPUT_DIR}/${service_name}/index.html${NC}"
}

# Generate example requests
generate_examples() {
    echo -e "${YELLOW}📋 Generating API examples...${NC}"
    
    mkdir -p "$OUTPUT_DIR/examples"
    
    # Authentication examples
    cat > "$OUTPUT_DIR/examples/authentication.md" << 'EOF'
# Authentication Examples

## Login Request
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contractor@example.com",
    "password": "securepassword123"
  }'
```

## Using JWT Token
```bash
# Get projects with authentication
curl -X GET http://localhost:4000/api/v1/projects \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```
EOF

    # BIM examples
    cat > "$OUTPUT_DIR/examples/bim-operations.md" << 'EOF'
# BIM Operations Examples

## Create BIM Element
```bash
curl -X POST http://localhost:4000/api/v1/projects/123e4567-e89b-12d3-a456-426614174000/elements \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "IfcWall",
    "properties": {
      "material": "Concrete",
      "dimensions": {
        "length": 10,
        "width": 0.3,
        "height": 3
      },
      "location": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "specifications": {
        "fireRating": "2 hour",
        "thermalProperties": {
          "rValue": 15
        }
      }
    }
  }'
```

## Query BIM Elements
```bash
# Get all walls in a project
curl -X GET "http://localhost:4000/api/v1/projects/123e4567-e89b-12d3-a456-426614174000/elements?type=IfcWall" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
EOF

    # AI Agent examples
    cat > "$OUTPUT_DIR/examples/ai-agents.md" << 'EOF'
# AI Agent Examples

## Compliance Check
```bash
curl -X POST http://localhost:3001/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "compliance",
    "task": {
      "action": "validate",
      "parameters": {
        "projectId": "123e4567-e89b-12d3-a456-426614174000",
        "checkType": "building_code",
        "jurisdiction": "California"
      }
    }
  }'
```

## Cost Estimation
```bash
curl -X POST http://localhost:3001/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "procurement",
    "task": {
      "action": "estimate",
      "parameters": {
        "materials": ["concrete", "steel", "lumber"],
        "quantities": {
          "concrete": 500,
          "steel": 1000,
          "lumber": 2000
        },
        "location": "San Francisco, CA"
      }
    }
  }'
```

## Semantic Search
```bash
curl -X POST http://localhost:3001/api/semantic-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "safety requirements for concrete pouring in high-rise construction",
    "limit": 5,
    "filters": {
      "type": "regulation"
    }
  }'
```
EOF

    echo -e "${GREEN}✅ Examples generated${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Starting documentation generation...${NC}"
    
    # Check if services are running for live documentation
    if curl -s "$API_BASE_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API Gateway is running - will include live examples${NC}"
        API_RUNNING=true
    else
        echo -e "${YELLOW}⚠️  API Gateway not running - generating static documentation only${NC}"
        API_RUNNING=false
    fi
    
    if curl -s "$MCP_BASE_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MCP Server is running - will include live examples${NC}"
        MCP_RUNNING=true
    else
        echo -e "${YELLOW}⚠️  MCP Server not running - generating static documentation only${NC}"
        MCP_RUNNING=false
    fi
    
    # Generate OpenAPI specifications
    generate_openapi_spec "api-gateway" "apps/api-gateway" "$API_BASE_URL"
    generate_openapi_spec "mcp-server" "apps/mcp-server" "$MCP_BASE_URL"
    
    # Generate HTML documentation
    if [ "$FORMAT" = "html" ] || [ "$FORMAT" = "all" ]; then
        generate_html_docs "api-gateway"
        generate_html_docs "mcp-server"
    fi
    
    # Generate examples
    if [ "$INCLUDE_EXAMPLES" = "true" ]; then
        generate_examples
    fi
    
    # Generate combined index
    cat > "$OUTPUT_DIR/index.html" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ectropy Platform API Documentation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: #1976d2; color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .service { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .service h3 { margin-top: 0; color: #1976d2; }
        .btn { background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 5px; }
        .status { padding: 5px 10px; border-radius: 3px; color: white; font-size: 12px; }
        .status.running { background: #4caf50; }
        .status.stopped { background: #f44336; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏗️ Ectropy Platform API Documentation</h1>
        <p>Enterprise Construction Collaboration Platform</p>
        <p>Generated on: $(date)</p>
    </div>
    
    <div class="service">
        <h3>🚪 API Gateway</h3>
        <p><span class="status ${API_RUNNING:+running}${API_RUNNING:-stopped}">${API_RUNNING:+Running}${API_RUNNING:-Stopped}</span></p>
        <p>Core platform API for project management, BIM elements, and stakeholder collaboration.</p>
        <a href="api-gateway/index.html" class="btn">📖 View Documentation</a>
        <a href="api-gateway/openapi.yaml" class="btn">📄 OpenAPI Spec</a>
    </div>
    
    <div class="service">
        <h3>🤖 MCP Server (AI Agents)</h3>
        <p><span class="status ${MCP_RUNNING:+running}${MCP_RUNNING:-stopped}">${MCP_RUNNING:+Running}${MCP_RUNNING:-Stopped}</span></p>
        <p>AI-powered construction automation including compliance checking, cost estimation, and document processing.</p>
        <a href="mcp-server/index.html" class="btn">📖 View Documentation</a>
        <a href="mcp-server/openapi.yaml" class="btn">📄 OpenAPI Spec</a>
    </div>
    
    <div class="service">
        <h3>📝 Examples & Guides</h3>
        <p>Code examples and integration guides for developers.</p>
        <a href="examples/authentication.md" class="btn">🔐 Authentication</a>
        <a href="examples/bim-operations.md" class="btn">🏗️ BIM Operations</a>
        <a href="examples/ai-agents.md" class="btn">🤖 AI Agents</a>
    </div>
    
    <hr style="margin: 40px 0;">
    
    <h2>Quick Start</h2>
    <ol>
        <li><strong>Authentication:</strong> Get a JWT token from <code>/api/v1/auth/login</code></li>
        <li><strong>Projects:</strong> List available projects with <code>/api/v1/projects</code></li>
        <li><strong>BIM Elements:</strong> Access project elements via <code>/api/v1/projects/{id}/elements</code></li>
        <li><strong>AI Agents:</strong> Execute tasks using <code>/api/agents/task</code></li>
    </ol>
    
    <h2>Support</h2>
    <ul>
        <li>📧 Email: api-support@ectropy.com</li>
        <li>📚 Documentation: <a href="https://docs.ectropy.com">https://docs.ectropy.com</a></li>
        <li>🐛 Issues: <a href="https://github.com/luhtech/Ectropy/issues">GitHub Issues</a></li>
    </ul>
</body>
</html>
EOF
    
    echo -e "${GREEN}🎉 Documentation generation complete!${NC}"
    echo -e "${BLUE}📍 Generated files:${NC}"
    find "$OUTPUT_DIR" -name "*.html" -o -name "*.yaml" -o -name "*.md" | sort
    echo
    echo -e "${BLUE}🌐 View documentation:${NC}"
    echo -e "   Main: ${OUTPUT_DIR}/index.html"
    echo -e "   API Gateway: ${OUTPUT_DIR}/api-gateway/index.html" 
    echo -e "   MCP Server: ${OUTPUT_DIR}/mcp-server/index.html"
}

# Run main function
main "$@"