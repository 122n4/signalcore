# I5 Research Executable Field Semantics V1

Status: CANDIDATE DESIGN CONTRACT - NOT CURRENT_ACCEPTED

Classification: DESIGN CANDIDATE / NOT CURRENT_ACCEPTED

Permanent A-number: NOT ASSIGNED

This contract freezes candidate executable methodology for the first I5 Research
Lab historical execution profile. Accepted A5 Research IR field identifiers are
vocabulary handles; this document defines the candidate executable semantics.
It does not activate Result hashing and does not implement the engine.

## Field Set V1

The V1 executable field set is:

```text
ADJUSTED_CLOSE
OBSERVATION_DATE
VOLUME
TOTAL_RETURN
MOMENTUM_12M
```

## ADJUSTED_CLOSE

`ADJUSTED_CLOSE` is a direct admitted dataset observation.

Requirements:

- positive canonical decimal;
- currency from DatasetSeries;
- observation date belongs to the declared calendar;
- no implicit interpolation;
- no future lookup.

## OBSERVATION_DATE

`OBSERVATION_DATE` is the direct canonical session date. It has no wall-clock
interpretation.

## VOLUME

`VOLUME` is a direct admitted integer dataset observation when present. There is
no synthetic volume.

## TOTAL_RETURN

`TOTAL_RETURN` is defined exactly as:

```text
previous_session(t)
=
the immediately preceding eligible session in XNYS_TRADING_CALENDAR_V1

TOTAL_RETURN(t)
=
ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(previous_session(t)) - 1
```

Rules:

- use only observations available at or before `t`;
- `previous_session(t) < t`;
- the exact immediately preceding eligible calendar session is resolved from
  `XNYS_TRADING_CALENDAR_V1`;
- the exact `ADJUSTED_CLOSE` observation for `previous_session(t)` must exist;
- if that exact observation is missing, `TOTAL_RETURN(t) = MISSING`;
- do not search farther backward;
- do not bridge the gap;
- do not substitute the previous available observation;
- no forward fill from the future;
- the first eligible session for which no prior required calendar observation
  is available has missing `TOTAL_RETURN`;
- missing required source observation yields missing result;
- computation uses deterministic decimal arithmetic, never JS binary floating
  point.

## MOMENTUM_12M

`MOMENTUM_12M` is calendar-12-month adjusted-close momentum:

```text
MOMENTUM_12M(t)
=
ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(anchor(t)) - 1
```

where:

```text
anchor_target_date = t minus 12 calendar months
```

Date subtraction rules:

- calendar arithmetic;
- preserve day when possible;
- clamp to final valid day of target month when required, including leap-day
  handling.

Then:

```text
anchor(t)
= latest eligible session on or before anchor_target_date
```

under the DatasetSeries declared calendar.

Requirements:

- `anchor(t) < t`;
- anchor must be an admitted eligible calendar session;
- the observation for the exact resolved anchor session must exist;
- if that exact resolved anchor observation does not exist, `MOMENTUM_12M` is
  missing;
- do not skip arbitrarily farther backwards looking for any available price;
- no future observation may be used.

`MOMENTUM_12M != 12-1 momentum`.

If a future 12-1 methodology is required, it receives a different field
ID/version.

## Missingness

Field missingness used for signal evaluation is not accounting truth.
`MISSING_DATA_EXCLUDE_V1` removes an unheld candidate instrument from the current
evaluation when a required signal field is missing. Missing execution or
valuation price for an instrument that must be executed or valued fails closed
under the engine contract.

## Numeric Semantics

All executable field arithmetic uses the deterministic decimal model frozen in
`I5_RESEARCH_EXECUTION_ENGINE_CONTRACT_V1.md`. It must not use JavaScript
`number` for scientific truth.
