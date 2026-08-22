# SYNTRAKE - SUPABASE MIGRATION AUTHORITY

## Investing retirement boundary

The pre-Genesis Investing implementation is RETIRED.

Production retirement lineage:

- 20260822125631_teardown_all_investing_runtime
- 20260822140357_remove_capitalized_investing_portfolio_residuals
- 20260822141129_assert_investing_runtime_zero_genesis_boundary
- 20260822143241_drop_retired_investing_defaults
- 20260822143442_remove_retired_investing_from_shared_mode_constraints

VERIFIED GENESIS DATABASE BOUNDARY:
No active Investing rows, defaults, constraints, relations, routines,
schemas, columns, policies, triggers or indexes remain in production.

Any Investing implementation appearing in migrations before this
boundary is HISTORICAL_LINEAGE_ONLY.

It MUST NOT be treated as:

- current architecture
- current database schema
- current API contract
- current authorization model
- current financial model
- current Investing implementation
- template/reference for Investing Genesis

Current database truth must come from:

1. the live Supabase schema,
2. current generated database types,
3. migrations after the Genesis boundary.

Never resurrect pre-Genesis Investing code from historical migrations
unless the owner explicitly requests historical analysis.

Never delete, rename, rewrite, squash or repair migration history
without explicit owner authorization.
