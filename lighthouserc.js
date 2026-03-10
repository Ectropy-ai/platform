module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm nx serve web-dashboard',
      startServerReadyPattern: 'Web Development Server is listening',
      startServerReadyTimeout: 60000,
      url: [
        'http://localhost:4200/',
        'http://localhost:4200/projects',
        'http://localhost:4200/viewer',
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--headless',
        ],
      },
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        // Specific performance metrics
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 4000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'speed-index': ['error', { maxNumericValue: 3000 }],
        // Accessibility requirements
        'color-contrast': 'error',
        'image-alt': 'error',
        label: 'error',
        'link-name': 'error',
        // Best practices
        'uses-https': 'off', // Allow HTTP for local development
        'no-vulnerable-libraries': 'error',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
