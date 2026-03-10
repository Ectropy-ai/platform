export default function Home() {
  return (
    <div>
      <div className="hero">
        <h1>Welcome to Ectropy Developer Portal</h1>
        <p>
          Build the future of construction with our federated platform APIs
        </p>
        <a href="/getting-started" className="button">
          Get Started
        </a>
      </div>

      <div className="card-grid">
        <div className="card">
          <h2>🚀 Quick Start</h2>
          <p>
            Get up and running in under 15 minutes. Learn how to authenticate,
            make your first API call, and integrate with construction projects.
          </p>
          <a href="/getting-started" className="button" style={{ marginTop: '1rem' }}>
            Quick Start Guide
          </a>
        </div>

        <div className="card">
          <h2>📚 API Reference</h2>
          <p>
            Comprehensive API documentation with interactive examples. Explore
            all endpoints for projects, BIM elements, analytics, and governance.
          </p>
          <a href="/api" className="button" style={{ marginTop: '1rem' }}>
            API Documentation
          </a>
        </div>

        <div className="card">
          <h2>🔧 JavaScript SDK</h2>
          <p>
            Use our TypeScript/JavaScript SDK for seamless integration. Type-safe,
            promise-based API client generated from OpenAPI specification.
          </p>
          <div className="code-block" style={{ marginTop: '1rem' }}>
            npm install @ectropy/sdk
          </div>
        </div>
      </div>

      <div className="content" style={{ marginTop: '3rem' }}>
        <h2>Platform Overview</h2>
        <p>
          Ectropy is a federated construction platform targeting the $22 trillion
          global construction industry. Our APIs enable:
        </p>
        <ul>
          <li>
            <strong>BIM Collaboration:</strong> Real-time 3D model viewing and
            editing via Speckle integration
          </li>
          <li>
            <strong>AI Orchestration:</strong> MCP server coordinates specialized
            AI agents for cost estimation, scheduling, compliance, and quality
          </li>
          <li>
            <strong>DAO Governance:</strong> Decentralized decision-making with
            blockchain-powered voting
          </li>
          <li>
            <strong>Document Analysis:</strong> Process construction documents,
            blueprints, contracts, and IFC files
          </li>
        </ul>

        <h2>Key Statistics</h2>
        <ul>
          <li>30% average cost reduction on pilot projects</li>
          <li>34-37% carbon emissions reduction</li>
          <li>3,400% ROI demonstrated in enterprise pilots</li>
          <li>67% of construction projects currently exceed budgets</li>
        </ul>

        <h2>Use Cases</h2>
        <ul>
          <li>Third-party BIM integrations</li>
          <li>Custom AI analysis plugins</li>
          <li>Mobile app development</li>
          <li>Partner platform integrations</li>
          <li>Construction IoT device connectivity</li>
        </ul>
      </div>
    </div>
  );
}
