/**
 * Platform Status Cards Component
 *
 * Phase: 2 - Tier 0 Platform Dashboard
 * Roadmap: .roadmap/phase-1-user-provisioning.md
 *
 * Reusable platform statistics cards for admin dashboards.
 * Shows high-level platform metrics: users, uptime, API requests, system status.
 *
 * Used in:
 * - PlatformDashboard.tsx (Tier 0 landing page for platform admins)
 * - AdminDashboard.tsx (full admin dashboard)
 */

import React from 'react';
import { Groups, TrendingUp, Speed, CheckCircle } from '@mui/icons-material';
import { StatsCard, StatsGrid } from '../dashboard';

export interface PlatformStats {
  totalUsers: number;
  activeUsers: number;
  systemUptime: number; // in hours
  apiRequests: number; // requests per minute
  systemStatus: string; // e.g., "Healthy", "Degraded", "Down"
}

interface PlatformStatusCardsProps {
  stats: PlatformStats;
  loading?: boolean;
}

/**
 * Platform Status Cards
 *
 * Displays 4 key platform metrics:
 * 1. Total Users (with active users badge)
 * 2. System Uptime (in hours)
 * 3. API Requests (per minute)
 * 4. System Status (overall health)
 */
const PlatformStatusCards: React.FC<PlatformStatusCardsProps> = ({ stats, loading = false }) => {
  // Determine system status color
  const getSystemStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('health') || statusLower === 'operational') {
      return 'success';
    }
    if (statusLower.includes('degrad') || statusLower.includes('slow')) {
      return 'warning';
    }
    if (statusLower.includes('down') || statusLower.includes('error')) {
      return 'error';
    }
    return 'info';
  };

  return (
    <StatsGrid columns={4}>
      <StatsCard
        title='Total Users'
        value={stats.totalUsers}
        icon={<Groups />}
        badge={`${stats.activeUsers} active`}
        status='success'
        testId='platform-card-users'
        loading={loading}
      />
      <StatsCard
        title='System Uptime'
        value={`${stats.systemUptime}h`}
        icon={<TrendingUp />}
        badge='All systems operational'
        status='success'
        testId='platform-card-uptime'
        loading={loading}
      />
      <StatsCard
        title='API Requests'
        value={stats.apiRequests}
        icon={<Speed />}
        badge='per minute'
        status='info'
        testId='platform-card-api'
        loading={loading}
      />
      <StatsCard
        title='System Status'
        value={stats.systemStatus}
        icon={<CheckCircle />}
        badge='No issues'
        status={getSystemStatusColor(stats.systemStatus)}
        testId='platform-card-status'
        loading={loading}
      />
    </StatsGrid>
  );
};

export default PlatformStatusCards;
