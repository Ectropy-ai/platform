-- Migration 002: Enhanced waitlist functionality
-- Add additional features for waitlist management

-- Add metadata columns to waitlist table
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- Create view for waitlist analytics
CREATE OR REPLACE VIEW waitlist_stats AS
SELECT 
    COUNT(*) as total_signups,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as signups_last_24h,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as signups_last_week,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as signups_last_month,
    COUNT(DISTINCT source) as unique_sources
FROM waitlist;