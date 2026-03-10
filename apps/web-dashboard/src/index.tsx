/**
 * =============================================================================
 * ENTERPRISE REACT APPLICATION ENTRY POINT
 *
 * @fileoverview Entry point for the Ectropy Construction Platform React application
 * @version 1.0.0
 * @author Ectropy Development Team
 *
 * This file initializes the React application with proper error boundaries,
 * development tools, and performance monitoring.
 *
 * Security considerations:
 * - React.StrictMode enabled for development safety checks
 * - Type-safe DOM element access with null checks
 * - Sentry error tracking for production monitoring
 *
 * Performance considerations:
 * - Concurrent features enabled through React 18
 * - Proper error boundary implementation ready
 * - Performance monitoring via Sentry
 *
 * DEPLOYMENT: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
 * =============================================================================
 */

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App';
import ErrorBoundary from './components/shared/ErrorBoundary';

// ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
// Initialize Sentry for error tracking and performance monitoring
import { initializeSentry } from './services/sentry.service';

// Initialize Sentry BEFORE rendering the app
// This ensures all errors are captured, including initialization errors
initializeSentry();

// Create Material-UI theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// Get the root element with proper error handling
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element not found. Please ensure there is a <div id="root"></div> in your HTML.',
  );
}

// Create React root with error handling
const root = createRoot(rootElement);

// Render the application with error boundary and strict mode
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);

// Register service worker for PWA capabilities (optional)
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/service-worker.js')
//       .then(() => logger.info('Service Worker registered'))
//       .catch(() => logger.error('Service Worker registration failed'));
//   });
// }

// Development-only performance monitoring
if (process.env.NODE_ENV === 'development') {
  // Performance monitoring for development
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'measure') {
        // Performance logging in development only - keep console.log for dev tools
        console.log(`Performance: ${entry.name} took ${entry.duration}ms`);
      }
    }
  });
  observer.observe({ entryTypes: ['measure'] });
}
