import { createHash, randomUUID } from "node:crypto";
import {
  isAuthorizedInvestingContext,
  type AuthorizedInvestingContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityQueryResult,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase, readInvestingDatabaseConfig } from "../authority/transport";

const operation = "I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1";
const capability = "I3_ACCOUNTING_WRITE";
const source = "SYNTHETIC_I3_REHEARSAL";
const valueOrigin = "SIMULATED";
const freshness = "NOT_APPLICABLE";
const accountingContext = "DEMO";
const materialHashDomain = "SYNTRAKE_INVESTING_I3_FILL_MATERIAL_V1";
const eventSetHashDomain = "SYNTRAKE_INVESTING_I3_FIFO_EVENT_SET_V1";
const maxBigintText = "9223372036854775807";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quantityPattern = /^(?:[1-9][0-9]{0,19}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$/;
const positiveMoneyPattern = /^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$/;
const nonnegativeMoneyPattern = /^(?:0|[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$/;
const sourceSequencePattern = /^(?:0|[1-9][0-9]{0,18})$/;
const canonicalUtcInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const transactionContextKeys = [
  "syntrake.investing.actor_kind",
  "syntrake.investing.actor_id",
  "syntrake.investing.external_provider",
  "syntrake.investing.external_subject",
  "syntrake.investing.principal_id",
  "syntrake.investing.tenant_id",
  "syntrake.investing.account_id",
  "syntrake.investing.tenant_membership_id",
  "syntrake.investing.account_access_id",
  "syntrake.investing.operation",
  "syntrake.investing.capability",
  "syntrake.investing.correlation_id",
  "syntrake.investing.idempotency_key",
  "syntrake.investing.idempotency_record_id",
  "syntrake.investing.material_request_hash",
  "syntrake.investing.instrument_id",
  "syntrake.investing.fill_id",
  "syntrake.investing.fill_side",
  "syntrake.investing.quantity",
  "syntrake.investing.unit_price",
  "syntrake.investing.gross_consideration",
  "syntrake.investing.fee_amount",
  "syntrake.investing.settlement_currency",
  "syntrake.investing.effective_at",
  "syntrake.investing.source_sequence",
  "syntrake.investing.source_reference",
  "syntrake.investing.accounting_revision_id",
  "syntrake.investing.ledger_transaction_id",
] as const;

export type I3SyntheticFillSide = "BUY" | "SELL";

export type AccountSyntheticI3FillInput = {
  authorizedContext: AuthorizedInvestingContext;
  idempotencyKey: string;
  correlationId: string;
  instrumentId: string;
  side: I3SyntheticFillSide;
  quantity: string;
  unitPrice: string;
  feeAmount: string;
  effectiveAt: string;
  sourceSequence: string;
  sourceReference: string;
};

export type AccountSyntheticI3FillSuccess = {
  ok: true;
  replayed: boolean;
  fillId: string;
  ledgerTransactionId: string;
  accountingRevisionId: string | null;
  idempotencyRecordId: string;
};

export type AccountSyntheticI3FillFailureCode =
  | "VALIDATION_ERROR"
  | "UNAVAILABLE"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "ACCOUNTING_REBUILD_REQUIRED"
  | "CASH_UNAVAILABLE"
  | "INSUFFICIENT_CASH"
  | "INSUFFICIENT_POSITION"
  | "UNREPRESENTABLE_ACCOUNTING"
  | "INTERNAL_ERROR";

export type AccountSyntheticI3FillFailure = {
  ok: false;
  code: AccountSyntheticI3FillFailureCode;
};

export type AccountSyntheticI3FillResult = AccountSyntheticI3FillSuccess | AccountSyntheticI3FillFailure;

type AuthorityPrincipalRow = { principal_id: string; state: "ACTIVE" };
type AuthorityTenantRow = { tenant_id: string; state: "ACTIVE" };
type AuthorityMembershipRow = {
  tenant_membership_id: string;
  tenant_id: string;
  principal_id: string;
  role: "OWNER";
  state: "ACTIVE";
};
type AuthorityAccountRow = {
  account_id: string;
  tenant_id: string;
  initial_tenant_membership_id: string;
  initial_principal_id: string;
  account_origin: "INITIAL_PERSONAL_BOOTSTRAP";
  base_currency: string;
  created_at: string;
  state: "ACTIVE";
};
type AuthorityAccessRow = {
  account_access_id: string;
  account_id: string;
  tenant_id: string;
  tenant_membership_id: string;
  principal_id: string;
  role: "OWNER";
  state: "ACTIVE";
};
type InstrumentRow = {
  instrument_id: string;
  primary_currency_code: string;
  state: "ACTIVE";
  source: typeof source;
  context: typeof accountingContext;
};
type ArithmeticRow = {
  gross_consideration: string | null;
  required_cash: string | null;
  sell_net_cash: string | null;
  valid_sell_fee: boolean;
};
type IdempotencyRow = {
  idempotency_record_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  operation_scope: "ACCOUNT_SCOPE";
  operation: typeof operation;
  principal_id: string;
  tenant_id: string;
  account_id: string;
  idempotency_key: string;
  material_request_hash: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "CONFLICT";
  canonical_result_reference: unknown;
};
type FillReplayRow = {
  fill_id: string;
  material_request_hash: string;
};
type CanonicalEffectRow = {
  fill_id: string;
  ledger_transaction_id: string;
  accounting_revision_id: string | null;
};
type CashStateRow = {
  funding_count: number;
  cash_balance: string;
  sufficient: boolean;
};
type OrderingRow = { later_or_equal_count: number };
type AllocationPlanRow = {
  lot_origin_id: string;
  consumed_quantity: string;
  allocated_cost_basis: string | null;
  allocated_gross_proceeds: string | null;
  allocated_disposal_fee: string | null;
  realized_result: string | null;
};
type SellTotalsRow = {
  consumed_basis: string;
  net_cash: string;
  realized_credit: string;
  realized_debit: string;
};
type LedgerAccountRow = {
  ledger_account_id: string;
  ledger_account_type:
    | "CASH_ASSET"
    | "SECURITIES_BOOK_COST_ASSET"
    | "TRADING_FEE_EXPENSE"
    | "REALIZED_GAIN_LOSS";
};

type WorkSuccess = AccountSyntheticI3FillSuccess & { commitFailure?: false; destroyClient?: false };
type WorkFailure = AccountSyntheticI3FillFailure & { commitFailure?: boolean; destroyClient?: boolean };
type WorkResult = WorkSuccess | WorkFailure;

export async function accountSyntheticI3Fill(
  input: AccountSyntheticI3FillInput,
  env: Record<string, string | undefined> = process.env,
): Promise<AccountSyntheticI3FillResult> {
  if (!isAuthorizedInvestingContext(input.authorizedContext)) return fail("VALIDATION_ERROR");
  if (!rehearsalEnabled(env)) return fail("UNAVAILABLE");

  const normalized = normalizeInput(input);
  if (!normalized) return fail("VALIDATION_ERROR");

  const config = readInvestingDatabaseConfig(env);
  if (config.ok === false) return fail("INTERNAL_ERROR");
  if (env.SYNTRAKE_I3_REHEARSAL_PROJECT_REF !== config.projectRef) return fail("UNAVAILABLE");

  let database: InvestingAuthorityDatabase;
  try {
    database = getInvestingAuthorityDatabase(env);
  } catch {
    return fail("INTERNAL_ERROR");
  }

  return withAccountingTransaction(database, async (client) => {
    if (await hasStaleTransactionContext(client)) {
      return { ...fail("INTERNAL_ERROR"), destroyClient: true };
    }

    const context = input.authorizedContext;
    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: context.actorId,
      external_provider: "CLERK",
      external_subject: context.actorId,
      principal_id: context.principalId,
      tenant_id: context.tenantId,
      account_id: context.accountId,
      tenant_membership_id: context.tenantMembershipId,
      account_access_id: context.accountAccessId,
      operation,
      capability,
      correlation_id: normalized.correlationId,
      idempotency_key: normalized.idempotencyKey,
      instrument_id: normalized.instrumentId,
      fill_side: normalized.side,
      quantity: normalized.quantity,
      unit_price: normalized.unitPrice,
      fee_amount: normalized.feeAmount,
      effective_at: normalized.effectiveAt,
      source_sequence: normalized.sourceSequence,
      source_reference: normalized.sourceReference,
    });

    const authority = await lockAndRevalidateAuthority(client, context);
    if (authority.ok === false) return authority;
    const account = authority.account;

    await setTransactionContext(client, { settlement_currency: account.base_currency });

    const instrument = await expectExactlyOne(
      client.query<InstrumentRow>(
        [
          "select instrument_id, primary_currency_code, state, source, context",
          "from investing.i3_instruments",
          "where instrument_id = $1 and state = 'ACTIVE' and source = 'SYNTHETIC_I3_REHEARSAL' and context = 'DEMO'",
        ].join(" "),
        [normalized.instrumentId],
      ),
      "VALIDATION_ERROR",
    );
    if (instrument.ok === false) return instrument;
    if (instrument.row.primary_currency_code !== account.base_currency) return fail("VALIDATION_ERROR");

    const arithmetic = await expectExactlyOne(
      client.query<ArithmeticRow>(
        [
          "with x as (select $1::numeric as q, $2::numeric as p, $3::numeric as f),",
          "calc as (select q * p as gross, f from x)",
          "select",
          "case when gross > 0 and pg_catalog.scale(pg_catalog.trim_scale(gross)) <= 8",
          "and gross <= 9999999999999999.99999999::numeric then pg_catalog.trim_scale(gross)::text else null end as gross_consideration,",
          "case when $4 = 'BUY' and gross + f > 0 and pg_catalog.scale(pg_catalog.trim_scale(gross + f)) <= 8",
          "and gross + f <= 9999999999999999.99999999::numeric then pg_catalog.trim_scale(gross + f)::text else null end as required_cash,",
          "case when $4 = 'SELL' and gross - f >= 0 and pg_catalog.scale(pg_catalog.trim_scale(gross - f)) <= 8",
          "and gross - f <= 9999999999999999.99999999::numeric then pg_catalog.trim_scale(gross - f)::text else null end as sell_net_cash,",
          "f <= gross as valid_sell_fee",
          "from calc",
        ].join(" "),
        [normalized.quantity, normalized.unitPrice, normalized.feeAmount, normalized.side],
      ),
      "INTERNAL_ERROR",
    );
    if (arithmetic.ok === false) return arithmetic;
    if (!arithmetic.row.gross_consideration) {
      return fail("UNREPRESENTABLE_ACCOUNTING");
    }
    if (normalized.side === "BUY" && !arithmetic.row.required_cash) return fail("UNREPRESENTABLE_ACCOUNTING");
    if (normalized.side === "SELL" && !arithmetic.row.valid_sell_fee) return fail("VALIDATION_ERROR");
    if (normalized.side === "SELL" && !arithmetic.row.sell_net_cash) return fail("UNREPRESENTABLE_ACCOUNTING");

    const materialRequestHash = hashMaterialRequest({
      context,
      instrumentId: normalized.instrumentId,
      side: normalized.side,
      quantity: normalized.quantity,
      unitPrice: normalized.unitPrice,
      grossConsideration: arithmetic.row.gross_consideration,
      feeAmount: normalized.feeAmount,
      settlementCurrency: account.base_currency,
      effectiveAt: normalized.effectiveAt,
      sourceSequence: normalized.sourceSequence,
      sourceReference: normalized.sourceReference,
    });

    const candidateIdempotencyRecordId = randomUUID();
    await setTransactionContext(client, {
      idempotency_record_id: candidateIdempotencyRecordId,
      material_request_hash: materialRequestHash,
      gross_consideration: arithmetic.row.gross_consideration,
    });

    const insertedIdempotency = await client.query(
      [
        "insert into investing.idempotency_records (",
        "idempotency_record_id, idempotency_key, material_request_hash, correlation_id,",
        "actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id, status",
        ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, 'ACCOUNT_SCOPE', $6, $7, $8, $9, 'STARTED')",
        "on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing",
      ].join(" "),
      [
        candidateIdempotencyRecordId,
        normalized.idempotencyKey,
        materialRequestHash,
        normalized.correlationId,
        context.actorId,
        operation,
        context.principalId,
        context.tenantId,
        context.accountId,
      ],
    );
    if (insertedIdempotency.rowCount !== 0 && insertedIdempotency.rowCount !== 1) return fail("INTERNAL_ERROR");

    const idempotencyResult = await client.query<IdempotencyRow>(
      [
        "select idempotency_record_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id,",
        "idempotency_key, material_request_hash, status, canonical_result_reference",
        "from investing.idempotency_records",
        "where actor_kind = 'USER_PRINCIPAL' and actor_id = $1 and principal_id = $2",
        "and tenant_id = $3 and account_id = $4",
        "and operation_scope = 'ACCOUNT_SCOPE' and operation = $5 and idempotency_key = $6",
      ].join(" "),
      [context.actorId, context.principalId, context.tenantId, context.accountId, operation, normalized.idempotencyKey],
    );
    if (idempotencyResult.rows.length > 1) return fail("INTERNAL_ERROR");
    if (idempotencyResult.rows.length === 0) {
      return fail(insertedIdempotency.rowCount === 0 ? "IDEMPOTENCY_CONFLICT" : "INTERNAL_ERROR");
    }
    const idempotency = { ok: true as const, row: idempotencyResult.rows[0]! };

    await setTransactionContext(client, { idempotency_record_id: idempotency.row.idempotency_record_id });

    if (!idempotencyBelongsToContext(idempotency.row, context, normalized.idempotencyKey)) {
      return fail("IDEMPOTENCY_CONFLICT");
    }

    if (insertedIdempotency.rowCount === 0) {
      return dispatchExistingIdempotency(client, idempotency.row, materialRequestHash);
    }
    if (
      idempotency.row.idempotency_record_id !== candidateIdempotencyRecordId ||
      idempotency.row.status !== "STARTED" ||
      idempotency.row.material_request_hash !== materialRequestHash
    ) {
      return fail("INTERNAL_ERROR");
    }

    await ensureGenesisAnchor(client, context, account, normalized.correlationId);
    await ensureAndLockMutexes(client, context, normalized.instrumentId, account.base_currency);

    const semanticFill = await client.query<FillReplayRow>(
        [
          "select fill_id, material_request_hash from investing.i3_fills",
          "where tenant_id = $1 and account_id = $2",
          "and source = 'SYNTHETIC_I3_REHEARSAL' and source_reference = $3",
        ].join(" "),
      [context.tenantId, context.accountId, normalized.sourceReference],
    );
    if (semanticFill.rows.length > 1) return fail("INTERNAL_ERROR");
    if (semanticFill.rows.length === 1) {
      if (semanticFill.rows[0]!.material_request_hash !== materialRequestHash) {
        return terminalConflict(client, idempotency.row.idempotency_record_id);
      }
      const effect = await resolveCanonicalEffect(client, semanticFill.rows[0]!.fill_id);
      if (effect.ok === false) return effect;
      const terminal = await terminalSuccess(client, idempotency.row.idempotency_record_id, effect.row, true);
      return terminal;
    }

    const ordering = await expectExactlyOne(
      client.query<OrderingRow>(
        [
          "select count(*)::integer as later_or_equal_count from investing.i3_fills",
          "where tenant_id = $1 and account_id = $2 and instrument_id = $3",
          "and (effective_at, source_sequence, source_reference) >= ($4::timestamptz, $5::bigint, $6)",
        ].join(" "),
        [
          context.tenantId,
          context.accountId,
          normalized.instrumentId,
          normalized.effectiveAt,
          normalized.sourceSequence,
          normalized.sourceReference,
        ],
      ),
      "INTERNAL_ERROR",
    );
    if (ordering.ok === false) return ordering;
    if (ordering.row.later_or_equal_count !== 0) return fail("ACCOUNTING_REBUILD_REQUIRED");

    if (normalized.side === "BUY") {
      const cash = await readCashState(client, context, account.base_currency, arithmetic.row.required_cash);
      if (cash.ok === false) return cash;
    }

    const fillId = randomUUID();
    await setTransactionContext(client, { fill_id: fillId });

    const fillInsert = await client.query(
      [
        "insert into investing.i3_fills (",
        "fill_id, tenant_id, account_id, instrument_id, side, quantity, unit_price, gross_consideration, fee_amount,",
        "settlement_currency_code, fee_currency_code, effective_at, settlement_at, source_sequence, actor_kind, actor_id,",
        "principal_id, operation_scope, operation, correlation_id, idempotency_record_id, material_request_hash,",
        "source, source_reference, value_origin, freshness, context",
        ") values (",
        "$1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8::numeric, $9::numeric,",
        "$10, $10, $11::timestamptz, $11::timestamptz, $12::bigint, 'USER_PRINCIPAL', $13,",
        "$14, 'ACCOUNT_SCOPE', $15, $16, $17, $18, $19, $20, 'SIMULATED', 'NOT_APPLICABLE', 'DEMO'",
        ")",
      ].join(" "),
      [
        fillId,
        context.tenantId,
        context.accountId,
        normalized.instrumentId,
        normalized.side,
        normalized.quantity,
        normalized.unitPrice,
        arithmetic.row.gross_consideration,
        normalized.feeAmount,
        account.base_currency,
        normalized.effectiveAt,
        normalized.sourceSequence,
        context.actorId,
        context.principalId,
        operation,
        normalized.correlationId,
        idempotency.row.idempotency_record_id,
        materialRequestHash,
        source,
        normalized.sourceReference,
      ],
    );
    if (fillInsert.rowCount !== 1) return fail("INTERNAL_ERROR");

    let accountingRevisionId: string | null = null;
    let sellTotals: SellTotalsRow | null = null;

    if (normalized.side === "BUY") {
      const lotInsert = await client.query(
        [
          "insert into investing.i3_acquisition_lot_origins (",
          "lot_origin_id, tenant_id, account_id, instrument_id, acquisition_fill_id, acquired_quantity,",
          "acquisition_unit_price, acquisition_gross_cost, acquisition_fee, settlement_currency_code,",
          "effective_at, acquisition_source_sequence, acquisition_source_reference",
          ") values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10, $11::timestamptz, $12::bigint, $13)",
        ].join(" "),
        [
          randomUUID(),
          context.tenantId,
          context.accountId,
          normalized.instrumentId,
          fillId,
          normalized.quantity,
          normalized.unitPrice,
          arithmetic.row.gross_consideration,
          normalized.feeAmount,
          account.base_currency,
          normalized.effectiveAt,
          normalized.sourceSequence,
          normalized.sourceReference,
        ],
      );
      if (lotInsert.rowCount !== 1) return fail("INTERNAL_ERROR");
    } else {
      const plan = await buildSellAllocationPlan(client, {
        context,
        instrumentId: normalized.instrumentId,
        fillId,
        quantity: normalized.quantity,
        grossConsideration: arithmetic.row.gross_consideration,
        feeAmount: normalized.feeAmount,
      });
      if (plan.ok === false) return plan;
      if (plan.rows.length === 0) return fail("INSUFFICIENT_POSITION");
      if (plan.rows.some((row) =>
        !row.allocated_cost_basis ||
        !row.allocated_gross_proceeds ||
        !row.allocated_disposal_fee ||
        !row.realized_result
      )) {
        return fail("UNREPRESENTABLE_ACCOUNTING");
      }

      accountingRevisionId = randomUUID();
      await setTransactionContext(client, { accounting_revision_id: accountingRevisionId });
      const eventSetHash = hashEventSet(fillId, plan.rows);

      const revisionInsert = await client.query(
        [
          "insert into investing.i3_accounting_revisions (",
          "accounting_revision_id, tenant_id, account_id, instrument_id, disposal_fill_id, revision_kind,",
          "methodology_id, methodology_version, event_set_hash, event_count, supersedes_accounting_revision_id",
          ") values ($1, $2, $3, $4, $5, 'DISPOSAL_FIFO_V1', 'FIFO_V1', 1, $6, $7, null)",
        ].join(" "),
        [
          accountingRevisionId,
          context.tenantId,
          context.accountId,
          normalized.instrumentId,
          fillId,
          eventSetHash,
          plan.rows.length,
        ],
      );
      if (revisionInsert.rowCount !== 1) return fail("INTERNAL_ERROR");

      for (const allocation of plan.rows) {
        const allocationInsert = await client.query(
          [
            "insert into investing.i3_lot_consumption_allocations (",
            "lot_consumption_allocation_id, accounting_revision_id, disposal_fill_id, lot_origin_id,",
            "tenant_id, account_id, instrument_id, consumed_quantity, allocated_cost_basis,",
            "allocated_gross_proceeds, allocated_disposal_fee, realized_result",
            ") values ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::numeric)",
          ].join(" "),
          [
            randomUUID(),
            accountingRevisionId,
            fillId,
            allocation.lot_origin_id,
            context.tenantId,
            context.accountId,
            normalized.instrumentId,
            allocation.consumed_quantity,
            allocation.allocated_cost_basis!,
            allocation.allocated_gross_proceeds!,
            allocation.allocated_disposal_fee!,
            allocation.realized_result!,
          ],
        );
        if (allocationInsert.rowCount !== 1) return fail("INTERNAL_ERROR");
      }

      const revisionSeal = await client.query(
        [
          "insert into investing.i3_accounting_revision_seals (",
          "accounting_revision_seal_id, accounting_revision_id, disposal_fill_id, tenant_id, account_id, instrument_id",
          ") values ($1, $2, $3, $4, $5, $6)",
        ].join(" "),
        [randomUUID(), accountingRevisionId, fillId, context.tenantId, context.accountId, normalized.instrumentId],
      );
      if (revisionSeal.rowCount !== 1) return fail("INTERNAL_ERROR");

      const totals = await expectExactlyOne(
        client.query<SellTotalsRow>(
          [
            "with x as (select coalesce(sum(allocated_cost_basis), 0::numeric) as basis",
            "from investing.i3_lot_consumption_allocations where accounting_revision_id = $1),",
            "f as (select $2::numeric as gross, $3::numeric as fee)",
            "select pg_catalog.trim_scale(x.basis)::text as consumed_basis,",
            "pg_catalog.trim_scale(f.gross - f.fee)::text as net_cash,",
            "pg_catalog.trim_scale(greatest(f.gross - x.basis, 0::numeric))::text as realized_credit,",
            "pg_catalog.trim_scale(greatest(x.basis - f.gross, 0::numeric))::text as realized_debit",
            "from x cross join f",
          ].join(" "),
          [accountingRevisionId, arithmetic.row.gross_consideration, normalized.feeAmount],
        ),
        "INTERNAL_ERROR",
      );
      if (totals.ok === false) return totals;
      sellTotals = totals.row;
    }

    const ledgerAccounts = await ensureLedgerAccounts(client, context, account.base_currency);
    if (ledgerAccounts.ok === false) return ledgerAccounts;

    const ledgerTransactionId = randomUUID();
    await setTransactionContext(client, { ledger_transaction_id: ledgerTransactionId });

    const ledgerTransaction = await client.query(
      [
        "insert into investing.ledger_transactions (",
        "ledger_transaction_id, tenant_id, account_id, actor_kind, actor_id, principal_id, operation_scope, operation,",
        "transaction_kind, effective_at, correlation_id, idempotency_record_id, material_request_hash,",
        "source, source_reference, value_origin, freshness, context, i3_fill_id, i3_instrument_id, i3_accounting_revision_id",
        ") values ($1, $2, $3, 'USER_PRINCIPAL', $4, $5, 'ACCOUNT_SCOPE', $6, $7, $8::timestamptz,",
        "$9, $10, $11, 'SYNTHETIC_I3_REHEARSAL', $12, 'SIMULATED', 'NOT_APPLICABLE', 'DEMO', $13, $14, $15)",
      ].join(" "),
      [
        ledgerTransactionId,
        context.tenantId,
        context.accountId,
        context.actorId,
        context.principalId,
        operation,
        normalized.side === "BUY" ? "I3_INTERNAL_PAPER_BUY_V1" : "I3_INTERNAL_PAPER_SELL_V1",
        normalized.effectiveAt,
        normalized.correlationId,
        idempotency.row.idempotency_record_id,
        materialRequestHash,
        normalized.sourceReference,
        fillId,
        normalized.instrumentId,
        accountingRevisionId,
      ],
    );
    if (ledgerTransaction.rowCount !== 1) return fail("INTERNAL_ERROR");

    if (normalized.side === "BUY") {
      const requiredCash = arithmetic.row.required_cash;
      if (!requiredCash) return fail("UNREPRESENTABLE_ACCOUNTING");
      if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.SECURITIES_BOOK_COST_ASSET, "DEBIT", requiredCash))) {
        return fail("INTERNAL_ERROR");
      }
      if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.CASH_ASSET, "CREDIT", requiredCash))) {
        return fail("INTERNAL_ERROR");
      }
    } else {
      if (!sellTotals) return fail("INTERNAL_ERROR");
      if (sellTotals.net_cash !== "0") {
        if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.CASH_ASSET, "DEBIT", sellTotals.net_cash))) {
          return fail("INTERNAL_ERROR");
        }
      }
      if (normalized.feeAmount !== "0") {
        if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.TRADING_FEE_EXPENSE, "DEBIT", normalized.feeAmount))) {
          return fail("INTERNAL_ERROR");
        }
      }
      if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.SECURITIES_BOOK_COST_ASSET, "CREDIT", sellTotals.consumed_basis))) {
        return fail("INTERNAL_ERROR");
      }
      if (sellTotals.realized_credit !== "0") {
        if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.REALIZED_GAIN_LOSS, "CREDIT", sellTotals.realized_credit))) {
          return fail("INTERNAL_ERROR");
        }
      } else if (sellTotals.realized_debit !== "0") {
        if (!(await insertPosting(client, ledgerTransactionId, context, account.base_currency, ledgerAccounts.rows.REALIZED_GAIN_LOSS, "DEBIT", sellTotals.realized_debit))) {
          return fail("INTERNAL_ERROR");
        }
      }
    }

    const ledgerSeal = await client.query(
      [
        "insert into investing.ledger_transaction_seals (",
        "ledger_transaction_seal_id, ledger_transaction_id, tenant_id, account_id",
        ") values ($1, $2, $3, $4)",
      ].join(" "),
      [randomUUID(), ledgerTransactionId, context.tenantId, context.accountId],
    );
    if (ledgerSeal.rowCount !== 1) return fail("INTERNAL_ERROR");

    await client.query(
      [
        "insert into investing.audit_events (",
        "correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
        "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
        ") values ($1, 'USER_PRINCIPAL', $2, $3, 'ACCOUNT_SCOPE', $4, $5,",
        "'I3_FILL_ACCOUNTING_SUCCEEDED', 'I3_FILL', $6, 'SUCCEEDED', null, $7::jsonb, transaction_timestamp())",
      ].join(" "),
      [
        normalized.correlationId,
        context.actorId,
        context.principalId,
        context.tenantId,
        context.accountId,
        fillId,
        JSON.stringify({
          accounting_revision_id: accountingRevisionId,
          idempotency_record_id: idempotency.row.idempotency_record_id,
          instrument_id: normalized.instrumentId,
          ledger_transaction_id: ledgerTransactionId,
          material_request_hash: materialRequestHash,
          source,
          source_reference: normalized.sourceReference,
        }),
      ],
    );

    return terminalSuccess(
      client,
      idempotency.row.idempotency_record_id,
      { fill_id: fillId, ledger_transaction_id: ledgerTransactionId, accounting_revision_id: accountingRevisionId },
      false,
    );
  });
}

function rehearsalEnabled(env: Record<string, string | undefined>) {
  return (
    env.SYNTRAKE_I3_SYNTHETIC_REHEARSAL_ENABLED === "true" &&
    typeof env.SYNTRAKE_I3_REHEARSAL_PROJECT_REF === "string" &&
    env.SYNTRAKE_I3_REHEARSAL_PROJECT_REF.length > 0 &&
    env.VERCEL_ENV !== "production"
  );
}

function normalizeInput(input: AccountSyntheticI3FillInput) {
  if (!uuidPattern.test(input.instrumentId)) return null;
  if (input.side !== "BUY" && input.side !== "SELL") return null;
  if (!quantityPattern.test(input.quantity)) return null;
  if (!positiveMoneyPattern.test(input.unitPrice)) return null;
  if (!nonnegativeMoneyPattern.test(input.feeAmount)) return null;
  if (!isBoundedText(input.idempotencyKey, 16, 512)) return null;
  if (!isBoundedText(input.correlationId, 16, 512)) return null;
  if (!isBoundedText(input.sourceReference, 1, 512)) return null;
  if (!isValidBigintText(input.sourceSequence)) return null;
  if (!canonicalUtcInstantPattern.test(input.effectiveAt)) return null;
  const parsed = new Date(input.effectiveAt);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input.effectiveAt) return null;

  return { ...input };
}

function idempotencyBelongsToContext(
  row: IdempotencyRow,
  context: AuthorizedInvestingContext,
  idempotencyKey: string,
) {
  return (
    row.actor_kind === "USER_PRINCIPAL" &&
    row.actor_id === context.actorId &&
    row.operation_scope === "ACCOUNT_SCOPE" &&
    row.operation === operation &&
    row.principal_id === context.principalId &&
    row.tenant_id === context.tenantId &&
    row.account_id === context.accountId &&
    row.idempotency_key === idempotencyKey
  );
}

async function lockAndRevalidateAuthority(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
): Promise<{ ok: true; account: AuthorityAccountRow } | AccountSyntheticI3FillFailure> {
  const principal = await expectExactlyOne(
    client.query<AuthorityPrincipalRow>(
      "select principal_id, state from investing.principals where principal_id = $1 and state = 'ACTIVE' for update",
      [context.principalId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (principal.ok === false) return principal;

  const tenant = await expectExactlyOne(
    client.query<AuthorityTenantRow>(
      "select tenant_id, state from investing.tenants where tenant_id = $1 and state = 'ACTIVE' for update",
      [context.tenantId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (tenant.ok === false) return tenant;

  const membership = await expectExactlyOne(
    client.query<AuthorityMembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, role, state",
        "from investing.tenant_memberships",
        "where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER' and state = 'ACTIVE'",
        "for update",
      ].join(" "),
      [context.tenantMembershipId, context.tenantId, context.principalId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (membership.ok === false) return membership;

  const account = await expectExactlyOne(
    client.query<AuthorityAccountRow>(
      [
        "select account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, account_origin, base_currency, created_at, state",
        "from investing.accounts",
        "where account_id = $1 and tenant_id = $2 and initial_principal_id = $3",
        "and initial_tenant_membership_id = $4 and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP' and state = 'ACTIVE'",
        "for update",
      ].join(" "),
      [context.accountId, context.tenantId, context.principalId, context.tenantMembershipId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (account.ok === false) return account;

  const access = await expectExactlyOne(
    client.query<AuthorityAccessRow>(
      [
        "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, role, state",
        "from investing.account_access",
        "where account_access_id = $1 and account_id = $2 and tenant_id = $3 and tenant_membership_id = $4",
        "and principal_id = $5 and role = 'OWNER' and state = 'ACTIVE' for update",
      ].join(" "),
      [context.accountAccessId, context.accountId, context.tenantId, context.tenantMembershipId, context.principalId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (access.ok === false) return access;

  return { ok: true, account: account.row };
}

async function ensureGenesisAnchor(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  account: AuthorityAccountRow,
  correlationId: string,
) {
  const inserted = await client.query(
    [
      "insert into investing.i3_accounting_genesis_anchors (",
      "accounting_genesis_anchor_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
      "origin_operation, effective_at, correlation_id, source, value_origin, freshness, context",
      ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, 'INITIAL_PERSONAL_BOOTSTRAP',",
      "$6::timestamptz, $7, 'PAPER_ACCOUNT_GENESIS', 'SIMULATED', 'NOT_APPLICABLE', 'DEMO')",
      "on conflict (tenant_id, account_id) do nothing",
    ].join(" "),
    [randomUUID(), context.tenantId, context.accountId, context.principalId, context.actorId, account.created_at, correlationId],
  );
  if (inserted.rowCount !== 0 && inserted.rowCount !== 1) throw new Error("I3_GENESIS_ANCHOR_DML_DRIFT");

  const anchor = await client.query<{ accounting_genesis_anchor_id: string }>(
    [
      "select accounting_genesis_anchor_id from investing.i3_accounting_genesis_anchors",
      "where tenant_id = $1 and account_id = $2 and principal_id = $3",
      "and actor_id = $4 and effective_at = $5::timestamptz",
    ].join(" "),
    [context.tenantId, context.accountId, context.principalId, context.actorId, account.created_at],
  );
  if (anchor.rows.length !== 1) throw new Error("I3_GENESIS_ANCHOR_MISMATCH");
}

async function ensureAndLockMutexes(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  instrumentId: string,
  currency: string,
) {
  const cashInsert = await client.query(
    [
      "insert into investing.i3_accounting_mutexes (accounting_mutex_id, tenant_id, account_id, mutex_kind, currency_code, instrument_id)",
      "values ($1, $2, $3, 'ACCOUNT_CURRENCY_CASH_SCOPE', $4, null) on conflict do nothing",
    ].join(" "),
    [randomUUID(), context.tenantId, context.accountId, currency],
  );
  if (cashInsert.rowCount !== 0 && cashInsert.rowCount !== 1) throw new Error("I3_CASH_MUTEX_DML_DRIFT");

  const instrumentInsert = await client.query(
    [
      "insert into investing.i3_accounting_mutexes (accounting_mutex_id, tenant_id, account_id, mutex_kind, currency_code, instrument_id)",
      "values ($1, $2, $3, 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE', null, $4) on conflict do nothing",
    ].join(" "),
    [randomUUID(), context.tenantId, context.accountId, instrumentId],
  );
  if (instrumentInsert.rowCount !== 0 && instrumentInsert.rowCount !== 1) throw new Error("I3_INSTRUMENT_MUTEX_DML_DRIFT");

  const cashLock = await client.query(
    [
      "select accounting_mutex_id from investing.i3_accounting_mutexes",
      "where tenant_id = $1 and account_id = $2 and mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'",
      "and currency_code = $3 and instrument_id is null for update",
    ].join(" "),
    [context.tenantId, context.accountId, currency],
  );
  if (cashLock.rows.length !== 1) throw new Error("I3_CASH_MUTEX_LOCK_FAILED");

  const instrumentLock = await client.query(
    [
      "select accounting_mutex_id from investing.i3_accounting_mutexes",
      "where tenant_id = $1 and account_id = $2 and mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'",
      "and currency_code is null and instrument_id = $3 for update",
    ].join(" "),
    [context.tenantId, context.accountId, instrumentId],
  );
  if (instrumentLock.rows.length !== 1) throw new Error("I3_INSTRUMENT_MUTEX_LOCK_FAILED");
}

async function readCashState(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  currency: string,
  requiredCash: string,
): Promise<{ ok: true; row: CashStateRow } | AccountSyntheticI3FillFailure> {
  const result = await expectExactlyOne(
    client.query<CashStateRow>(
      [
        "with sealed_cash as (",
        "select t.ledger_transaction_id, t.transaction_kind, p.side, p.amount",
        "from investing.ledger_transactions t",
        "join investing.ledger_transaction_seals s on s.ledger_transaction_id = t.ledger_transaction_id and s.tenant_id = t.tenant_id and s.account_id = t.account_id",
        "join investing.ledger_postings p on p.ledger_transaction_id = t.ledger_transaction_id and p.tenant_id = t.tenant_id and p.account_id = t.account_id",
        "join investing.ledger_accounts la on la.ledger_account_id = p.ledger_account_id and la.tenant_id = p.tenant_id and la.account_id = p.account_id and la.currency_code = p.currency_code",
        "where t.tenant_id = $1 and t.account_id = $2 and p.currency_code = $3 and la.ledger_account_type = 'CASH_ASSET'",
        "), x as (",
        "select count(distinct ledger_transaction_id) filter (where transaction_kind = 'INITIAL_PAPER_CASH_FUNDING')::integer as funding_count,",
        "coalesce(sum(case when side = 'DEBIT' then amount else -amount end), 0::numeric) as cash_balance from sealed_cash",
        ")",
        "select funding_count, pg_catalog.trim_scale(cash_balance)::text as cash_balance, cash_balance >= $4::numeric as sufficient from x",
      ].join(" "),
      [context.tenantId, context.accountId, currency, requiredCash],
    ),
    "INTERNAL_ERROR",
  );
  if (result.ok === false) return result;
  if (result.row.funding_count !== 1) return fail("CASH_UNAVAILABLE");
  if (!result.row.sufficient) return fail("INSUFFICIENT_CASH");
  return result;
}

async function buildSellAllocationPlan(
  client: InvestingAuthorityTransactionClient,
  input: {
    context: AuthorizedInvestingContext;
    instrumentId: string;
    fillId: string;
    quantity: string;
    grossConsideration: string;
    feeAmount: string;
  },
): Promise<{ ok: true; rows: AllocationPlanRow[] } | AccountSyntheticI3FillFailure> {
  const plan = await client.query<AllocationPlanRow>(
    [
      "with prior as (",
      "select a.lot_origin_id, coalesce(sum(a.consumed_quantity), 0::numeric) as consumed",
      "from investing.i3_lot_consumption_allocations a",
      "join investing.i3_accounting_revisions r on r.accounting_revision_id = a.accounting_revision_id and r.supersedes_accounting_revision_id is null",
      "join investing.i3_accounting_revision_seals s on s.accounting_revision_id = r.accounting_revision_id",
      "where a.tenant_id = $1 and a.account_id = $2 and a.instrument_id = $3",
      "group by a.lot_origin_id",
      "), open_lots as (",
      "select l.*, l.acquired_quantity - coalesce(prior.consumed, 0::numeric) as available_quantity",
      "from investing.i3_acquisition_lot_origins l left join prior on prior.lot_origin_id = l.lot_origin_id",
      "where l.tenant_id = $1 and l.account_id = $2 and l.instrument_id = $3",
      "and l.acquired_quantity - coalesce(prior.consumed, 0::numeric) > 0",
      "), ordered as (",
      "select open_lots.*, coalesce(sum(available_quantity) over (order by effective_at, acquisition_source_sequence, acquisition_source_reference, lot_origin_id rows between unbounded preceding and 1 preceding), 0::numeric) as before_quantity",
      "from open_lots",
      "), consumed as (",
      "select *, greatest(least(available_quantity, $4::numeric - before_quantity), 0::numeric) as take_quantity",
      "from ordered",
      "), planned as (",
      "select *,",
      "((acquisition_gross_cost + acquisition_fee) * take_quantity / acquired_quantity) as basis_alloc,",
      "($5::numeric * take_quantity / $4::numeric) as proceeds_alloc,",
      "($6::numeric * take_quantity / $4::numeric) as fee_alloc",
      "from consumed where take_quantity > 0",
      ")",
      "select lot_origin_id, pg_catalog.trim_scale(take_quantity)::text as consumed_quantity,",
      "case when pg_catalog.scale(pg_catalog.trim_scale(basis_alloc)) <= 8 then pg_catalog.trim_scale(basis_alloc)::text else null end as allocated_cost_basis,",
      "case when pg_catalog.scale(pg_catalog.trim_scale(proceeds_alloc)) <= 8 then pg_catalog.trim_scale(proceeds_alloc)::text else null end as allocated_gross_proceeds,",
      "case when pg_catalog.scale(pg_catalog.trim_scale(fee_alloc)) <= 8 then pg_catalog.trim_scale(fee_alloc)::text else null end as allocated_disposal_fee,",
      "case when pg_catalog.scale(pg_catalog.trim_scale(proceeds_alloc - fee_alloc - basis_alloc)) <= 8 then pg_catalog.trim_scale(proceeds_alloc - fee_alloc - basis_alloc)::text else null end as realized_result",
      "from planned order by effective_at, acquisition_source_sequence, acquisition_source_reference, lot_origin_id",
    ].join(" "),
    [
      input.context.tenantId,
      input.context.accountId,
      input.instrumentId,
      input.quantity,
      input.grossConsideration,
      input.feeAmount,
    ],
  );

  const quantityCheck = await expectExactlyOne(
    client.query<{ planned_quantity: string; enough: boolean }>(
      [
        "select pg_catalog.trim_scale(coalesce(sum(x.consumed_quantity::numeric), 0::numeric))::text as planned_quantity,",
        "coalesce(sum(x.consumed_quantity::numeric), 0::numeric) = $2::numeric as enough",
        "from jsonb_to_recordset($1::jsonb) as x(consumed_quantity text)",
      ].join(" "),
      [JSON.stringify(plan.rows.map((row) => ({ consumed_quantity: row.consumed_quantity }))), input.quantity],
    ),
    "INTERNAL_ERROR",
  );
  if (quantityCheck.ok === false) return quantityCheck;
  if (!quantityCheck.row.enough) return fail("INSUFFICIENT_POSITION");
  return { ok: true, rows: plan.rows };
}

async function ensureLedgerAccounts(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  currency: string,
): Promise<
  | {
      ok: true;
      rows: Record<LedgerAccountRow["ledger_account_type"], string>;
    }
  | AccountSyntheticI3FillFailure
> {
  for (const spec of [
    ["SECURITIES_BOOK_COST_ASSET", "ASSET", "DEBIT"],
    ["TRADING_FEE_EXPENSE", "EXPENSE", "DEBIT"],
    ["REALIZED_GAIN_LOSS", "INCOME", "CREDIT"],
  ] as const) {
    const inserted = await client.query(
      [
        "insert into investing.ledger_accounts (",
        "ledger_account_id, tenant_id, account_id, currency_code, account_class, normal_side, ledger_account_type, ledger_account_code, state",
        ") values ($1, $2, $3, $4, $5, $6, $7, $7, 'ACTIVE') on conflict do nothing",
      ].join(" "),
      [randomUUID(), context.tenantId, context.accountId, currency, spec[1], spec[2], spec[0]],
    );
    if (inserted.rowCount !== 0 && inserted.rowCount !== 1) return fail("INTERNAL_ERROR");
  }

  const accounts = await client.query<LedgerAccountRow>(
    [
      "select ledger_account_id, ledger_account_type from investing.ledger_accounts",
      "where tenant_id = $1 and account_id = $2 and currency_code = $3 and state = 'ACTIVE'",
      "and ledger_account_type in ('CASH_ASSET', 'SECURITIES_BOOK_COST_ASSET', 'TRADING_FEE_EXPENSE', 'REALIZED_GAIN_LOSS')",
    ].join(" "),
    [context.tenantId, context.accountId, currency],
  );
  const map = Object.fromEntries(accounts.rows.map((row) => [row.ledger_account_type, row.ledger_account_id])) as Partial<
    Record<LedgerAccountRow["ledger_account_type"], string>
  >;
  if (!map.CASH_ASSET || !map.SECURITIES_BOOK_COST_ASSET || !map.TRADING_FEE_EXPENSE || !map.REALIZED_GAIN_LOSS) {
    return fail("CASH_UNAVAILABLE");
  }
  return { ok: true, rows: map as Record<LedgerAccountRow["ledger_account_type"], string> };
}

async function insertPosting(
  client: InvestingAuthorityTransactionClient,
  ledgerTransactionId: string,
  context: AuthorizedInvestingContext,
  currency: string,
  ledgerAccountId: string,
  side: "DEBIT" | "CREDIT",
  amount: string,
) {
  const result = await client.query(
    [
      "insert into investing.ledger_postings (",
      "ledger_posting_id, ledger_transaction_id, tenant_id, account_id, ledger_account_id, currency_code, side, amount",
      ") values ($1, $2, $3, $4, $5, $6, $7, $8::numeric)",
    ].join(" "),
    [randomUUID(), ledgerTransactionId, context.tenantId, context.accountId, ledgerAccountId, currency, side, amount],
  );
  return result.rowCount === 1;
}

async function dispatchExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  row: IdempotencyRow,
  materialRequestHash: string,
): Promise<WorkResult> {
  if (row.status === "SUCCEEDED") {
    if (row.material_request_hash !== materialRequestHash) return fail("IDEMPOTENCY_CONFLICT");
    const reference = parseCanonicalReference(row.canonical_result_reference);
    if (!reference) return fail("INTERNAL_ERROR");
    const effect = await resolveCanonicalEffect(client, reference.fillId);
    if (effect.ok === false) return effect;
    if (
      effect.row.ledger_transaction_id !== reference.ledgerTransactionId ||
      effect.row.accounting_revision_id !== reference.accountingRevisionId
    ) {
      return fail("INTERNAL_ERROR");
    }
    return {
      ok: true,
      replayed: true,
      fillId: reference.fillId,
      ledgerTransactionId: reference.ledgerTransactionId,
      accountingRevisionId: reference.accountingRevisionId,
      idempotencyRecordId: row.idempotency_record_id,
    };
  }
  if (row.status === "CONFLICT") return fail("IDEMPOTENCY_CONFLICT");
  if (row.status === "STARTED") return fail("IDEMPOTENCY_IN_PROGRESS");
  return fail("INTERNAL_ERROR");
}

async function resolveCanonicalEffect(
  client: InvestingAuthorityTransactionClient,
  fillId: string,
): Promise<{ ok: true; row: CanonicalEffectRow } | AccountSyntheticI3FillFailure> {
  return expectExactlyOne(
    client.query<CanonicalEffectRow>(
      [
        "select f.fill_id, t.ledger_transaction_id, t.i3_accounting_revision_id as accounting_revision_id",
        "from investing.i3_fills f",
        "join investing.ledger_transactions t on t.i3_fill_id = f.fill_id and t.i3_instrument_id = f.instrument_id",
        "join investing.ledger_transaction_seals s on s.ledger_transaction_id = t.ledger_transaction_id and s.tenant_id = t.tenant_id and s.account_id = t.account_id",
        "where f.fill_id = $1",
      ].join(" "),
      [fillId],
    ),
    "INTERNAL_ERROR",
  );
}

async function terminalSuccess(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  effect: CanonicalEffectRow,
  replayed: boolean,
): Promise<WorkResult> {
  const reference = {
    fillId: effect.fill_id,
    ledgerTransactionId: effect.ledger_transaction_id,
    accountingRevisionId: effect.accounting_revision_id,
  };
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = 'SUCCEEDED', canonical_result_reference = $2::jsonb, error_code = null,",
      "updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [idempotencyRecordId, JSON.stringify(reference)],
  );
  if (updated.rowCount !== 1) return fail("INTERNAL_ERROR");
  return {
    ok: true,
    replayed,
    ...reference,
    idempotencyRecordId,
  };
}

async function terminalConflict(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
): Promise<WorkResult> {
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = 'CONFLICT', canonical_result_reference = null, error_code = 'I3_SEMANTIC_FILL_CONFLICT',",
      "updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [idempotencyRecordId],
  );
  if (updated.rowCount !== 1) return fail("INTERNAL_ERROR");
  return { ...fail("IDEMPOTENCY_CONFLICT"), commitFailure: true };
}

function parseCanonicalReference(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.fillId !== "string" || !uuidPattern.test(record.fillId)) return null;
  if (typeof record.ledgerTransactionId !== "string" || !uuidPattern.test(record.ledgerTransactionId)) return null;
  if (record.accountingRevisionId !== null && (typeof record.accountingRevisionId !== "string" || !uuidPattern.test(record.accountingRevisionId))) {
    return null;
  }
  return {
    fillId: record.fillId,
    ledgerTransactionId: record.ledgerTransactionId,
    accountingRevisionId: record.accountingRevisionId as string | null,
  };
}

async function withAccountingTransaction(
  database: InvestingAuthorityDatabase,
  work: (client: InvestingAuthorityTransactionClient) => Promise<WorkResult>,
): Promise<AccountSyntheticI3FillResult> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let result: WorkResult = fail("INTERNAL_ERROR");
  let destroyClient = false;
  let cleanupFailed = false;

  try {
    client = await database.connect();
    await client.query("begin isolation level read committed");
    result = await work(client);
    destroyClient = result.ok === false && result.destroyClient === true;
    if (result.ok || (result.ok === false && result.commitFailure === true)) {
      await client.query("commit");
    } else {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
        cleanupFailed = true;
      }
    }
  } catch {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
      }
    }
    cleanupFailed = true;
    result = fail("INTERNAL_ERROR");
  }

  if (client) {
    try {
      await client.release(destroyClient || cleanupFailed);
    } catch {
      cleanupFailed = true;
    }
  }

  return cleanupFailed ? fail("INTERNAL_ERROR") : stripWorkFlags(result);
}

async function hasStaleTransactionContext(client: InvestingAuthorityTransactionClient) {
  const result = await client.query<Record<string, string | null>>(
    `select ${transactionContextKeys
      .map((key, index) => `current_setting('${key}', true) as c${index}`)
      .join(", ")}`,
  );
  const row = result.rows[0] ?? {};
  return Object.values(row).some((value) => value !== null && value !== "");
}

async function setTransactionContext(
  client: InvestingAuthorityTransactionClient,
  values: Record<string, string>,
) {
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}

async function expectExactlyOne<Row>(
  query: Promise<InvestingAuthorityQueryResult<Row>>,
  emptyCode: AccountSyntheticI3FillFailureCode,
): Promise<{ ok: true; row: Row } | AccountSyntheticI3FillFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function hashMaterialRequest(input: {
  context: AuthorizedInvestingContext;
  instrumentId: string;
  side: I3SyntheticFillSide;
  quantity: string;
  unitPrice: string;
  grossConsideration: string;
  feeAmount: string;
  settlementCurrency: string;
  effectiveAt: string;
  sourceSequence: string;
  sourceReference: string;
}) {
  const fields = [
    materialHashDomain,
    input.context.actorId,
    input.context.principalId,
    input.context.tenantId,
    input.context.accountId,
    input.instrumentId,
    input.side,
    input.quantity,
    input.unitPrice,
    input.grossConsideration,
    input.feeAmount,
    input.settlementCurrency,
    input.effectiveAt,
    input.sourceSequence,
    source,
    input.sourceReference,
    valueOrigin,
    freshness,
    accountingContext,
  ];
  return createHash("sha256").update(fields.join("\0")).digest("hex").toUpperCase();
}

function hashEventSet(fillId: string, rows: AllocationPlanRow[]) {
  const hash = createHash("sha256").update(eventSetHashDomain).update("\0").update(fillId);
  for (const row of rows) {
    hash
      .update("\0")
      .update(row.lot_origin_id)
      .update("\0")
      .update(row.consumed_quantity)
      .update("\0")
      .update(row.allocated_cost_basis ?? "UNAVAILABLE")
      .update("\0")
      .update(row.allocated_gross_proceeds ?? "UNAVAILABLE")
      .update("\0")
      .update(row.allocated_disposal_fee ?? "UNAVAILABLE");
  }
  return hash.digest("hex").toUpperCase();
}

function isBoundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isValidBigintText(value: string) {
  if (!sourceSequencePattern.test(value)) return false;
  return value.length < maxBigintText.length || (value.length === maxBigintText.length && value <= maxBigintText);
}

function fail(code: AccountSyntheticI3FillFailureCode): AccountSyntheticI3FillFailure {
  return { ok: false, code };
}

function stripWorkFlags(result: WorkResult): AccountSyntheticI3FillResult {
  if (result.ok === true) return result;
  return { ok: false, code: result.code };
}
