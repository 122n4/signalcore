import type { ResearchFailureForensics } from "./types";

export function classifyResearchFailure(args: {
  reason?: string | null;
  error?: string | null;
}): ResearchFailureForensics {
  const reason = args.reason ?? "";
  const error = args.error ?? "";
  const combined = `${reason}\n${error}`.toLowerCase();

  if (
    combined.includes("stage-timeout") ||
    combined.includes("stage timeout") ||
    combined.includes("timed out")
  ) {
    return {
      category: "runtime_timeout",
      confidence: "high",
      summary: "Research run exceeded a stage timeout before finalization completed.",
    };
  }

  if (combined.includes("artifact contract")) {
    return {
      category: "artifact_contract",
      confidence: "high",
      summary: "Artifact contract incomplete or invalid during recovery/finalization.",
    };
  }

  if (combined.includes("unsupported research task type")) {
    return {
      category: "unsupported_task",
      confidence: "high",
      summary: "Planner or queue produced a task type that the runner does not execute.",
    };
  }

  if (combined.includes("data quality") || combined.includes("coverage")) {
    return {
      category: "data_quality",
      confidence: "medium",
      summary: "Candidate or instrument was blocked by research data quality rules.",
    };
  }

  if (combined.includes("stale") || combined.includes("hung") || combined.includes("heartbeat")) {
    return {
      category: "runtime_lock",
      confidence: "high",
      summary: "Run failed or recovered because the lock heartbeat became stale or hung.",
    };
  }

  if (combined.includes("eperm") || combined.includes("operation not permitted")) {
    return {
      category: "runtime_os",
      confidence: "high",
      summary: "Operating system denied a filesystem or process operation.",
    };
  }

  if (
    combined.includes("enoent") ||
    combined.includes("eacces") ||
    combined.includes("rename") ||
    combined.includes("status.json") ||
    combined.includes("research-lock.json")
  ) {
    return {
      category: "runtime_fs",
      confidence: "high",
      summary: "Filesystem write/rename path failed during research runtime.",
    };
  }

  if (combined.includes("validation gates failed") || combined.includes("hard validation")) {
    return {
      category: "validation_gate",
      confidence: "high",
      summary: "Candidate was rejected by formal validation gates.",
    };
  }

  return {
    category: "unknown_runtime",
    confidence: "low",
    summary: "Failure did not match a known runtime or validation pattern yet.",
  };
}
