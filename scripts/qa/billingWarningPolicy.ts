import type { PremiumAuditReport } from "../../lib/billing/premiumAuditService";
import type { PremiumAuditIssue } from "../../lib/billing/premiumAudit";
import { isClerkTestSecretKey } from "./clerkTestUserDiscovery";

type BillingAuditUser = PremiumAuditReport["users"][number];

export type BillingWarningEntry = Readonly<{
  userId: string;
  email: string | null;
  issue: PremiumAuditIssue;
}>;

export type BillingWarningClassification = Readonly<{
  environment: "CLERK_TEST" | "NON_TEST";
  ignoredExpectedTestWarnings: BillingWarningEntry[];
  blockingWarnings: BillingWarningEntry[];
}>;

function warningEntries(report: PremiumAuditReport): BillingWarningEntry[] {
  return report.users.flatMap((user) =>
    user.issues
      .filter((issue) => issue.severity === "warn")
      .map((issue) => ({
        userId: user.userId,
        email: user.email,
        issue,
      })),
  );
}

function isExpectedClerkTestManualMetadataWarning(
  user: BillingAuditUser,
  issue: PremiumAuditIssue,
) {
  return (
    issue.severity === "warn" &&
    issue.code === "metadata_paid_without_stripe_source" &&
    user.source === "manual_metadata" &&
    user.effectivePremium === true &&
    user.metadataIsPaid === true &&
    user.stripeStatus === null &&
    user.stripeCustomerId === null &&
    user.stripeSubscriptionId === null
  );
}

export function classifyBillingWarnings(
  report: PremiumAuditReport,
  clerkSecretKey: string | null | undefined,
): BillingWarningClassification {
  const warnings = warningEntries(report);
  if (!isClerkTestSecretKey(clerkSecretKey)) {
    return {
      environment: "NON_TEST",
      ignoredExpectedTestWarnings: [],
      blockingWarnings: warnings,
    };
  }

  const expectedCandidates = report.users.flatMap((user) =>
    user.issues
      .filter((issue) => isExpectedClerkTestManualMetadataWarning(user, issue))
      .map((issue) => ({
        userId: user.userId,
        email: user.email,
        issue,
      })),
  );

  const canIgnoreExpectedTestWarning =
    expectedCandidates.length === 1 && report.summary.manualMetadataPremium === 1;
  const ignoredIds = new Set(
    canIgnoreExpectedTestWarning
      ? expectedCandidates.map((entry) => `${entry.userId}:${entry.issue.code}`)
      : [],
  );

  return {
    environment: "CLERK_TEST",
    ignoredExpectedTestWarnings: canIgnoreExpectedTestWarning ? expectedCandidates : [],
    blockingWarnings: warnings.filter(
      (entry) => !ignoredIds.has(`${entry.userId}:${entry.issue.code}`),
    ),
  };
}
