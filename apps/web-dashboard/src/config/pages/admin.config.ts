/**
 * Admin Dashboard Configuration
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Configuration for the Admin role dashboard.
 * Admins are responsible for system oversight, user management,
 * and platform health monitoring.
 *
 * Key Features:
 * - System health monitoring
 * - User management
 * - Audit logs
 * - Platform configuration
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 */

import type { DashboardPageConfig } from '../types/page-config.types';

export const adminDashboardConfig: DashboardPageConfig = {
  id: 'admin-dashboard',
  title: 'Admin Dashboard',
  description: 'System oversight, user management, and platform health',
  roles: ['admin'],

  layout: {
    template: 'DashboardLayout',
    sidebar: {
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: 'Dashboard',
          path: '/dashboard',
        },
        {
          id: 'users',
          label: 'Users',
          icon: 'People',
          path: '/users',
        },
        {
          id: 'health',
          label: 'System Health',
          icon: 'Speed',
          path: '/health',
        },
        {
          id: 'audit',
          label: 'Audit Logs',
          icon: 'Security',
          path: '/audit',
        },
        {
          id: 'projects',
          label: 'All Projects',
          icon: 'Assignment',
          path: '/projects',
        },
        {
          id: 'storage',
          label: 'Storage',
          icon: 'Storage',
          path: '/storage',
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: 'Settings',
          path: '/settings',
        },
        {
          id: 'demo-setup',
          label: 'Demo Setup',
          icon: 'Build',
          path: '/demo',
          featureFlag: 'enableDemoMode',
        },
      ],
      logo: {
        text: 'Ectropy Admin',
      },
    },
    header: {
      showSearch: true,
      showNotifications: true,
      showUserMenu: true,
    },
  },

  sections: [
    // System Metrics
    {
      id: 'system-metrics',
      type: 'metrics',
      grid: { xs: 12 },
      metrics: [
        {
          id: 'total-users',
          label: 'Total Users',
          value: { source: 'users', field: 'id', aggregation: 'count' },
          icon: 'People',
          color: 'primary',
        },
        {
          id: 'total-projects',
          label: 'Total Projects',
          value: { source: 'projects', field: 'id', aggregation: 'count' },
          icon: 'Assignment',
          color: 'info',
        },
        {
          id: 'system-health',
          label: 'System Health',
          value: '98%',
          icon: 'Speed',
          color: 'success',
        },
        {
          id: 'api-requests',
          label: 'API Requests (24h)',
          value: '12.4K',
          icon: 'Timeline',
          color: 'warning',
        },
      ],
    },

    // System Health Panel
    {
      id: 'health-panel',
      type: 'component',
      title: 'System Health',
      component: 'SystemHealthPanel',
      grid: { xs: 12, md: 6 },
      minHeight: 300,
      loading: {
        skeleton: 'card',
      },
      props: {
        showServices: true,
        showDatabase: true,
        showCache: true,
      },
    },

    // Users List
    {
      id: 'users-list',
      type: 'data-list',
      title: 'Users',
      grid: { xs: 12, md: 6 },
      dataSource: 'users',
      columns: [
        { field: 'name', header: 'Name', sortable: true },
        { field: 'email', header: 'Email' },
        {
          field: 'role',
          header: 'Role',
          type: 'chip',
        },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            active: 'success',
            inactive: 'default',
            suspended: 'error',
          },
        },
        { field: 'lastLogin', header: 'Last Login', type: 'date' },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      filters: [
        {
          field: 'role',
          label: 'Role',
          type: 'multiSelect',
          options: [
            { value: 'admin', label: 'Admin' },
            { value: 'architect', label: 'Architect' },
            { value: 'engineer', label: 'Engineer' },
            { value: 'contractor', label: 'Contractor' },
            { value: 'owner', label: 'Owner' },
          ],
        },
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'suspended', label: 'Suspended' },
          ],
        },
      ],
      emptyMessage: 'No users found. Users API may require admin authentication.',
    },

    // All Projects
    {
      id: 'projects-list',
      type: 'data-list',
      title: 'All Projects',
      grid: { xs: 12, lg: 6 },
      dataSource: 'projects',
      columns: [
        { field: 'name', header: 'Project', sortable: true },
        { field: 'owner', header: 'Owner' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            active: 'success',
            pending: 'warning',
            completed: 'info',
            archived: 'default',
          },
        },
        { field: 'createdAt', header: 'Created', type: 'date' },
        { field: 'userCount', header: 'Users' },
      ],
      actions: ['view', 'edit', 'delete'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      sorting: {
        enabled: true,
        defaultField: 'createdAt',
        defaultDirection: 'desc',
      },
      emptyMessage: 'No projects found.',
    },

    // Audit Logs
    {
      id: 'audit-logs',
      type: 'component',
      title: 'Recent Activity',
      component: 'AuditLogViewer',
      grid: { xs: 12, lg: 6 },
      minHeight: 350,
      loading: {
        skeleton: 'table',
      },
      props: {
        limit: 20,
        showFilters: true,
      },
    },

    // Service Status Chart
    {
      id: 'service-chart',
      type: 'chart',
      title: 'Service Uptime (7 days)',
      chartType: 'line',
      grid: { xs: 12 },
      dataSource: 'systemStats',
      minHeight: 250,
      xAxis: {
        field: 'date',
        label: 'Date',
        type: 'time',
      },
      yAxis: {
        field: 'uptime',
        label: 'Uptime %',
      },
      series: [
        { field: 'apiGateway', label: 'API Gateway', color: '#4caf50' },
        { field: 'database', label: 'Database', color: '#2196f3' },
        { field: 'speckle', label: 'Speckle', color: '#ff9800' },
      ],
    },
  ],

  dataRequirements: ['users', 'projects', 'systemStats', 'auditLogs'],

  actions: [
    {
      id: 'add-user',
      label: 'Add User',
      icon: 'People',
      type: 'modal',
      variant: 'contained',
      color: 'primary',
      modal: {
        title: 'Add New User',
        component: 'AddUserModal',
        props: {},
      },
      refreshData: ['users'],
    },
    {
      id: 'demo-setup',
      label: 'Demo Setup',
      icon: 'Build',
      type: 'modal',
      variant: 'outlined',
      featureFlag: 'enableDemoMode',
      modal: {
        title: 'Demo Project Setup',
        component: 'DemoSetupDialog',
        props: {},
      },
    },
    {
      id: 'export-logs',
      label: 'Export Logs',
      icon: 'Description',
      type: 'api',
      variant: 'outlined',
      endpoint: '/api/v1/audit/export',
      method: 'GET',
      featureFlag: 'enableExportFeatures',
      successMessage: 'Logs exported successfully',
    },
  ],

  refreshInterval: 30, // Refresh every 30 seconds for health monitoring

  meta: {
    version: '1.0.0',
    lastUpdated: '2026-01-23',
    author: 'Ectropy Platform',
  },
};

export default adminDashboardConfig;
