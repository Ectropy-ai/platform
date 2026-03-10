#!/usr/bin/env tsx

let createGitHubAgent: any;

async function main(): Promise<void> {
  console.log('🤖 Consulting Repo Governor via MCP...');
  try {
    ({ createGitHubAgent } = await import('./setup-github-agent-mcp.js'));
  } catch (err) {
    console.warn('Skipping missing module:', (err as Error).message);
    createGitHubAgent = () => ({
      initialize: async () => false,
      getDocContent: async () => '',
      getRepoSummary: async () => ({}),
    });
  }

  const agent = createGitHubAgent({
    mcpEndpoint: process.env.MCP_ENDPOINT || 'http://localhost:3020',
    agentToken: process.env.MCP_AGENT_TOKEN || process.env.GITHUB_TOKEN || '',
    environment: (process.env.NODE_ENV as any) || 'dev',
  });

  const online = await agent.initialize();
  if (!online) {
    console.warn('⚠️ MCP server unavailable, continuing in offline mode');
  }
  const docPath = process.argv[2];
  if (docPath) {
    const content = await agent.getDocContent(docPath);
    console.log(`📄 ${docPath}`);
    console.log(content);
  } else {
    const summary = await agent.getRepoSummary();
    console.log('📊 Repository summary:');
    console.log(JSON.stringify(summary, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('💥 Repo Governor consultation failed:', err);
    process.exit(1);
  });
}
