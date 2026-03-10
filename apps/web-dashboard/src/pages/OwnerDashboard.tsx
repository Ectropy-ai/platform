import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger';
import {
  getLength,
  safeMap,
  safeFilter,
  isEmpty,
  hasElements,
} from '@ectropy/shared/utils/browser';
import {
  Box,
  Typography,
  Grid,
  Button,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  AccountBalance,
  AttachMoney,
  CheckCircle,
  Schedule,
  Gavel,
  Assessment,
  HowToVote,
  ViewInAr,
  Business,
  Dashboard,
  TrendingUp,
  Groups as GroupsIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import {
  useProjects,
  useProposals,
  useElements,
  useDAOTemplates,
  useCreateProposal,
  useVoteOnProposal,
  useBudgetData,
  useProjectActivities,
} from '../hooks/queries';
import { config } from '../services/config';
import SpeckleBIMViewer from '../components/BIMViewer/SpeckleBIMViewer';
import ElementPropertiesPanel from '../components/BIMViewer/ElementPropertiesPanel';
import {
  StatsCard,
  StatsGrid,
  BudgetTable,
  ActivityFeed,
  type BudgetItem as DashboardBudgetItem,
  type Activity,
} from '../components/dashboard';

interface OwnerDashboardProps {}

const OwnerDashboard: React.FC<OwnerDashboardProps> = () => {
  const { user } = useAuth();

  // SPRINT 4: Use React Query hooks for data fetching (enterprise caching & deduplication)
  const { projects, isLoading: projectsLoading } = useProjects();
  const { proposals: daoProposals, isLoading: proposalsLoading } = useProposals();
  const { templates: daoTemplates } = useDAOTemplates();

  // Get first project for element fetching
  const selectedProject = hasElements(projects) ? projects[0] : null;
  const { elements, isLoading: elementsLoading } = useElements(selectedProject?.id ?? '', {
    enabled: !!selectedProject?.id,
  });

  // Mutations with optimistic updates
  const createProposalMutation = useCreateProposal();
  const voteOnProposalMutation = useVoteOnProposal();

  // ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23): Real data from Prisma models
  const {
    items: budgetItems,
    summary: budgetSummary,
    isLoading: budgetLoading,
    isUnderBudget,
    variancePercent,
  } = useBudgetData({
    projectId: selectedProject?.id,
    enabled: !!selectedProject?.id,
  });

  const { activities: recentActivities, isLoading: activitiesLoading } = useProjectActivities({
    projectId: selectedProject?.id,
    enabled: !!selectedProject?.id,
    limit: 5,
  });

  // Local UI state
  const [selectedBIMElement, setSelectedBIMElement] = useState<any>(null);
  const [governanceDialogOpen, setGovernanceDialogOpen] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [votingPeriod, setVotingPeriod] = useState(7);
  const [requiredVotes, setRequiredVotes] = useState(3);
  const [mcpStatus, setMcpStatus] = useState<string>('checking...');
  const [mcpScore, setMcpScore] = useState<number | null>(null);

  // Combined loading state
  const loading = projectsLoading || proposalsLoading || budgetLoading;

  // Fetch MCP health status on mount
  useEffect(() => {
    fetch(`${config.apiBaseUrl}/health`)
      .then(r => r.json())
      .then(data => {
        if (data.status) {
          setMcpStatus(data.status);
        }
        if (data.score !== undefined) {
          setMcpScore(data.score);
        }
      })
      .catch(e => {
        logger.debug('MCP status check failed:', e);
        setMcpStatus('offline');
      });
  }, []);

  const handleBIMElementSelect = (elementId: string, properties: any) => {
    setSelectedBIMElement(properties);
  };

  const handleElementAction = (action: string, elementId: string) => {
    logger.debug(`Owner action: ${action} on element ${elementId}`);
    switch (action) {
      case 'view_asset':
        logger.debug('Viewing asset details for element', { elementId });
        break;
      case 'maintenance':
        logger.debug('Opening maintenance log for element', { elementId });
        break;
      default:
        logger.debug('Unknown action', { action });
    }
  };

  // SPRINT 4: Use mutation hooks with optimistic updates
  const handleCreateProposal = async () => {
    if (!proposalTitle.trim() || !proposalDescription.trim()) {
      logger.warn('Proposal title and description are required');
      return;
    }

    createProposalMutation.mutate(
      {
        title: proposalTitle,
        description: proposalDescription,
        votingPeriodDays: votingPeriod,
      },
      {
        onSuccess: () => {
          logger.debug('Proposal created successfully');
          // Reset form and close dialog
          setProposalTitle('');
          setProposalDescription('');
          setVotingPeriod(7);
          setRequiredVotes(3);
          setGovernanceDialogOpen(false);
        },
        onError: error => {
          logger.error('Error creating proposal:', { error });
        },
      },
    );
  };

  const handleVoteOnProposal = async (
    proposalId: string,
    decision: 'for' | 'against' | 'abstain',
  ) => {
    voteOnProposalMutation.mutate(
      {
        proposalId,
        decision,
        comment: `Owner vote: ${decision}`,
      },
      {
        onSuccess: () => {
          logger.debug('Vote submitted successfully');
        },
        onError: error => {
          logger.error('Error voting on proposal:', { error });
        },
      },
    );
  };

  // Transform budget items for BudgetTable component
  const budgetItemsForTable: DashboardBudgetItem[] = budgetItems.map(item => ({
    id: item.id,
    category: item.category,
    budgeted: item.budgeted,
    actual: item.actual,
    variance: item.variance,
    status: item.status as 'completed' | 'in_progress' | 'pending',
  }));

  // Transform activities for ActivityFeed component
  const activitiesForFeed: Activity[] = recentActivities.map(a => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    timestamp: a.timestamp,
    user: a.user,
    details: a.details,
  }));

  // ENTERPRISE P0.5: Use safe array utilities with real data
  const ownerStats = {
    totalBudget: budgetSummary.totalBudget,
    totalSpent: budgetSummary.totalActual,
    variance: budgetSummary.totalVariance,
    projectProgress: budgetSummary.projectProgress,
    activeProposals: getLength(safeFilter(daoProposals, p => p.status === 'voting')),
    stakeholderCount: 4,
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading owner dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant='h4' sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AccountBalance color='primary' />
            Owner Dashboard
          </Typography>
          <Chip
            data-testid='mcp-status'
            label={`MCP: ${mcpStatus}${mcpScore !== null ? ` (${mcpScore})` : ''}`}
            color={
              mcpStatus === 'operational' || mcpStatus === 'healthy'
                ? 'success'
                : mcpStatus === 'degraded'
                  ? 'warning'
                  : 'default'
            }
            size='small'
          />
        </Box>
        <Typography variant='subtitle1' color='text.secondary'>
          Welcome back, {user?.name}. Monitor project progress, budget, and stakeholder governance.
        </Typography>
      </Box>

      {/* Stats Cards - Using reusable StatsGrid component */}
      <StatsGrid columns={4}>
        <StatsCard
          title='Total Budget'
          value={`$${(ownerStats.totalBudget / 1000).toFixed(0)}k`}
          icon={<AttachMoney />}
          badge={
            isUnderBudget ? `${variancePercent}% under budget` : `${variancePercent}% over budget`
          }
          status={isUnderBudget ? 'success' : 'warning'}
          testId='dashboard-card-budget'
          loading={budgetLoading}
        />
        <StatsCard
          title='Project Progress'
          value={`${ownerStats.projectProgress}%`}
          icon={<TrendingUp />}
          badge='Overall completion'
          status={ownerStats.projectProgress >= 50 ? 'success' : 'warning'}
          testId='dashboard-card-progress'
          loading={budgetLoading}
        />
        <StatsCard
          title='Active Proposals'
          value={ownerStats.activeProposals}
          icon={<HowToVote />}
          badge='Pending votes'
          status='info'
          testId='dashboard-card-proposals'
          loading={proposalsLoading}
        />
        <StatsCard
          title='Stakeholders'
          value={ownerStats.stakeholderCount}
          icon={<GroupsIcon />}
          badge='All active'
          status='success'
          testId='dashboard-card-stakeholders'
          loading={false}
        />
      </StatsGrid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Main BIM Viewer - Owner Overview */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <ViewInAr color='primary' />
              <Typography variant='h6'>Project Overview</Typography>
              <Chip
                label={config.enableSpeckle ? 'OWNER VIEW' : 'UNAVAILABLE'}
                color={config.enableSpeckle ? 'success' : 'default'}
                size='small'
              />
            </Box>

            {/* ENTERPRISE FIX (2025-12-18): ROOT CAUSE #57 - Feature flag guard for BIM viewer */}
            {config.enableSpeckle ? (
              <SpeckleBIMViewer
                streamId={undefined}
                objectId={undefined}
                stakeholderRole='owner'
                onElementSelect={handleBIMElementSelect}
                height='600px'
                serverUrl={config.speckleApiUrl}
              />
            ) : (
              <Alert severity='info' sx={{ my: 4 }}>
                <strong>BIM Viewer Currently Unavailable</strong>
                <br />
                3D building visualization requires Speckle server configuration. This feature will
                be available when the platform is fully deployed.
              </Alert>
            )}
          </Paper>
        </Grid>

        {/* Owner Management Tools */}
        <Grid item xs={12} lg={4}>
          {/* Element Properties Panel */}
          <ElementPropertiesPanel
            selectedElement={selectedBIMElement}
            stakeholderRole='owner'
            onElementAction={handleElementAction}
          />

          {/* Owner Tools */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Business color='primary' />
              <Typography variant='h6'>Owner Tools</Typography>
            </Box>
            <Stack spacing={2}>
              <Button
                variant='contained'
                fullWidth
                startIcon={<HowToVote />}
                onClick={() => setGovernanceDialogOpen(true)}
              >
                Create Proposal
              </Button>
              <Button variant='outlined' fullWidth startIcon={<Assessment />}>
                Project Report
              </Button>
              <Button variant='outlined' fullWidth startIcon={<AttachMoney />}>
                Financial Summary
              </Button>
              <Button variant='outlined' fullWidth startIcon={<Dashboard />}>
                Asset Management
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Financial Overview and Governance - Using reusable components */}
      <Box sx={{ mt: 3 }}>
        <Alert severity='info' sx={{ mb: 2 }}>
          <strong>Real-time Financial Tracking:</strong> All project costs and progress are
          automatically tracked and integrated with stakeholder voting.
        </Alert>

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <BudgetTable
              items={budgetItemsForTable}
              summary={budgetSummary}
              title='Budget Overview'
              icon={<AttachMoney color='primary' />}
              loading={budgetLoading}
              showSummary
              emptyMessage='No budget items configured'
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Gavel color='primary' />
                <Typography variant='h6'>Governance</Typography>
              </Box>

              <Alert severity='info' sx={{ mb: 2 }}>
                <strong>Live DAO Governance:</strong> Real-time proposal voting and stakeholder
                collaboration.
              </Alert>

              <Typography variant='subtitle2' sx={{ mb: 1 }}>
                Active Proposals ({getLength(daoProposals)})
              </Typography>
              <List dense>
                {safeMap(daoProposals, proposal => (
                  <ListItem key={proposal.id} sx={{ display: 'block', py: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {proposal.status === 'voting' && <HowToVote color='warning' />}
                        {proposal.status === 'approved' && <CheckCircle color='success' />}
                        {proposal.status === 'draft' && <Schedule color='action' />}
                      </ListItemIcon>
                      <Box sx={{ flex: 1 }}>
                        <ListItemText
                          primary={proposal.title}
                          secondary={`${proposal.votes_for}/${proposal.required_votes} votes • ${new Date(proposal.voting_ends).toLocaleDateString()}`}
                        />
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Chip
                            size='small'
                            label={proposal.status}
                            color={
                              proposal.status === 'approved'
                                ? 'success'
                                : proposal.status === 'voting'
                                  ? 'warning'
                                  : 'default'
                            }
                          />
                          {proposal.status === 'voting' && (
                            <>
                              <Button
                                size='small'
                                variant='outlined'
                                color='success'
                                onClick={() => handleVoteOnProposal(proposal.id, 'for')}
                              >
                                Vote For
                              </Button>
                              <Button
                                size='small'
                                variant='outlined'
                                color='error'
                                onClick={() => handleVoteOnProposal(proposal.id, 'against')}
                              >
                                Vote Against
                              </Button>
                            </>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  </ListItem>
                ))}
                {isEmpty(daoProposals) && (
                  <ListItem>
                    <ListItemText
                      primary='No active proposals'
                      secondary='Create a new proposal to begin governance voting'
                    />
                  </ListItem>
                )}
              </List>

              <Typography variant='subtitle2' sx={{ mt: 2, mb: 1 }}>
                Recent Activity
              </Typography>
              <ActivityFeed
                activities={activitiesForFeed}
                maxItems={5}
                loading={activitiesLoading}
                emptyMessage='No recent activity'
                dense
              />
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Governance Proposal Dialog */}
      <Dialog
        open={governanceDialogOpen}
        onClose={() => setGovernanceDialogOpen(false)}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>Create Governance Proposal</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label='Proposal Title'
                fullWidth
                value={proposalTitle}
                onChange={e => setProposalTitle(e.target.value)}
                placeholder='e.g., Approve material upgrade for exterior walls'
                sx={{ mb: 2 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='Description'
                multiline
                rows={4}
                fullWidth
                value={proposalDescription}
                onChange={e => setProposalDescription(e.target.value)}
                placeholder='Describe the proposal, rationale, and expected impact...'
                sx={{ mb: 2 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label='Voting Period (days)'
                type='number'
                value={votingPeriod}
                onChange={e => setVotingPeriod(Number(e.target.value))}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label='Required Votes'
                type='number'
                value={requiredVotes}
                onChange={e => setRequiredVotes(Number(e.target.value))}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGovernanceDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateProposal}
            variant='contained'
            disabled={!proposalTitle.trim() || !proposalDescription.trim()}
          >
            Create Proposal
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OwnerDashboard;
