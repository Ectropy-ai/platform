/**
 * Engineer Dashboard Configuration
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Configuration for the Engineer role dashboard.
 * Engineers are responsible for structural analysis, load calculations,
 * and technical task management.
 *
 * Key Features:
 * - Structural analysis tools
 * - Task management (when API implemented)
 * - Alert monitoring (when API implemented)
 * - Technical documentation
 *
 * NOTE: Some features require backend API implementation:
 * - enableEngineeringTasks: Requires /api/v1/tasks endpoint
 * - enableStructuralAlerts: Requires /api/v1/alerts endpoint
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 */

import type { DashboardPageConfig } from '../types/page-config.types';

export const engineerDashboardConfig: DashboardPageConfig = {
  id: 'engineer-dashboard',
  title: 'Engineer Dashboard',
  description: 'Structural analysis, task management, and technical oversight',
  roles: ['engineer', 'admin'],

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
          id: 'analysis',
          label: 'Structural Analysis',
          icon: 'Analytics',
          path: '/analysis',
        },
        {
          id: 'tasks',
          label: 'Tasks',
          icon: 'Assignment',
          path: '/tasks',
          featureFlag: 'enableEngineeringTasks',
        },
        {
          id: 'alerts',
          label: 'Alerts',
          icon: 'Warning',
          path: '/alerts',
          badge: 'dynamic',
          featureFlag: 'enableStructuralAlerts',
        },
        {
          id: 'elements',
          label: 'Elements',
          icon: 'Build',
          path: '/elements',
        },
        {
          id: 'bim-viewer',
          label: 'BIM Viewer',
          icon: 'ViewInAr',
          path: '/viewer',
          featureFlag: 'enableSpeckle',
        },
        {
          id: 'projects',
          label: 'Projects',
          icon: 'Assignment',
          path: '/projects',
        },
      ],
      logo: {
        text: 'Ectropy',
      },
    },
    header: {
      showSearch: true,
      showNotifications: true,
      showUserMenu: true,
    },
  },

  sections: [
    // Metrics Row
    {
      id: 'metrics',
      type: 'metrics',
      grid: { xs: 12 },
      metrics: [
        {
          id: 'active-tasks',
          label: 'Active Tasks',
          value: { source: 'tasks', field: 'id', aggregation: 'count' },
          icon: 'Assignment',
          color: 'primary',
          featureFlag: 'enableEngineeringTasks',
        },
        {
          id: 'open-alerts',
          label: 'Open Alerts',
          value: { source: 'alerts', field: 'id', aggregation: 'count' },
          icon: 'Warning',
          color: 'error',
          featureFlag: 'enableStructuralAlerts',
        },
        {
          id: 'elements-reviewed',
          label: 'Elements',
          value: { source: 'elements', field: 'id', aggregation: 'count' },
          icon: 'Build',
          color: 'info',
        },
        {
          id: 'projects',
          label: 'Projects',
          value: { source: 'projects', field: 'id', aggregation: 'count' },
          icon: 'Engineering',
          color: 'success',
        },
      ],
    },

    // Engineering Tasks (Feature-flagged - API not yet implemented)
    {
      id: 'tasks-list',
      type: 'data-list',
      title: 'Engineering Tasks',
      grid: { xs: 12, md: 6 },
      dataSource: 'tasks',
      featureFlag: 'enableEngineeringTasks',
      columns: [
        { field: 'title', header: 'Task', sortable: true },
        {
          field: 'priority',
          header: 'Priority',
          type: 'status',
          statusColors: {
            high: 'error',
            medium: 'warning',
            low: 'info',
          },
        },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            pending: 'warning',
            in_progress: 'info',
            completed: 'success',
            blocked: 'error',
          },
        },
        { field: 'dueDate', header: 'Due', type: 'date' },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      emptyMessage: 'No engineering tasks. Tasks API pending implementation.',
    },

    // Structural Alerts (Feature-flagged - API not yet implemented)
    {
      id: 'alerts-list',
      type: 'data-list',
      title: 'Structural Alerts',
      grid: { xs: 12, md: 6 },
      dataSource: 'alerts',
      featureFlag: 'enableStructuralAlerts',
      columns: [
        { field: 'elementName', header: 'Element' },
        { field: 'description', header: 'Alert' },
        {
          field: 'severity',
          header: 'Severity',
          type: 'status',
          statusColors: {
            critical: 'error',
            warning: 'warning',
            info: 'info',
          },
        },
        { field: 'createdAt', header: 'Time', type: 'date' },
      ],
      actions: ['view'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      emptyMessage: 'No structural alerts. Alerts API pending implementation.',
    },

    // BIM Viewer
    {
      id: 'bim-viewer',
      type: 'component',
      title: '3D Model',
      component: 'SpeckleBIMViewer',
      grid: { xs: 12, lg: 6 },
      featureFlag: 'enableSpeckle',
      minHeight: 400,
      loading: {
        skeleton: 'viewer',
      },
      props: {
        height: 400,
        showControls: true,
        viewMode: 'structural',
        highlightStructural: true,
      },
    },

    // Elements List
    {
      id: 'elements-list',
      type: 'data-list',
      title: 'Structural Elements',
      grid: { xs: 12, lg: 6 },
      dataSource: 'elements',
      columns: [
        { field: 'name', header: 'Element', sortable: true },
        { field: 'type', header: 'Type' },
        { field: 'loadCapacity', header: 'Load Capacity' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            verified: 'success',
            pending_review: 'warning',
            needs_attention: 'error',
          },
        },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      filters: [
        {
          field: 'type',
          label: 'Element Type',
          type: 'select',
          options: [
            { value: 'beam', label: 'Beam' },
            { value: 'column', label: 'Column' },
            { value: 'slab', label: 'Slab' },
            { value: 'foundation', label: 'Foundation' },
            { value: 'wall', label: 'Wall' },
          ],
        },
      ],
      emptyMessage: 'No structural elements found.',
    },

    // Projects
    {
      id: 'projects-list',
      type: 'data-list',
      title: 'Assigned Projects',
      grid: { xs: 12 },
      dataSource: 'projects',
      columns: [
        { field: 'name', header: 'Project', sortable: true },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            active: 'success',
            pending: 'warning',
            review: 'info',
          },
        },
        { field: 'structuralStatus', header: 'Structural Review' },
        { field: 'updatedAt', header: 'Updated', type: 'date' },
      ],
      actions: ['view'],
      pagination: {
        enabled: true,
        pageSize: 5,
      },
      emptyMessage: 'No projects assigned.',
    },
  ],

  dataRequirements: ['projects', 'elements', 'tasks', 'alerts'],

  actions: [
    {
      id: 'create-task',
      label: 'New Task',
      icon: 'Assignment',
      type: 'modal',
      variant: 'contained',
      color: 'primary',
      featureFlag: 'enableEngineeringTasks',
      modal: {
        title: 'Create Engineering Task',
        component: 'CreateTaskModal',
        props: {},
      },
      refreshData: ['tasks'],
    },
    {
      id: 'run-analysis',
      label: 'Structural Analysis',
      icon: 'Analytics',
      type: 'api',
      variant: 'outlined',
      endpoint: '/api/v1/analysis/structural',
      method: 'POST',
      successMessage: 'Analysis started',
    },
  ],

  refreshInterval: 30, // Refresh every 30 seconds for alerts

  meta: {
    version: '1.0.0',
    lastUpdated: '2026-01-23',
    author: 'Ectropy Platform',
  },
};

export default engineerDashboardConfig;
