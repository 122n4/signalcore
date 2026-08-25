# Genesis Baseline Boundary

This directory stores the accepted I1 Genesis database baseline artifact.

NEW DB / I2+:
Genesis baseline + migrations post-Genesis.

EXISTING PRODUCTION:
historical migration lineage real + explicit transition migrations.

The Genesis baseline MUST NOT be presented as a migration historically executed in Production.

The Production ACL transition migration remains separate:

- `supabase/migrations/20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql`

Do not apply that transition migration as part of a fresh Genesis baseline replay unless a future owner-approved plan explicitly changes the migration strategy.
