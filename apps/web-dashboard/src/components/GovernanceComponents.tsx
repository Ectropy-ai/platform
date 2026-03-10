/**
 * Governance Components
 * Provides UI for DAO proposals and voting
 */

import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  LinearProgress,
  Stack,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  HowToVote,
  ThumbUp,
  ThumbDown,
  RemoveCircle,
  Add,
  Schedule,
  CheckCircle,
  Cancel,
  Pending,
} from '@mui/icons-material';
// ENTERPRISE: Import centralized type from API service for consistency with backend
import { apiService, DAOProposal } from '../services/api';

interface Vote {
  id: string;
  voter: {
    id: string;
    name: string;
    role: string;
  };
  decision: string;
  comment?: string;
  weight: number;
  timestamp: string;
}

interface ProposalCreationDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onProposalCreated: (proposal: DAOProposal) => void;
}

export const ProposalCreationDialog: React.FC<ProposalCreationDialogProps> = ({
  open,
  onClose,
  projectId,
  onProposalCreated,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposalType, setProposalType] = useState('budget_allocation');
  const [votingDays, setVotingDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const proposalTypes = [
    { value: 'design_change', label: 'Design Change' },
    { value: 'budget_allocation', label: 'Budget Allocation' },
    { value: 'timeline_adjustment', label: 'Timeline Adjustment' },
    { value: 'contractor_selection', label: 'Contractor Selection' },
    { value: 'material_change', label: 'Material Change' },
    { value: 'governance', label: 'Governance' },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const newProposal = await apiService.createProjectProposal(projectId, {
        title,
        description,
        proposalType,
        votingDays,
      });
      onProposalCreated(newProposal);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create proposal');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setProposalType('budget_allocation');
    setVotingDays(7);
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='md' fullWidth>
      <DialogTitle>Create New Proposal</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              label='Proposal Title'
              value={title}
              onChange={e => setTitle(e.target.value)}
              fullWidth
              required
              placeholder='e.g., Approve HVAC System Upgrade'
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label='Description'
              value={description}
              onChange={e => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={4}
              required
              placeholder='Detailed description of the proposal...'
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Proposal Type</InputLabel>
              <Select
                value={proposalType}
                onChange={e => setProposalType(e.target.value)}
                label='Proposal Type'
              >
                {proposalTypes.map(type => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label='Voting Period (days)'
              value={votingDays}
              onChange={e => setVotingDays(parseInt(e.target.value) || 7)}
              fullWidth
              type='number'
              inputProps={{ min: 1, max: 30 }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant='contained'
          disabled={!title || !description || loading}
        >
          {loading ? 'Creating...' : 'Create Proposal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface VotingDialogProps {
  open: boolean;
  onClose: () => void;
  proposal: DAOProposal;
  onVoteCast: () => void;
}

export const VotingDialog: React.FC<VotingDialogProps> = ({
  open,
  onClose,
  proposal,
  onVoteCast,
}) => {
  const [decision, setDecision] = useState<'approve' | 'reject' | 'abstain' | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVote = async () => {
    if (!decision) return;

    setLoading(true);
    setError('');

    try {
      await apiService.voteOnProjectProposal(proposal.id, {
        decision,
        comment,
      });
      onVoteCast();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cast vote');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDecision(null);
    setComment('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Cast Your Vote</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant='h6' gutterBottom sx={{ mt: 1 }}>
          {proposal.title}
        </Typography>
        <Typography variant='body2' color='text.secondary' paragraph>
          {proposal.description}
        </Typography>

        <Stack spacing={2} sx={{ mt: 3 }}>
          <Button
            variant={decision === 'approve' ? 'contained' : 'outlined'}
            color='success'
            fullWidth
            startIcon={<ThumbUp />}
            onClick={() => setDecision('approve')}
          >
            Approve
          </Button>
          <Button
            variant={decision === 'reject' ? 'contained' : 'outlined'}
            color='error'
            fullWidth
            startIcon={<ThumbDown />}
            onClick={() => setDecision('reject')}
          >
            Reject
          </Button>
          <Button
            variant={decision === 'abstain' ? 'contained' : 'outlined'}
            color='inherit'
            fullWidth
            startIcon={<RemoveCircle />}
            onClick={() => setDecision('abstain')}
          >
            Abstain
          </Button>
        </Stack>

        <TextField
          label='Comment (optional)'
          value={comment}
          onChange={e => setComment(e.target.value)}
          fullWidth
          multiline
          rows={3}
          sx={{ mt: 2 }}
          placeholder='Add a comment to explain your vote...'
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleVote} variant='contained' disabled={!decision || loading}>
          {loading ? 'Submitting...' : 'Cast Vote'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface ProposalCardProps {
  proposal: DAOProposal;
  onViewDetails: () => void;
  onVote: () => void;
  canVote: boolean;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onViewDetails,
  onVote,
  canVote,
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Pending color='primary' />;
      case 'passed':
        return <CheckCircle color='success' />;
      case 'rejected':
        return <Cancel color='error' />;
      case 'expired':
        return <Schedule color='disabled' />;
      default:
        return <Pending />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'primary';
      case 'passed':
        return 'success';
      case 'rejected':
        return 'error';
      case 'expired':
        return 'default';
      default:
        return 'default';
    }
  };

  // ENTERPRISE: Calculate totals from DAOProposal's individual vote properties
  const totalVotes = proposal.votes_for + proposal.votes_against + proposal.abstentions;
  const voteProgress =
    proposal.required_votes > 0 ? (totalVotes / proposal.required_votes) * 100 : 0;

  const daysRemaining = Math.ceil(
    (new Date(proposal.voting_ends).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <Card>
      <CardContent>
        <Box display='flex' justifyContent='space-between' alignItems='start' mb={2}>
          <Box display='flex' alignItems='center' gap={1}>
            {getStatusIcon(proposal.status)}
            <Typography variant='h6' component='div'>
              {proposal.title}
            </Typography>
          </Box>
          <Chip
            label={proposal.status}
            size='small'
            color={getStatusColor(proposal.status) as any}
          />
        </Box>

        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          {proposal.description.substring(0, 150)}
          {proposal.description.length > 150 ? '...' : ''}
        </Typography>

        <Stack spacing={1} sx={{ mb: 2 }}>
          <Box>
            <Typography variant='caption' color='text.secondary'>
              Proposer: {proposal.proposer} ({proposal.proposer_role})
            </Typography>
          </Box>

          <Box>
            <Typography variant='caption' color='text.secondary' display='block'>
              Votes: {totalVotes} / {proposal.required_votes} required
            </Typography>
            <LinearProgress
              variant='determinate'
              value={Math.min(voteProgress, 100)}
              sx={{ mt: 0.5, mb: 0.5 }}
            />
            <Stack direction='row' spacing={1}>
              <Chip
                label={`✓ ${proposal.votes_for}`}
                size='small'
                color='success'
                variant='outlined'
              />
              <Chip
                label={`✗ ${proposal.votes_against}`}
                size='small'
                color='error'
                variant='outlined'
              />
              <Chip label={`⊝ ${proposal.abstentions}`} size='small' variant='outlined' />
            </Stack>
          </Box>

          {proposal.status === 'voting' && daysRemaining >= 0 && (
            <Typography variant='caption' color='text.secondary'>
              ⏰ {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
            </Typography>
          )}
        </Stack>

        <Stack direction='row' spacing={1}>
          <Button variant='outlined' fullWidth onClick={onViewDetails}>
            View Details
          </Button>
          {canVote && proposal.status === 'voting' && (
            <Button variant='contained' fullWidth startIcon={<HowToVote />} onClick={onVote}>
              Vote
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

interface ProposalDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  proposalId: string;
}

export const ProposalDetailsDialog: React.FC<ProposalDetailsDialogProps> = ({
  open,
  onClose,
  proposalId,
}) => {
  const [proposal, setProposal] = useState<any>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && proposalId) {
      fetchProposalDetails();
    }
  }, [open, proposalId]);

  const fetchProposalDetails = async () => {
    setLoading(true);
    try {
      const data = await apiService.getProposalById(proposalId);
      if (data) {
        setProposal(data);
        // ENTERPRISE: DAOProposal doesn't include votesList - fetch separately if needed via getProposalVotes()
        setVotes([]);
      }
    } catch (err) {
      // ENTERPRISE: Type-safe error logging with proper error casting
      // Follows industry best practices for unknown error type handling
      logger.error(
        'Failed to fetch proposal details:',
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      setLoading(false);
    }
  };

  if (!proposal) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{proposal.title}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Typography>Loading...</Typography>
        ) : (
          <>
            <Stack spacing={2}>
              <Box>
                <Typography variant='subtitle2' color='text.secondary'>
                  Description
                </Typography>
                <Typography variant='body1'>{proposal.description}</Typography>
              </Box>

              <Box>
                <Typography variant='subtitle2' color='text.secondary'>
                  Proposer
                </Typography>
                <Typography variant='body1'>
                  {proposal.proposer.name} ({proposal.proposer.role})
                </Typography>
              </Box>

              <Box>
                <Typography variant='subtitle2' color='text.secondary'>
                  Vote Summary
                </Typography>
                <Stack direction='row' spacing={2} sx={{ mt: 1 }}>
                  <Box>
                    <Typography variant='h4' color='success.main'>
                      {proposal.votes.for}
                    </Typography>
                    <Typography variant='caption'>Approve</Typography>
                  </Box>
                  <Box>
                    <Typography variant='h4' color='error.main'>
                      {proposal.votes.against}
                    </Typography>
                    <Typography variant='caption'>Reject</Typography>
                  </Box>
                  <Box>
                    <Typography variant='h4'>{proposal.votes.abstain}</Typography>
                    <Typography variant='caption'>Abstain</Typography>
                  </Box>
                </Stack>
              </Box>

              {votes.length > 0 && (
                <Box>
                  <Typography variant='subtitle2' color='text.secondary' sx={{ mb: 1 }}>
                    Vote History
                  </Typography>
                  <List>
                    {votes.map(vote => (
                      <React.Fragment key={vote.id}>
                        <ListItem>
                          <ListItemText
                            primary={
                              <Box display='flex' alignItems='center' gap={1}>
                                {vote.voter.name}
                                <Chip
                                  label={vote.decision}
                                  size='small'
                                  color={
                                    vote.decision === 'approve'
                                      ? 'success'
                                      : vote.decision === 'reject'
                                        ? 'error'
                                        : 'default'
                                  }
                                />
                              </Box>
                            }
                            secondary={
                              <>
                                {vote.comment && <div>{vote.comment}</div>}
                                <div>
                                  Weight: {vote.weight} •{' '}
                                  {new Date(vote.timestamp).toLocaleString()}
                                </div>
                              </>
                            }
                          />
                        </ListItem>
                        <Divider component='li' />
                      </React.Fragment>
                    ))}
                  </List>
                </Box>
              )}
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
