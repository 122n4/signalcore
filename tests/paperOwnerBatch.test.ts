import { afterEach, describe, expect, it } from "vitest";

import { resolvePaperOwnerBatchSize, selectPaperOwnerBatch } from "@/lib/trading/bot/ownerBatch";

const ORIGINAL_ENV = { ...process.env };

function setOwners(...owners: string[]) {
  process.env.SC_OWNER_USER_ID = "";
  process.env.SC_OWNER_USER_IDS = owners.join(",");
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("paper owner batch selection", () => {
  it("keeps two owners when two are configured", () => {
    delete process.env.SYNTRAKE_BOT_OWNER_BATCH_SIZE;
    setOwners("owner-1");

    expect(selectPaperOwnerBatch()).toEqual(["owner-1"]);
  });

  it("keeps a single owner when only one is configured", () => {
    delete process.env.SYNTRAKE_BOT_OWNER_BATCH_SIZE;
    setOwners("owner-1", "owner-2");

    expect(selectPaperOwnerBatch()).toEqual(["owner-1", "owner-2"]);
  });

  it("processes all owners when no batch size is configured", () => {
    setOwners("owner-1", "owner-2", "owner-3", "owner-4", "owner-5");
    delete process.env.SYNTRAKE_BOT_OWNER_BATCH_SIZE;

    expect(resolvePaperOwnerBatchSize()).toBeNull();
    expect(selectPaperOwnerBatch()).toEqual([
      "owner-1",
      "owner-2",
      "owner-3",
      "owner-4",
      "owner-5",
    ]);
  });

  it("respects the configured batch size", () => {
    setOwners("owner-1", "owner-2", "owner-3", "owner-4", "owner-5");
    process.env.SYNTRAKE_BOT_OWNER_BATCH_SIZE = "3";

    expect(resolvePaperOwnerBatchSize()).toBe(3);
    expect(selectPaperOwnerBatch()).toEqual(["owner-1", "owner-2", "owner-3"]);
  });

  it("supports a configured batch larger than a small install without truncation side effects", () => {
    setOwners("owner-1", "owner-2");
    process.env.SYNTRAKE_BOT_OWNER_BATCH_SIZE = "5";

    expect(selectPaperOwnerBatch()).toEqual(["owner-1", "owner-2"]);
  });
});
