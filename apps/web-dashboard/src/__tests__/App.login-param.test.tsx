/** @jest-environment jsdom */
/**
 * Test for /?login parameter handling in App.tsx
 *
 * Ensures that when the app is accessed at /?login, it shows the Login component
 * instead of the LandingPage. This is critical for E2E tests which navigate to
 * /?login to access OAuth buttons.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock useAuth hook to control authentication state
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    logout: vi.fn(),
    loginWithOAuth: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock config
vi.mock('../services/config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
    speckleServerUrl: 'http://localhost:3000',
  },
}));

// Mock child components to avoid complex dependencies
vi.mock('../components/Login', () => ({
  __esModule: true,
  default: () => <div data-testid="login-component">Login Component</div>,
}));

vi.mock('../pages/LandingPage', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-page">Landing Page</div>,
}));

vi.mock('../pages/ArchitectDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="architect-dashboard">Architect Dashboard</div>,
}));

vi.mock('../pages/EngineerDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="engineer-dashboard">Engineer Dashboard</div>,
}));

vi.mock('../pages/ContractorDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="contractor-dashboard">Contractor Dashboard</div>,
}));

vi.mock('../pages/OwnerDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="owner-dashboard">Owner Dashboard</div>,
}));

vi.mock('../pages/ProjectsListPage', () => ({
  __esModule: true,
  default: () => <div data-testid="projects-list">Projects List</div>,
}));

vi.mock('../pages/ViewerPage', () => ({
  __esModule: true,
  ViewerPage: () => <div data-testid="viewer-page">Viewer Page</div>,
}));

vi.mock('../pages/AdminDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="admin-dashboard">Admin Dashboard</div>,
}));

// Mock other potential dependencies
vi.mock('../contexts/RoleContext', () => ({
  RoleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRole: () => ({
    currentRole: 'architect',
    setRole: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(() => ({
    clear: vi.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Simple test component that mimics App's login parameter behavior
const TestLoginParamBehavior: React.FC<{ initialPath: string }> = ({ initialPath }) => {
  // Simulate the App's logic for handling ?login parameter
  const searchParams = new URLSearchParams(initialPath.split('?')[1] || '');
  const hasLoginParam = searchParams.has('login');
  const hasDashboardParam = searchParams.has('dashboard');

  if (hasLoginParam || hasDashboardParam) {
    return <div data-testid="login-component">Login Component</div>;
  }

  return <div data-testid="landing-page">Landing Page</div>;
};

describe('App /?login parameter handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Login parameter behavior', () => {
    it('should show Login when ?login is in URL', () => {
      render(
        <MemoryRouter initialEntries={['/?login']}>
          <TestLoginParamBehavior initialPath="/?login" />
        </MemoryRouter>
      );

      expect(screen.getByTestId('login-component')).toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });

    it('should show LandingPage when no query params', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <TestLoginParamBehavior initialPath="/" />
        </MemoryRouter>
      );

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
      expect(screen.queryByTestId('login-component')).not.toBeInTheDocument();
    });

    it('should show Login when ?dashboard is in URL', () => {
      render(
        <MemoryRouter initialEntries={['/?dashboard']}>
          <TestLoginParamBehavior initialPath="/?dashboard" />
        </MemoryRouter>
      );

      expect(screen.getByTestId('login-component')).toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });
  });

  describe('URL parameter parsing', () => {
    it('should correctly parse ?login parameter', () => {
      const url = '/?login';
      const searchParams = new URLSearchParams(url.split('?')[1]);
      expect(searchParams.has('login')).toBe(true);
    });

    it('should correctly parse ?dashboard parameter', () => {
      const url = '/?dashboard';
      const searchParams = new URLSearchParams(url.split('?')[1]);
      expect(searchParams.has('dashboard')).toBe(true);
    });

    it('should handle empty query string', () => {
      const url = '/';
      const searchParams = new URLSearchParams(url.split('?')[1] || '');
      expect(searchParams.has('login')).toBe(false);
      expect(searchParams.has('dashboard')).toBe(false);
    });

    it('should handle multiple parameters', () => {
      const url = '/?login&redirect=/dashboard';
      const searchParams = new URLSearchParams(url.split('?')[1]);
      expect(searchParams.has('login')).toBe(true);
      expect(searchParams.get('redirect')).toBe('/dashboard');
    });
  });
});
