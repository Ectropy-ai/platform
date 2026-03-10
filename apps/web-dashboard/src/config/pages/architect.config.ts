/**
 * Architect Dashboard Configuration
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Configuration for the Architect role dashboard.
 * Architects are responsible for BIM model management, design reviews,
 * and AI-powered analysis.
 *
 * Key Features:
 * - 3D BIM viewer with IFC upload
 * - AI analysis (cost, compliance, quality)
 * - Element properties panel
 * - Design collaboration
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 */

import type { DashboardPageConfig } from '../types/page-config.types';

export const architectDashboardConfig: DashboardPageConfig = {
  id: 'architect-dashboard',
  title: 'Architect Dashboard',
  description: 'BIM management, design review, and AI analysis',
  roles: ['architect', 'admin'],

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
          id: 'models',
          label: '3D Models',
          icon: 'ViewInAr',
          path: '/models',
          featureFlag: 'enableSpeckle',
        },
        {
          id: 'upload',
          label: 'Upload IFC',
          icon: 'Upload',
          path: '/upload',
          featureFlag: 'enableSpeckle',
        },
        {
          id: 'analysis',
          label: 'AI Analysis',
          icon: 'Analytics',
          path: '/analysis',
          featureFlag: 'enableAIAnalysis',
        },
        {
          id: 'elements',
          label: 'Elements',
          icon: 'Build',
          path: '/elements',
        },
        {
          id: 'projects',
          label: 'Projects',
          icon: 'Assignment',
          path: '/projects',
        },
        {
          id: 'seppa',
          label: 'SEPPA Assistant',
          icon: 'Engineering',
          path: '/assistant',
          featureFlag: 'enableSEPPAChat',
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
    // Project Metrics
    {
      id: 'metrics',
      type: 'metrics',
      grid: { xs: 12 },
      metrics: [
        {
          id: 'active-models',
          label: 'Active Models',
          value: { source: 'streams', field: 'id', aggregation: 'count' },
          icon: 'ViewInAr',
          color: 'primary',
          featureFlag: 'enableSpeckle',
        },
        {
          id: 'total-elements',
          label: 'Elements',
          value: { source: 'elements', field: 'id', aggregation: 'count' },
          icon: 'Build',
          color: 'info',
        },
        {
          id: 'projects',
          label: 'Projects',
          value: { source: 'projects', field: 'id', aggregation: 'count' },
          icon: 'Assignment',
          color: 'success',
        },
        {
          id: 'analysis-score',
          label: 'Analysis Score',
          value: '92',
          unit: '/100',
          icon: 'Analytics',
          color: 'warning',
          featureFlag: 'enableAIAnalysis',
        },
      ],
    },

    // BIM Viewer (Primary)
    {
      id: 'bim-viewer',
      type: 'component',
      title: '3D BIM Viewer',
      component: 'SpeckleBIMViewer',
      grid: { xs: 12, lg: 8 },
      featureFlag: 'enableSpeckle',
      minHeight: 500,
      loading: {
        skeleton: 'viewer',
        message: 'Loading 3D model...',
      },
      props: {
        height: 500,
        showControls: true,
        showUpload: true,
        viewMode: 'architect',
      },
    },

    // Element Properties
    {
      id: 'element-properties',
      type: 'component',
      title: 'Element Properties',
      component: 'ElementPropertiesPanel',
      grid: { xs: 12, lg: 4 },
      minHeight: 500,
      loading: {
        skeleton: 'card',
      },
      props: {
        showEditButton: true,
        showHistory: false,
      },
    },

    // AI Analysis Panel
    {
      id: 'ai-analysis',
      type: 'component',
      title: 'AI Analysis',
      component: 'AIAnalysisPanel',
      grid: { xs: 12, md: 6 },
      featureFlag: 'enableAIAnalysis',
      minHeight: 300,
      loading: {
        skeleton: 'card',
        message: 'Running AI analysis...',
      },
      props: {
        analysisTypes: ['cost', 'compliance', 'quality'],
        autoRun: false,
      },
    },

    // Projects List
    {
      id: 'projects-list',
      type: 'data-list',
      title: 'Your Projects',
      grid: { xs: 12, md: 6 },
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
            completed: 'info',
          },
        },
        { field: 'updatedAt', header: 'Updated', type: 'date' },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 5,
      },
      emptyMessage: 'No projects found.',
    },

    // Construction Elements
    {
      id: 'elements-list',
      type: 'data-list',
      title: 'Construction Elements',
      grid: { xs: 12 },
      dataSource: 'elements',
      columns: [
        { field: 'name', header: 'Element Name', sortable: true },
        { field: 'type', header: 'Type' },
        { field: 'material', header: 'Material' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            planned: 'info',
            in_progress: 'warning',
            completed: 'success',
          },
        },
        { field: 'quantity', header: 'Qty' },
      ],
      actions: ['view', 'edit', 'select'],
      pagination: {
        enabled: true,
        pageSize: 10,
        pageSizeOptions: [10, 25, 50],
      },
      sorting: {
        enabled: true,
        defaultField: 'name',
        defaultDirection: 'asc',
      },
      filters: [
        {
          field: 'type',
          label: 'Element Type',
          type: 'select',
          options: [
            { value: 'structural', label: 'Structural' },
            { value: 'architectural', label: 'Architectural' },
            { value: 'mep', label: 'MEP' },
          ],
        },
        {
          field: 'status',
          label: 'Status',
          type: 'multiSelect',
          options: [
            { value: 'planned', label: 'Planned' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
          ],
        },
      ],
      emptyMessage: 'No construction elements found. Upload an IFC file to import elements.',
    },
  ],

  dataRequirements: ['projects', 'elements', 'streams'],

  actions: [
    {
      id: 'upload-ifc',
      label: 'Upload IFC',
      icon: 'Upload',
      type: 'modal',
      variant: 'contained',
      color: 'primary',
      featureFlag: 'enableSpeckle',
      modal: {
        title: 'Upload IFC File',
        component: 'IFCUploadModal',
        props: {},
      },
      refreshData: ['elements', 'streams'],
    },
    {
      id: 'run-analysis',
      label: 'Run Analysis',
      icon: 'Analytics',
      type: 'api',
      variant: 'outlined',
      endpoint: '/api/mcp/agents/analyze',
      method: 'POST',
      featureFlag: 'enableAIAnalysis',
      successMessage: 'Analysis started',
    },
  ],

  refreshInterval: 0, // Manual refresh only

  meta: {
    version: '1.0.0',
    lastUpdated: '2026-01-23',
    author: 'Ectropy Platform',
  },
};

export default architectDashboardConfig;
