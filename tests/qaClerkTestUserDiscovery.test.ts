import { describe, expect, it } from "vitest";
import {
  isClerkTestSecretKey,
  selectUniquePaidClerkTestUserId,
} from "../scripts/qa/clerkTestUserDiscovery";

describe("Clerk TEST QA user discovery", () => {
  it("accepts only Clerk TEST secret keys for automatic discovery", () => {
    expect(isClerkTestSecretKey("sk_test_example")).toBe(true);
    expect(isClerkTestSecretKey("sk_live_example")).toBe(false);
    expect(isClerkTestSecretKey("")).toBe(false);
  });

  it("selects exactly one user with explicit boolean isPaid=true metadata", () => {
    expect(
      selectUniquePaidClerkTestUserId([
        { id: "user_free", publicMetadata: { isPaid: false } },
        { id: "user_paid", publicMetadata: { isPaid: true } },
      ]),
    ).toBe("user_paid");
  });

  it("does not treat truthy strings or missing metadata as paid authority", () => {
    expect(() =>
      selectUniquePaidClerkTestUserId([
        { id: "user_string", publicMetadata: { isPaid: "true" } },
        { id: "user_missing", publicMetadata: {} },
      ]),
    ).toThrow("found 0");
  });

  it("fails closed when there is no explicit paid user", () => {
    expect(() =>
      selectUniquePaidClerkTestUserId([
        { id: "user_free", publicMetadata: { isPaid: false } },
      ]),
    ).toThrow("found 0");
  });

  it("fails closed when multiple paid users make QA identity ambiguous", () => {
    expect(() =>
      selectUniquePaidClerkTestUserId([
        { id: "user_paid_a", publicMetadata: { isPaid: true } },
        { id: "user_paid_b", publicMetadata: { isPaid: true } },
      ]),
    ).toThrow("found 2");
  });

  it("rejects malformed non-Clerk ids even if metadata claims paid", () => {
    expect(() =>
      selectUniquePaidClerkTestUserId([
        { id: "not-a-clerk-user", publicMetadata: { isPaid: true } },
      ]),
    ).toThrow("found 0");
  });
});
