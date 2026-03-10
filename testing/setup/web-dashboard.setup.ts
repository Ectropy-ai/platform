/**
 * Web Dashboard Test Setup
 * Configures testing environment for React frontend testing
 */

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock environment variables for web dashboard tests
process.env.NODE_ENV = 'test';
process.env.REACT_APP_API_URL = 'http://localhost:3001';
process.env.REACT_APP_SPECKLE_URL = 'https://test.speckle.example.com';

// Mock browser APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// Mock fetch for API calls
global.fetch = jest.fn();

// Global test utilities for React components
global.reactTestUtils = {
  /**
   * Create mock user for React components
   */
  createMockUser: (role = 'architect') => ({
    id: `${role}-user-id`,
    email: `${role}@test.com`,
    role,
    profile: {
      firstName: 'Test',
      lastName: 'User',
      company: `Test ${role} Company`,
    },
    permissions: getStakeholderPermissions(role),
  }),

  /**
   * Create mock authentication context
   */
  createMockAuthContext: (user = null) => ({
    user,
    login: jest.fn(),
    logout: jest.fn(),
    isAuthenticated: !!user,
    loading: false,
    error: null,
  }),

  /**
   * Create mock project context
   */
  createMockProjectContext: () => ({
    currentProject: {
      id: 'test-project-id',
      name: 'Test Construction Project',
      role: 'architect',
      permissions: ['design:read', 'design:write'],
    },
    setCurrentProject: jest.fn(),
    projects: [],
    loading: false,
  }),

  /**
   * Mock Material-UI theme
   */
  createMockTheme: () => ({
    palette: {
      mode: 'light',
      primary: { main: '#1976d2' },
      secondary: { main: '#dc004e' },
    },
    typography: {
      fontFamily: 'Roboto, Arial, sans-serif',
    },
    spacing: (factor: number) => `${8 * factor}px`,
    breakpoints: {
      up: jest.fn(),
      down: jest.fn(),
      between: jest.fn(),
    },
  }),

  /**
   * Setup mock API responses
   */
  setupMockAPI: () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/projects')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: '1', name: 'Project 1' },
              { id: '2', name: 'Project 2' },
            ]),
        });
      }

      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(reactTestUtils.createMockUser()),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });
    });
  },
};

// Construction dashboard specific test utilities
global.dashboardTestUtils = {
  /**
   * Create mock BIM viewer props
   */
  createMockBIMViewer: () => ({
    modelId: 'test-model-id',
    viewerConfig: {
      width: 800,
      height: 600,
      controls: true,
      background: '#f0f0f0',
    },
    onElementSelect: jest.fn(),
    onViewChange: jest.fn(),
  }),

  /**
   * Create mock dashboard data
   */
  createMockDashboardData: (role = 'architect') => {
    const baseData = {
      projects: [
        { id: '1', name: 'Office Building', status: 'active' },
        { id: '2', name: 'Residential Complex', status: 'planning' },
      ],
      notifications: [
        { id: '1', message: 'New BIM model uploaded', read: false },
        { id: '2', message: 'Project milestone completed', read: true },
      ],
    };

    const roleSpecificData = {
      architect: {
        ...baseData,
        designTasks: [
          { id: '1', title: 'Review floor plans', due: '2024-01-15' },
          { id: '2', title: 'Update facade design', due: '2024-01-20' },
        ],
        bimModels: [
          {
            id: '1',
            name: 'Architectural Model v1.2',
            lastModified: '2024-01-10',
          },
        ],
      },
      engineer: {
        ...baseData,
        analyses: [
          { id: '1', type: 'Structural', status: 'completed', confidence: 95 },
          { id: '2', type: 'Seismic', status: 'running', progress: 45 },
        ],
        safetyChecks: [
          { id: '1', item: 'Load calculations', status: 'passed' },
          { id: '2', item: 'Material specifications', status: 'pending' },
        ],
      },
      contractor: {
        ...baseData,
        constructionProgress: [
          { phase: 'Foundation', completion: 100 },
          { phase: 'Structure', completion: 75 },
          { phase: 'MEP', completion: 30 },
        ],
        materials: [
          { item: 'Concrete', ordered: 500, delivered: 450 },
          { item: 'Steel beams', ordered: 100, delivered: 80 },
        ],
      },
      owner: {
        ...baseData,
        financialSummary: {
          budget: 5000000,
          spent: 2800000,
          remaining: 2200000,
        },
        governance: [
          { proposal: 'Change order #1', status: 'approved', votes: '4/5' },
          { proposal: 'Budget revision', status: 'pending', votes: '2/5' },
        ],
      },
    };

    return roleSpecificData[role] || baseData;
  },

  /**
   * Mock role-based navigation
   */
  createMockNavigation: (role = 'architect') => {
    const baseNav = [
      { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
      { label: 'Projects', path: '/projects', icon: 'projects' },
    ];

    const roleSpecificNav = {
      architect: [
        ...baseNav,
        { label: 'Design Tools', path: '/design', icon: 'design' },
        { label: 'BIM Models', path: '/bim', icon: 'model' },
      ],
      engineer: [
        ...baseNav,
        { label: 'Analysis', path: '/analysis', icon: 'calculate' },
        { label: 'Safety', path: '/safety', icon: 'security' },
      ],
      contractor: [
        ...baseNav,
        { label: 'Construction', path: '/construction', icon: 'build' },
        { label: 'Materials', path: '/materials', icon: 'inventory' },
      ],
      owner: [
        ...baseNav,
        { label: 'Governance', path: '/governance', icon: 'governance' },
        { label: 'Analytics', path: '/analytics', icon: 'analytics' },
      ],
    };

    return roleSpecificNav[role] || baseNav;
  },
};

/**
 * Get permissions for construction stakeholder roles
 */
function getStakeholderPermissions(role: string): string[] {
  const permissions = {
    architect: ['design:read', 'design:write', 'bim:read', 'bim:write'],
    engineer: [
      'analysis:read',
      'analysis:write',
      'bim:read',
      'safety:read',
      'safety:write',
    ],
    contractor: [
      'construction:read',
      'construction:write',
      'materials:read',
      'progress:write',
    ],
    owner: [
      'project:read',
      'governance:read',
      'governance:write',
      'finance:read',
    ],
  };

  return permissions[role] || ['basic:read'];
}

// Setup and teardown hooks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // Reset localStorage and sessionStorage
  localStorageMock.clear();
  sessionStorageMock.clear();

  // Reset fetch mock
  (global.fetch as jest.Mock).mockClear();
});

afterEach(() => {
  // Clean up any test data
  jest.restoreAllMocks();
});

console.log('🎨 Web Dashboard test environment configured');
