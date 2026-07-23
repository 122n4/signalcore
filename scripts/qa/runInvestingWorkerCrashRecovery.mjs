import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import pg from "pg";

const { Client } = pg;
const databaseUrl = String(process.env.INVESTING_TEST_DATABASE_URL || "");
const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const workerScript = path.resolve("scripts/investing/runPersistentPaperWorker.mjs");
const artifactDirectory = path.resolve("artifacts/investing-worker-crash", runId);
const evidence = { runId, startedAt: new Date().toISOString(), scenarios: [], ambiguity: {}, liveBlock: {} };

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function numeric(value) {
  const parsed = Number(value);
  invariant(Number.isFinite(parsed), "worker_crash_numeric_invalid");
  return parsed;
}

async function queryOne(client, sql, parameters = []) {
  const response = await client.query(sql, parameters);
  return response.rows[0];
}

async function serviceClient() {
  const client = new Client({ connectionString: databaseUrl, application_name: `worker-crash-harness-${runId}` });
  await client.connect();
  await client.query("set role service_role");
  await client.query("set statement_timeout='20s'");
  return client;
}

async function seedOrder(client, label, targetState) {
  const userId = `worker_crash_${runId}_${label}`;
  const portfolioId = `worker_portfolio_${label}`;
  const opened = await queryOne(client,
    "select public.investing_open_paper_account_v2($1,$2,'EUR',1000,$3,$4) result",
    [userId, portfolioId, `fund_${runId}_${label}`, `fund_corr_${runId}_${label}`],
  );
  const accountId = opened.result.account_id;
  const fingerprint = `worker_decision_${runId}_${label}`;
  await client.query(`
    insert into public.investing_rebalance_ledger(
      user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,
      rebalance_actions,governance_policy,portfolio_id,account_id
    ) values($1,'investing',$2,$3,$4,'proposed',$5::jsonb,$6::jsonb,$7,$8)
  `, [
    userId, `2099-05-${String(evidence.scenarios.length + 1).padStart(2, "0")}`, fingerprint,
    `worker_mandate_${runId}_${label}`,
    JSON.stringify([{ symbol: "VWCE", action: "buy", deltaValueEur: 100 }]),
    JSON.stringify({ approvedSymbols: ["VWCE"] }), portfolioId, accountId,
  ]);
  const queue = await queryOne(client, `
    insert into public.investing_execution_queue(
      user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,
      approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,
      operational_state,version,expires_at
    ) values($1,'investing',$2,$3,$4,'paper_execute','not_required',false,500,$5,$6,'approved',1,now()+interval '1 hour')
    returning id
  `, [
    userId, `2099-05-${String(evidence.scenarios.length + 1).padStart(2, "0")}`, fingerprint,
    `worker_mandate_${runId}_${label}`, portfolioId, accountId,
  ]);
  const submitted = await queryOne(client, `
    select public.investing_submit_paper_order_v2($1,$2,1,'VWCE',100,now(),$3,$4,$5) result
  `, [userId, queue.id, `worker_client_${runId}_${label}`, `worker_idem_${runId}_${label}`, `worker_submit_${runId}_${label}`]);
  const orderId = submitted.result.order_id;
  if (["submitted", "partially_filled", "reconciling"].includes(targetState)) {
    await client.query("select public.investing_ack_paper_order_v2($1,$2,$3)", [userId, orderId, `worker_ack_${runId}_${label}`]);
  }
  if (targetState === "partially_filled") {
    await client.query(`
      select public.investing_record_paper_fill_v2($1,$2,$3,$4,0.4,100,1,0.5,now(),$5)
    `, [userId, orderId, `seed_partial_${runId}_${label}`, `seed_partial_broker_${runId}_${label}`, `seed_partial_corr_${runId}_${label}`]);
  }
  if (targetState === "reconciling") {
    await client.query(`
      select public.investing_record_paper_fill_v2($1,$2,$3,$4,1,100,1,0.5,now(),$5)
    `, [userId, orderId, `seed_full_${runId}_${label}`, `seed_full_broker_${runId}_${label}`, `seed_full_corr_${runId}_${label}`]);
    await client.query("select public.investing_start_paper_reconciliation_v2($1,$2,$3)", [userId, orderId, `seed_reconcile_${runId}_${label}`]);
  }
  return { label, targetState, userId, portfolioId, accountId, queueId: queue.id, orderId };
}

function startWorker({ name, orderId, holdState = "", environment = "paper" }) {
  const logs = [];
  const child = spawn(process.execPath, [workerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INVESTING_WORKER_DATABASE_URL: databaseUrl,
      INVESTING_WORKER_NAME: name,
      INVESTING_WORKER_TARGET_ORDER_ID: orderId || "",
      INVESTING_WORKER_QA_HOLD_STATE: holdState,
      INVESTING_WORKER_QA_MODE: "true",
      INVESTING_WORKER_ONCE: "true",
      INVESTING_WORKER_HEALTH_PORT: "0",
      INVESTING_EXECUTION_ENVIRONMENT: environment,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try { logs.push(JSON.parse(line)); } catch { logs.push({ event: "unparsed_stdout", line }); }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => logs.push({ event: "stderr", line: String(chunk).trim() }));
  return { child, logs };
}

async function waitForLog(running, event, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = running.logs.find((entry) => entry.event === event);
    if (found) return found;
    if (running.child.exitCode !== null) throw new Error(`worker_exited_before_${event}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`worker_log_timeout_${event}`);
}

async function waitForExit(running, timeoutMs = 20_000) {
  if (running.child.exitCode !== null) return { code: running.child.exitCode, signal: running.child.signalCode };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker_exit_timeout")), timeoutMs);
    running.child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function killAtState(scenario) {
  const running = startWorker({
    name: `investing-crash-${runId}-${scenario.label}`,
    orderId: scenario.orderId,
    holdState: scenario.targetState,
  });
  const hold = await waitForLog(running, "qa_hold_reached");
  const healthLog = await waitForLog(running, "health_listening");
  const healthResponse = await fetch(healthLog.health_url, { cache: "no-store" });
  const healthBody = await healthResponse.json();
  invariant(healthResponse.status === 200 && healthBody.ok === true && healthBody.pid === hold.pid, `${scenario.label}_health_failed`);
  invariant(hold.state === scenario.targetState, `${scenario.label}_hold_state_wrong`);
  const killed = running.child.kill("SIGKILL");
  invariant(killed, `${scenario.label}_kill_failed`);
  const exit = await waitForExit(running);
  invariant(exit.code !== 0, `${scenario.label}_worker_not_killed`);
  return { pid: hold.pid, health: { status: healthResponse.status, body: healthBody }, exit, logs: running.logs };
}

async function ageOrder(admin, orderId) {
  await admin.query("begin");
  try {
    await admin.query("alter table public.investing_orders disable trigger investing_orders_touch_updated_at");
    await admin.query("update public.investing_orders set updated_at=now()-interval '10 minutes' where id=$1", [orderId]);
    await admin.query("alter table public.investing_orders enable trigger investing_orders_touch_updated_at");
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
}

async function runOnce(scenario, suffix = "restart") {
  const running = startWorker({ name: `investing-${suffix}-${runId}-${scenario.label}`, orderId: scenario.orderId });
  const exit = await waitForExit(running);
  invariant(exit.code === 0, `${scenario.label}_${suffix}_failed`);
  return { pid: running.child.pid, exit, logs: running.logs };
}

async function snapshot(client, scenario) {
  const order = await queryOne(client, "select status,cumulative_filled_quantity,reserved_cash_amount,idempotency_key from public.investing_orders where id=$1", [scenario.orderId]);
  const queue = await queryOne(client, "select operational_state from public.investing_execution_queue where id=$1", [scenario.queueId]);
  const cash = await queryOne(client, "select available_amount,settled_amount,reserved_amount from public.investing_cash_balances where account_id=$1", [scenario.accountId]);
  const position = await queryOne(client, "select quantity,cost_basis,reserved_quantity from public.investing_positions where account_id=$1 and symbol='VWCE'", [scenario.accountId]);
  const counts = await queryOne(client, `
    select
      (select count(*)::int from public.investing_orders where id=$1) orders,
      (select count(*)::int from public.investing_fills where order_id=$1) fills,
      (select count(*)::int from public.investing_ledger_transactions where account_id=$2 and source_type='fill') fill_transactions,
      (select count(*)::int from public.investing_reconciliation_runs where account_id=$2) reconciliation_runs,
      (select count(*)::int from public.investing_execution_events where order_id=$1 and event_type like '%recovered%') recovery_events
  `, [scenario.orderId, scenario.accountId]);
  const ledger = await queryOne(client, `
    select count(*) filter(where delta<>0)::int unbalanced, min(entries)::int min_entries
    from (
      select t.id,count(e.id) entries,
        round(sum(case when e.side='debit' then e.amount else -e.amount end),8) delta
      from public.investing_ledger_transactions t
      join public.investing_ledger_entries e on e.transaction_id=t.id
      where t.account_id=$1 group by t.id
    ) x
  `, [scenario.accountId]);
  return { order, queue, cash, position: position || null, counts, ledger };
}

async function crashScenario(admin, service, targetState) {
  const scenario = await seedOrder(service, targetState, targetState);
  const before = await snapshot(service, scenario);
  const crash = await killAtState(scenario);
  const persistedAfterKill = await snapshot(service, scenario);
  invariant(persistedAfterKill.order.status === targetState, `${targetState}_state_not_persisted_after_kill`);
  if (targetState === "submitting" || targetState === "reconciling") await ageOrder(admin, scenario.orderId);
  const restart = await runOnce(scenario);
  const after = await snapshot(service, scenario);
  invariant(after.counts.orders === 1, `${targetState}_duplicate_order`);
  invariant(after.ledger.unbalanced === 0 && after.ledger.min_entries >= 2, `${targetState}_ledger_invalid`);
  if (targetState === "submitting") {
    invariant(after.order.status === "submission_failed", "submitting_not_safely_blocked");
    invariant(numeric(after.cash.reserved_amount) === 0 && after.counts.fills === 0, "submitting_financial_effect_after_recovery");
    invariant(after.counts.recovery_events === 1, "submitting_recovery_event_missing");
  } else {
    invariant(after.order.status === "reconciled" && after.queue.operational_state === "reconciled", `${targetState}_not_reconciled`);
    invariant(numeric(after.order.cumulative_filled_quantity) === 1, `${targetState}_quantity_wrong`);
    invariant(numeric(after.cash.reserved_amount) === 0, `${targetState}_reservation_stuck`);
    invariant(after.counts.reconciliation_runs === 1, `${targetState}_reconciliation_run_count_wrong`);
    if (targetState === "partially_filled") invariant(after.counts.fills === 2, "partial_fill_not_completed_exactly_once");
    else invariant(after.counts.fills === 1, `${targetState}_fill_count_wrong`);
    if (targetState === "reconciling") invariant(after.counts.recovery_events === 1, "reconciling_recovery_event_missing");
  }
  const repeatedRestart = await runOnce(scenario, "second-restart");
  const repeated = await snapshot(service, scenario);
  invariant(repeated.counts.fills === after.counts.fills && repeated.counts.reconciliation_runs === after.counts.reconciliation_runs, `${targetState}_restart_not_idempotent`);
  const result = { targetState, scenario, before, crash, persistedAfterKill, restart, after, repeatedRestart, repeated };
  evidence.scenarios.push(result);
  return result;
}

async function testTwoWorkers(service) {
  const scenario = await seedOrder(service, "two_workers", "submitted");
  const first = startWorker({ name: `investing-dual-a-${runId}`, orderId: scenario.orderId });
  const second = startWorker({ name: `investing-dual-b-${runId}`, orderId: scenario.orderId });
  const exits = await Promise.all([waitForExit(first), waitForExit(second)]);
  invariant(exits.every((entry) => entry.code === 0), "two_workers_process_failed");
  const after = await snapshot(service, scenario);
  invariant(after.order.status === "reconciled" && after.counts.fills === 1 && after.counts.reconciliation_runs === 1, "two_workers_duplicate_effect");
  evidence.ambiguity.twoWorkers = { scenario, pids: [first.child.pid, second.child.pid], exits, logs: [first.logs, second.logs], after };
}

async function testOutOfOrderAndReplay(service) {
  const outOfOrder = await seedOrder(service, "out_of_order", "submitting");
  let rejected = false;
  try {
    await service.query(`
      select public.investing_record_paper_fill_v2($1,$2,$3,$3,1,100,0,0,now(),$4)
    `, [outOfOrder.userId, outOfOrder.orderId, `out_of_order_fill_${runId}`, `out_of_order_corr_${runId}`]);
  } catch (error) {
    rejected = String(error.message).includes("investing_order_state_rejects_fill");
  }
  invariant(rejected, "out_of_order_fill_not_rejected");

  const submitted = evidence.scenarios.find((entry) => entry.targetState === "submitted");
  const replay = await queryOne(service, `
    select public.investing_record_paper_fill_v2(
      o.user_id,o.id,f.fill_id,f.broker_fill_id,f.quantity,f.price,
      f.fee_amount,f.tax_amount,f.executed_at,$2
    ) result
    from public.investing_orders o
    join public.investing_fills f on f.order_id=o.id
    where o.id=$1
  `, [submitted.scenario.orderId, `duplicate_fill_corr_${runId}`]);
  invariant(replay.result.replayed === true, "same_fill_not_replayed");
  const afterReplay = await snapshot(service, submitted.scenario);
  invariant(afterReplay.counts.fills === 1 && afterReplay.counts.fill_transactions === 1, "same_fill_duplicated_financial_effect");
  evidence.ambiguity.outOfOrder = { rejected, orderId: outOfOrder.orderId };
  evidence.ambiguity.sameFillReplay = { replayed: true, after: afterReplay };
}

async function testLiveWorkerBlock() {
  const running = startWorker({ name: `investing-live-block-${runId}`, orderId: "", environment: "live" });
  const exit = await waitForExit(running);
  invariant(exit.code === 1, "live_worker_config_not_blocked");
  invariant(running.logs.some((entry) => entry.error === "investing_live_execution_blocked"), "live_worker_explicit_error_missing");
  evidence.liveBlock = { exit, logs: running.logs };
}

async function main() {
  invariant(databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"), "INVESTING_TEST_DATABASE_URL_required");
  const admin = new Client({ connectionString: databaseUrl, application_name: `worker-crash-admin-${runId}` });
  await admin.connect();
  const service = await serviceClient();
  try {
    for (const state of ["submitting", "submitted", "partially_filled", "reconciling"]) {
      await crashScenario(admin, service, state);
    }
    await testTwoWorkers(service);
    await testOutOfOrderAndReplay(service);
    await testLiveWorkerBlock();
    evidence.completedAt = new Date().toISOString();
    evidence.ok = true;
    await fs.mkdir(artifactDirectory, { recursive: true });
    await fs.writeFile(path.join(artifactDirectory, "report.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ ok: true, runId, artifactDirectory, scenarios: evidence.scenarios.map((entry) => ({
      state: entry.targetState,
      killedPid: entry.crash.pid,
      finalStatus: entry.after.order.status,
      fills: entry.after.counts.fills,
      recoveryEvents: entry.after.counts.recovery_events,
    })), twoWorkers: evidence.ambiguity.twoWorkers.after }, null, 2)}\n`);
  } finally {
    await Promise.allSettled([service.end(), admin.end()]);
  }
}

main().catch(async (error) => {
  evidence.ok = false;
  evidence.error = String(error?.stack || error);
  await fs.mkdir(artifactDirectory, { recursive: true }).catch(() => undefined);
  await fs.writeFile(path.join(artifactDirectory, "report.failed.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8").catch(() => undefined);
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
