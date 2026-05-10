function parseCsv(v: unknown) {
  return String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function getOwnerUserIds() {
  const fromList = parseCsv(process.env.SC_OWNER_USER_IDS);
  const single = String(process.env.SC_OWNER_USER_ID || "").trim();
  const merged = single ? [single, ...fromList] : fromList;
  return Array.from(new Set(merged));
}

export function isOwnerUserId(userId: string | null | undefined) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const owners = getOwnerUserIds();
  return owners.includes(id);
}
