export const LOCAL_QA_AUTH_COOKIE = "syntrake_qa_auth";
export const LOCAL_QA_USER_ID = "qa-local-syntrake-user";

type RequestLike = {
  headers?: { get(name: string): string | null };
  url?: string;
  nextUrl?: URL;
};

export function isLocalQaAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production";
}

export function isLocalQaUserId(userId: string | null | undefined) {
  return userId === LOCAL_QA_USER_ID;
}

export function isLocalQaAuthBypassRequest(req: RequestLike | null | undefined) {
  if (!isLocalQaAuthEnabled()) return false;

  const header = req?.headers?.get("x-syntrake-qa-auth");
  if (header === "1") return true;

  const cookie = req?.headers?.get("cookie") || "";
  if (cookie.split(";").some((part) => part.trim() === `${LOCAL_QA_AUTH_COOKIE}=1`)) return true;

  try {
    const url = req?.nextUrl ?? (req?.url ? new URL(req.url) : null);
    return url?.searchParams.get("qa") === "assisted" || url?.searchParams.get("__qa_auth") === "1";
  } catch {
    return false;
  }
}
