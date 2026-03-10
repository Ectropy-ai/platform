import { defineConfig } from 'cypress';
import { nxE2EPreset } from '@nx/cypress/plugins/cypress-preset';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: 'src',
      webServerCommands: { default: 'nx run web-dashboard:serve' },
      ciWebServerCommand: 'nx run web-dashboard:serve-static',
    }),
    baseUrl: 'http://localhost:3002',
  },
});
//# sourceMappingURL=cypress.config.js.map
