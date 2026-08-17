import { describe, expect, it } from "vitest";
import BrokerPage from "@/app/app/broker/page";

function expectRedirect(fn: () => unknown, target: string) {
  try {
    fn();
    throw new Error("Expected redirect to be thrown.");
  } catch (error: any) {
    const digest = String(error?.digest || error?.message || error);
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain(target);
  }
}

describe("navigation redirects", () => {
  it("redirects /app/broker into the shell autonomy broker setup flow and preserves mode", () => {
    expectRedirect(
      () => BrokerPage({ searchParams: { mode: "crypto", source: "welcome" } }),
      "/app?tab=autonomy&brokerSetup=1&mode=crypto&source=welcome",
    );
  });
});
