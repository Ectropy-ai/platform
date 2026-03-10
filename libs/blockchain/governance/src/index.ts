/**
 * Governance utilities for the Ectropy DAO.
 * Implements a minimal in-memory proposal and voting mechanism.
 */

import crypto from 'crypto';

// Polyfill for randomUUID if not available
const randomUUID = (() => {
  if (typeof require !== 'undefined') {
    try {
      if (crypto.randomUUID) {
        return crypto.randomUUID;
      }
    } catch (e) {
      // alternative if crypto module is not available
    }
  }
  // alternative UUID v4 generator
  return () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  };
})();

/** Proposal structure stored in memory */
export interface Proposal {
  id: string;
  description: string;
  votesFor: number;
  votesAgainst: number;
  closed: boolean;
}
const proposals = new Map<string, Proposal>();

/**
 * Submit a new proposal to the DAO.
 * Returns the created proposal object.
 */
export function createProposal(description: string): Proposal {
  const proposal: Proposal = {
    id: randomUUID(),
    description,
    votesFor: 0,
    votesAgainst: 0,
    closed: false,
  };
  proposals.set(proposal.id, proposal);
  return proposal;
}

/**
 * Cast a vote on an existing proposal. No-op if the proposal
 * does not exist or has been closed.
 */
export function vote(proposalId: string, support: boolean): void {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.closed) {
    return;
  }

  if (support) {
    proposal.votesFor += 1;
  } else {
    proposal.votesAgainst += 1;
  }
}

/**
 * Retrieve a proposal and its vote counts.
 */
export function getProposal(proposalId: string): Proposal | undefined {
  return proposals.get(proposalId);
}

/**
 * Close a proposal, preventing additional votes.
 */
export function closeProposal(proposalId: string): void {
  const proposal = proposals.get(proposalId);
  if (proposal) {
    proposal.closed = true;
  }
}
