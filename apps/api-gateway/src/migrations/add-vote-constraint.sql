-- Prevent duplicate voting at database level
ALTER TABLE votes ADD CONSTRAINT unique_user_proposal 
UNIQUE (user_id, proposal_id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_votes_user_proposal 
ON votes (user_id, proposal_id);