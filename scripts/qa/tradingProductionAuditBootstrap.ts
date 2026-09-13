import {
  isClerkTestSecretKey,
  selectUniquePaidClerkTestUserId,
} from "./clerkTestUserDiscovery";

function hasExplicitQaIdentity(env: NodeJS.ProcessEnv = process.env) {
  const values = [
    env.QA_SIGN_IN_URL,
    env.QA_CLERK_USER_ID,
    env.QA_CLERK_EMAIL,
    env.SC_OWNER_USER_ID,
    env.SC_OWNER_USER_IDS,
  ];
  return values.some((value) => String(value || "").trim().length > 0);
}

async function ensureQaIdentity() {
  if (hasExplicitQaIdentity()) return;

  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  if (!secretKey) {
    throw new Error("Trading QA auth requires CLERK_SECRET_KEY.");
  }
  if (!isClerkTestSecretKey(secretKey)) {
    throw new Error(
      "Automatic QA user discovery is allowed only with a Clerk TEST secret; configure an explicit QA identity for non-test Clerk environments.",
    );
  }

  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey });
  const result = await client.users.getUserList({ limit: 100 });
  const users = Array.isArray(result?.data) ? result.data : [];
  const totalCount = Number(result?.totalCount ?? users.length);

  if (!Number.isFinite(totalCount) || totalCount > users.length) {
    throw new Error(
      "Clerk TEST QA discovery refused an incomplete user listing; configure an explicit QA identity.",
    );
  }

  process.env.QA_CLERK_USER_ID = selectUniquePaidClerkTestUserId(users);
  console.log(
    "Trading QA auth: selected the unique Clerk TEST user with explicit isPaid=true metadata.",
  );
}

await ensureQaIdentity();
await import("./trading-production-audit.mjs");
