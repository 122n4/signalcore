import { auth } from "@clerk/nextjs/server";

export type VerifiedClerkIdentity =
  | {
      ok: true;
      externalProvider: "CLERK";
      externalSubject: string;
    }
  | {
      ok: false;
      code: "UNAUTHENTICATED" | "INTERNAL_ERROR";
    };

export async function resolveVerifiedClerkIdentity(): Promise<VerifiedClerkIdentity> {
  try {
    const result = await auth();
    if (!result.userId) return { ok: false, code: "UNAUTHENTICATED" };

    return {
      ok: true,
      externalProvider: "CLERK",
      externalSubject: result.userId,
    };
  } catch {
    return { ok: false, code: "INTERNAL_ERROR" };
  }
}
