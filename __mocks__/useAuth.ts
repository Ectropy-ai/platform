/**
 * Comprehensive Mock for useAuth Hook
 * Provides reliable test behavior and eliminates network-related test failures
 */

export const useAuth = jest.fn(() => ({
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    roles: ['user'],
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
    name: 'Test User',
    full_name: 'Test User',
    role: 'user'
  },
  isLoading: false,
  error: null,
  login: jest.fn().mockImplementation(async (email: string, password: string) => {
    // Simulate different test scenarios
    if (email === 'test@api.com' && password === 'validpassword') {
      return Promise.resolve(true);
    }
    if (email === 'network@error.com') {
      return Promise.reject(new Error('Network error'));
    }
    if (email === 'demo@ectropy.com' && (password === 'demo' || password === 'demo123')) {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }),
  logout: jest.fn().mockResolvedValue(undefined),
  refreshToken: jest.fn().mockResolvedValue({
    token: 'refreshed-mock-token'
  })
}));

// Export demo users for testing
export const DEMO_USERS = {
  'demo@ectropy.com': {
    id: 'demo-user-123',
    email: 'demo@ectropy.com',
    firstName: 'Demo',
    lastName: 'Admin',
    isActive: true,
    roles: ['admin'],
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
    name: 'Demo Admin',
    full_name: 'Demo Admin User',
    role: 'admin'
  }
};

export default useAuth;