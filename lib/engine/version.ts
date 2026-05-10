import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";

export type EngineVersion = "v3" | "v4";

export function getEngineVersion(env: NodeJS.ProcessEnv = process.env): EngineVersion {
  // Default to v4-ultra unless explicitly pinned to v3.
  const raw = String(env.ENGINE_VERSION || "v4").trim().toLowerCase();
  return raw === "v3" ? "v3" : "v4";
}

export function getEngineV4AllowedModes(env: NodeJS.ProcessEnv = process.env): AutopilotMode[] | null {
  const raw = String(env.ENGINE_V4_MODES || "").trim();
  if (!raw) return null;
  const uniq = new Set<AutopilotMode>();
  for (const part of raw.split(",")) {
    const mode = normalizeMode(part);
    if (mode) uniq.add(mode);
  }
  return uniq.size > 0 ? Array.from(uniq) : null;
}

export function isEngineV4EnabledForMode(mode: AutopilotMode, env: NodeJS.ProcessEnv = process.env) {
  if (getEngineVersion(env) !== "v4") return false;
  const allowed = getEngineV4AllowedModes(env);
  if (!allowed) return true;
  return allowed.includes(mode);
}
