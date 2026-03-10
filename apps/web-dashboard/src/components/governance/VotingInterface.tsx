import React, { useState, ReactElement } from 'react';
import { logger } from '../../services/logger';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  TextField,
  Chip,
  LinearProgress,
  Avatar,
  Divider,
  Alert,
} from '@mui/material';
import {
  ThumbUp,
  ThumbDown,
  RemoveCircleOutline,
  Schedule,
  Person,
  Description,
} from '@mui/icons-material';
import { Proposal, Vote, User } from '../../types/stakeholders';

interface VotingInterfaceProps {
  proposal: Proposal;
  currentUser: User;
  onVote: (
    proposalId: string,
    decision: 'approve' | 'reject' | 'abstain',
    comment?: string,
  ) => void;
  onWithdrawVote?: (proposalId: string) => void;
}

const VotingInterface: React.FC<VotingInterfaceProps> = ({
  proposal,
  currentUser,
  onVote,
  onWithdrawVote,
}) => {
  const [selectedVote, setSelectedVote] = useState<'approve' | 'reject' | 'abstain'>('approve');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if current user has already voted
  const existingVote = proposal.votes.find(vote => vote.voter.id === currentUser.id);
  const hasVoted = !!existingVote;

  // Calculate voting statistics
  const approveVotes = proposal.votes.filter(v => v.decision === 'approve').length;
  const rejectVotes = proposal.votes.filter(v => v.decision === 'reject').length;
  const abstainVotes = proposal.votes.filter(v => v.decision === 'abstain').length;
  const totalVotes = proposal.votes.length;
  const approvePercentage = totalVotes > 0 ? (approveVotes / totalVotes) * 100 : 0;
  const rejectPercentage = totalVotes > 0 ? (rejectVotes / totalVotes) * 100 : 0;

  // Check if voting is still open
  const isVotingOpen = new Date(proposal.deadline) > new Date() && proposal.status === 'active';
  const daysLeft = Math.ceil(
    (new Date(proposal.deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24),
  );

  const handleSubmitVote = async () => {
    if (!isVotingOpen || hasVoted) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onVote(proposal.id, selectedVote, comment.trim() || undefined);
      setComment('');
    } catch (error) {
      logger.error('Failed to submit vote:', { error });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawVote = async () => {
    if (!onWithdrawVote || !hasVoted) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onWithdrawVote(proposal.id);
    } catch (error) {
      logger.error('Failed to withdraw vote:', { error });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVoteIcon = (decision: string): ReactElement | undefined => {
    switch (decision) {
      case 'approve':
        return <ThumbUp fontSize='small' />;
      case 'reject':
        return <ThumbDown fontSize='small' />;
      case 'abstain':
        return <RemoveCircleOutline fontSize='small' />;
      default:
        return undefined;
    }
  };

  const getVoteColor = (decision: string) => {
    switch (decision) {
      case 'approve':
        return 'success';
      case 'reject':
        return 'error';
      case 'abstain':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 2 }}>
      <Stack spacing={3}>
        {/* Proposal Header */}
        <Box>
          <Typography variant='h6' gutterBottom>
            {proposal.title}
          </Typography>
          <Stack direction='row' spacing={2} alignItems='center' mb={2}>
            <Chip
              icon={<Schedule />}
              label={`${daysLeft} days left`}
              color={daysLeft <= 3 ? 'error' : daysLeft <= 7 ? 'warning' : 'default'}
              size='small'
            />
            <Chip
              icon={<Person />}
              label={`${totalVotes}/${proposal.requiredVotes} votes`}
              color={totalVotes >= proposal.requiredVotes ? 'success' : 'default'}
              size='small'
            />
            <Chip label={proposal.proposalType.replace('_', ' ')} variant='outlined' size='small' />
          </Stack>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            {proposal.description}
          </Typography>
        </Box>

        {/* Voting Progress */}
        <Box>
          <Typography variant='subtitle2' gutterBottom>
            Current Results
          </Typography>
          <Stack spacing={1}>
            <Box>
              <Stack direction='row' justifyContent='space-between' alignItems='center'>
                <Stack direction='row' alignItems='center' spacing={1}>
                  <ThumbUp fontSize='small' color='success' />
                  <Typography variant='body2'>Approve</Typography>
                </Stack>
                <Typography variant='body2'>
                  {approveVotes} ({approvePercentage.toFixed(1)}%)
                </Typography>
              </Stack>
              <LinearProgress
                variant='determinate'
                value={approvePercentage}
                color='success'
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Box>
              <Stack direction='row' justifyContent='space-between' alignItems='center'>
                <Stack direction='row' alignItems='center' spacing={1}>
                  <ThumbDown fontSize='small' color='error' />
                  <Typography variant='body2'>Reject</Typography>
                </Stack>
                <Typography variant='body2'>
                  {rejectVotes} ({rejectPercentage.toFixed(1)}%)
                </Typography>
              </Stack>
              <LinearProgress
                variant='determinate'
                value={rejectPercentage}
                color='error'
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            {abstainVotes > 0 && (
              <Box>
                <Stack direction='row' justifyContent='space-between' alignItems='center'>
                  <Stack direction='row' alignItems='center' spacing={1}>
                    <RemoveCircleOutline fontSize='small' />
                    <Typography variant='body2'>Abstain</Typography>
                  </Stack>
                  <Typography variant='body2'>{abstainVotes}</Typography>
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>

        <Divider />

        {/* Voting Interface */}
        {!isVotingOpen && <Alert severity='info'>Voting for this proposal has ended.</Alert>}

        {hasVoted ? (
          <Box>
            <Alert severity='success' sx={{ mb: 2 }}>
              You have already voted on this proposal.
            </Alert>
            <Paper variant='outlined' sx={{ p: 2 }}>
              <Stack direction='row' alignItems='center' spacing={2}>
                <Chip
                  icon={getVoteIcon(existingVote.decision)}
                  label={
                    existingVote.decision.charAt(0).toUpperCase() + existingVote.decision.slice(1)
                  }
                  color={getVoteColor(existingVote.decision) as any}
                />
                <Typography variant='body2' flex={1}>
                  {existingVote.comment || 'No comment provided'}
                </Typography>
                {isVotingOpen && onWithdrawVote && (
                  <Button
                    size='small'
                    variant='outlined'
                    onClick={handleWithdrawVote}
                    disabled={isSubmitting}
                  >
                    Withdraw Vote
                  </Button>
                )}
              </Stack>
            </Paper>
          </Box>
        ) : isVotingOpen ? (
          <Box>
            <Typography variant='subtitle2' gutterBottom>
              Cast Your Vote
            </Typography>
            <FormControl component='fieldset' sx={{ mb: 2 }}>
              <RadioGroup
                value={selectedVote}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSelectedVote(e.target.value as any)
                }
              >
                <FormControlLabel
                  value='approve'
                  control={<Radio />}
                  label={
                    <Stack direction='row' alignItems='center' spacing={1}>
                      <ThumbUp fontSize='small' color='success' />
                      <Typography>Approve this proposal</Typography>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value='reject'
                  control={<Radio />}
                  label={
                    <Stack direction='row' alignItems='center' spacing={1}>
                      <ThumbDown fontSize='small' color='error' />
                      <Typography>Reject this proposal</Typography>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value='abstain'
                  control={<Radio />}
                  label={
                    <Stack direction='row' alignItems='center' spacing={1}>
                      <RemoveCircleOutline fontSize='small' />
                      <Typography>Abstain from voting</Typography>
                    </Stack>
                  }
                />
              </RadioGroup>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder='Add a comment to explain your vote (optional)'
              value={comment}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComment(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <Description sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />

            <Button
              variant='contained'
              onClick={handleSubmitVote}
              disabled={isSubmitting}
              startIcon={getVoteIcon(selectedVote)}
              color={
                selectedVote === 'approve'
                  ? 'success'
                  : selectedVote === 'reject'
                    ? 'error'
                    : 'primary'
              }
            >
              {isSubmitting
                ? 'Submitting...'
                : `${selectedVote.charAt(0).toUpperCase() + selectedVote.slice(1)} Proposal`}
            </Button>
          </Box>
        ) : null}

        {/* Recent Votes */}
        {proposal.votes.length > 0 && (
          <Box>
            <Typography variant='subtitle2' gutterBottom>
              Recent Votes
            </Typography>
            <Stack spacing={1}>
              {proposal.votes
                .slice(-5)
                .reverse()
                .map(vote => (
                  <Paper key={vote.id} variant='outlined' sx={{ p: 2 }}>
                    <Stack direction='row' alignItems='center' spacing={2}>
                      <Avatar sx={{ width: 32, height: 32 }}>{vote.voter.name.charAt(0)}</Avatar>
                      <Box flex={1}>
                        <Stack direction='row' alignItems='center' spacing={1}>
                          <Typography variant='body2' fontWeight='medium'>
                            {vote.voter.name}
                          </Typography>
                          <Chip
                            size='small'
                            icon={getVoteIcon(vote.decision)}
                            label={vote.decision}
                            color={getVoteColor(vote.decision) as any}
                          />
                        </Stack>
                        {vote.comment && (
                          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                            {vote.comment}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant='caption' color='text.secondary'>
                        {new Date(vote.timestamp).toLocaleDateString()}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  );
};

export default VotingInterface;
