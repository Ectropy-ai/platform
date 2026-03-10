/**
 * Test Utils - Centralized Exports
 * Single source for all test utilities
 *
 * Created: 2025-12-22
 * Purpose: Simplify imports across test files
 */

// Re-export testing library utilities
export * from '@testing-library/react';
export { renderWithTheme } from './render-with-theme';

// Export custom test providers
export {
  TestProviders,
  TestProvidersMinimal,
  renderWithProviders,
  type TestProvidersProps,
} from './TestProviders';

// Export mock data
export {
  mockUsers,
  mockProjects,
  mockBIMModels,
  mockAnalyticsEvents,
  mockEmailTemplates,
  mockOAuthTokens,
  mockAPIResponses,
  createMockUser,
  createMockProject,
} from './mockData';

// Export user-event for interaction testing
export { default as userEvent } from '@testing-library/user-event';
