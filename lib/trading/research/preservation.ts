import path from "node:path";
import { readdir, writeFile } from "node:fs/promises";

import { ensureDirectory, fileExists, readJsonIfExists, sanitizeFileSegment, sha256File, writeJsonAtomic } from "./fs";
import type { ResearchConfig, ResearchReportFileOutput } from "./types";

async function collectFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
          return collectFiles(fullPath);
        }
        return [fullPath];
      }),
    );
    return nested.flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function buildResearchPreservationReport(config: ResearchConfig) {
  const roots = [
    config.paths.baselinesDir,
    config.paths.runsDir,
    path.join(config.paths.rootDir, "datasets", "snapshots"),
  ];
  const files = (await Promise.all(roots.map((root) => collectFiles(root)))).flat().sort();
  const items = await Promise.all(
    files.map(async (filePath) => ({
      path: filePath,
      sha256: await sha256File(filePath),
    })),
  );
  return {
    schema_version: "research.preservation-report.v1",
    report_id: `preservation-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    immutable_roots: roots,
    file_count: items.length,
    files: items,
  };
}

export async function verifyResearchPreservationReport(args: {
  config: ResearchConfig;
  reportPath?: string;
}): Promise<{ ok: boolean; checked: number; missing: string[]; mismatched: string[] }> {
  const reportPath = args.reportPath ?? path.join(args.config.paths.reportsDir, "preservation", "preservation-latest.json");
  const report = await readJsonIfExists<Awaited<ReturnType<typeof buildResearchPreservationReport>>>(reportPath);
  if (!report) {
    return { ok: false, checked: 0, missing: [reportPath], mismatched: [] };
  }

  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const file of report.files) {
    if (!(await fileExists(file.path))) {
      missing.push(file.path);
      continue;
    }
    const checksum = await sha256File(file.path);
    if (checksum !== file.sha256) {
      mismatched.push(file.path);
    }
  }

  return {
    ok: missing.length === 0 && mismatched.length === 0,
    checked: report.files.length,
    missing,
    mismatched,
  };
}

export async function writeResearchPreservationReport(args: {
  config: ResearchConfig;
  report: Awaited<ReturnType<typeof buildResearchPreservationReport>>;
}): Promise<ResearchReportFileOutput> {
  const dir = path.join(args.config.paths.reportsDir, "preservation");
  await ensureDirectory(dir);
  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(dir, `${safeId}.json`);
  const markdownPath = path.join(dir, `${safeId}.md`);
  const latestJsonPath = path.join(dir, "preservation-latest.json");
  const latestMarkdownPath = path.join(dir, "preservation-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);

  const verification = await verifyResearchPreservationReport({
    config: args.config,
    reportPath: latestJsonPath,
  });

  const markdown = [
    "# Research Preservation",
    "",
    `- Generated at: ${args.report.generated_at}`,
    `- Immutable roots: ${args.report.immutable_roots.join(", ")}`,
    `- File count: ${args.report.file_count}`,
    `- Restore verification: ${verification.ok ? "ok" : "failed"}`,
    `- Checked files: ${verification.checked}`,
    "",
    "## Verification",
    `- Missing: ${verification.missing.length}`,
    `- Mismatched: ${verification.mismatched.length}`,
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8");

  return {
    jsonPath: latestJsonPath,
    markdownPath: latestMarkdownPath,
  };
}
