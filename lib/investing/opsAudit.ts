import { buildInvestingHistoricalAudit } from "@/lib/investing/historyAudit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeInvestingAuditArgs(args: { mode?: string | null; days?: unknown }) {
  return {
    mode: String(args.mode || "investing").trim() || "investing",
    days: clampInt(args.days, 7, 3650, 180),
  };
}

export async function loadInvestingHistoricalAudit(args?: { mode?: string | null; days?: unknown }) {
  const normalized = normalizeInvestingAuditArgs(args ?? {});
  const since = new Date(Date.now() - normalized.days * 24 * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseAdmin();

  const [mandateQuery, rebalanceQuery, researchQuery, executionQuery, approvalQuery] = await Promise.all([
    sb
      .from("investing_mandate_snapshots")
      .select("user_id,mode,day_key,as_of,mandate_fingerprint,objective,inputs,policy,meta,created_at")
      .eq("mode", normalized.mode)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from("investing_rebalance_ledger")
      .select("user_id,mode,day_key,as_of,decision_fingerprint,mandate_fingerprint,status,valuation_context,reason_codes,benchmark,meta,created_at")
      .eq("mode", normalized.mode)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from("investing_research_snapshots")
      .select("user_id,mode,day_key,as_of,research_fingerprint,mandate_fingerprint,benchmark_id,status,summary,research_payload,meta,created_at")
      .eq("mode", normalized.mode)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from("investing_execution_queue")
      .select("user_id,mode,day_key,as_of,decision_fingerprint,approval_status,execution_decision,approval_required,kill_switch_active,deployable_capital_eur,blocking_reasons,notes,created_at")
      .eq("mode", normalized.mode)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from("investing_execution_approvals")
      .select("user_id,mode,decision_fingerprint,queue_day_key,decided_at,decided_by,approval_status,override_applied,note,meta,created_at")
      .eq("mode", normalized.mode)
      .gte("created_at", since)
      .order("decided_at", { ascending: false })
      .limit(5000),
  ]);

  if (mandateQuery.error) {
    throw new Error(`investing_mandate_audit_read_failed:${mandateQuery.error.message}`);
  }
  if (rebalanceQuery.error) {
    throw new Error(`investing_rebalance_audit_read_failed:${rebalanceQuery.error.message}`);
  }
  if (researchQuery.error) {
    throw new Error(`investing_research_audit_read_failed:${researchQuery.error.message}`);
  }
  if (executionQuery.error) {
    throw new Error(`investing_execution_audit_read_failed:${executionQuery.error.message}`);
  }
  if (approvalQuery.error) {
    throw new Error(`investing_execution_approvals_read_failed:${approvalQuery.error.message}`);
  }

  const executionRows = Array.isArray(executionQuery.data) ? (executionQuery.data as Record<string, any>[]) : [];
  const approvalRows = Array.isArray(approvalQuery.data) ? (approvalQuery.data as Record<string, any>[]) : [];
  const approvalStatusCounts = executionRows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row?.approval_status || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const decisionCounts = executionRows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row?.execution_decision || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const pendingApprovals = executionRows.filter((row) => row?.approval_status === "pending").slice(0, 12);
  const overrideCount = approvalRows.filter((row) => row?.override_applied).length;

  return {
    mode: normalized.mode,
    days: normalized.days,
    since,
    audit: buildInvestingHistoricalAudit({
      mandateSnapshots: Array.isArray(mandateQuery.data) ? (mandateQuery.data as Record<string, any>[]) : [],
      rebalanceLedger: Array.isArray(rebalanceQuery.data) ? (rebalanceQuery.data as Record<string, any>[]) : [],
      researchSnapshots: Array.isArray(researchQuery.data) ? (researchQuery.data as Record<string, any>[]) : [],
    }),
    execution: {
      coverage: executionRows.length,
      approvalHistoryCoverage: approvalRows.length,
      approvalStatusCounts,
      decisionCounts,
      overrideCount,
      pendingApprovals,
      recentApprovals: approvalRows.slice(0, 12),
    },
  };
}
