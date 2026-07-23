import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";

import pg from "pg";

const { Client } = pg;
const databaseUrl = String(process.env.INVESTING_WORKER_DATABASE_URL || "");
const workerName = String(process.env.INVESTING_WORKER_NAME || "investing-paper-worker");
const targetOrderId = String(process.env.INVESTING_WORKER_TARGET_ORDER_ID || "");
const holdState = String(process.env.INVESTING_WORKER_QA_HOLD_STATE || "");
const qaMode = String(process.env.INVESTING_WORKER_QA_MODE || "").toLowerCase() === "true";
const once = String(process.env.INVESTING_WORKER_ONCE || "").toLowerCase() === "true";
const pollMs = Math.max(100, Number(process.env.INVESTING_WORKER_POLL_MS || 1000));
const environment = String(process.env.INVESTING_EXECUTION_ENVIRONMENT || "paper").toLowerCase();
const healthPort = Number(process.env.INVESTING_WORKER_HEALTH_PORT ?? 8788);
const health = { status: "starting", lastHeartbeatAt: null, lastCycleAt: null, error: null };

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({
    at: new Date().toISOString(),
    event,
    worker_name: workerName,
    pid: process.pid,
    ...fields,
  })}\n`);
}

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function correlation(prefix, orderId = "") {
  return `${prefix}_${crypto.randomUUID()}${orderId ? `_${orderId}` : ""}`;
}

function numeric(value) {
  const parsed = Number(value);
  invariant(Number.isFinite(parsed), "investing_worker_numeric_invalid");
  return parsed;
}

async function heartbeat(client) {
  const id = correlation("investing_worker_heartbeat");
  const response = await client.query(
    "select public.investing_recover_stuck_paper_v2($1,$2) result",
    [workerName, id],
  );
  health.lastHeartbeatAt = new Date().toISOString();
  log("heartbeat", { correlation_id: id, metrics: response.rows[0].result });
}

async function startHealthServer() {
  invariant(Number.isInteger(healthPort) && healthPort >= 0 && healthPort <= 65535, "investing_worker_health_port_invalid");
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    if (request.url !== "/health") {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    response.statusCode = health.status === "failed" ? 503 : 200;
    response.end(JSON.stringify({
      ok: health.status !== "failed",
      worker_name: workerName,
      environment: "paper",
      pid: process.pid,
      status: health.status,
      last_heartbeat_at: health.lastHeartbeatAt,
      last_cycle_at: health.lastCycleAt,
    }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(healthPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  log("health_listening", { health_url: `http://127.0.0.1:${address.port}/health` });
  return server;
}

async function claim(client) {
  await client.query("begin");
  try {
    const parameters = [];
    let target = "";
    if (targetOrderId) {
      parameters.push(targetOrderId);
      target = `and id=$${parameters.length}::uuid`;
    }
    const response = await client.query(`
      select id,user_id,status,quantity,cumulative_filled_quantity,limit_price
      from public.investing_orders
      where environment='paper'
        and status in ('submitting','submitted','partially_filled','filled','reconciling','reconciliation_failed')
        ${target}
      order by updated_at,id
      for update skip locked
      limit 1
    `, parameters);
    return response.rows[0] || null;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function processClaimedOrder(client, order) {
  const orderId = String(order.id);
  if (holdState && order.status === holdState) {
    log("qa_hold_reached", { order_id: orderId, state: order.status });
    await new Promise(() => {});
  }

  if (order.status === "submitting") {
    const id = correlation("investing_worker_ack", orderId);
    await client.query(
      "select public.investing_ack_paper_order_v2($1,$2,$3)",
      [order.user_id, orderId, id],
    );
    log("order_acknowledged", { order_id: orderId, correlation_id: id });
    return;
  }

  if (order.status === "submitted" || order.status === "partially_filled") {
    const quantity = numeric(order.quantity);
    const cumulative = numeric(order.cumulative_filled_quantity);
    const remaining = Number((quantity - cumulative).toFixed(12));
    invariant(remaining > 0, "investing_worker_remaining_quantity_invalid");
    const fillKey = `worker_fill_${orderId}_${String(order.cumulative_filled_quantity).replace(/\W/g, "_")}`;
    const id = correlation("investing_worker_fill", orderId);
    await client.query(
      "select public.investing_record_paper_fill_v2($1,$2,$3,$3,$4,$5,0,0,now(),$6)",
      [order.user_id, orderId, fillKey, remaining, order.limit_price, id],
    );
    log("fill_recorded", { order_id: orderId, fill_id: fillKey, quantity: remaining, correlation_id: id });
    const startId = correlation("investing_worker_reconciliation_start", orderId);
    await client.query(
      "select public.investing_start_paper_reconciliation_v2($1,$2,$3)",
      [order.user_id, orderId, startId],
    );
    const finishId = correlation("investing_worker_reconciliation_finish", orderId);
    const result = await client.query(
      "select public.investing_reconcile_paper_order_v2($1,$2,$3) result",
      [order.user_id, orderId, finishId],
    );
    log("reconciliation_completed", { order_id: orderId, correlation_id: finishId, result: result.rows[0].result });
    return;
  }

  if (order.status === "filled" || order.status === "reconciliation_failed") {
    const startId = correlation("investing_worker_reconciliation_start", orderId);
    await client.query(
      "select public.investing_start_paper_reconciliation_v2($1,$2,$3)",
      [order.user_id, orderId, startId],
    );
    const finishId = correlation("investing_worker_reconciliation_finish", orderId);
    const result = await client.query(
      "select public.investing_reconcile_paper_order_v2($1,$2,$3) result",
      [order.user_id, orderId, finishId],
    );
    log("reconciliation_completed", { order_id: orderId, correlation_id: finishId, result: result.rows[0].result });
    return;
  }

  if (order.status === "reconciling") {
    const id = correlation("investing_worker_reconciliation_resume", orderId);
    const result = await client.query(
      "select public.investing_reconcile_paper_order_v2($1,$2,$3) result",
      [order.user_id, orderId, id],
    );
    log("reconciliation_resumed", { order_id: orderId, correlation_id: id, result: result.rows[0].result });
  }
}

async function cycle(client) {
  await heartbeat(client);
  const order = await claim(client);
  if (!order) {
    await client.query("rollback");
    log("idle", { target_order_id: targetOrderId || null });
    health.lastCycleAt = new Date().toISOString();
    return false;
  }
  try {
    log("order_claimed", { order_id: order.id, state: order.status });
    await processClaimedOrder(client, order);
    await client.query("commit");
    health.lastCycleAt = new Date().toISOString();
    log("order_committed", { order_id: order.id });
    return true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  invariant(environment === "paper", environment === "live" ? "investing_live_execution_blocked" : "investing_execution_environment_invalid");
  invariant(!holdState || qaMode, "investing_worker_qa_hold_requires_qa_mode");
  invariant(databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"), "investing_worker_database_url_required");
  invariant(/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(workerName), "investing_worker_name_invalid");
  const healthServer = await startHealthServer();
  const client = new Client({ connectionString: databaseUrl, application_name: workerName });
  await client.connect();
  await client.query("set role service_role");
  await client.query("set lock_timeout='10s'");
  await client.query("set statement_timeout='20s'");
  log("worker_started", { environment: "paper" });
  health.status = "healthy";
  try {
    do {
      await cycle(client);
      if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs));
    } while (!once);
  } finally {
    health.status = "stopping";
    await client.end().catch(() => undefined);
    await new Promise((resolve) => healthServer.close(resolve));
  }
  log("worker_stopped");
}

main().catch((error) => {
  health.status = "failed";
  health.error = String(error?.message || "investing_worker_failed").split("\n", 1)[0];
  log("worker_failed", { error: health.error });
  process.exitCode = 1;
});
