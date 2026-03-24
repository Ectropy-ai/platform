/**
 * Project Workspace Page
 * Comprehensive view for managing a single project with BIM viewer, members, governance,
 * and SEPPA AI assistant integration.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Button,
  Stack,
  Chip,
  IconButton,
  Breadcrumbs,
  Link,
  Fab,
  Tooltip,
  Badge,
  Zoom,
} from '@mui/material';
import {
  Dashboard,
  ViewInAr,
  People,
  HowToVote,
  Settings,
  ArrowBack,
  SmartToy as AssistantIcon,
} from '@mui/icons-material';
import SpeckleBIMViewer from '../components/BIMViewer/SpeckleBIMViewer';
import { ProjectMembersDialog, ProjectCard } from '../components/ProjectManagement';
import {
  ProposalCreationDialog,
  ProposalCard,
  VotingDialog,
  ProposalDetailsDialog,
} from '../components/GovernanceComponents';
import { SEPPAChatPanel } from '../components/seppa-chat';
// ENTERPRISE: Import centralized types from API service for consistency with backend
import { apiService, DAOProposal } from '../services/api';
import { config } from '../services/config';
import type { AuthorityLevel } from '../services/seppa';
import type { ElementProperties } from '../types';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  location?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  userRole?: string;
  permissions?: string[];
  elementCount?: number;
}

interface ProjectWorkspaceProps {
  projectId?: string;
  onBack?: () => void;
  /** Current user ID */
  userId?: string;
  /** Current user name */
  userName?: string;
  /** User's authority level for PM decisions */
  userAuthority?: AuthorityLevel;
}

/**
 * Map user role to authority level
 */
const roleToAuthority = (role?: string): AuthorityLevel => {
  switch (role?.toLowerCase()) {
    case 'owner':
    case 'executive':
      return 5;
    case 'admin':
    case 'manager':
    case 'pm':
      return 3;
    case 'superintendent':
      return 2;
    case 'foreman':
      return 1;
    case 'architect':
    case 'engineer':
      return 4;
    default:
      return 0;
  }
};

const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  projectId: initialProjectId,
  onBack,
  userId = 'demo-user',
  userName = 'Demo User',
  userAuthority: providedAuthority,
}) => {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);
  const [project, setProject] = useState<Project | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [proposals, setProposals] = useState<DAOProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVoxelId, setSelectedVoxelId] = useState<string | undefined>();

  // SEPPA Chat state
  const [seppaOpen, setSeppaOpen] = useState(false);

  // Dialog states
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [createProposalOpen, setCreateProposalOpen] = useState(false);
  const [votingDialogOpen, setVotingDialogOpen] = useState(false);
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<DAOProposal | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');

  // Calculate authority level from role if not provided
  const userAuthority = providedAuthority ?? roleToAuthority(project?.userRole);

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchProposals();
    }
  }, [projectId]);

  const fetchProject = async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);
    try {
      const data = await apiService.getProjectById(projectId);
      if (data) {
        setProject(data as Project);
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProposals = async () => {
    if (!projectId) {
      return;
    }

    try {
      const data = await apiService.getProjectProposals(projectId);
      setProposals(data);
    } catch (err) {
      console.error('Failed to fetch proposals:', err);
    }
  };

  const handleOpenVoting = (proposal: DAOProposal) => {
    setSelectedProposal(proposal);
    setVotingDialogOpen(true);
  };

  const handleOpenDetails = (proposalId: string) => {
    setSelectedProposalId(proposalId);
    setProposalDetailsOpen(true);
  };

  const handleVoteCast = () => {
    fetchProposals();
  };

  const handleProposalCreated = (proposal: DAOProposal) => {
    setProposals([proposal, ...proposals]);
  };

  /**
   * Handle element selection from BIM viewer
   * TypeScript FIX: Accept ElementProperties | null to match SpeckleBIMViewer props
   */
  const handleElementSelect = (elementId: string, properties: ElementProperties | null) => {
    console.log('Selected element:', elementId, properties);
    // Extract voxel ID if available from element properties
    const voxelId = properties?.voxelId as string | undefined;
    if (voxelId) {
      setSelectedVoxelId(voxelId);
    }
  };

  const canManageMembers = project?.permissions?.includes('admin') || false;
  const canCreateProposals = project?.userRole !== undefined;

  if (!projectId || !project) {
    return (
      <Container maxWidth='lg' sx={{ mt: 4 }}>
        <Typography variant='h5'>Please select a project</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth='xl' sx={{ mt: 2, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        {onBack && (
          <IconButton onClick={onBack} sx={{ mb: 1 }}>
            <ArrowBack />
          </IconButton>
        )}
        <Breadcrumbs sx={{ mb: 1 }}>
          <Link color='inherit' href='#' onClick={onBack}>
            Projects
          </Link>
          <Typography color='text.primary'>{project.name}</Typography>
        </Breadcrumbs>
        <Box display='flex' justifyContent='space-between' alignItems='center'>
          <Box>
            <Typography variant='h4' component='h1' gutterBottom>
              {project.name}
            </Typography>
            <Stack direction='row' spacing={1}>
              <Chip label={project.status} size='small' color='primary' />
              <Chip label={project.userRole} size='small' />
              {project.location && (
                <Chip label={project.location} size='small' variant='outlined' />
              )}
            </Stack>
          </Box>
          <Stack direction='row' spacing={1}>
            <Button
              startIcon={<People />}
              onClick={() => setMembersDialogOpen(true)}
              variant='outlined'
            >
              Members
            </Button>
            {canManageMembers && (
              <Button startIcon={<Settings />} variant='outlined'>
                Settings
              </Button>
            )}
          </Stack>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)}>
          <Tab icon={<Dashboard />} label='Overview' />
          <Tab icon={<ViewInAr />} label='BIM Viewer' />
          <Tab icon={<HowToVote />} label='Governance' />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {currentTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant='h6' gutterBottom>
                  Project Details
                </Typography>
                <Stack spacing={2}>
                  {project.description && (
                    <Box>
                      <Typography variant='subtitle2' color='text.secondary'>
                        Description
                      </Typography>
                      <Typography>{project.description}</Typography>
                    </Box>
                  )}
                  {project.budget && (
                    <Box>
                      <Typography variant='subtitle2' color='text.secondary'>
                        Budget
                      </Typography>
                      <Typography>${project.budget.toLocaleString()}</Typography>
                    </Box>
                  )}
                  {project.startDate && (
                    <Box>
                      <Typography variant='subtitle2' color='text.secondary'>
                        Timeline
                      </Typography>
                      <Typography>
                        {new Date(project.startDate).toLocaleDateString()}
                        {project.endDate && ` - ${new Date(project.endDate).toLocaleDateString()}`}
                      </Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant='subtitle2' color='text.secondary'>
                      Elements
                    </Typography>
                    <Typography>{project.elementCount || 0} construction elements</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant='h6' gutterBottom>
                  Recent Activity
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  No recent activity
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {currentTab === 1 && (
        <Box>
          <Card>
            <CardContent>
              <Box display='flex' justifyContent='space-between' alignItems='center' sx={{ mb: 2 }}>
                <Typography variant='h6'>BIM Model Viewer</Typography>
                {selectedVoxelId && (
                  <Chip
                    label={`Selected: ${selectedVoxelId}`}
                    color='secondary'
                    size='small'
                    onDelete={() => setSelectedVoxelId(undefined)}
                  />
                )}
              </Box>
              <Box sx={{ height: '600px', bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <SpeckleBIMViewer
                  streamId={project.id}
                  objectId={undefined}
                  stakeholderRole={(project.userRole as any) || 'contractor'}
                  onElementSelect={handleElementSelect}
                  height='600px'
                  serverUrl={config.speckleApiUrl}
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {currentTab === 2 && (
        <Box>
          <Box display='flex' justifyContent='space-between' alignItems='center' sx={{ mb: 3 }}>
            <Typography variant='h5'>Project Governance</Typography>
            {canCreateProposals && (
              <Button
                variant='contained'
                startIcon={<HowToVote />}
                onClick={() => setCreateProposalOpen(true)}
              >
                Create Proposal
              </Button>
            )}
          </Box>

          {proposals.length === 0 ? (
            <Card>
              <CardContent>
                <Typography variant='body1' color='text.secondary' align='center'>
                  No proposals yet. Create the first one to start governing this project.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={2}>
              {proposals.map(proposal => (
                <Grid item xs={12} md={6} key={proposal.id}>
                  <ProposalCard
                    proposal={proposal}
                    onViewDetails={() => handleOpenDetails(proposal.id)}
                    onVote={() => handleOpenVoting(proposal)}
                    canVote={canCreateProposals && proposal.status === 'voting'}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* SEPPA Chat FAB */}
      <Zoom in={!seppaOpen}>
        <Tooltip title='Ask SEPPA - AI Construction Assistant' placement='left'>
          <Fab
            color='primary'
            aria-label='Open SEPPA assistant'
            onClick={() => setSeppaOpen(true)}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              width: 64,
              height: 64,
              boxShadow: 4,
              background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
              },
            }}
          >
            <Badge
              badgeContent='AI'
              color='secondary'
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.6rem',
                  height: 16,
                  minWidth: 16,
                  padding: '0 4px',
                },
              }}
            >
              <AssistantIcon sx={{ fontSize: 32 }} />
            </Badge>
          </Fab>
        </Tooltip>
      </Zoom>

      {/* SEPPA Chat Panel */}
      <SEPPAChatPanel
        open={seppaOpen}
        onClose={() => setSeppaOpen(false)}
        projectId={project.id}
        selectedVoxelId={selectedVoxelId}
        userAuthority={userAuthority}
        userId={userId}
        userName={userName}
      />

      {/* Dialogs */}
      <ProjectMembersDialog
        open={membersDialogOpen}
        onClose={() => setMembersDialogOpen(false)}
        projectId={projectId}
        projectName={project.name}
        canManageMembers={canManageMembers}
      />

      <ProposalCreationDialog
        open={createProposalOpen}
        onClose={() => setCreateProposalOpen(false)}
        projectId={projectId}
        onProposalCreated={handleProposalCreated}
      />

      {selectedProposal && (
        <VotingDialog
          open={votingDialogOpen}
          onClose={() => setVotingDialogOpen(false)}
          proposal={selectedProposal}
          onVoteCast={handleVoteCast}
        />
      )}

      <ProposalDetailsDialog
        open={proposalDetailsOpen}
        onClose={() => setProposalDetailsOpen(false)}
        proposalId={selectedProposalId}
      />
    </Container>
  );
};

export default ProjectWorkspace;
