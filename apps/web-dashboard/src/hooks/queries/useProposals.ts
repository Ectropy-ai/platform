/**
 * useProposals - Shared hook for DAO governance data
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides centralized governance data fetching with:
 * - Proposal listing and filtering
 * - Voting functionality
 * - Template management
 * - Optimistic updates for votes
 *
 * @example
 * ```tsx
 * function GovernancePanel() {
 *   const { proposals, isLoading } = useProposals();
 *   const { mutate: vote } = useVoteOnProposal();
 *
 *   const handleVote = (proposalId: string, support: boolean) => {
 *     vote({ proposalId, support });
 *   };
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, type DAOProposal, type DAOVote, type DAOTemplate } from '../../services/api';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';

// Re-export API types for consumer convenience
export type { DAOProposal, DAOVote, DAOTemplate };

export interface UseProposalsOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Filter by status */
  status?: string;
  /** Filter by project */
  projectId?: string;
}

export interface UseProposalsReturn {
  /** List of proposals */
  proposals: DAOProposal[];
  /** Loading state */
  isLoading: boolean;
  /** Fetching state (background refetch) */
  isFetching: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

export interface CreateProposalInput {
  title: string;
  description: string;
  projectId?: string;
  templateId?: string;
  votingPeriodDays?: number;
}

export interface VoteInput {
  proposalId: string;
  decision: 'for' | 'against' | 'abstain';
  comment?: string;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchProposals(filters?: {
  status?: string;
  projectId?: string;
}): Promise<DAOProposal[]> {
  logger.debug('Fetching proposals', { filters });
  const proposals = await apiService.getDAOProposals();

  // Apply filters
  let filtered = proposals;
  if (filters?.status) {
    filtered = filtered.filter(p => p.status === filters.status);
  }
  // Note: API DAOProposal doesn't have projectId field, so skip this filter

  logger.debug('Fetched proposals', { count: filtered.length });
  return filtered;
}

async function fetchProposal(id: string): Promise<DAOProposal | null> {
  logger.debug('Fetching proposal', { id });
  const proposals = await apiService.getDAOProposals();
  const proposal = proposals.find(p => p.id === id) || null;
  return proposal;
}

async function fetchProposalVotes(proposalId: string): Promise<DAOVote[]> {
  logger.debug('Fetching proposal votes', { proposalId });
  const votes = await apiService.getProposalVotes(proposalId);
  return votes;
}

async function fetchTemplates(): Promise<DAOTemplate[]> {
  logger.debug('Fetching DAO templates');
  const templates = await apiService.getDAOTemplates();
  return templates;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching all proposals
 */
export function useProposals(options: UseProposalsOptions = {}): UseProposalsReturn {
  const { enabled = true, staleTime, status, projectId } = options;

  const filters = { status, projectId };
  const hasFilters = status || projectId;

  const query = useQuery({
    queryKey: hasFilters ? queryKeys.proposals.list(filters) : queryKeys.proposals.all,
    queryFn: () => fetchProposals(hasFilters ? filters : undefined),
    enabled,
    staleTime,
  });

  return {
    proposals: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching a single proposal
 */
export function useProposal(
  id: string | undefined,
  options: Omit<UseProposalsOptions, 'status' | 'projectId'> = {},
) {
  const { enabled = true, staleTime } = options;

  const query = useQuery({
    queryKey: queryKeys.proposals.detail(id || ''),
    queryFn: () => fetchProposal(id!),
    enabled: enabled && !!id,
    staleTime,
  });

  return {
    proposal: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching votes on a proposal
 */
export function useProposalVotes(
  proposalId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.proposals.votes(proposalId || ''),
    queryFn: () => fetchProposalVotes(proposalId!),
    enabled: enabled && !!proposalId,
  });

  return {
    votes: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching DAO templates
 */
export function useDAOTemplates(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.governance.templates,
    queryFn: fetchTemplates,
    enabled,
    staleTime: 10 * 60 * 1000, // Templates change infrequently
  });

  return {
    templates: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Hook for creating a proposal
 */
export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['createProposal'],
    mutationFn: async (input: CreateProposalInput): Promise<DAOProposal> => {
      logger.info('Creating proposal', { title: input.title });
      const proposal = await apiService.createDAOProposal({
        title: input.title,
        description: input.description,
        proposer_role: 'architect', // TODO: Get from auth context
        voting_period_days: input.votingPeriodDays ?? 7,
        required_votes: 5,
      });
      return proposal;
    },
    onSuccess: newProposal => {
      // Add to proposals cache
      queryClient.setQueryData<DAOProposal[]>(queryKeys.proposals.all, old =>
        old ? [newProposal, ...old] : [newProposal],
      );
      logger.info('Proposal created', { id: newProposal.id });
    },
    onError: error => {
      logger.error('Failed to create proposal', { error });
    },
    onSettled: () => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
    },
  });
}

/**
 * Hook for voting on a proposal
 */
export function useVoteOnProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['voteOnProposal'],
    mutationFn: async (input: VoteInput): Promise<DAOVote> => {
      logger.info('Voting on proposal', { proposalId: input.proposalId, decision: input.decision });
      const result = await apiService.voteOnProposal(
        input.proposalId,
        input.decision,
        input.comment,
      );
      return result;
    },
    onMutate: async input => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.proposals.all });

      // Snapshot previous value
      const previousProposals = queryClient.getQueryData<DAOProposal[]>(queryKeys.proposals.all);

      // Optimistically update vote count
      if (previousProposals) {
        queryClient.setQueryData<DAOProposal[]>(
          queryKeys.proposals.all,
          previousProposals.map(p => {
            if (p.id === input.proposalId) {
              const voteIncrement = input.decision === 'for' ? 1 : 0;
              const againstIncrement = input.decision === 'against' ? 1 : 0;
              const abstainIncrement = input.decision === 'abstain' ? 1 : 0;
              return {
                ...p,
                votes_for: p.votes_for + voteIncrement,
                votes_against: p.votes_against + againstIncrement,
                abstentions: p.abstentions + abstainIncrement,
              };
            }
            return p;
          }),
        );
      }

      return { previousProposals };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousProposals) {
        queryClient.setQueryData(queryKeys.proposals.all, context.previousProposals);
      }
      logger.error('Failed to vote', { error, proposalId: variables.proposalId });
    },
    onSettled: (data, error, variables) => {
      // Refetch proposal and votes to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.proposals.votes(variables.proposalId),
      });
    },
  });
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Hook for getting active (voting) proposals
 */
export function useActiveProposals(options: Omit<UseProposalsOptions, 'status'> = {}) {
  return useProposals({ ...options, status: 'voting' });
}

/**
 * Hook for checking if user has voted on a proposal
 */
export function useHasVoted(proposalId: string | undefined, voterId: string | undefined) {
  const { votes, isLoading } = useProposalVotes(proposalId, {
    enabled: !!proposalId && !!voterId,
  });

  const hasVoted = votes.some(v => v.voter === voterId);
  const userVote = votes.find(v => v.voter === voterId);

  return {
    hasVoted,
    userVote,
    isLoading,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useProposals;
