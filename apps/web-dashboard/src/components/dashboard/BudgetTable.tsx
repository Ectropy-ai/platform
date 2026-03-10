/**
 * BudgetTable - Reusable budget overview table for dashboards
 *
 * White-label ready component for displaying budget items with variance.
 * Supports color-coded variance indicators and summary row.
 *
 * @module components/dashboard
 */

import React from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Skeleton,
  Alert,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { colors, spacing, borderRadius, shadows, typography } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export type BudgetStatus = 'completed' | 'in_progress' | 'pending';

export interface BudgetItem {
  id: string | number;
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  status: BudgetStatus;
}

export interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  projectProgress: number;
}

export interface BudgetTableProps {
  /** Array of budget items to display */
  items: BudgetItem[];
  /** Budget summary */
  summary?: BudgetSummary;
  /** Table title */
  title?: string;
  /** Currency symbol */
  currency?: string;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Show summary row */
  showSummary?: boolean;
  /** Optional header icon */
  icon?: React.ReactNode;
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

const StyledTable = styled(Table)({
  '& .MuiTableCell-head': {
    backgroundColor: colors.grey[50],
    fontWeight: typography.fontWeight.semiBold,
    fontSize: typography.fontSize.sm,
    color: colors.grey[700],
  },
  '& .MuiTableCell-body': {
    fontSize: typography.fontSize.sm,
  },
});

const SummaryRow = styled(TableRow)({
  backgroundColor: colors.grey[50],
  '& .MuiTableCell-root': {
    fontWeight: typography.fontWeight.bold,
    borderTop: `2px solid ${colors.grey[300]}`,
  },
});

const VarianceCell = styled(Typography)<{ positive: boolean }>(({ positive }) => ({
  color: positive ? colors.success.main : colors.error.main,
  fontWeight: typography.fontWeight.medium,
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatCurrency(value: number, currency: string = '$'): string {
  return `${currency}${value.toLocaleString()}`;
}

function getStatusColor(status: BudgetStatus): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in_progress':
      return 'warning';
    default:
      return 'default';
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * BudgetTable - Displays budget items with variance tracking
 *
 * @example
 * <BudgetTable
 *   title="Budget Overview"
 *   items={budgetItems}
 *   summary={budgetSummary}
 *   showSummary
 *   currency="$"
 * />
 */
export const BudgetTable: React.FC<BudgetTableProps> = ({
  items,
  summary,
  title = 'Budget Overview',
  currency = '$',
  loading = false,
  emptyMessage = 'No budget items found',
  showSummary = true,
  icon,
}) => {
  if (loading) {
    return (
      <StyledPaper>
        <Header>
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="text" width={200} height={28} />
        </Header>
        <Box sx={{ p: spacing.lg }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="text" height={48} sx={{ mb: 1 }} />
          ))}
        </Box>
      </StyledPaper>
    );
  }

  return (
    <StyledPaper>
      <Header>
        {icon || <AttachMoneyIcon color="primary" />}
        <HeaderTitle>{title}</HeaderTitle>
        {summary && (
          <Chip
            size="small"
            label={summary.totalVariance < 0 ? 'Under budget' : 'Over budget'}
            color={summary.totalVariance < 0 ? 'success' : 'warning'}
            sx={{ ml: 'auto' }}
          />
        )}
      </Header>

      {items.length === 0 ? (
        <Box sx={{ p: spacing.lg }}>
          <Alert severity="info">{emptyMessage}</Alert>
        </Box>
      ) : (
        <StyledTable size="small">
          <TableHead>
            <TableRow>
              <TableCell>Category</TableCell>
              <TableCell align="right">Budgeted</TableCell>
              <TableCell align="right">Actual</TableCell>
              <TableCell align="right">Variance</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.category}</TableCell>
                <TableCell align="right">{formatCurrency(item.budgeted, currency)}</TableCell>
                <TableCell align="right">{formatCurrency(item.actual, currency)}</TableCell>
                <TableCell align="right">
                  <VarianceCell positive={item.variance <= 0}>
                    {item.variance <= 0 ? '' : '+'}
                    {formatCurrency(item.variance, currency)}
                  </VarianceCell>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={item.status.replace('_', ' ')}
                    color={getStatusColor(item.status)}
                  />
                </TableCell>
              </TableRow>
            ))}

            {showSummary && summary && (
              <SummaryRow>
                <TableCell>Total</TableCell>
                <TableCell align="right">{formatCurrency(summary.totalBudget, currency)}</TableCell>
                <TableCell align="right">{formatCurrency(summary.totalActual, currency)}</TableCell>
                <TableCell align="right">
                  <VarianceCell positive={summary.totalVariance <= 0}>
                    {summary.totalVariance <= 0 ? '' : '+'}
                    {formatCurrency(summary.totalVariance, currency)}
                  </VarianceCell>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {summary.projectProgress}% Complete
                  </Typography>
                </TableCell>
              </SummaryRow>
            )}
          </TableBody>
        </StyledTable>
      )}
    </StyledPaper>
  );
};

export default BudgetTable;
