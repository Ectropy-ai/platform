// ENTERPRISE: Vitest setup for Testing Library DOM matchers
// For @testing-library/jest-dom v6.x with proper type compatibility
import { expect, vi } from 'vitest';

// Only load DOM matchers when in jsdom environment (not node environment)
if (typeof window !== 'undefined') {
  // Dynamic import to prevent loading in node environment
  // Use default export for proper Vitest matcher type compatibility
  const matchers = await import('@testing-library/jest-dom/matchers');
  expect.extend(matchers.default || matchers);
}

// ENTERPRISE: Ensure React is in test mode
// TypeScript FIX: Use Object.assign to bypass readonly constraint
// This is required because ProcessEnv interface marks NODE_ENV as readonly in strict mode
if (typeof process !== 'undefined' && process.env) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    REACT_APP_ENV: 'test',
  });
}

(global as any).__DEV__ = true;

// Vitest setup - replace Jest with Vitest mocks
// Mock fetch globally
(global as any).fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      data: {
        costReduction: 23.5,
        timeSavings: 31.2,
        searchSpeed: 26,
        uptime: 100,
      },
    }),
} as Response);

// Mock localStorage (only in jsdom environment)
if (typeof window !== 'undefined') {
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });

  // Mock sessionStorage
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    },
    writable: true,
  });

  // Mock Speckle Viewer
  const mockViewer = {
    Viewer: vi.fn().mockImplementation(() => ({
      init: vi.fn(),
      dispose: vi.fn(),
    })),
    DefaultViewerParams: {},
    CameraController: vi.fn(),
    SelectionHelper: vi.fn(),
  };
  // Apply the mock
  Object.defineProperty(window, '__SPECKLE_VIEWER_MOCK__', {
    value: mockViewer,
    writable: true,
  });
}
