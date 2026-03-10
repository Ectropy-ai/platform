export class DuplicateVoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateVoteError';
  }
}

export async function validateUniqueVote(
  userId: string,
  proposalId: string
): Promise<void> {
  const database = require('../database/connection');
  const existingVote = await database.query(
    'SELECT id FROM votes WHERE user_id = $1 AND proposal_id = $2',
    [userId, proposalId]
  );

  if (existingVote.rows.length > 0) {
    throw new DuplicateVoteError('User has already voted on this proposal');
  }
}
