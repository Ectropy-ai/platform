/**
 * Owner Dashboard Configuration
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Configuration for the Owner role dashboard.
 * Owners are responsible for project oversight, governance decisions,
 * and budget tracking.
 *
 * Key Features:
 * - Project overview with status metrics
 * - DAO governance (proposals & voting)
 * - Budget tracking
 * - Decision log
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 */

import type { DashboardPageConfig } from '../types/page-config.types';

export const ownerDashboardConfig: DashboardPageConfig = {
  id: 'owner-dashboard',
  title: 'Owner Dashboard',
  description: 'Project oversight, governance, and financial tracking',
  roles: ['owner', 'admin'],

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
          id: 'projects',
          label: 'My Projects',
          icon: 'Assignment',
          path: '/projects',
        },
        {
          id: 'governance',
          label: 'Governance',
          icon: 'Gavel',
          path: '/governance',
          featureFlag: 'enableGovernance',
        },
        {
          id: 'budget',
          label: 'Budget',
          icon: 'AttachMoney',
          path: '/budget',
        },
        {
          id: 'decisions',
          label: 'Decision Log',
          icon: 'AccountBalance',
          path: '/decisions',
        },
        {
          id: 'bim-viewer',
          label: 'BIM Viewer',
          icon: 'ViewInAr',
          path: '/viewer',
          featureFlag: 'enableSpeckle',
        },
        {
          id: 'analytics',
          label: 'Analytics',
          icon: 'Analytics',
          path: '/analytics',
          featureFlag: 'enableAdvancedAnalytics',
        },
      ],
      logo: {
        text: 'Ectropy',
      },
    },
    header: {
      showSearch: false,
      showNotifications: true,
      showUserMenu: true,
    },
  },

  sections: [
    // Project Metrics Row
    {
      id: 'project-metrics',
      type: 'metrics',
      grid: { xs: 12 },
      metrics: [
        {
          id: 'total-projects',
          label: 'Active Projects',
          value: { source: 'projects', field: 'id', aggregation: 'count' },
          icon: 'Assignment',
          color: 'primary',
        },
        {
          id: 'active-proposals',
          label: 'Active Proposals',
          value: { source: 'proposals', field: 'id', aggregation: 'count' },
          icon: 'Gavel',
          color: 'warning',
          featureFlag: 'enableGovernance',
        },
        {
          id: 'total-elements',
          label: 'Construction Elements',
          value: { source: 'elements', field: 'id', aggregation: 'count' },
          icon: 'Build',
          color: 'info',
        },
        {
          id: 'completion-rate',
          label: 'Overall Progress',
          value: '78%',
          unit: '',
          icon: 'Speed',
          color: 'success',
        },
      ],
    },

    // Projects List
    {
      id: 'projects-list',
      type: 'data-list',
      title: 'My Projects',
      grid: { xs: 12, md: 6 },
      dataSource: 'projects',
      columns: [
        { field: 'name', header: 'Project Name', sortable: true },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            active: 'success',
            pending: 'warning',
            completed: 'info',
            on_hold: 'error',
          },
        },
        { field: 'updatedAt', header: 'Last Updated', type: 'date', sortable: true },
      ],
      actions: ['view', 'edit'],
      pagination: {
        enabled: true,
        pageSize: 5,
      },
      emptyMessage: 'No projects found. Create a new project to get started.',
    },

    // Active Proposals
    {
      id: 'proposals-list',
      type: 'data-list',
      title: 'Active Proposals',
      grid: { xs: 12, md: 6 },
      dataSource: 'proposals',
      featureFlag: 'enableGovernance',
      columns: [
        { field: 'title', header: 'Proposal', sortable: true },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            open: 'warning',
            approved: 'success',
            rejected: 'error',
            pending: 'info',
          },
        },
        { field: 'votesFor', header: 'For', type: 'text' },
        { field: 'votesAgainst', header: 'Against', type: 'text' },
        { field: 'deadline', header: 'Deadline', type: 'date' },
      ],
      actions: ['view'],
      pagination: {
        enabled: true,
        pageSize: 5,
      },
      emptyMessage: 'No active proposals. The project team can create proposals for decisions.',
    },

    // Governance Panel
    {
      id: 'governance-panel',
      type: 'component',
      title: 'Governance',
      component: 'GovernancePanel',
      grid: { xs: 12 },
      featureFlag: 'enableGovernance',
      minHeight: 400,
      loading: {
        skeleton: 'card',
        message: 'Loading governance tools...',
      },
      props: {
        showCreateProposal: true,
        showVotingHistory: true,
      },
    },

    // Construction Elements Overview
    {
      id: 'elements-overview',
      type: 'data-list',
      title: 'Recent Construction Activity',
      grid: { xs: 12, lg: 6 },
      dataSource: 'elements',
      columns: [
        { field: 'name', header: 'Element', sortable: true },
        { field: 'type', header: 'Type' },
        {
          field: 'status',
          header: 'Status',
          type: 'status',
          statusColors: {
            planned: 'info',
            in_progress: 'warning',
            completed: 'success',
            blocked: 'error',
          },
        },
        { field: 'progress', header: 'Progress', type: 'progress' },
      ],
      pagination: {
        enabled: true,
        pageSize: 10,
      },
      emptyMessage: 'No construction elements tracked yet.',
    },

    // BIM Viewer
    {
      id: 'bim-viewer',
      type: 'component',
      title: '3D Model Overview',
      component: 'SpeckleBIMViewer',
      grid: { xs: 12, lg: 6 },
      featureFlag: 'enableSpeckle',
      minHeight: 400,
      loading: {
        skeleton: 'viewer',
        message: 'Loading 3D model...',
      },
      props: {
        height: 400,
        showControls: true,
        viewMode: 'overview',
      },
    },
  ],

  dataRequirements: ['projects', 'proposals', 'elements'],

  actions: [
    {
      id: 'create-proposal',
      label: 'New Proposal',
      icon: 'Gavel',
      type: 'modal',
      variant: 'contained',
      color: 'primary',
      featureFlag: 'enableGovernance',
      modal: {
        title: 'Create Proposal',
        component: 'CreateProposalModal',
        props: {},
      },
      refreshData: ['proposals'],
    },
    {
      id: 'export-report',
      label: 'Export Report',
      icon: 'Description',
      type: 'api',
      variant: 'outlined',
      endpoint: '/api/v1/reports/owner-summary',
      method: 'GET',
      featureFlag: 'enableExportFeatures',
      successMessage: 'Report generated successfully',
    },
  ],

  refreshInterval: 60, // Refresh every 60 seconds

  meta: {
    version: '1.0.0',
    lastUpdated: '2026-01-23',
    author: 'Ectropy Platform',
  },
};

export default ownerDashboardConfig;
