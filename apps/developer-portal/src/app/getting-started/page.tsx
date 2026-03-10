export default function GettingStartedPage() {
  return (
    <div className="content">
      <h1>Getting Started</h1>
      <p>
        Welcome to the Ectropy Platform! This guide will help you make your first
        API call in under 15 minutes.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Basic knowledge of REST APIs</li>
        <li>An Ectropy account (sign up at staging.ectropy.ai)</li>
        <li>Node.js 20+ installed (for SDK usage)</li>
      </ul>

      <h2>Step 1: Authentication</h2>
      <p>
        All API requests require authentication using JWT tokens. First, obtain
        your access token:
      </p>

      <div className="code-block">
        {`curl -X POST https://staging.ectropy.ai/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'`}
      </div>

      <p>
        The response will include your access token:
      </p>

      <div className="code-block">
        {`{
  "message": "Authentication successful",
  "user": {
    "id": "uuid",
    "email": "your-email@example.com",
    "role": "architect"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}`}
      </div>

      <h2>Step 2: Make Your First API Call</h2>
      <p>
        Use your access token to fetch projects:
      </p>

      <div className="code-block">
        {`curl -X GET https://staging.ectropy.ai/api/v1/projects \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`}
      </div>

      <p>
        Response:
      </p>

      <div className="code-block">
        {`{
  "projects": [
    {
      "id": "uuid",
      "name": "Downtown Office Complex",
      "description": "25-story mixed-use development",
      "status": "in_progress",
      "total_budget": 15000000,
      "location": "123 Main St, New York, NY 10001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}`}
      </div>

      <h2>Step 3: Create a Construction Project</h2>
      <p>
        Create your first construction project:
      </p>

      <div className="code-block">
        {`curl -X POST https://staging.ectropy.ai/api/v1/projects \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My First Project",
    "description": "A test construction project",
    "total_budget": 1000000,
    "location": "San Francisco, CA",
    "start_date": "2025-01-01"
  }'`}
      </div>

      <h2>Step 4: Add BIM Elements</h2>
      <p>
        Add a structural element to your project:
      </p>

      <div className="code-block">
        {`curl -X POST https://staging.ectropy.ai/api/v1/projects/PROJECT_ID/elements \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "element_name": "Column-A1",
    "element_type": "structural_column",
    "material": "Reinforced Concrete",
    "cost": 5000
  }'`}
      </div>

      <h2>Using the JavaScript SDK</h2>
      <p>
        For a more convenient experience, use our TypeScript/JavaScript SDK:
      </p>

      <h3>Installation</h3>
      <div className="code-block">
        npm install @ectropy/sdk
      </div>

      <h3>Usage Example</h3>
      <div className="code-block">
        {`import { EctropyClient } from '@ectropy/sdk';

// Initialize client
const client = new EctropyClient({
  baseURL: 'https://staging.ectropy.ai',
  apiKey: 'YOUR_ACCESS_TOKEN'
});

// List projects
const projects = await client.projects.list();
console.log(projects);

// Create a project
const newProject = await client.projects.create({
  name: 'My First Project',
  description: 'A test construction project',
  total_budget: 1000000,
  location: 'San Francisco, CA'
});

// Add an element
const element = await client.elements.create(newProject.id, {
  element_name: 'Column-A1',
  element_type: 'structural_column',
  material: 'Reinforced Concrete',
  cost: 5000
});`}
      </div>

      <h2>Rate Limits</h2>
      <p>
        Be aware of the following rate limits:
      </p>
      <ul>
        <li>API endpoints: 100 requests per 15 minutes</li>
        <li>Authentication endpoints: 5 requests per 15 minutes</li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li>
          <a href="/api">Explore the full API reference</a>
        </li>
        <li>
          <a href="https://github.com/luhtech/Ectropy" target="_blank" rel="noopener noreferrer">
            View sample projects on GitHub
          </a>
        </li>
        <li>Learn about BIM collaboration features</li>
        <li>Integrate AI agents for cost estimation and scheduling</li>
      </ul>

      <h2>Need Help?</h2>
      <p>
        Join our community:
      </p>
      <ul>
        <li>
          <a href="https://github.com/luhtech/Ectropy/discussions" target="_blank" rel="noopener noreferrer">
            GitHub Discussions
          </a>
        </li>
        <li>
          <a href="https://github.com/luhtech/Ectropy/issues" target="_blank" rel="noopener noreferrer">
            Report Issues
          </a>
        </li>
        <li>Email: support@ectropy.ai</li>
      </ul>
    </div>
  );
}
