import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { ensureDirectory, sanitizeFileSegment, writeJsonAtomic } from "./fs";
import type { ResearchConfig, ResearchDecisionLedgerEntry, ResearchReportFileOutput } from "./types";

type NegativeKnowledgeEntry = {
  key: string;
  baseline_id: string | null;
  template_id: string | null;
  family_id: string | null;
  decision_count: number;
  latest_at: string | null;
  representative_reason: string;
};

async function readDecisionLedgerEntries(config: ResearchConfig): Promise<ResearchDecisionLedgerEntry[]> {
  try {
    const raw = await readFile(config.paths.decisionsPath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ResearchDecisionLedgerEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function buildResearchNegativeKnowledgeReport(config: ResearchConfig) {
  const entries = (await readDecisionLedgerEntries(config)).filter((entry) =>
    entry.decision === "reject" || entry.decision === "failed",
  );
  const grouped = new Map<string, NegativeKnowledgeEntry>();

  for (const entry of entries) {
    const key = [
      entry.baseline_id ?? "baseline:none",
      entry.planner_template_id ?? "template:none",
      entry.planner_family_id ?? "family:none",
      entry.reason ?? "reason:none",
    ].join("::");
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        key,
        baseline_id: entry.baseline_id ?? null,
        template_id: entry.planner_template_id ?? null,
        family_id: entry.planner_family_id ?? null,
        decision_count: 1,
        latest_at: entry.timestamp,
        representative_reason: entry.reason,
      });
      continue;
    }
    current.decision_count += 1;
    current.latest_at =
      current.latest_at && current.latest_at.localeCompare(entry.timestamp) > 0
        ? current.latest_at
        : entry.timestamp;
  }

  const items = [...grouped.values()].sort(
    (left, right) => right.decision_count - left.decision_count || (right.latest_at ?? "").localeCompare(left.latest_at ?? ""),
  );
  return {
    schema_version: "research.negative-knowledge-report.v1",
    report_id: `negative-knowledge-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    summary: {
      total_rejections: entries.length,
      reusable_patterns: items.length,
    },
    items,
  };
}

export async function writeResearchNegativeKnowledgeReport(args: {
  config: ResearchConfig;
  report: Awaited<ReturnType<typeof buildResearchNegativeKnowledgeReport>>;
}): Promise<ResearchReportFileOutput> {
  const dir = path.join(args.config.paths.reportsDir, "knowledge");
  await ensureDirectory(dir);
  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(dir, `${safeId}.json`);
  const markdownPath = path.join(dir, `${safeId}.md`);
  const latestJsonPath = path.join(dir, "negative-knowledge-latest.json");
  const latestMarkdownPath = path.join(dir, "negative-knowledge-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);

  const markdown = [
    "# Research Negative Knowledge",
    "",
    `- Generated at: ${args.report.generated_at}`,
    `- Total rejections: ${args.report.summary.total_rejections}`,
    `- Reusable patterns: ${args.report.summary.reusable_patterns}`,
    "",
    "## Patterns",
    ...(args.report.items.length > 0
      ? args.report.items.slice(0, 25).map(
          (item) => `- ${item.baseline_id ?? "n/a"} / ${item.template_id ?? "n/a"} / ${item.decision_count}x / ${item.representative_reason}`,
        )
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8");

  return {
    jsonPath: latestJsonPath,
    markdownPath: latestMarkdownPath,
  };
}
