/**
 * AlertList - Reusable alert list for dashboards
 *
 * White-label ready component for displaying structural or system alerts.
 * Supports severity indicators and element references.
 *
 * @module components/dashboard
 */

import React from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Skeleton,
  Alert as MuiAlert,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { colors, spacing, borderRadius, shadows, typography } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = 'error' | 'warning' | 'info' | 'success';

export interface Alert {
  id: string | number;
  message: string;
  severity: AlertSeverity;
  element?: string;
  title?: string;
  createdAt?: string;
}

export interface AlertListProps {
  /** Array of alerts to display */
  alerts: Alert[];
  /** List title */
  title?: string;
  /** Maximum number of alerts to show */
  maxItems?: number;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Show element reference */
  showElement?: boolean;
  /** Optional header icon */
  icon?: React.ReactNode;
  /** Dense display mode */
  dense?: boolean;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const StyledPaper = styled(Paper)({
  borderRadius: borderRadius.lg,
  boxShadow: shadows.base,
  overflow: 'hidden',
});

const Header = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  padding: spacing.lg,
  borderBottom: `1px solid ${colors.grey[200]}`,
});

const HeaderTitle = styled(Typography)({
  fontSize: typography.fontSize.lg,
  fontWeight: typography.fontWeight.semiBold,
  color: colors.grey[900],
});

const StyledList = styled(List)({
  padding: 0,
});

const StyledListItem = styled(ListItem)<{ severity: AlertSeverity }>(({ severity }) => ({
  borderLeft: `3px solid ${getSeverityBorderColor(severity)}`,
  '&:not(:last-child)': {
    borderBottom: `1px solid ${colors.grey[100]}`,
  },
  '&:hover': {
    backgroundColor: colors.grey[50],
  },
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getSeverityBorderColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'error':
      return colors.error.main;
    case 'warning':
      return colors.warning.main;
    case 'info':
      return colors.info.main;
    case 'success':
      return colors.success.main;
    default:
      return colors.grey[400];
  }
}

const SeverityIcon: React.FC<{ severity: AlertSeverity }> = ({ severity }) => {
  switch (severity) {
    case 'error':
      return <ErrorIcon color="error" />;
    case 'warning':
      return <WarningIcon color="warning" />;
    case 'info':
      return <InfoIcon color="info" />;
    case 'success':
      return <CheckCircleIcon color="success" />;
    default:
      return <InfoIcon color="action" />;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * AlertList - Displays a list of alerts with severity indicators
 *
 * @example
 * <AlertList
 *   title="Structural Alerts"
 *   alerts={alerts}
 *   showElement
 *   maxItems={5}
 * />
 */
export const AlertList: React.FC<AlertListProps> = ({
  alerts,
  title = 'Alerts',
  maxItems,
  loading = false,
  emptyMessage = 'No alerts',
  showElement = true,
  icon,
  dense = false,
}) => {
  const displayAlerts = maxItems ? alerts.slice(0, maxItems) : alerts;

  if (loading) {
    return (
      <StyledPaper>
        <Header>
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="text" width={150} height={28} />
        </Header>
        <StyledList>
          {[1, 2, 3].map((i) => (
            <ListItem key={i}>
              <ListItemIcon>
                <Skeleton variant="circular" width={24} height={24} />
              </ListItemIcon>
              <ListItemText
                primary={<Skeleton variant="text" width="80%" />}
                secondary={<Skeleton variant="text" width="40%" />}
              />
            </ListItem>
          ))}
        </StyledList>
      </StyledPaper>
    );
  }

  return (
    <StyledPaper>
      <Header>
        {icon || <NotificationsIcon color="primary" />}
        <HeaderTitle>{title}</HeaderTitle>
        {alerts.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {alerts.length} total
          </Typography>
        )}
      </Header>

      {displayAlerts.length === 0 ? (
        <Box sx={{ p: spacing.lg }}>
          <MuiAlert severity="success" icon={<CheckCircleIcon />}>
            {emptyMessage}
          </MuiAlert>
        </Box>
      ) : (
        <StyledList dense={dense}>
          {displayAlerts.map((alert) => (
            <StyledListItem key={alert.id} severity={alert.severity}>
              <ListItemIcon>
                <SeverityIcon severity={alert.severity} />
              </ListItemIcon>
              <ListItemText
                primary={alert.title || alert.message}
                secondary={
                  <Box component="span">
                    {alert.title && (
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        display="block"
                      >
                        {alert.message}
                      </Typography>
                    )}
                    {showElement && alert.element && (
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                      >
                        Element: {alert.element}
                      </Typography>
                    )}
                  </Box>
                }
                primaryTypographyProps={{
                  fontWeight: typography.fontWeight.medium,
                  fontSize: typography.fontSize.sm,
                }}
              />
            </StyledListItem>
          ))}
        </StyledList>
      )}

      {maxItems && alerts.length > maxItems && (
        <Box
          sx={{
            p: spacing.md,
            textAlign: 'center',
            borderTop: `1px solid ${colors.grey[200]}`,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            +{alerts.length - maxItems} more alerts
          </Typography>
        </Box>
      )}
    </StyledPaper>
  );
};

export default AlertList;
