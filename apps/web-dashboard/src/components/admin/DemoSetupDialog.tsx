/**
 * DemoSetupDialog - One-Click Demo Project Creation
 * Phase 4 - Model Catalog API & Portfolio Foundation (Task 4.5)
 *
 * Workflow:
 * 1. User browses building types from global catalog (GET /api/catalog/models)
 * 2. User selects building type to copy to portfolio
 * 3. Optional: Custom project name/description
 * 4. Click "Add to Portfolio"
 * 5. Backend workflow (POST /api/portfolio/copy-demo):
 *    - Creates project in tenant database
 *    - Adds to user portfolio with portfolioType='demo'
 *    - Assigns user as project OWNER
 * 6. On success: Redirect to portfolio or BIM viewer
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  LinearProgress,
  Chip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';

// =============================================================================
// TYPE DEFINITIONS (Match backend schema)
// =============================================================================

// Model Catalog Types (from platform database)
interface CatalogModel {
  id: string;
  buildingType: string;
  displayName: string;
  description: string | null;
  ifcFilePath: string;
  estimatedBudgetUsd: number | null;
  isActive: boolean;
}

interface CatalogResponse {
  success: boolean;
  data: CatalogModel[];
}

// Portfolio API Types
interface CopyDemoRequest {
  building_type: string;
  project_name?: string;
  description?: string;
}

interface CopyDemoResponse {
  success: boolean;
  project: {
    id: string;
    name: string;
    catalogBuildingType: string;
    speckleStreamId: string | null;
    status: string;
    estimatedBudget?: string;
  };
  viewerUrl: string;
  message: string;
}

// =============================================================================
// BUILDING TYPE ICONS (UI metadata)
// =============================================================================

const buildingTypeIcons: Record<string, string> = {
  'residential-single-family': '🏠',
  'residential-multi-family': '🏘️',
  'commercial-office': '🏢',
  'commercial-large': '🏗️',
};

// =============================================================================
// COMPONENT
// =============================================================================

interface DemoSetupDialogProps {
  open: boolean;
  onClose: () => void;
}

export const DemoSetupDialog: React.FC<DemoSetupDialogProps> = ({ open, onClose }) => {
  const navigate = useNavigate();

  // Catalog state
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Form state
  const [selectedBuildingType, setSelectedBuildingType] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');

  // Progress state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopyDemoResponse | null>(null);

  // Fetch catalog models when dialog opens
  useEffect(() => {
    if (open && catalogModels.length === 0) {
      fetchCatalogModels();
    }
  }, [open]);

  const fetchCatalogModels = async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);

    try {
      const response = await apiClient.get<CatalogResponse>('/api/catalog/models');

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch catalog');
      }

      // response.data is the API JSON body { success, data: CatalogModel[] }
      const catalogData = response.data;
      const models: CatalogModel[] = Array.isArray(catalogData)
        ? catalogData
        : Array.isArray(catalogData?.data)
          ? catalogData.data
          : [];
      setCatalogModels(models);

      // Auto-select first building type if available
      if (models.length > 0 && !selectedBuildingType) {
        setSelectedBuildingType(models[0].buildingType);
      }
    } catch (err) {
      console.error('Failed to fetch catalog:', err);
      setCatalogError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  // Reset form when dialog closes
  const handleClose = () => {
    if (!isCreating) {
      setSelectedBuildingType(null);
      setProjectName('');
      setDescription('');
      setError(null);
      setResult(null);
      onClose();
    }
  };

  // Create demo project (copy from catalog to portfolio)
  const handleCreateDemo = async () => {
    if (!selectedBuildingType) {
      setError('Please select a building type');
      return;
    }

    setIsCreating(true);
    setError(null);
    setResult(null);

    const requestBody: CopyDemoRequest = {
      building_type: selectedBuildingType,
      project_name: projectName || undefined,
      description: description || undefined,
    };

    try {
      // Use apiClient which handles CSRF tokens automatically
      const response = await apiClient.post<CopyDemoResponse>('/api/portfolio/copy-demo', requestBody);

      if (!response.success) {
        throw new Error(response.error || 'Failed to create demo project');
      }

      const demoResult = response.data as CopyDemoResponse;

      // Success - show result
      setResult(demoResult);

      // Auto-redirect to viewer after 2 seconds
      if (demoResult.viewerUrl) {
        setTimeout(() => {
          navigate(demoResult.viewerUrl);
          handleClose();
        }, 2000);
      }
    } catch (err) {
      console.error('Demo project creation failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: '1.5em' }}>🏗️</span>
          <Typography variant="h5" component="span">
            Add Demo Project from Catalog
          </Typography>
          <Chip label="Phase 4" size="small" color="primary" sx={{ ml: 'auto' }} />
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Loading Catalog */}
        {isLoadingCatalog && (
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Loading building catalog...
            </Typography>
          </Box>
        )}

        {/* Catalog Error */}
        {catalogError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {catalogError}
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Success Result */}
        {result && result.success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body1" gutterBottom>
              <strong>Project added to your portfolio!</strong>
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Project: {result.project.name}
            </Typography>
            <Typography variant="body2">
              Building Type: {result.project.catalogBuildingType}
            </Typography>
            <Typography variant="body2">
              Status: {result.project.status}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
              {result.message} - Redirecting to viewer...
            </Typography>
          </Alert>
        )}

        {/* Form (hidden during creation and loading) */}
        {!isCreating && !result && !isLoadingCatalog && (
          <>
            {/* Building Type Selection */}
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
              1. Select Building Type from Catalog
            </Typography>
            {catalogModels.length === 0 ? (
              <Alert severity="info" sx={{ mb: 3 }}>
                No building types available in catalog. Please contact support.
              </Alert>
            ) : (
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {catalogModels.map((model) => (
                  <Grid item xs={12} sm={6} key={model.id}>
                    <Card
                      variant={selectedBuildingType === model.buildingType ? 'elevation' : 'outlined'}
                      sx={{
                        border: selectedBuildingType === model.buildingType ? '2px solid' : '1px solid',
                        borderColor:
                          selectedBuildingType === model.buildingType ? 'primary.main' : 'divider',
                      }}
                    >
                      <CardActionArea onClick={() => setSelectedBuildingType(model.buildingType)}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <span style={{ fontSize: '2em' }}>
                              {buildingTypeIcons[model.buildingType] || '🏢'}
                            </span>
                            <Typography variant="h6">{model.displayName}</Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {model.description || 'No description available'}
                          </Typography>
                          {model.estimatedBudgetUsd && (
                            <Typography variant="body2" color="primary" sx={{ mt: 1, fontWeight: 600 }}>
                              Est. Budget: ${model.estimatedBudgetUsd.toLocaleString()}
                            </Typography>
                          )}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 1, display: 'block', fontFamily: 'monospace' }}
                          >
                            {model.ifcFilePath}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}

            {/* Optional Fields */}
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              2. Project Details (Optional)
            </Typography>
            <TextField
              label="Project Name"
              fullWidth
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., Partner Demo - Commercial Office"
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Demo project for partner presentation on Dec 20, 2025"
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isCreating}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!isCreating && !result && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateDemo}
            disabled={!selectedBuildingType || isLoadingCatalog}
            startIcon={<span>📁</span>}
          >
            Add to Portfolio
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default DemoSetupDialog;
