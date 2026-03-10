/**
 * ==============================================================================
 * USER FILTERS (M4)
 * ==============================================================================
 * Search and filter controls for user management table
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Enable platform admins to search and filter users efficiently
 * ==============================================================================
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Paper,
  Typography,
  InputAdornment,
  SelectChangeEvent,
} from '@mui/material';
import { Search, FilterList, Clear } from '@mui/icons-material';
import { UserFilters as UserFiltersType } from '../../../types/user-management.types';

// ==============================================================================
// PROPS
// ==============================================================================

export interface UserFiltersProps {
  /** Current filter values */
  filters: UserFiltersType;
  /** Filter change handler */
  onFilterChange: (filters: UserFiltersType) => void;
  /** Clear filters handler */
  onClearFilters: () => void;
}

// ==============================================================================
// COMPONENT
// ==============================================================================

export const UserFilters: React.FC<UserFiltersProps> = ({
  filters,
  onFilterChange,
  onClearFilters,
}) => {
  // ===========================================================================
  // LOCAL STATE (for debounced search)
  // ===========================================================================

  const [searchValue, setSearchValue] = useState(filters.search || '');

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  /**
   * Handle search input change (debounced)
   */
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      setSearchValue(newValue);

      // Debounce search (wait for user to stop typing)
      const timeoutId = setTimeout(() => {
        onFilterChange({
          ...filters,
          search: newValue || undefined,
          offset: 0, // Reset to first page when searching
        });
      }, 500);

      // Cleanup timeout on next change
      return () => clearTimeout(timeoutId);
    },
    [filters, onFilterChange],
  );

  /**
   * Handle authorization status filter change
   */
  const handleStatusChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;

    let isAuthorized: boolean | undefined;
    if (value === 'authorized') {
      isAuthorized = true;
    } else if (value === 'pending') {
      isAuthorized = false;
    } else {
      isAuthorized = undefined; // All
    }

    onFilterChange({
      ...filters,
      isAuthorized,
      offset: 0, // Reset to first page when filtering
    });
  };

  /**
   * Handle clear all filters
   */
  const handleClearAll = () => {
    setSearchValue('');
    onClearFilters();
  };

  // ===========================================================================
  // COMPUTED VALUES
  // ===========================================================================

  const statusValue =
    filters.isAuthorized === true
      ? 'authorized'
      : filters.isAuthorized === false
        ? 'pending'
        : 'all';

  const hasActiveFilters = !!(filters.search || filters.isAuthorized !== undefined);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 3,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Box display='flex' alignItems='center' gap={1} mb={2}>
        <FilterList fontSize='small' color='action' />
        <Typography variant='subtitle2' fontWeight={600}>
          Filters
        </Typography>
      </Box>

      <Box
        display='flex'
        flexDirection={{ xs: 'column', md: 'row' }}
        gap={2}
        alignItems={{ md: 'center' }}
      >
        {/* Search Input */}
        <TextField
          placeholder='Search by email or name...'
          value={searchValue}
          onChange={handleSearchChange}
          size='small'
          fullWidth
          sx={{ flex: 1, maxWidth: { md: 400 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <Search fontSize='small' />
              </InputAdornment>
            ),
          }}
        />

        {/* Status Filter */}
        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel id='status-filter-label'>Authorization Status</InputLabel>
          <Select
            labelId='status-filter-label'
            id='status-filter'
            value={statusValue}
            label='Authorization Status'
            onChange={handleStatusChange}
          >
            <MenuItem value='all'>All Users</MenuItem>
            <MenuItem value='authorized'>Authorized Only</MenuItem>
            <MenuItem value='pending'>Pending Only</MenuItem>
          </Select>
        </FormControl>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant='outlined'
            color='inherit'
            size='small'
            startIcon={<Clear />}
            onClick={handleClearAll}
            sx={{ minWidth: 120 }}
          >
            Clear Filters
          </Button>
        )}
      </Box>

      {/* Active Filter Summary */}
      {hasActiveFilters && (
        <Box mt={2} display='flex' gap={1} flexWrap='wrap'>
          {filters.search && (
            <Typography variant='caption' color='text.secondary'>
              Search: <strong>{filters.search}</strong>
            </Typography>
          )}
          {filters.isAuthorized !== undefined && (
            <Typography variant='caption' color='text.secondary'>
              Status: <strong>{filters.isAuthorized ? 'Authorized' : 'Pending'}</strong>
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default UserFilters;
