import { auth } from "@clerk/nextjs/server";
import { isLocalQaAuthBypassRequest, LOCAL_QA_USER_ID } from "@/lib/auth/localQaAuth";

export async function getRequestUserId(req?: Request | null) {
  const { userId } = await auth();
  if (userId) return userId;
  if (isLocalQaAuthBypassRequest(req)) return LOCAL_QA_USER_ID;
  return null;
}
