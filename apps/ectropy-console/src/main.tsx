/**
 * ==============================================================================
 * ECTROPY EMPLOYEE CONSOLE - MAIN ENTRY POINT
 * ==============================================================================
 * Platform administration interface for Ectropy staff.
 * Manages tenants, users, and system monitoring across the entire platform.
 *
 * Access: Restricted to users with is_platform_admin = true
 * URL: console.ectropy.ai (production) | localhost:3001 (development)
 *
 * Migration Note: Will move to ectropy-business repository post-split.
 * ==============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { consoleTheme } from './theme/console-theme';
import App from './App';

// Configure React Query with enterprise defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds - admin data needs to be fresh
      gcTime: 5 * 60 * 1000, // 5 minutes cache
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html has <div id="root"></div>');
}

// Path-based deployment: /console/ requires basename
// Subdomain deployment: console.ectropy.ai uses '/'
// VITE_BASE_PATH is set at build time (see Dockerfile and deploy-staging.yml)
const basePath = import.meta.env.BASE_URL || '/';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter basename={basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={consoleTheme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
