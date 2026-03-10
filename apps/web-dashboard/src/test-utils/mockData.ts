/**
 * Mock Data for Testing
 * Enterprise-grade test data fixtures following schema definitions
 *
 * Created: 2025-12-22
 * Purpose: Provide consistent, reusable mock data across all test suites
 * Aligned with: Test Expansion Strategy Phase 1
 * Schema: Matches backend API User interface and frontend data structures
 */

import type { User } from '../hooks/useAuth';

/**
 * Mock Users - All 5 Ectropy Platform Roles
 * Represents the complete RBAC (Role-Based Access Control) model
 */
export const mockUsers = {
  /**
   * Architect Role
   * Permissions: Design review, BIM model upload, project creation
   */
  architect: {
    id: 'user-architect-001',
    email: 'architect@ectropy.test',
    firstName: 'Sarah',
    lastName: 'Chen',
    isActive: true,
    roles: ['architect'],
    createdAt: new Date('2025-01-15T10:00:00Z'),
    updatedAt: new Date('2025-12-22T10:00:00Z'),
    name: 'Sarah Chen',
    full_name: 'Sarah Chen',
    role: 'architect',
  } as User,

  /**
   * Engineer Role
   * Permissions: Technical analysis, calculations, BIM model review
   */
  engineer: {
    id: 'user-engineer-001',
    email: 'engineer@ectropy.test',
    firstName: 'Michael',
    lastName: 'Rodriguez',
    isActive: true,
    roles: ['engineer'],
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-12-22T10:00:00Z'),
    name: 'Michael Rodriguez',
    full_name: 'Michael Rodriguez',
    role: 'engineer',
  } as User,

  /**
   * Contractor Role
   * Permissions: Construction planning, resource management, scheduling
   */
  contractor: {
    id: 'user-contractor-001',
    email: 'contractor@ectropy.test',
    firstName: 'James',
    lastName: 'Wilson',
    isActive: true,
    roles: ['contractor'],
    createdAt: new Date('2025-02-01T10:00:00Z'),
    updatedAt: new Date('2025-12-22T10:00:00Z'),
    name: 'James Wilson',
    full_name: 'James Wilson',
    role: 'contractor',
  } as User,

  /**
   * Owner Role
   * Permissions: Project oversight, budget approval, milestone tracking
   */
  owner: {
    id: 'user-owner-001',
    email: 'owner@ectropy.test',
    firstName: 'Emily',
    lastName: 'Thompson',
    isActive: true,
    roles: ['owner'],
    createdAt: new Date('2025-02-10T10:00:00Z'),
    updatedAt: new Date('2025-12-22T10:00:00Z'),
    name: 'Emily Thompson',
    full_name: 'Emily Thompson',
    role: 'owner',
  } as User,

  /**
   * Admin Role
   * Permissions: Full platform access, user management, system configuration
   */
  admin: {
    id: 'user-admin-001',
    email: 'admin@ectropy.test',
    firstName: 'David',
    lastName: 'Kim',
    isActive: true,
    roles: ['admin'],
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-12-22T10:00:00Z'),
    name: 'David Kim',
    full_name: 'David Kim',
    role: 'admin',
  } as User,

  /**
   * Inactive User (for testing access restrictions)
   */
  inactive: {
    id: 'user-inactive-001',
    email: 'inactive@ectropy.test',
    firstName: 'Inactive',
    lastName: 'User',
    isActive: false,
    roles: ['user'],
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-12-22T10:00:00Z'),
    name: 'Inactive User',
    full_name: 'Inactive User',
    role: 'user',
  } as User,
};

/**
 * Mock Projects - Test Building Projects
 * Represents various project states and types
 */
export const mockProjects = [
  {
    id: 'project-001',
    name: 'Downtown Office Complex',
    status: 'active',
    type: 'commercial',
    location: 'San Francisco, CA',
    startDate: new Date('2025-01-15T00:00:00Z'),
    estimatedEndDate: new Date('2026-06-30T00:00:00Z'),
    budget: 15000000,
    progress: 35,
    description: 'Modern 12-story office building with sustainable design',
    architect: mockUsers.architect,
    engineers: [mockUsers.engineer],
    contractors: [mockUsers.contractor],
    owner: mockUsers.owner,
  },
  {
    id: 'project-002',
    name: 'Residential Tower',
    status: 'planning',
    type: 'residential',
    location: 'Seattle, WA',
    startDate: new Date('2025-03-01T00:00:00Z'),
    estimatedEndDate: new Date('2027-12-31T00:00:00Z'),
    budget: 45000000,
    progress: 10,
    description: '30-story luxury residential tower with mixed-use ground floor',
    architect: mockUsers.architect,
    engineers: [mockUsers.engineer],
    contractors: [mockUsers.contractor],
    owner: mockUsers.owner,
  },
  {
    id: 'project-003',
    name: 'Community Center Renovation',
    status: 'completed',
    type: 'public',
    location: 'Portland, OR',
    startDate: new Date('2024-06-01T00:00:00Z'),
    estimatedEndDate: new Date('2025-05-31T00:00:00Z'),
    budget: 3500000,
    progress: 100,
    description: 'Historic community center renovation with modern amenities',
    architect: mockUsers.architect,
    engineers: [mockUsers.engineer],
    contractors: [mockUsers.contractor],
    owner: mockUsers.owner,
  },
];

/**
 * Mock BIM Models - Speckle Stream Data
 * Represents uploaded IFC files and their processing states
 */
export const mockBIMModels = [
  {
    id: 'stream-001',
    name: 'Office Complex - Structural Model',
    projectId: 'project-001',
    streamId: 'abc123def456',
    fileName: 'office-structural.ifc',
    fileSize: 12500000, // 12.5 MB
    uploadedBy: mockUsers.architect.id,
    uploadedAt: new Date('2025-11-01T14:30:00Z'),
    status: 'processed',
    objectCount: 4523,
    commitId: 'commit-abc123',
  },
  {
    id: 'stream-002',
    name: 'Office Complex - Architectural Model',
    projectId: 'project-001',
    streamId: 'def456ghi789',
    fileName: 'office-architectural.ifc',
    fileSize: 18700000, // 18.7 MB
    uploadedBy: mockUsers.architect.id,
    uploadedAt: new Date('2025-11-15T09:15:00Z'),
    status: 'processed',
    objectCount: 8934,
    commitId: 'commit-def456',
  },
  {
    id: 'stream-003',
    name: 'Residential Tower - MEP Systems',
    projectId: 'project-002',
    streamId: 'ghi789jkl012',
    fileName: 'residential-mep.ifc',
    fileSize: 9200000, // 9.2 MB
    uploadedBy: mockUsers.engineer.id,
    uploadedAt: new Date('2025-12-10T16:45:00Z'),
    status: 'processing',
    objectCount: 0, // Still processing
    commitId: null,
  },
];

/**
 * Mock Analytics Events
 * Represents user activity tracking events
 */
export const mockAnalyticsEvents = [
  {
    id: 'event-001',
    eventType: 'bim_model_upload',
    userId: mockUsers.architect.id,
    projectId: 'project-001',
    timestamp: new Date('2025-11-01T14:30:00Z'),
    metadata: {
      fileName: 'office-structural.ifc',
      fileSize: 12500000,
      processingTime: 45.3, // seconds
    },
  },
  {
    id: 'event-002',
    eventType: 'dashboard_view',
    userId: mockUsers.owner.id,
    projectId: 'project-001',
    timestamp: new Date('2025-12-22T08:00:00Z'),
    metadata: {
      role: 'owner',
      sessionDuration: 1200, // seconds
    },
  },
  {
    id: 'event-003',
    eventType: 'bim_viewer_interaction',
    userId: mockUsers.engineer.id,
    projectId: 'project-001',
    timestamp: new Date('2025-12-22T10:30:00Z'),
    metadata: {
      action: 'rotate',
      modelId: 'stream-001',
      interactionCount: 34,
    },
  },
];

/**
 * Mock Email Templates
 * For testing email service
 */
export const mockEmailTemplates = {
  welcome: {
    subject: 'Welcome to Ectropy Platform',
    recipientName: 'Sarah Chen',
    recipientEmail: 'architect@ectropy.test',
    template: 'welcome',
  },
  passwordReset: {
    subject: 'Password Reset Request',
    recipientName: 'Michael Rodriguez',
    recipientEmail: 'engineer@ectropy.test',
    resetToken: 'reset-token-abc123xyz789',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    template: 'password-reset',
  },
  projectInvitation: {
    subject: 'Project Invitation: Downtown Office Complex',
    recipientName: 'James Wilson',
    recipientEmail: 'contractor@ectropy.test',
    projectName: 'Downtown Office Complex',
    invitedBy: 'Sarah Chen',
    template: 'project-invitation',
  },
};

/**
 * Mock OAuth Tokens
 * For testing authentication flows
 */
export const mockOAuthTokens = {
  google: {
    accessToken: 'google-access-token-abc123',
    refreshToken: 'google-refresh-token-xyz789',
    expiresIn: 3600,
    tokenType: 'Bearer',
    scope: 'openid profile email',
  },
  github: {
    accessToken: 'github-access-token-def456',
    refreshToken: 'github-refresh-token-uvw012',
    expiresIn: 28800,
    tokenType: 'Bearer',
    scope: 'user:email',
  },
};

/**
 * Mock API Responses
 * For mocking fetch calls in tests
 */
export const mockAPIResponses = {
  authMe: {
    success: {
      user: mockUsers.architect,
    },
    unauthorized: {
      error: 'Unauthorized',
      message: 'No active session found',
    },
  },
  projectsList: {
    success: {
      projects: mockProjects,
      total: mockProjects.length,
      page: 1,
      pageSize: 10,
    },
  },
  bimModelUpload: {
    success: {
      streamId: 'new-stream-abc123',
      status: 'processing',
      message: 'IFC file uploaded successfully',
    },
    error: {
      error: 'Upload failed',
      message: 'Invalid IFC file format',
    },
  },
};

/**
 * Helper function to create a custom user for tests
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: `user-${Date.now()}`,
    email: 'test@ectropy.test',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    roles: ['user'],
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Test User',
    full_name: 'Test User',
    role: 'user',
    ...overrides,
  };
}

/**
 * Helper function to create a custom project for tests
 */
export function createMockProject(overrides: Partial<typeof mockProjects[0]> = {}) {
  return {
    id: `project-${Date.now()}`,
    name: 'Test Project',
    status: 'active',
    type: 'commercial',
    location: 'Test Location',
    startDate: new Date(),
    estimatedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    budget: 1000000,
    progress: 0,
    description: 'Test project description',
    architect: mockUsers.architect,
    engineers: [mockUsers.engineer],
    contractors: [mockUsers.contractor],
    owner: mockUsers.owner,
    ...overrides,
  };
}
