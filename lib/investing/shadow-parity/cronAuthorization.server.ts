import "server-only";

import { timingSafeEqual } from "node:crypto";

export function authorizedShadowParityCron(
  authorizationHeader: string | null,
  secret: string | undefined,
) {
  if (!secret || secret.length < 32 || !authorizationHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorizationHeader, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
