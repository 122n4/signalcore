import { getOwnerUserIds } from "@/lib/signalcore/owner";

export function resolvePaperOwnerBatchSize(env: NodeJS.ProcessEnv = process.env): number | null {
  const configured = String(env.SYNTRAKE_BOT_OWNER_BATCH_SIZE ?? "").trim();
  if (!configured) return null;
  const raw = Number(configured);
  if (!Number.isFinite(raw)) return null;
  return Math.max(1, Math.round(raw));
}

export function selectPaperOwnerBatch(env: NodeJS.ProcessEnv = process.env): string[] {
  const owners = getOwnerUserIds();
  const batchSize = resolvePaperOwnerBatchSize(env);
  return batchSize === null ? owners : owners.slice(0, batchSize);
}
