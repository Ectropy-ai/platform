// Mock for @ectropy/shared module in Jest environment
// Handles import.meta.url issues

import path from 'path';

export default {
  getCurrentDirname: (_importMetaUrl) => {
    // Return a sensible default for test environment
    return path.join(process.cwd(), 'apps', 'mcp-server', 'src');
  },
  getCurrentFilename: (_importMetaUrl) => {
    return path.join(process.cwd(), 'apps', 'mcp-server', 'src', 'server.ts');
  },
};
