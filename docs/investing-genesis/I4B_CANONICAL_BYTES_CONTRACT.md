# Syntrake Investing Genesis I4-B Canonical Plan Bytes Contract

Status: I4-B corrected candidate for independent audit.

Parent: 8d45b1f57305f3d9b1e44705915739c6c5796269

This contract closes the I4-A gate:

```text
EXACT_PLAN_CONTENT_CANONICAL_BYTES = MUST_FREEZE_IN_I4_B_BEFORE_IMPLEMENTATION
```

It defines exact bytes for immutable PlanRevision content and exact request-hash
preimages for later I4-C Plan mutations. It does not implement runtime writing,
public APIs, UI, Research Lab, recommendations, execution, Trading, or database
deployment.

## Hash Domains

All hashes are SHA-256 and stored as uppercase 64-character hexadecimal text.

```text
PLAN_REVISION_CONTENT_HASH_DOMAIN =
  SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1

PLAN_MUTATION_REQUEST_HASH_DOMAIN =
  SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1

PLAN_REVISION_CONTENT_HASH != MATERIAL_REQUEST_HASH
```

The content hash domain and material request hash domain are disjoint. A content
hash identifies immutable user-intent content only. A material request hash
identifies one operation-specific mutation request.

## V1 Field Schema

I4-B intentionally uses a smaller truthful V1 schema than the earlier failed
candidate. Fields whose product semantics are not frozen are deferred instead of
invented.

Deferred fields:

```text
RECURRING_CONTRIBUTION = DEFERRED_UNTIL_EXACT_CADENCE_SEMANTICS
LIQUIDITY_NEED = DEFERRED_UNTIL_EXACT_TIME_AND_MEANING_SEMANTICS
ACCOUNT_BASE_CURRENCY_INHERITANCE = FORBIDDEN
```

V1 fields appear in this exact order:

```text
planning_currency_preference
goal_description
target_money
target_date
time_horizon_months
risk_tolerance
excluded_asset_classes
notes
```

All fields participate in `PLAN_REVISION_CONTENT_HASH`.

| Field | Fixed type | Allowed states | Validation |
| --- | --- | --- | --- |
| `planning_currency_preference` | `TOKEN` | all states | If supplied, one of `USD`, `EUR`, `GBP`, `CHF`, `CAD`, `AUD`, `JPY`. This is explicit user planning-currency preference, never implicit account inheritance. |
| `goal_description` | `TEXT` | all states | If supplied, NFC UTF-8 scalar text, 1..4096 bytes after NFC, with no U+0000, C0 controls, or DEL. |
| `target_money` | `MONEY` | all states | If supplied, amount decimal with max 16 integer digits and max 2 fractional digits plus accepted currency. |
| `target_date` | `DATE` | all states | If supplied, actual Gregorian calendar date from `1900-01-01` through `2200-12-31`, encoded `YYYY-MM-DD`. |
| `time_horizon_months` | `INTEGER` | all states | If supplied, canonical integer text `0..1200`. |
| `risk_tolerance` | `TOKEN` | all states | User-declared self-description/preference only, one of `CONSERVATIVE`, `BALANCED`, `GROWTH`, `AGGRESSIVE`. It is not system suitability classification. |
| `excluded_asset_classes` | `TOKEN_SET` | all states | If supplied, explicit user-declared exclusion set. Empty supplied set means explicit none. Elements are unique, max 16, aggregate canonical bytes max 512, each one of `CASH`, `BONDS`, `EQUITIES`, `FUNDS`, `CRYPTO`, `DERIVATIVES`. Elements are ordered by deterministic ASCII/UTF-8 byte lexical order, not database default locale. |
| `notes` | `TEXT` | all states | If supplied, NFC UTF-8 scalar text, 1..8192 bytes after NFC, with no U+0000, C0 controls, or DEL. |

Accepted field states:

```text
SUPPLIED
NOT_SUPPLIED
UNKNOWN
DECLINED
NOT_APPLICABLE
```

For every non-`SUPPLIED` state, any supplied value payload is invalid:

```text
NON_SUPPLIED_STATE_WITH_VALUE = VALIDATION_ERROR
NO_NEW_PLAN_REVISION
```

System validation/evidence availability is not a user-intent state.

## Scalar Text and Controls

Text input must be well-formed Unicode scalar text before NFC normalization.
Lone high surrogates and lone low surrogates are rejected. They must not be
replaced with U+FFFD or allowed to collapse to the same bytes as an explicit
replacement character.

After NFC, text must not contain:

```text
U+0000
U+0001..U+001F
U+007F
```

The forbidden set is exactly those ASCII control scalars. U+0085, U+009F, and
ordinary non-ASCII scalar text remain valid when the input is well formed,
NFC-normalized, and within the field byte bound.

This keeps canonical text compatible with PostgreSQL `text` conversion and
prevents control characters from smuggling record boundaries into line-oriented
audit/debug views. Free-text case and ordinary spaces remain meaningful.

## Decimal and Money

Canonical decimal input regex:

```text
^(0|[1-9][0-9]*)(\.[0-9]+)?$
```

Canonical decimal output:

- no sign in V1 Plan money fields;
- no exponent notation;
- no locale separators;
- no whitespace;
- no leading zero except `0`;
- trailing fractional zeroes removed;
- decimal point removed when fractional part becomes empty;
- max 16 integer digits;
- max 2 fractional digits after canonicalization;
- no JavaScript `number` authority.

Supplied money bytes are exactly:

```text
amount=<canonical decimal>\n
currency=<accepted currency token>
```

Amount without currency, currency without amount, nonaccepted currency, excess
precision, or excess scale is:

```text
VALIDATION_ERROR
NO_NEW_PLAN_REVISION
NO_PARTIAL_SUPPLIED_MONEY_STATE
```

## Dates and Instants

Date-only values are actual Gregorian dates encoded exactly `YYYY-MM-DD`.
Invalid dates such as `2027-02-29` and dates outside `1900-01-01..2200-12-31`
are rejected. Date-only intent never becomes an instant.

I4-B does not include an instant field in V1 content. If a future schema adds an
instant, it must freeze exact accepted input offsets and UTC RFC3339 millisecond
output before persistence.

## Canonical Content Bytes

Canonical content bytes are UTF-8 bytes for this exact envelope:

```text
SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\n
content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\n
field_count=8\n
<field-record-1>
...
<field-record-8>
```

Each field record is:

```text
field=<field_name>\n
state=<STATE>\n
type=<FIXED_TYPE>\n
value_length=<decimal UTF-8 byte length>\n
<value bytes>\n
end_field\n
```

For non-`SUPPLIED` states, value bytes are empty and `value_length=0`. The total
canonical content byte length must be greater than zero and at most 32768 bytes.

There is no stable JSON shortcut. The database persistence stores canonical
bytes and validates their exact V1 grammar; it does not store redundant mutable
JSON content that can diverge from the bytes.

## Content Hash Preimage

`PLAN_REVISION_CONTENT_HASH` preimage is exactly:

```text
utf8("SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1")
0x00
canonical_plan_content_bytes
```

Excluded:

- `idempotency_key`;
- `correlation_id`;
- `recorded_at`;
- generated `plan_root_id`;
- generated `plan_revision_id`;
- active pointer state;
- audit event ids;
- retry metadata.

## Material Request Hashes

Every material request preimage is UTF-8 fragments joined by one NUL byte
(`0x00`). UUIDs are lowercase canonical PostgreSQL UUID text. Integers are
canonical base-10 text with no sign, leading zero, decimal point, or exponent.
Hashes are uppercase hex.

Canonical PostgreSQL UUID text is exactly:

```text
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

I4-B does not add a UUID version policy beyond PostgreSQL UUID textual
canonicalization.

`PLAN_INITIALIZE_V1` fragments:

```text
SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1
PLAN_INITIALIZE_V1
tenant=<tenant_id>
account=<account_id>
principal=<principal_id>
content=<PLAN_REVISION_CONTENT_HASH>
activation=CREATE_ROOT_CREATE_INITIAL_REVISION_ACTIVATE
```

Generated result ids, idempotency key, correlation id, `recorded_at`, and retry
metadata are excluded.

`PLAN_CREATE_AND_ACTIVATE_REVISION_V1` fragments:

```text
SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1
PLAN_CREATE_AND_ACTIVATE_REVISION_V1
tenant=<tenant_id>
account=<account_id>
principal=<principal_id>
plan_root=<plan_root_id>
expected_active_revision=<plan_revision_id>
expected_active_version=<integer>
content=<PLAN_REVISION_CONTENT_HASH>
activation=CREATE_REVISION_AND_ACTIVATE_ATOMICALLY
```

This hash changes when `plan_root_id`, expected active revision, expected active
version, content hash, Principal, or operation identity changes. It does not
change when generated new revision ids, idempotency key, correlation id, or
`recorded_at` change.

## Golden Vectors

Base fixture:

```text
planning_currency_preference = SUPPLIED TOKEN USD
goal_description = SUPPLIED TEXT Retire at 55
target_money = SUPPLIED MONEY amount=1000000 currency=USD
target_date = SUPPLIED DATE 2045-12-31
time_horizon_months = SUPPLIED INTEGER 240
risk_tolerance = UNKNOWN TOKEN
excluded_asset_classes = SUPPLIED TOKEN_SET CRYPTO,DERIVATIVES
notes = NOT_APPLICABLE TEXT
```

Pinned hashes:

| Vector | Canonical content hash |
| --- | --- |
| base | `85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6` |
| decimal equivalent `1000000.0` | `85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6` |
| risk `DECLINED` | `BDC0BA730310245C39FB71D16F81148E48BA6AB5D8CBB0AB8F859677C8C71F32` |
| risk `NOT_SUPPLIED` | `063D41325DEB9CC54D786162B4962508FD9C7B09D0B9DCEEB16109F02F8B09AB` |
| free-text case changed | `B9786F9478C50D43DBA6166225C0123DAE9EA4ADEA615228BE2C271F49BE42D8` |
| free-text spacing changed | `B76A21743BD95E3E83DEEC99B51C7DB444BA4209DC3020C53BB5713CD770F4C2` |
| NFC-equivalent Unicode | `D5CA14174AE928554596EABD1AD03B191CEF6707714D411D61A5C084E59B7647` |
| unordered set reordered | `85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6` |
| explicit empty exclusion set | `E8CAAB8172D3A88366D65DAE967F6C8DA1CC66E12D5FBBBA2C1C4E0C6745EEBD` |
| changed target date | `AC94498B4E7625D463ECEB029FEE74ABB218A6AC93011C78515983C1685BEF30` |

Base `PLAN_INITIALIZE_V1` material request hash:

```text
51A407FA13E14311E269EED8B763B357CD5770E3BD0251C65B3C20B1D23F083A
```

Base `PLAN_CREATE_AND_ACTIVATE_REVISION_V1` material request hash:

```text
7ED3DBF335B52E4AEEDB1811635FD4635C39F6B9277B863CAA4440C85DA7506E
```

Create-and-activate adversarial vectors:

```text
plan_root_id changed:
B6758807567D8C01A536D290587AFF5719C772DA0677704AD6D71D9F62A2B431

expected_active_revision changed:
554C74FF3C7236911C412502F78658A137AFFAE416F9444C28E6B7506754B410

expected_active_version changed:
15B6095E1FFBCEBF9D452C783F3AE559CBD719DA5873635AD08997091672A193

principal changed:
92A5D24580F0A52C32C6373D90F96C57BEE46C002587D423C2F0CCA52D4A4F88
```
