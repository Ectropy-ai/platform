import React from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Chip,
  Box,
  Divider,
  Button,
  Stack,
} from '@mui/material';
import {
  Architecture,
  Engineering,
  Construction,
  Business,
  Info,
  Edit,
  Share,
  Assignment,
  Schedule,
  AttachMoney,
  Warning,
  CheckCircle,
} from '@mui/icons-material';

interface ElementPropertiesPanelProps {
  selectedElement: any;
  stakeholderRole: 'architect' | 'engineer' | 'contractor' | 'owner';
  onPropertyEdit?: (property: string, value: any) => void;
  onElementAction?: (action: string, elementId: string) => void;
}

interface PropertyGroup {
  title: string;
  icon: React.ReactNode;
  properties: Record<string, any>;
  actions?: Array<{ label: string; action: string; icon: React.ReactNode }>;
}

export const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
  selectedElement,
  stakeholderRole,
  onPropertyEdit,
  onElementAction,
}) => {
  // Get stakeholder role icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'architect':
        return <Architecture color='primary' />;
      case 'engineer':
        return <Engineering color='primary' />;
      case 'contractor':
        return <Construction color='primary' />;
      case 'owner':
        return <Business color='primary' />;
      default:
        return <Info color='primary' />;
    }
  };

  // Get role-specific properties
  const getStakeholderProperties = (element: any, role: string): PropertyGroup[] => {
    if (!element) {
      return [];
    }

    const baseProperties = {
      'Element ID': element.id || 'Not specified',
      'Element Type': element.speckle_type || element.type || 'Unknown',
      Name: element.name || 'Unnamed Element',
    };

    switch (role) {
      case 'architect':
        return [
          {
            title: 'Design Properties',
            icon: <Architecture />,
            properties: {
              ...baseProperties,
              Material: element.material?.name || element.material || 'Not specified',
              Finish: element.finish || element.properties?.finish || 'Not specified',
              'Fire Rating':
                element.fireRating || element.properties?.fireRating || 'Not specified',
              'Acoustic Rating':
                element.acousticRating || element.properties?.acousticRating || 'Not specified',
              'Thermal Properties': element.thermalProperties || 'Not specified',
            },
            actions: [
              { label: 'Edit Design', action: 'edit_design', icon: <Edit /> },
              { label: 'Share with Team', action: 'share', icon: <Share /> },
            ],
          },
          {
            title: 'Spatial Properties',
            icon: <Assignment />,
            properties: {
              'Room/Space': element.space || element.room || 'Not assigned',
              Level: element.level || element.properties?.level || 'Not specified',
              Area: formatArea(element.area || element.properties?.area),
              Volume: formatVolume(element.volume || element.properties?.volume),
              Dimensions: formatDimensions(element),
            },
          },
        ];

      case 'engineer':
        return [
          {
            title: 'Structural Properties',
            icon: <Engineering />,
            properties: {
              ...baseProperties,
              'Load Bearing':
                element.isLoadBearing || element.properties?.loadBearing ? 'Yes' : 'No',
              'Material Grade':
                element.materialGrade || element.properties?.materialGrade || 'Not specified',
              'Structural Use':
                element.structuralUse || element.properties?.structuralUse || 'Not specified',
              'Design Load':
                element.designLoad || element.properties?.designLoad || 'Not specified',
              'Safety Factor':
                element.safetyFactor || element.properties?.safetyFactor || 'Not specified',
            },
            actions: [
              { label: 'Structural Analysis', action: 'analyze', icon: <Assignment /> },
              { label: 'Load Calculations', action: 'calculate_loads', icon: <Engineering /> },
            ],
          },
          {
            title: 'Technical Specifications',
            icon: <Info />,
            properties: {
              'Connection Type':
                element.connectionType || element.properties?.connectionType || 'Not specified',
              Reinforcement:
                element.reinforcement || element.properties?.reinforcement || 'Not specified',
              'Code Compliance': element.codeCompliance || 'Pending Review',
              'Installation Method': element.installationMethod || 'Standard',
            },
          },
        ];

      case 'contractor':
        return [
          {
            title: 'Construction Status',
            icon: <Construction />,
            properties: {
              ...baseProperties,
              'Installation Status': getStatusDisplay(
                element.installationStatus || element.status || 'not_started',
              ),
              Progress: `${element.progress || 0}%`,
              'Crew Assigned': element.crewAssigned || element.properties?.crew || 'Not assigned',
              'Installation Date': formatDate(
                element.installationDate || element.properties?.installationDate,
              ),
              'Completion Date': formatDate(
                element.completionDate || element.properties?.completionDate,
              ),
            },
            actions: [
              { label: 'Update Progress', action: 'update_progress', icon: <Schedule /> },
              { label: 'Assign Crew', action: 'assign_crew', icon: <Construction /> },
            ],
          },
          {
            title: 'Resources & Logistics',
            icon: <Schedule />,
            properties: {
              Supplier: element.supplier || element.properties?.supplier || 'Not assigned',
              'Delivery Status': element.deliveryStatus || 'Pending',
              'Installation Cost': formatCurrency(
                element.installationCost || element.properties?.cost,
              ),
              'Required Equipment': element.requiredEquipment || 'Standard tools',
              'Safety Requirements': element.safetyRequirements || 'Standard PPE',
            },
          },
        ];

      case 'owner':
        return [
          {
            title: 'Asset Information',
            icon: <Business />,
            properties: {
              ...baseProperties,
              'Asset Tag': element.assetTag || element.properties?.assetTag || 'Not assigned',
              Cost: formatCurrency(element.cost || element.properties?.cost),
              'Warranty Period':
                element.warranty || element.properties?.warranty || 'Not specified',
              'Maintenance Schedule': element.maintenanceSchedule || 'Not specified',
              'Expected Lifespan':
                element.lifespan || element.properties?.lifespan || 'Not specified',
            },
            actions: [
              { label: 'Asset Details', action: 'view_asset', icon: <Info /> },
              { label: 'Maintenance Log', action: 'maintenance', icon: <Schedule /> },
            ],
          },
          {
            title: 'Financial & Performance',
            icon: <AttachMoney />,
            properties: {
              'Initial Cost': formatCurrency(element.initialCost || element.cost),
              'Operating Cost/Year': formatCurrency(
                element.operatingCost || element.properties?.operatingCost,
              ),
              'Energy Performance': element.energyPerformance || 'Not rated',
              'ROI Period': element.roiPeriod || 'Not calculated',
              'Replacement Cost': formatCurrency(
                element.replacementCost || element.properties?.replacementCost,
              ),
            },
          },
        ];

      default:
        return [
          {
            title: 'General Properties',
            icon: <Info />,
            properties: baseProperties,
          },
        ];
    }
  };

  // Utility functions for formatting
  const formatDimensions = (element: any) => {
    const dims = element.dimensions || element.parameters;
    if (!dims) {
      return 'Not specified';
    }

    if (dims.length && dims.width && dims.height) {
      return `${dims.length} × ${dims.width} × ${dims.height}`;
    } else if (dims.Height && dims.Width) {
      return `${dims.Height.value || dims.Height} × ${dims.Width.value || dims.Width}`;
    }
    return 'Not specified';
  };

  const formatArea = (area: any) => {
    if (!area) {
      return 'Not specified';
    }
    const value = typeof area === 'object' ? area.value : area;
    return `${value} m²`;
  };

  const formatVolume = (volume: any) => {
    if (!volume) {
      return 'Not specified';
    }
    const value = typeof volume === 'object' ? volume.value : volume;
    return `${value} m³`;
  };

  const formatCurrency = (cost: any) => {
    if (!cost) {
      return 'Not specified';
    }
    const value = typeof cost === 'object' ? cost.value : cost;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (date: any) => {
    if (!date) {
      return 'Not scheduled';
    }
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return String(date);
    }
  };

  const getStatusDisplay = (status: string) => {
    const statusConfig = {
      completed: { label: 'Completed', color: 'success' as const, icon: <CheckCircle /> },
      in_progress: { label: 'In Progress', color: 'warning' as const, icon: <Schedule /> },
      planned: { label: 'Planned', color: 'info' as const, icon: <Assignment /> },
      on_hold: { label: 'On Hold', color: 'error' as const, icon: <Warning /> },
      not_started: { label: 'Not Started', color: 'default' as const, icon: <Schedule /> },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    return <Chip label={config.label} color={config.color} size='small' icon={config.icon} />;
  };

  const propertyGroups = getStakeholderProperties(selectedElement, stakeholderRole);

  if (!selectedElement) {
    return (
      <Paper sx={{ p: 2, height: '400px', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {getRoleIcon(stakeholderRole)}
          <Typography variant='h6'>Element Properties</Typography>
          <Chip label={stakeholderRole.toUpperCase()} color='primary' size='small' />
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: 'text.secondary',
          }}
        >
          <Info sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
          <Typography variant='body1' align='center'>
            Select an element in the 3D view to see its properties
          </Typography>
          <Typography variant='body2' align='center' sx={{ mt: 1 }}>
            Properties will be filtered for your {stakeholderRole} role
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid #ddd' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {getRoleIcon(stakeholderRole)}
          <Typography variant='h6'>Element Properties</Typography>
          <Chip label={stakeholderRole.toUpperCase()} color='primary' size='small' />
        </Box>
        <Typography variant='subtitle2' color='text.secondary'>
          {selectedElement.name || selectedElement.id}
        </Typography>
      </Box>

      {/* Properties Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {propertyGroups.map((group, groupIndex) => (
          <Box key={groupIndex} sx={{ mb: 2 }}>
            {/* Group Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 1 }}>
              {group.icon}
              <Typography variant='subtitle2' fontWeight='bold'>
                {group.title}
              </Typography>
            </Box>

            {/* Properties Table */}
            <TableContainer>
              <Table size='small'>
                <TableBody>
                  {Object.entries(group.properties).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell
                        component='th'
                        scope='row'
                        sx={{ fontWeight: 'bold', width: '40%', py: 0.5 }}
                      >
                        {key}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        {React.isValidElement(value) ? value : String(value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Group Actions */}
            {group.actions && group.actions.length > 0 && (
              <Stack direction='row' spacing={1} sx={{ mt: 1, px: 1 }}>
                {group.actions.map((action, actionIndex) => (
                  <Button
                    key={actionIndex}
                    size='small'
                    startIcon={action.icon}
                    variant='outlined'
                    onClick={() => onElementAction?.(action.action, selectedElement.id)}
                  >
                    {action.label}
                  </Button>
                ))}
              </Stack>
            )}

            {groupIndex < propertyGroups.length - 1 && <Divider sx={{ mt: 2 }} />}
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

export default ElementPropertiesPanel;
