export function createGitHubAgent() {
  return {
    initialize: async () => false,
    getDocContent: async () => '',
    getRepoSummary: async () => ({}),
  };
}
export default { createGitHubAgent };
