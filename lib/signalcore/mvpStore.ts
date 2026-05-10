// lib/signalcore/mvpStore.ts

type StoreValue = Record<string, any>;

const store = new Map<string, StoreValue>();

export function getUserStore(userId: string): StoreValue {
  return store.get(userId) ?? {};
}

export function setUserStore(userId: string, patch: StoreValue): StoreValue {
  const prev = store.get(userId) ?? {};
  const next = { ...prev, ...patch };
  store.set(userId, next);
  return next;
}

export function getFlag(userId: string, key: string): boolean {
  const v = getUserStore(userId)[key];
  return Boolean(v);
}

export function setFlag(userId: string, key: string, value: boolean): StoreValue {
  return setUserStore(userId, { [key]: Boolean(value) });
}