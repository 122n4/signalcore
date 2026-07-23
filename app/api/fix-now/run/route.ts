import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { getQuotes } from "@/lib/market/quotes";
import { computePortfolioValuation } from "@/lib/signalcore/valuation";
import { computeDiagnostics } from "@/lib/signalcore/engineV3";
import { buildDynamicStarterPack } from "@/lib/signalcore/dynamicStarterPack";
import { createExecutionId, writeEngineEvent } from "@/lib/engine/events";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";
import { isLeakResolved } from "@/lib/fixNow/leakResolution";
import {
  INVESTING_SHARED_BROKER_SYNC_BLOCKED,
  isInvestingSharedBrokerBlocked,
  resolveEffectiveSharedBrokerMode,
} from "@/lib/broker/investingBoundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  symbol: string;
  name: string | null;
  qty: number | null;
  valueEur: number | null;
  updatedAt: string | null;
};

type FixExecutionRow = {
  symbol: string;
  name: string | null;
  action: "buy" | "sell" | "hold";
  currentValueEur: number;
  targetValueEur: number;
  deltaEur: number;
  qtyCurrent: number | null;
  qtyTarget: number | null;
};

type FixAction = {
  round: number;
  leakKey: string;
  strategy: "starter_pack" | "concentration_rebalance" | "pricing_repair";
  changedRows: number;
  executionRows: FixExecutionRow[];
};

type PersistResult = {
  changed: number;
  executionRows: FixExecutionRow[];
};

function asNum(x: unknown, fallback = NaN) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normSymbol(x: unknown) {
  return String(x || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^\w.\-:]/g, "");
}

function roundQty(v: number) {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function roundValue(v: number) {
  return Math.round(v * 100) / 100;
}

function isPlanActive(plan: Record<string, unknown> | null) {
  if (!plan) return false;
  const status = String(plan.status ?? "").toLowerCase().trim();
  if (status) return status === "active";
  if (typeof plan.is_active === "boolean") return Boolean(plan.is_active);
  if (typeof plan.active === "boolean") return Boolean(plan.active);
  return Boolean(plan.id);
}

function concentrationTargetPct(mode: AutopilotMode) {
  void mode;
  return 33;
}

function concentrationDiversifierSymbols(mode: AutopilotMode) {
  void mode;
  return ["SPY", "QQQ", "AGGH", "GLD", "EFA"];
}

function isAutoFixableLeakKey(key: string | null | undefined) {
  const leak = String(key || "").toLowerCase().trim();
  return leak === "no_holdings" || leak === "concentration_high" || leak === "concentration_med" || leak === "pricing_low" || leak === "valuation_zero";
}

async function loadContext(args: { userId: string; mode: AutopilotMode }) {
  const sb = getSupabaseAdmin();
  const { userId, mode } = args;

  const [{ data: planRows, error: planErr }, { data: itemRows, error: itemsErr }, { data: snapRows }] = await Promise.all([
    sb.from("plans").select("*").eq("user_id", userId).eq("mode", mode).order("created_at", { ascending: false }).limit(1),
    sb
      .from("portfolio_items")
      .select("id,symbol,name,qty,value_eur,updated_at,mode")
      .eq("user_id", userId)
      .eq("mode", mode)
      .order("created_at", { ascending: true }),
    sb.from("daily_snapshots").select("total_eur").eq("user_id", userId).eq("mode", mode).order("day_key", { ascending: false }).limit(1),
  ]);

  if (planErr) throw new Error(planErr.message || "plans_read_failed");
  if (itemsErr) throw new Error(itemsErr.message || "portfolio_items_read_failed");

  const plan = ((planRows ?? [])[0] as Record<string, unknown> | null) ?? null;
  const hasPlan = isPlanActive(plan);
  const items: ItemRow[] = (itemRows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id || ""),
    symbol: normSymbol(r.symbol),
    name: r.name == null ? null : String(r.name),
    qty: Number.isFinite(asNum(r.qty)) ? asNum(r.qty) : null,
    valueEur: Number.isFinite(asNum(r.value_eur)) ? asNum(r.value_eur) : null,
    updatedAt: r.updated_at == null ? null : String(r.updated_at),
  }));

  const latestTotalEur = Number((snapRows ?? [])[0]?.total_eur || 0) || 0;

  return { plan, hasPlan, items, latestTotalEur };
}

async function inferLeak(args: { mode: AutopilotMode; hasPlan: boolean; items: ItemRow[] }) {
  const { mode, hasPlan, items } = args;
  if (!hasPlan) return { key: "no_plan" as const, diagnostics: null, missingSymbols: [] as string[] };
  if (!items.length) return { key: "no_holdings" as const, diagnostics: null, missingSymbols: [] as string[] };

  const symbols = items.map((i) => i.symbol).filter(Boolean);
  const quotes = await getQuotes({ symbols, ttlSec: 60 });
  const valuation = computePortfolioValuation({
    cashEur: 0,
    items: items.map((x) => ({ symbol: x.symbol, qty: x.qty, valueEur: x.valueEur })),
    quotes,
  });
  const liveCoveragePct = Number((valuation as any)?.liveCoveragePct ?? (valuation as any)?.coveragePct ?? 0);
  const missingLiveSymbols = Array.isArray((valuation as any)?.missingLiveSymbols)
    ? ((valuation as any).missingLiveSymbols as any[]).map(normSymbol).filter(Boolean)
    : Array.isArray((valuation as any)?.missingSymbols)
      ? ((valuation as any).missingSymbols as any[]).map(normSymbol).filter(Boolean)
      : [];
  const diagnostics = computeDiagnostics({
    mode,
    hasPlan,
    cashEur: 0,
    items: items.map((x) => ({ symbol: x.symbol, qty: x.qty, valueEur: x.valueEur })),
    quotes,
    pricing: {
      coveragePct: liveCoveragePct,
      missingSymbols: missingLiveSymbols,
      priceAgeSeconds: valuation.priceAgeSeconds,
    },
  });

  const key = diagnostics.riskLeaks?.[0]?.key ? String(diagnostics.riskLeaks[0].key).toLowerCase().trim() : null;
  return { key, diagnostics, missingSymbols: missingLiveSymbols };
}

async function persistTargets(args: {
  userId: string;
  mode: AutopilotMode;
  currentItems: ItemRow[];
  targets: Array<{ symbol: string; targetValueEur: number; name?: string | null; qty?: number | null }>;
  applyChanges: boolean;
}): Promise<PersistResult> {
  const sb = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const map = new Map<string, ItemRow>();
  for (const it of args.currentItems) map.set(normSymbol(it.symbol), it);

  let changed = 0;
  const executionRows: FixExecutionRow[] = [];
  const rollbackOps: Array<
    | {
        kind: "update";
        id: string;
        symbol: string;
        previous: {
          value_eur: number | null;
          qty: number | null;
          name: string | null;
          updated_at: string | null;
        };
      }
    | { kind: "insert"; symbol: string }
  > = [];

  try {
    for (const t of args.targets) {
      const symbol = normSymbol(t.symbol);
      if (!symbol) continue;
      const nextValue = Math.max(0, roundValue(asNum(t.targetValueEur, 0)));
      const ex = map.get(symbol);
      const currentValue = ex && Number.isFinite(asNum(ex.valueEur)) ? Math.max(0, roundValue(asNum(ex.valueEur, 0))) : 0;
      const qtyCurrent = ex?.qty != null && Number.isFinite(asNum(ex.qty)) ? roundQty(asNum(ex.qty, 0)) : null;
      let qtyTarget: number | null = null;
      const rowName = t.name ? String(t.name) : ex?.name ?? null;

      if (ex) {
        const patch: Record<string, unknown> = { value_eur: nextValue, updated_at: nowIso };
        if (t.name && !ex.name) patch.name = String(t.name);
        if (t.qty != null && Number.isFinite(asNum(t.qty))) {
          qtyTarget = roundQty(asNum(t.qty, 0));
          patch.qty = qtyTarget;
        } else if (ex.qty != null && ex.valueEur != null && ex.valueEur > 0) {
          qtyTarget = roundQty((nextValue / ex.valueEur) * ex.qty);
          patch.qty = qtyTarget;
        } else {
          qtyTarget = qtyCurrent;
        }

        if (args.applyChanges) {
          const { error } = await sb
            .from("portfolio_items")
            .update(patch)
            .eq("user_id", args.userId)
            .eq("mode", args.mode)
            .eq("id", ex.id);
          if (error) throw new Error(error.message || "portfolio_items_update_failed");
          rollbackOps.push({
            kind: "update",
            id: ex.id,
            symbol,
            previous: {
              value_eur: ex.valueEur != null && Number.isFinite(asNum(ex.valueEur)) ? roundValue(asNum(ex.valueEur)) : null,
              qty: ex.qty != null && Number.isFinite(asNum(ex.qty)) ? roundQty(asNum(ex.qty)) : null,
              name: ex.name ?? null,
              updated_at: ex.updatedAt ?? null,
            },
          });
          changed += 1;
        }
      } else {
        qtyTarget = t.qty != null && Number.isFinite(asNum(t.qty)) ? roundQty(asNum(t.qty, 0)) : null;
        const insertRow: Record<string, unknown> = {
          user_id: args.userId,
          mode: args.mode,
          symbol,
          name: rowName,
          qty: qtyTarget,
          value_eur: nextValue,
          created_at: nowIso,
          updated_at: nowIso,
        };
        if (args.applyChanges) {
          const { error } = await sb.from("portfolio_items").insert(insertRow);
          if (error) throw new Error(error.message || "portfolio_items_insert_failed");
          rollbackOps.push({ kind: "insert", symbol });
          changed += 1;
        }
      }

      const delta = roundValue(nextValue - currentValue);
      const action: FixExecutionRow["action"] = delta > 1 ? "buy" : delta < -1 ? "sell" : "hold";
      executionRows.push({
        symbol,
        name: rowName,
        action,
        currentValueEur: currentValue,
        targetValueEur: nextValue,
        deltaEur: delta,
        qtyCurrent,
        qtyTarget,
      });
    }
  } catch (e: any) {
    if (args.applyChanges && rollbackOps.length > 0) {
      for (let idx = rollbackOps.length - 1; idx >= 0; idx -= 1) {
        const op = rollbackOps[idx];
        if (op.kind === "insert") {
          await sb
            .from("portfolio_items")
            .delete()
            .eq("user_id", args.userId)
            .eq("mode", args.mode)
            .eq("symbol", op.symbol);
          continue;
        }
        await sb
          .from("portfolio_items")
          .update({
            value_eur: op.previous.value_eur,
            qty: op.previous.qty,
            name: op.previous.name,
            updated_at: op.previous.updated_at ?? nowIso,
          })
          .eq("user_id", args.userId)
          .eq("mode", args.mode)
          .eq("id", op.id);
      }
    }
    throw new Error(e?.message || "portfolio_items_persist_failed");
  }

  return { changed, executionRows };
}

async function applyStarterPack(args: {
  userId: string;
  mode: AutopilotMode;
  currentItems: ItemRow[];
  budgetOverrideEur?: number | null;
  referenceTotalEur?: number;
  applyChanges: boolean;
}): Promise<PersistResult> {
  const dynamic = await buildDynamicStarterPack({
    mode: args.mode,
    referenceTotalEur: args.referenceTotalEur ?? 0,
    budgetOverrideEur: args.budgetOverrideEur ?? null,
  });

  const targets = dynamic.items.map((x) => ({
    symbol: x.symbol,
    name: x.name,
    qty: x.qty,
    targetValueEur: Number(x.value_eur) || 0,
  }));

  if (!targets.length) return { changed: 0, executionRows: [] };
  return persistTargets({
    userId: args.userId,
    mode: args.mode,
    currentItems: args.currentItems,
    targets,
    applyChanges: args.applyChanges,
  });
}

async function applyConcentrationFix(args: {
  userId: string;
  mode: AutopilotMode;
  currentItems: ItemRow[];
  applyChanges: boolean;
}): Promise<PersistResult> {
  const valued = args.currentItems
    .map((x) => ({
      symbol: x.symbol,
      name: x.name,
      qty: x.qty,
      value: Number.isFinite(asNum(x.valueEur)) ? asNum(x.valueEur) : 0,
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  if (valued.length < 2) return { changed: 0, executionRows: [] };

  const total = valued.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return { changed: 0, executionRows: [] };

  const top = valued[0];
  const targetPct = concentrationTargetPct(args.mode);
  const topTarget = (total * targetPct) / 100;
  const excess = Math.max(0, top.value - topTarget);
  if (excess <= 0) return { changed: 0, executionRows: [] };

  const receivers = valued.slice(1, 6).map((x) => ({ symbol: x.symbol, name: x.name, value: x.value, synthetic: false }));
  const existingSet = new Set(valued.map((x) => x.symbol));
  const missingSlots = Math.max(0, 3 - receivers.length);
  const diversifiers = concentrationDiversifierSymbols(args.mode)
    .map((s) => normSymbol(s))
    .filter((s) => s && s !== top.symbol && !existingSet.has(s))
    .slice(0, missingSlots);

  for (const sym of diversifiers) {
    receivers.push({ symbol: sym, name: null, value: 0, synthetic: true });
  }

  if (!receivers.length) return { changed: 0, executionRows: [] };
  const perReceiver = excess / receivers.length;
  const targets: Array<{ symbol: string; targetValueEur: number; name?: string | null }> = [
    { symbol: top.symbol, name: top.name, targetValueEur: top.value - excess },
  ];

  for (const r of receivers) {
    targets.push({
      symbol: r.symbol,
      name: r.name,
      targetValueEur: r.synthetic ? perReceiver : r.value + perReceiver,
    });
  }

  return persistTargets({
    userId: args.userId,
    mode: args.mode,
    currentItems: args.currentItems,
    targets,
    applyChanges: args.applyChanges,
  });
}

async function applyPricingRepair(args: {
  userId: string;
  mode: AutopilotMode;
  currentItems: ItemRow[];
  missingSymbols: string[];
  applyChanges: boolean;
}): Promise<PersistResult> {
  const missingQuote = new Set((args.missingSymbols || []).map((x) => normSymbol(x)));
  const valuedRows = args.currentItems.filter((x) => Number.isFinite(asNum(x.valueEur)) && asNum(x.valueEur) > 0);
  const valuedTotal = valuedRows.reduce((s, x) => s + asNum(x.valueEur, 0), 0);
  const suggested =
    valuedRows.length > 0
      ? Math.max(250, Math.round((valuedTotal / valuedRows.length) * 0.4))
      : 500;

  const targets = args.currentItems
    .map((x) => {
      const missingInput = x.qty == null && (x.valueEur == null || x.valueEur <= 0);
      const missingMarket = missingQuote.has(x.symbol);
      if (!missingInput && !missingMarket) return null;
      const base = x.valueEur != null && x.valueEur > 0 ? x.valueEur : suggested;
      return {
        symbol: x.symbol,
        name: x.name,
        targetValueEur: base,
      };
    })
    .filter(Boolean) as Array<{ symbol: string; name?: string | null; targetValueEur: number }>;

  if (!targets.length) return { changed: 0, executionRows: [] };
  return persistTargets({
    userId: args.userId,
    mode: args.mode,
    currentItems: args.currentItems,
    targets,
    applyChanges: args.applyChanges,
  });
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  const executionId = createExecutionId("fix");
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sb = getSupabaseAdmin();
  const effectiveMode = await resolveEffectiveSharedBrokerMode({
    userId,
    requestedMode: body?.mode,
    supabase: sb,
  });
  if (isInvestingSharedBrokerBlocked(effectiveMode.mode)) {
    return NextResponse.json(
      { ok: false, error: INVESTING_SHARED_BROKER_SYNC_BLOCKED, mode: "investing", spoofed: effectiveMode.spoofed },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  const access = await resolveModeAccess({
    supabase: sb,
    userId,
    requestedMode: effectiveMode.mode,
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
      { status: access.status }
    );
  }
  const mode = access.mode;
  const requestedLeakKey = String(body?.leakKey || "").toLowerCase().trim() || null;
  const budgetOverrideEur = Number.isFinite(asNum(body?.budgetEur)) ? clamp(asNum(body?.budgetEur), 100, 50000) : null;
  const maxRounds = clamp(Number(body?.maxRounds || 4), 1, 6);
  const previewFlag = String(body?.previewOnly ?? "").toLowerCase().trim();
  const previewOnly = body?.previewOnly === true || previewFlag === "1" || previewFlag === "true" || previewFlag === "yes";
  const applyChanges = !previewOnly;

  const actions: FixAction[] = [];
  let rounds = 0;
  let appliedRows = 0;
  let initialLeakKey: string | null = null;
  let finalLeakKey: string | null = null;
  let stoppedReason: string | null = null;

  for (let i = 0; i < maxRounds; i++) {
    const ctx = await loadContext({ userId, mode });
    const inferred = await inferLeak({ mode, hasPlan: ctx.hasPlan, items: ctx.items });
    const leakKey = inferred.key ? String(inferred.key).toLowerCase() : null;

    if (i === 0) initialLeakKey = leakKey;
    if (!leakKey) {
      finalLeakKey = null;
      stoppedReason = "no_active_leak";
      break;
    }

    finalLeakKey = leakKey;
    if (!isAutoFixableLeakKey(leakKey)) {
      stoppedReason = "non_auto_fixable_leak";
      break;
    }

    let result: PersistResult = { changed: 0, executionRows: [] };
    if (leakKey === "no_holdings") {
      result = await applyStarterPack({
        userId,
        mode,
        currentItems: ctx.items,
        budgetOverrideEur,
        referenceTotalEur: ctx.latestTotalEur,
        applyChanges,
      });
      actions.push({
        round: i + 1,
        leakKey,
        strategy: "starter_pack",
        changedRows: result.changed,
        executionRows: result.executionRows,
      });
    } else if (leakKey === "concentration_high" || leakKey === "concentration_med") {
      result = await applyConcentrationFix({ userId, mode, currentItems: ctx.items, applyChanges });
      actions.push({
        round: i + 1,
        leakKey,
        strategy: "concentration_rebalance",
        changedRows: result.changed,
        executionRows: result.executionRows,
      });
    } else if (leakKey === "pricing_low" || leakKey === "valuation_zero") {
      result = await applyPricingRepair({
        userId,
        mode,
        currentItems: ctx.items,
        missingSymbols: inferred.missingSymbols,
        applyChanges,
      });
      actions.push({
        round: i + 1,
        leakKey,
        strategy: "pricing_repair",
        changedRows: result.changed,
        executionRows: result.executionRows,
      });
    }

    rounds += 1;
    appliedRows += result.changed;

    if (!applyChanges) {
      stoppedReason = "preview_only";
      break;
    }

    if (result.changed <= 0) {
      stoppedReason = "no_mutation_possible";
      break;
    }
  }

  const endCtx = await loadContext({ userId, mode });
  const endLeak = await inferLeak({ mode, hasPlan: endCtx.hasPlan, items: endCtx.items });
  finalLeakKey = endLeak.key ? String(endLeak.key).toLowerCase() : null;

  const resolved = requestedLeakKey
    ? isLeakResolved({ targetLeakKey: requestedLeakKey, currentLeakKey: finalLeakKey })
    : !finalLeakKey;

  const manualPlanRaw = actions
    .flatMap((a) =>
      (a.executionRows || []).map((r) => ({
        round: a.round,
        leakKey: a.leakKey,
        strategy: a.strategy,
        symbol: r.symbol,
        name: r.name,
        action: r.action,
        currentValueEur: r.currentValueEur,
        targetValueEur: r.targetValueEur,
        deltaEur: r.deltaEur,
        qtyCurrent: r.qtyCurrent,
        qtyTarget: r.qtyTarget,
      }))
    );

  const manualBySymbol = new Map<
    string,
    {
      first: (typeof manualPlanRaw)[number];
      last: (typeof manualPlanRaw)[number];
    }
  >();

  for (const row of manualPlanRaw) {
    const symbol = normSymbol(row?.symbol);
    if (!symbol) continue;
    const normalized = { ...row, symbol };
    const prev = manualBySymbol.get(symbol);
    if (!prev) {
      manualBySymbol.set(symbol, { first: normalized, last: normalized });
      continue;
    }
    manualBySymbol.set(symbol, { first: prev.first, last: normalized });
  }

  const manualPlan = Array.from(manualBySymbol.values())
    .map(({ first, last }) => {
      const current = Number(first.currentValueEur || 0);
      const target = Number(last.targetValueEur || 0);
      const delta = roundValue(target - current);
      const action = delta > 1 ? "buy" : delta < -1 ? "sell" : "hold";
      return {
        round: last.round,
        leakKey: last.leakKey,
        strategy: last.strategy,
        symbol: last.symbol,
        name: last.name || first.name || null,
        action,
        currentValueEur: current,
        targetValueEur: target,
        deltaEur: delta,
        qtyCurrent: first.qtyCurrent ?? null,
        qtyTarget: last.qtyTarget ?? first.qtyTarget ?? null,
      };
    })
    .filter((r) => Math.abs(Number(r.deltaEur || 0)) >= 1)
    .sort((a, b) => Math.abs(Number(b.deltaEur || 0)) - Math.abs(Number(a.deltaEur || 0)))
    .slice(0, 30);

  try {
    await getSupabaseAdmin().from("journal_entries").insert({
      user_id: userId,
      mode,
      type: "fix_now_run",
      title: resolved ? "FixNow auto resolved" : "FixNow auto partial",
      details: {
        executionId,
        requestedLeakKey,
        initialLeakKey,
        finalLeakKey,
        rounds,
        appliedRows,
        stoppedReason,
        previewOnly,
        actions,
        manualPlan,
      },
      created_at: new Date().toISOString(),
    });
  } catch {
    // non-blocking audit write
  }

  if (!resolved && finalLeakKey) {
    await writeEngineEvent({
      userId,
      mode,
      event: "risk_blocked",
      status: "warn",
      source: "api.fix_now.run",
      executionId,
      details: {
        requestedLeakKey,
        finalLeakKey,
        rounds,
        appliedRows,
        stoppedReason,
        previewOnly,
        duration_ms: Date.now() - startedAtMs,
      },
    });
  } else if (resolved) {
    await writeEngineEvent({
      userId,
      mode,
      event: "signal_generated",
      status: "ok",
      source: "api.fix_now.run",
      executionId,
      details: {
        requestedLeakKey,
        rounds,
        appliedRows,
        previewOnly,
        state: "risk_unblocked",
        duration_ms: Date.now() - startedAtMs,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    mode,
    requestedLeakKey,
    initialLeakKey,
    finalLeakKey,
    resolved,
    rounds,
    appliedRows,
    stoppedReason,
    nonAutoFixable: finalLeakKey ? !isAutoFixableLeakKey(finalLeakKey) : false,
    previewOnly,
    executionId,
    actions,
    manualPlan,
  });
}
