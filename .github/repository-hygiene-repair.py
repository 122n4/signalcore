from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, got {count}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "app/app/tabs/AlertsTab.tsx",
    "    [entries, followedInstruments, isFollowedInstrument],",
    "    [entries, isFollowedInstrument],",
)

replace_once(
    "lib/broker/store.ts",
    '''function isMissingSchemaError(msg: string) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("relation") ||
    m.includes("unknown column") ||
    m.includes("column") ||
    m.includes("schema cache")
  );
}

''',
    "",
)

replace_once(
    "lib/trading/research/localArchiveInventory.ts",
    "  const generatedAt = new Date().toISOString();\n",
    "",
)

replace_once(
    "lib/trading/research/runner.ts",
    "  ResearchPostCycleOpportunityOutputs,\n",
    "",
)
replace_once(
    "lib/trading/research/runner.ts",
    "  let latestOpportunityOutputs: ResearchPostCycleOpportunityOutputs | null = null;\n",
    "",
)
replace_once(
    "lib/trading/research/runner.ts",
    "        latestOpportunityOutputs = await dependencies.postRunOpportunityRefresh(config);",
    "        await dependencies.postRunOpportunityRefresh(config);",
)
