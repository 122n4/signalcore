type HeaderReader = Pick<Headers, "get">;

type LoopAuthEnv = {
  CRON_SECRET?: string;
  ENGINE_LOOP_SECRET?: string;
  NODE_ENV?: string;
};

export function readBearerToken(authHeader: string | null | undefined) {
  const auth = String(authHeader || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function isEngineLoopAuthorized(args: {
  headers: HeaderReader;
  env?: LoopAuthEnv;
}) {
  const env = args.env || {};
  const cronSecret = String(env.CRON_SECRET || env.ENGINE_LOOP_SECRET || "").trim();
  const token = readBearerToken(args.headers.get("authorization"));
  const isVercelCron = Boolean(args.headers.get("x-vercel-cron"));

  if (isVercelCron) return true;

  if (cronSecret) return token === cronSecret;

  if (String(env.NODE_ENV || "").toLowerCase() === "production") {
    // Production should never run loop endpoints without an explicit shared secret.
    return false;
  }

  if (isVercelCron) return true;
  return true;
}
