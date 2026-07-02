import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("paper daemon production schedule", () => {
  it("schedules the canonical paper daemon in Vercel cron", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };

    expect(config.crons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/api/trading/bot/paper-daemon",
          schedule: "0 7 * * *",
        }),
      ]),
    );
  });
});
