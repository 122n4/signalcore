import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.INVESTING_TEST_DATABASE_URL
  || "postgresql://postgres@127.0.0.1:55432/signalcore_investing_test";
const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const results = [];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function client() {
  const db = new Client({ connectionString, application_name: `investing-concurrency-${runId}` });
  await db.connect();
  await db.query("set role service_role");
  await db.query("set lock_timeout='10s'");
  await db.query("set statement_timeout='20s'");
  return db;
}

async function queryOne(db, sql, params = []) {
  const response = await db.query(sql, params);
  return response.rows[0];
}

async function openAccount(db, suffix, initialDeposit = 1000) {
  const userId = `concurrency_${runId}_${suffix}`;
  const portfolioId = `portfolio_${suffix}`;
  const row = await queryOne(db,
    "select public.investing_open_paper_account_v2($1,$2,'EUR',$3,$4,$5) result",
    [userId, portfolioId, initialDeposit, `fund_${runId}_${suffix}`, `fund_corr_${runId}_${suffix}`],
  );
  return { userId, portfolioId, accountId: row.result.account_id };
}

async function proposal(db, owner, suffix, side = "buy", notional = 100, approval = false) {
  const fingerprint = `decision_${runId}_${suffix}`;
  await db.query(`
    insert into public.investing_rebalance_ledger(
      user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,
      rebalance_actions,governance_policy,portfolio_id,account_id
    ) values($1,'investing',$2,$3,$4,'proposed',$5::jsonb,$6::jsonb,$7,$8)
  `, [
    owner.userId, `2099-03-${String(results.length + 1).padStart(2, "0")}`, fingerprint,
    `mandate_${runId}_${suffix}`,
    JSON.stringify([{ symbol: "VWCE", action: side, deltaValueEur: side === "buy" ? notional : -notional }]),
    JSON.stringify({ approvedSymbols: ["VWCE"] }), owner.portfolioId, owner.accountId,
  ]);
  const queue = await queryOne(db, `
    insert into public.investing_execution_queue(
      user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,
      approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,
      operational_state,version,expires_at
    ) values($1,'investing',$2,$3,$4,$5,$6,$7,2000,$8,$9,$10,1,now()+interval '1 hour')
    returning id,version
  `, [
    owner.userId, `2099-03-${String(results.length + 1).padStart(2, "0")}`, fingerprint,
    `mandate_${runId}_${suffix}`, approval ? "manual_execute" : "paper_execute",
    approval ? "pending" : "not_required", approval,
    owner.portfolioId, owner.accountId, approval ? "awaiting_approval" : "approved",
  ]);
  return queue;
}

async function submit(db, owner, queueId, suffix, idempotency = suffix) {
  const row = await queryOne(db, `
    select public.investing_submit_paper_order_v2($1,$2,1,'VWCE',100,now(),$3,$4,$5) result
  `, [owner.userId, queueId, `client_${runId}_${suffix}`, `idem_${runId}_${idempotency}`, `submit_corr_${runId}_${suffix}`]);
  return row.result;
}

async function acknowledge(db, owner, orderId, suffix) {
  return (await queryOne(db,
    "select public.investing_ack_paper_order_v2($1,$2,$3) result",
    [owner.userId, orderId, `ack_corr_${runId}_${suffix}`],
  )).result;
}

async function dailyCycle(db, owner, suffix) {
  const asOf = "2099-03-20T12:00:00.000Z";
  const dayKey = "2099-03-20";
  const mandateFingerprint = `daily_mandate_${runId}`;
  const decisionFingerprint = `daily_decision_${runId}`;
  const common = { user_id: owner.userId, portfolio_id: owner.portfolioId };
  const params = [
    owner.userId, owner.portfolioId, owner.accountId, dayKey, `daily_request_${runId}`,
    `daily_corr_${runId}_${suffix}`, null,
    JSON.stringify({ ...common, day_key: dayKey, environment: "paper", total_amount: 1000, cash_amount: 1000, base_currency: "EUR", canonical_result: { status: "hold" } }),
    JSON.stringify({ ...common, as_of: asOf, mandate_fingerprint: mandateFingerprint, algorithm_version: "investing_v2", objective: "growth", risk_profile: "balanced", horizon: "long", base_currency: "EUR", mandate_version: "1", policy_version: "1", model_version: "1" }),
    JSON.stringify({ ...common, as_of: asOf, decision_fingerprint: decisionFingerprint, mandate_fingerprint: mandateFingerprint, algorithm_version: "investing_v2", objective: "growth", status: "proposed", target_portfolio: [], rebalance_actions: [], governance_policy: { approvedSymbols: [] }, policy_version: "1", model_version: "1" }),
    JSON.stringify({ ...common, as_of: asOf, research_fingerprint: `daily_research_${runId}`, mandate_fingerprint: mandateFingerprint, algorithm_version: "investing_v2", benchmark_id: "none", status: "review", policy_version: "1", model_version: "1" }),
    JSON.stringify({ ...common, mode: "investing", as_of: asOf, decision_fingerprint: decisionFingerprint, mandate_fingerprint: mandateFingerprint, algorithm_version: "investing_v2", execution_decision: "hold", approval_status: "not_required", approval_required: false, kill_switch_active: false, override_allowed: false, max_deployable_pct: 0, deployable_capital_eur: 0, operational_state: "proposed" }),
  ];
  return queryOne(db, `
    select public.investing_record_daily_cycle_v2(
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb
    ) result
  `, params);
}

async function race(label, operations) {
  const started = performance.now();
  const settled = await Promise.allSettled(operations.map((operation) => operation()));
  const durationMs = Math.round(performance.now() - started);
  invariant(durationMs < 20_000, `${label}:lock_timeout`);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  const rejected = settled.filter((item) => item.status === "rejected");
  results.push({ label, durationMs, fulfilled: fulfilled.length, rejected: rejected.length });
  return settled;
}

const control = await client();
const c1 = await client();
const c2 = await client();

try {
  // Simultaneous approve/reject: one immutable decision only.
  const approvalOwner = await openAccount(control, "approval");
  const approvalQueue = await proposal(control, approvalOwner, "approval", "buy", 100, true);
  let settled = await race("approve_vs_reject", [
    () => queryOne(c1, "select public.investing_record_approval_v2($1,$2,'pending',1,'approved',null,$3) result", [approvalOwner.userId, approvalQueue.id, `approval_a_${runId}`]),
    () => queryOne(c2, "select public.investing_record_approval_v2($1,$2,'pending',1,'rejected',null,$3) result", [approvalOwner.userId, approvalQueue.id, `approval_b_${runId}`]),
  ]);
  invariant(settled.filter((item) => item.status === "fulfilled").length === 1, "approval_race_not_single_winner");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_execution_approvals where queue_id=$1", [approvalQueue.id])).count) === 1, "approval_race_duplicate_effect");

  // Same daily command from two sessions creates one canonical cycle.
  const dailyOwner = await openAccount(control, "daily");
  settled = await race("two_daily_cycles", [
    () => dailyCycle(c1, dailyOwner, "a"),
    () => dailyCycle(c2, dailyOwner, "b"),
  ]);
  invariant(settled.every((item) => item.status === "fulfilled"), "daily_cycle_race_failed");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_daily_cycles where user_id=$1 and client_request_id=$2", [dailyOwner.userId, `daily_request_${runId}`])).count) === 1, "daily_cycle_duplicate_effect");

  // Two submits for one proposal: one order and one reservation.
  const submitOwner = await openAccount(control, "submit");
  const submitQueue = await proposal(control, submitOwner, "submit");
  settled = await race("two_submits_same_proposal", [
    () => submit(c1, submitOwner, submitQueue.id, "submit_a", "submit_a"),
    () => submit(c2, submitOwner, submitQueue.id, "submit_b", "submit_b"),
  ]);
  invariant(settled.filter((item) => item.status === "fulfilled").length === 1, "submit_race_not_single_winner");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_orders where queue_id=$1", [submitQueue.id])).count) === 1, "submit_race_duplicate_order");
  invariant(Number((await queryOne(control, "select reserved_amount value from public.investing_cash_balances where account_id=$1", [submitOwner.accountId])).value) === 100, "submit_race_duplicate_reservation");

  // Same idempotency key returns the same canonical order to both callers.
  const idemOwner = await openAccount(control, "idem");
  const idemQueue = await proposal(control, idemOwner, "idem");
  settled = await race("same_idempotency_submit", [
    () => submit(c1, idemOwner, idemQueue.id, "idem_same", "idem_same"),
    () => submit(c2, idemOwner, idemQueue.id, "idem_same", "idem_same"),
  ]);
  invariant(settled.every((item) => item.status === "fulfilled"), "same_idempotency_not_replay_safe");
  const idempotentOrderIds = settled.map((item) => item.value.order_id);
  invariant(new Set(idempotentOrderIds).size === 1, "same_idempotency_returned_different_orders");
  invariant(settled.some((item) => item.value.replayed === true), "same_idempotency_missing_replay");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_orders where account_id=$1", [idemOwner.accountId])).count) === 1, "same_idempotency_duplicate_order");

  // Duplicate fill / two workers: both calls return safely and persist one effect.
  const fillOwner = await openAccount(control, "fill");
  const fillQueue = await proposal(control, fillOwner, "fill");
  const fillOrder = await submit(control, fillOwner, fillQueue.id, "fill_submit");
  await acknowledge(control, fillOwner, fillOrder.order_id, "fill");
  settled = await race("duplicate_fill_two_workers", [
    () => queryOne(c1, "select public.investing_record_paper_fill_v2($1,$2,$3,$4,1,100,1,2,now(),$5) result", [fillOwner.userId, fillOrder.order_id, `fill_${runId}`, `broker_fill_${runId}`, `fill_corr_a_${runId}`]),
    () => queryOne(c2, "select public.investing_record_paper_fill_v2($1,$2,$3,$4,1,100,1,2,now(),$5) result", [fillOwner.userId, fillOrder.order_id, `fill_${runId}`, `broker_fill_${runId}`, `fill_corr_b_${runId}`]),
  ]);
  invariant(settled.every((item) => item.status === "fulfilled"), "duplicate_fill_not_replay_safe");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_fills where order_id=$1", [fillOrder.order_id])).count) === 1, "duplicate_fill_persisted_twice");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_ledger_transactions where source_type='fill' and source_id=$1", [`fill_${runId}`])).count) === 1, "duplicate_fill_ledger_twice");

  // Two distinct partial fills serialize and complete exactly once each.
  const partialOwner = await openAccount(control, "partial");
  const partialQueue = await proposal(control, partialOwner, "partial");
  const partialOrder = await submit(control, partialOwner, partialQueue.id, "partial_submit");
  await acknowledge(control, partialOwner, partialOrder.order_id, "partial");
  settled = await race("concurrent_partial_fills", [
    () => queryOne(c1, "select public.investing_record_paper_fill_v2($1,$2,$3,$4,0.5,100,0,0,now(),$5) result", [partialOwner.userId, partialOrder.order_id, `partial_a_${runId}`, `partial_broker_a_${runId}`, `partial_corr_a_${runId}`]),
    () => queryOne(c2, "select public.investing_record_paper_fill_v2($1,$2,$3,$4,0.5,100,0,0,now(),$5) result", [partialOwner.userId, partialOrder.order_id, `partial_b_${runId}`, `partial_broker_b_${runId}`, `partial_corr_b_${runId}`]),
  ]);
  invariant(settled.every((item) => item.status === "fulfilled"), "partial_fill_race_failed");
  const partialFinal = await queryOne(control, "select status,cumulative_filled_quantity from public.investing_orders where id=$1", [partialOrder.order_id]);
  invariant(partialFinal.status === "filled" && Number(partialFinal.cumulative_filled_quantity) === 1, "partial_fill_final_state_wrong");

  // Two reconciliation workers with the same correlation produce one immutable run.
  await queryOne(control, "select public.investing_start_paper_reconciliation_v2($1,$2,$3) result", [partialOwner.userId, partialOrder.order_id, `rec_start_${runId}`]);
  settled = await race("two_reconciliation_workers", [
    () => queryOne(c1, "select public.investing_reconcile_paper_order_v2($1,$2,$3) result", [partialOwner.userId, partialOrder.order_id, `rec_same_${runId}`]),
    () => queryOne(c2, "select public.investing_reconcile_paper_order_v2($1,$2,$3) result", [partialOwner.userId, partialOrder.order_id, `rec_same_${runId}`]),
  ]);
  invariant(settled.every((item) => item.status === "fulfilled"), "reconciliation_race_failed");
  invariant(Number((await queryOne(control, "select count(*) count from public.investing_reconciliation_runs where account_id=$1 and correlation_id=$2", [partialOwner.accountId, `rec_same_${runId}`])).count) === 1, "reconciliation_duplicate_run");

  // Competing cash reservations cannot overdraw available cash.
  const cashOwner = await openAccount(control, "cash", 1000);
  const cashQueueA = await proposal(control, cashOwner, "cash_a", "buy", 600);
  const cashQueueB = await proposal(control, cashOwner, "cash_b", "buy", 600);
  settled = await race("concurrent_cash_reservations", [
    () => submit(c1, cashOwner, cashQueueA.id, "cash_a"),
    () => submit(c2, cashOwner, cashQueueB.id, "cash_b"),
  ]);
  invariant(settled.filter((item) => item.status === "fulfilled").length === 1, "cash_reservation_race_not_single_winner");
  const cashFinal = await queryOne(control, "select available_amount,reserved_amount from public.investing_cash_balances where account_id=$1", [cashOwner.accountId]);
  invariant(Number(cashFinal.reserved_amount) === 600 && Number(cashFinal.available_amount) === 1000, "cash_reservation_final_state_wrong");

  // Competing sells cannot reserve more than the position.
  const sellOwner = await openAccount(control, "sell", 1000);
  const seedQueue = await proposal(control, sellOwner, "sell_seed", "buy", 100);
  const seedOrder = await submit(control, sellOwner, seedQueue.id, "sell_seed");
  await acknowledge(control, sellOwner, seedOrder.order_id, "sell_seed");
  await queryOne(control, "select public.investing_record_paper_fill_v2($1,$2,$3,$4,1,100,0,0,now(),$5) result", [sellOwner.userId, seedOrder.order_id, `sell_seed_fill_${runId}`, `sell_seed_broker_${runId}`, `sell_seed_corr_${runId}`]);
  const sellQueueA = await proposal(control, sellOwner, "sell_a", "sell", 75);
  const sellQueueB = await proposal(control, sellOwner, "sell_b", "sell", 75);
  settled = await race("concurrent_position_reservations", [
    () => submit(c1, sellOwner, sellQueueA.id, "sell_a"),
    () => submit(c2, sellOwner, sellQueueB.id, "sell_b"),
  ]);
  invariant(settled.filter((item) => item.status === "fulfilled").length === 1, "sell_reservation_race_not_single_winner");
  const positionFinal = await queryOne(control, "select quantity,reserved_quantity from public.investing_positions where account_id=$1 and symbol='VWCE'", [sellOwner.accountId]);
  invariant(Number(positionFinal.quantity) === 1 && Number(positionFinal.reserved_quantity) === 0.75, "sell_reservation_final_state_wrong");

  console.log(JSON.stringify({ ok: true, runId, races: results }, null, 2));
} finally {
  await Promise.allSettled([control.end(), c1.end(), c2.end()]);
}
