# SYNTRAKE - CANONICAL BUILD RULES

## Investing Genesis

The old Investing implementation has been retired.

Pre-Genesis Investing source, contracts and architecture are prohibited
as implementation references.

Supabase migrations before the verified retirement boundary are
HISTORICAL_LINEAGE_ONLY.

Investing Genesis must be designed from current requirements,
current live schema truth and explicitly accepted new contracts.

Never infer current behavior from deleted Investing code or historical
migrations.

Trading and Investing must remain isolated.

Missing financial truth must never become zero/default/estimated truth
unless explicitly classified.

Authenticated identity is not ownership.
service_role is capability, not authorization.

No production deploy, destructive database action, migration history
rewrite, merge or push without explicit owner authorization.
