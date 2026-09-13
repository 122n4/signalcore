export type ClerkQaUserCandidate = Readonly<{
  id?: unknown;
  publicMetadata?: unknown;
}>;

export function isClerkTestSecretKey(secretKey: string | null | undefined) {
  return String(secretKey || "").startsWith("sk_test_");
}

export function selectUniquePaidClerkTestUserId(
  users: readonly ClerkQaUserCandidate[],
): string {
  const paidCandidates = users
    .map((user) => {
      const id = typeof user?.id === "string" ? user.id.trim() : "";
      const metadata =
        user?.publicMetadata && typeof user.publicMetadata === "object"
          ? (user.publicMetadata as Record<string, unknown>)
          : {};
      return {
        id,
        isPaid: metadata.isPaid === true,
      };
    })
    .filter((candidate) => candidate.id.startsWith("user_") && candidate.isPaid);

  if (paidCandidates.length !== 1) {
    throw new Error(
      `Clerk TEST QA discovery requires exactly one explicit isPaid=true user; found ${paidCandidates.length}.`,
    );
  }

  return paidCandidates[0].id;
}
