# Mention search performance notes

## Summary
- Enabled the `pg_trgm` extension and added `GIN` indexes on `lower(users.name)` and `lower(users.email)` to accelerate prefix lookups used by `search_comment_mentions`.
- Normalized the RPC to reuse the lower-cased columns and rely on deterministic `LIKE` patterns so the new functional indexes are always eligible.
- Wired the frontend search utilities to consistently lowercase input before querying Supabase and to cancel in-flight requests when users type quickly.

## Observations
- `EXPLAIN ANALYZE` on `search_comment_mentions` now picks the new GIN indexes for selective prefixes instead of falling back to sequential scans.
- Cancelling superseded RPC calls prevents redundant round-trips while typing and keeps the suggestion list responsive.

## Follow-ups
- Monitor Supabase query stats for regressions and consider collecting telemetry on aborted requests to quantify the UX gain.
