function parseCsv(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isInvestingOwnerUserId(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!userId) return false;
  const owners = new Set([...parseCsv(env.INVESTING_OWNER_USER_IDS), ...parseCsv(env.SC_OWNER_USER_IDS)]);
  const single = String(env.INVESTING_OWNER_USER_ID || env.SC_OWNER_USER_ID || "").trim();
  if (single) owners.add(single);
  return owners.has(userId);
}
