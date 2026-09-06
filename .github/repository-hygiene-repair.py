from pathlib import Path
import subprocess


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, got {count}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "app/ops/page.tsx",
    'import type { Metadata } from "next";\nimport { auth } from "@clerk/nextjs/server";',
    'import type { Metadata } from "next";\nimport Link from "next/link";\nimport { auth } from "@clerk/nextjs/server";',
)
replace_once(
    "app/ops/page.tsx",
    '''            <a
              href="/ops/trades"
              className="rounded-full border border-amber-200/30 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15"
            >
              Trade Ledger
            </a>''',
    '''            <Link
              href="/ops/trades"
              className="rounded-full border border-amber-200/30 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15"
            >
              Trade Ledger
            </Link>''',
)

replace_once(
    "app/ops/trades/page.tsx",
    'import type { Metadata } from "next";\nimport { auth } from "@clerk/nextjs/server";',
    'import type { Metadata } from "next";\nimport Link from "next/link";\nimport { auth } from "@clerk/nextjs/server";',
)
replace_once(
    "app/ops/trades/page.tsx",
    '''              <a href="/ops/trades" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white">
                Reset
              </a>''',
    '''              <Link href="/ops/trades" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white">
                Reset
              </Link>''',
)

replace_once(
    "lib/signalcore/useDailyBundle.ts",
    'import { useCallback, useEffect, useMemo, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useReducer } from "react";',
)
replace_once(
    "lib/signalcore/useDailyBundle.ts",
    '''  const [snapshot, setSnapshot] = useState<DailyBundleSnapshot>(() => readModeSnapshot(mode));

  useEffect(() => {
    setSnapshot(readModeSnapshot(mode));

    const unsubscribe = subscribeToMode(mode, () => {
      setSnapshot(readModeSnapshot(mode));
    });

    const nextSnapshot = readModeSnapshot(mode);''',
    '''  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const snapshot = readModeSnapshot(mode);

  useEffect(() => {
    const unsubscribe = subscribeToMode(mode, forceRender);

    const nextSnapshot = readModeSnapshot(mode);''',
)

replace_once(
    "lib/trading/research/localArchiveInventory.ts",
    "  let sizeBytes = 0;",
    "  const sizeBytes = 0;",
)

subprocess.run(["npm", "audit", "fix", "--package-lock-only"], check=True)
