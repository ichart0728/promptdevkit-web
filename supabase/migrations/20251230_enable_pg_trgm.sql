-- Enable pg_trgm for fuzzy and prefix search optimizations
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Support case-insensitive prefix search on user name and email
CREATE INDEX IF NOT EXISTS users_name_trgm_idx
    ON public.users USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_email_trgm_idx
    ON public.users USING gin (lower(email) gin_trgm_ops);

-- Refresh planner statistics so the new indexes are considered immediately
ANALYZE public.users;
