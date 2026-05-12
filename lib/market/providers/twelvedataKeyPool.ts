type TwelveDataKeyState = {
  until: number;
  reason: string;
};

type TwelveDataKeyAttempt<T> = {
  key: string;
  keyIndex: number;
  keyLabel: string;
  run: (key: string) => Promise<T>;
};

const g = globalThis as any;
if (!g.__sc_twelvedata_key_cooldowns) {
  g.__sc_twelvedata_key_cooldowns = new Map<string, TwelveDataKeyState>();
}
if (typeof g.__sc_twelvedata_key_cursor !== "number") {
  g.__sc_twelvedata_key_cursor = 0;
}

const KEY_COOLDOWNS: Map<string, TwelveDataKeyState> = g.__sc_twelvedata_key_cooldowns;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function getTwelveDataApiKeys(env: NodeJS.ProcessEnv = process.env) {
  const pooled = clean(env.TWELVEDATA_API_KEYS)
    .split(/[,\n;]/)
    .map(clean)
    .filter(Boolean);
  const legacy = clean(env.TWELVEDATA_API_KEY);
  return unique([...pooled, legacy]);
}

export function hasTwelveDataApiKey(env: NodeJS.ProcessEnv = process.env) {
  return getTwelveDataApiKeys(env).length > 0;
}

export function getTwelveDataKeyPoolStatus(env: NodeJS.ProcessEnv = process.env) {
  const now = Date.now();
  const keys = getTwelveDataApiKeys(env);
  return {
    configuredCount: keys.length,
    activeCount: keys.filter((key) => {
      const cooldown = KEY_COOLDOWNS.get(key);
      if (!cooldown) return true;
      return now >= cooldown.until;
    }).length,
    cooldownCount: keys.filter((key) => {
      const cooldown = KEY_COOLDOWNS.get(key);
      return cooldown && now < cooldown.until;
    }).length,
  };
}

function cooldownMsForTwelveDataError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  if (
    message.includes("current minute") ||
    message.includes("minute limit") ||
    message.includes("too many requests") ||
    message.includes("(429)") ||
    message.includes("rate limit")
  ) {
    return 75_000;
  }

  if (
    message.includes("api credits") ||
    message.includes("credits") ||
    message.includes("quota") ||
    message.includes("usage limit") ||
    message.includes("plan limit")
  ) {
    return 12 * 60_000;
  }

  return 0;
}

function keyLabel(index: number) {
  return `td_key_${index + 1}`;
}

function orderedKeyAttempts<T>(keys: string[], run: (key: string) => Promise<T>): TwelveDataKeyAttempt<T>[] {
  const start = Math.abs(Number(g.__sc_twelvedata_key_cursor || 0)) % keys.length;
  return keys.map((_, offset) => {
    const keyIndex = (start + offset) % keys.length;
    const key = keys[keyIndex];
    return {
      key,
      keyIndex,
      keyLabel: keyLabel(keyIndex),
      run,
    };
  });
}

function getActiveCooldown(key: string) {
  const cooldown = KEY_COOLDOWNS.get(key);
  if (!cooldown) return null;
  if (Date.now() >= cooldown.until) {
    KEY_COOLDOWNS.delete(key);
    return null;
  }
  return cooldown;
}

export async function withTwelveDataKeyPool<T>(run: (key: string) => Promise<T>): Promise<T> {
  const keys = getTwelveDataApiKeys();
  if (keys.length === 0) throw new Error("Missing TWELVEDATA_API_KEY");

  const errors: string[] = [];
  for (const attempt of orderedKeyAttempts(keys, run)) {
    const cooldown = getActiveCooldown(attempt.key);
    if (cooldown) {
      errors.push(`${attempt.keyLabel}:cooldown_active:${cooldown.reason}`);
      continue;
    }

    try {
      const value = await attempt.run(attempt.key);
      g.__sc_twelvedata_key_cursor = attempt.keyIndex + 1;
      return value;
    } catch (error) {
      const message = String((error as any)?.message ?? error ?? "twelvedata_key_failed");
      const cooldownMs = cooldownMsForTwelveDataError(error);
      if (cooldownMs > 0) {
        KEY_COOLDOWNS.set(attempt.key, {
          until: Date.now() + cooldownMs,
          reason: message,
        });
      }
      errors.push(`${attempt.keyLabel}:${message}`);
    }
  }

  throw new Error(errors.length > 0 ? errors.join(" | ") : "All Twelve Data keys failed");
}

export function resetTwelveDataKeyPoolForTests() {
  KEY_COOLDOWNS.clear();
  g.__sc_twelvedata_key_cursor = 0;
}
