import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Box,
  LinearProgress,
  Stack,
  IconButton,
  Avatar,
} from '@mui/material';
import { HowToVote, AccessTime, People, CheckCircle, Schedule, Warning } from '@mui/icons-material';

/**
 * Proposal interface for governance voting
 * ENTERPRISE PATTERN: stakeholderWeights aligned with Prisma StakeholderRole enum
 * @see prisma/schema.prisma - StakeholderRole enum
 */
interface Proposal {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'voting' | 'passed' | 'rejected';
  proposer: string;
  createdAt: string;
  votingEndsAt: string;
  votesFor: number;
  votesAgainst: number;
  totalVotes: number;
  requiredThreshold: number;
  stakeholderWeights: {
    owner: number;
    architect: number;
    contractor: number;
    engineer: number;
    consultant?: number;
    inspector?: number;
    site_manager?: number;
    admin?: number;
  };
}

interface ProposalCardProps {
  proposal: Proposal;
  currentUserRole?: string;
  userHasVoted?: boolean;
  onVote?: (proposalId: string, vote: 'for' | 'against') => void;
  onViewDetails?: (proposalId: string) => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  currentUserRole,
  userHasVoted = false,
  onVote,
  onViewDetails,
}) => {
  const votePercentage =
    proposal.totalVotes > 0 ? (proposal.votesFor / proposal.totalVotes) * 100 : 0;

  const isVotingActive = proposal.status === 'voting';
  const timeRemaining = new Date(proposal.votingEndsAt).getTime() - Date.now();
  const hoursRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60)));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'success';
      case 'rejected':
        return 'error';
      case 'voting':
        return 'warning';
      case 'draft':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle />;
      case 'rejected':
        return <Warning />;
      case 'voting':
        return <HowToVote />;
      case 'draft':
        return <Schedule />;
      default:
        return <Schedule />;
    }
  };

  return (
    <Card sx={{ mb: 2, border: isVotingActive ? '2px solid #ff9800' : '1px solid #e0e0e0' }}>
      <CardContent>
        {/* Header */}
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant='h6' sx={{ mb: 1 }}>
              {proposal.title}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
              {proposal.description}
            </Typography>
          </Box>
          <Chip
            icon={getStatusIcon(proposal.status)}
            label={proposal.status.toUpperCase()}
            color={getStatusColor(proposal.status) as any}
            sx={{ ml: 2 }}
          />
        </Box>

        {/* Proposal Details */}
        <Box sx={{ mb: 2 }}>
          <Stack direction='row' spacing={2} sx={{ mb: 1 }}>
            <Typography variant='body2' color='text.secondary'>
              <People sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
              Proposer: {proposal.proposer}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              <AccessTime sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
              Created: {new Date(proposal.createdAt).toLocaleDateString()}
            </Typography>
          </Stack>

          {isVotingActive && (
            <Typography variant='body2' color='warning.main'>
              <Schedule sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
              Voting ends in {hoursRemaining} hours
            </Typography>
          )}
        </Box>

        {/* Voting Progress */}
        {(proposal.status === 'voting' ||
          proposal.status === 'passed' ||
          proposal.status === 'rejected') && (
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
            >
              <Typography variant='body2'>
                Votes: {proposal.votesFor} for, {proposal.votesAgainst} against
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {votePercentage.toFixed(1)}% approval
              </Typography>
            </Box>
            <LinearProgress
              variant='determinate'
              value={votePercentage}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: '#ffcdd2',
                '& .MuiLinearProgress-bar': {
                  backgroundColor:
                    votePercentage >= proposal.requiredThreshold ? '#4caf50' : '#ff9800',
                },
              }}
            />
            <Typography variant='caption' color='text.secondary' sx={{ mt: 0.5, display: 'block' }}>
              Required threshold: {proposal.requiredThreshold}%
            </Typography>
          </Box>
        )}

        {/* Stakeholder Weights */}
        <Box sx={{ mb: 2 }}>
          <Typography variant='subtitle2' sx={{ mb: 1 }}>
            Voting Weights:
          </Typography>
          <Stack direction='row' spacing={1} flexWrap='wrap'>
            {Object.entries(proposal.stakeholderWeights).map(([role, weight]) => (
              <Chip
                key={role}
                label={`${role}: ${weight}%`}
                size='small'
                variant={currentUserRole === role ? 'filled' : 'outlined'}
                color={currentUserRole === role ? 'primary' : 'default'}
              />
            ))}
          </Stack>
        </Box>

        {/* Action Buttons */}
        <Stack direction='row' spacing={1}>
          {isVotingActive && currentUserRole && !userHasVoted && onVote && (
            <>
              <Button
                variant='contained'
                color='success'
                size='small'
                onClick={() => onVote(proposal.id, 'for')}
                startIcon={<CheckCircle />}
              >
                Vote For
              </Button>
              <Button
                variant='outlined'
                color='error'
                size='small'
                onClick={() => onVote(proposal.id, 'against')}
                startIcon={<Warning />}
              >
                Vote Against
              </Button>
            </>
          )}

          {userHasVoted && (
            <Chip label='You have voted' color='info' size='small' icon={<CheckCircle />} />
          )}

          <Button variant='text' size='small' onClick={() => onViewDetails?.(proposal.id)}>
            View Details
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ProposalCard;
