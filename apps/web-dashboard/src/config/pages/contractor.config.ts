/**
 * Contractor Dashboard Configuration
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Configuration for the Contractor role dashboard.
 * Contractors are responsible for construction progress tracking,
 * team management, and scheduling.
 *
 * Key Features:
 * - Construction progress tracking
 * - Team/crew management
 * - Schedule management
 * - Material tracking
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 */

import type { DashboardPageConfig } from '../types/page-config.types';

export const contractorDashboardConfig: DashboardPageConfig = {
  id: 'contractor-dashboard',
  title: 'Contractor Dashboard',
  description: 'Construction progress, team management, and scheduling',
  roles: ['contractor', 'admin'],

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
          id: 'progress',
          label: 'Progress',
          icon: 'Timeline',
          path: '/progress',
        },
        {
          id: 'team',
          label: 'Team',
          icon: 'People',
          path: '/team',
        },
        {
          id: 'schedule',
          label: 'Schedule',
          icon: 'Schedule',
          path: '/schedule',
        },
        {
          id: 'materials',
          label: 'Materials',
          icon: 'Inventory',
          path: '/materials',
          featureFlag: 'enableManufacturerProducts',
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
          id: 'overall-progress',
          label: 'Overall Progress',
          value: '67%',
          icon: 'Timeline',
          color: 'primary',
        },
        {
          id: 'active-elements',
          label: 'Active Work Items',
          value: { source: 'elements', field: 'id', aggregation: 'count' },
          icon: 'Build',
          color: 'info',
        },
        {
          id: 'projects',
          label: 'Active Projects',
          value: { source: 'projects', field: 'id', aggregation: 'count' },
          icon: 'Assignment',
          color: 'success',
        },
        {
          id: 'on-schedule',
          label: 'On Schedule',
          value: '85%',
          icon: 'CheckCircle',
          color: 'success',
        },
      ],
    },

    // Construction Progress
    {
      id: 'progress-chart',
      type: 'chart',
      title: 'Construction Progress',
      chartType: 'bar',
      grid: { xs: 12, md: 6 },
      dataSource: 'elements',
      minHeight: 300,
      xAxis: {
        field: 'phase',
        label: 'Construction Phase',
        type: 'category',
      },
      yAxis: {
        field: 'progress',
        label: 'Completion %',
      },
    },

    // Elements by Status
    {
      id: 'elements-status',
      type: 'data-list',
      title: 'Work Items by Status',
      grid: { xs: 12, md: 6 },
      dataSource: 'elements',
      columns: [
        { field: 'name', header: 'Element', sortable: true },
        { field: 'zone', header: 'Zone' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            not_started: 'default',
            in_progress: 'warning',
            completed: 'success',
            blocked: 'error',
          },
        },
        { field: 'progress', header: 'Progress', type: 'progress' },
        { field: 'assignedTo', header: 'Assigned' },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      filters: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'not_started', label: 'Not Started' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
            { value: 'blocked', label: 'Blocked' },
          ],
        },
        {
          field: 'zone',
          label: 'Zone',
          type: 'select',
          options: [
            { value: 'zone-a', label: 'Zone A' },
            { value: 'zone-b', label: 'Zone B' },
            { value: 'zone-c', label: 'Zone C' },
          ],
        },
      ],
      emptyMessage: 'No work items found.',
    },

    // BIM Viewer
    {
      id: 'bim-viewer',
      type: 'component',
      title: 'Site Model',
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
        viewMode: 'construction',
        showProgress: true,
      },
    },

    // Materials/Products (Feature-flagged)
    {
      id: 'materials-list',
      type: 'data-list',
      title: 'Materials',
      grid: { xs: 12, lg: 6 },
      dataSource: 'products',
      featureFlag: 'enableManufacturerProducts',
      columns: [
        { field: 'name', header: 'Material', sortable: true },
        { field: 'manufacturer', header: 'Manufacturer' },
        { field: 'quantity', header: 'Qty' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            in_stock: 'success',
            ordered: 'info',
            low_stock: 'warning',
            out_of_stock: 'error',
          },
        },
      ],
      actions: ['view'],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      emptyMessage: 'Materials API returns mock data. Full implementation pending.',
    },

    // Projects
    {
      id: 'projects-list',
      type: 'data-list',
      title: 'Active Projects',
      grid: { xs: 12 },
      dataSource: 'projects',
      columns: [
        { field: 'name', header: 'Project', sortable: true },
        { field: 'location', header: 'Location' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            active: 'success',
            pending: 'warning',
            on_hold: 'error',
          },
        },
        { field: 'progress', header: 'Progress', type: 'progress' },
        { field: 'dueDate', header: 'Due Date', type: 'date' },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 5,
      },
      emptyMessage: 'No active projects.',
    },
  ],

  dataRequirements: ['projects', 'elements', 'products'],

  actions: [
    {
      id: 'update-progress',
      label: 'Update Progress',
      icon: 'Timeline',
      type: 'modal',
      variant: 'contained',
      color: 'primary',
      modal: {
        title: 'Update Construction Progress',
        component: 'UpdateProgressModal',
        props: {},
      },
      refreshData: ['elements'],
    },
    {
      id: 'add-note',
      label: 'Add Note',
      icon: 'Description',
      type: 'modal',
      variant: 'outlined',
      modal: {
        title: 'Add Site Note',
        component: 'AddNoteModal',
        props: {},
      },
    },
  ],

  refreshInterval: 60,

  meta: {
    version: '1.0.0',
    lastUpdated: '2026-01-23',
    author: 'Ectropy Platform',
  },
};

export default contractorDashboardConfig;
