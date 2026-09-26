import artifact from "./calendars/XNYS_TRADING_CALENDAR_V1.json";
import artifactV2 from "./calendars/XNYS_TRADING_CALENDAR_V2.json";
import { i5ResearchInternalCanonicalJsonBytesV1, sha256HexV1, type CanonicalJsonValue } from "./canonical";
import { annualKeyV1, compareCivilDateV1, isoWeekKeyV1, monthKeyV1, quarterKeyV1 } from "./civilDate";

export const xnysTradingCalendarV1 = artifact as Readonly<{
  schemaVersion: "XNYS_TRADING_CALENDAR_V1";
  calendar: "XNYS_TRADING_CALENDAR_V1";
  coverageStart: string;
  coverageEnd: string;
  sessionCount: string;
  sessionListSha256: string;
  sessions: readonly string[];
}>;

export const xnysTradingCalendarArtifactSha256V1 = "6279CB8F235222063AB6F766ECC347C1D6F74CD99B4FD8BDFE9EF644F9F880E6";
export const xnysTradingCalendarArtifactSha256V2 = "071433C0BCC4D72960DEEBBFC5678E5635E41B2B48319E05658D9715CA3F8578";

const sessions = xnysTradingCalendarV1.sessions;
const sessionSet = new Set(sessions);

export const xnysTradingCalendarV2 = artifactV2 as Readonly<{
  schemaVersion: "XNYS_TRADING_CALENDAR_V2";
  calendar: "XNYS_TRADING_CALENDAR_V2";
  coverageStart: string;
  coverageEnd: string;
  sessionCount: string;
  sessionListSha256: string;
  sessions: readonly string[];
}>;

const sessionsV2 = xnysTradingCalendarV2.sessions;
const sessionSetV2 = new Set(sessionsV2);

export function verifyXnysTradingCalendarArtifactV1(): void {
  const actual = sha256HexV1(Buffer.concat([i5ResearchInternalCanonicalJsonBytesV1(artifact as CanonicalJsonValue), Buffer.from("\n", "utf8")]));
  if (actual !== xnysTradingCalendarArtifactSha256V1) throw new Error("CALENDAR_ARTIFACT_SHA_MISMATCH");
  const joined = `${sessions.join("\n")}\n`;
  if (sha256HexV1(Buffer.from(joined, "utf8")) !== xnysTradingCalendarV1.sessionListSha256) {
    throw new Error("CALENDAR_SESSION_LIST_SHA_MISMATCH");
  }
}

export function assertXnysCoverageV1(date: string): void {
  if (compareCivilDateV1(date, xnysTradingCalendarV1.coverageStart) < 0 || compareCivilDateV1(date, xnysTradingCalendarV1.coverageEnd) > 0) {
    throw new Error("CALENDAR_OUT_OF_RANGE");
  }
}

export function isXnysSessionV1(date: string): boolean {
  assertXnysCoverageV1(date);
  return sessionSet.has(date);
}

export function xnysSessionsInRangeV1(start: string, end: string): readonly string[] {
  assertXnysCoverageV1(start);
  assertXnysCoverageV1(end);
  return sessions.filter((session) => session >= start && session <= end);
}

export function previousXnysSessionV1(date: string): string | null {
  assertXnysCoverageV1(date);
  const index = sessions.indexOf(date);
  if (index <= 0) return null;
  return sessions[index - 1]!;
}

export function nextXnysSessionV1(date: string): string | null {
  assertXnysCoverageV1(date);
  const index = sessions.indexOf(date);
  if (index < 0 || index + 1 >= sessions.length) return null;
  return sessions[index + 1]!;
}

export function latestXnysSessionOnOrBeforeV1(date: string): string | null {
  assertXnysCoverageV1(date);
  let low = 0;
  let high = sessions.length - 1;
  let found: string | null = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const session = sessions[mid]!;
    if (session <= date) {
      found = session;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export type RebalanceScheduleV1 = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export function rebalanceSessionsV1(valuationSessions: readonly string[], schedule: RebalanceScheduleV1): ReadonlySet<string> {
  if (schedule === "DAILY") return new Set(valuationSessions);
  const key = schedule === "WEEKLY" ? isoWeekKeyV1 : schedule === "MONTHLY" ? monthKeyV1 : schedule === "QUARTERLY" ? quarterKeyV1 : annualKeyV1;
  const lastByKey = new Map<string, string>();
  for (const session of valuationSessions) lastByKey.set(key(session), session);
  return new Set(lastByKey.values());
}

export function verifyXnysTradingCalendarArtifactV2(): void {
  const actual = sha256HexV1(Buffer.concat([i5ResearchInternalCanonicalJsonBytesV1(artifactV2 as CanonicalJsonValue), Buffer.from("\n", "utf8")]));
  if (actual !== xnysTradingCalendarArtifactSha256V2) throw new Error("CALENDAR_ARTIFACT_SHA_MISMATCH");
  const joined = `${sessionsV2.join("\n")}\n`;
  if (sha256HexV1(Buffer.from(joined, "utf8")) !== xnysTradingCalendarV2.sessionListSha256) {
    throw new Error("CALENDAR_SESSION_LIST_SHA_MISMATCH");
  }
  const overlap = sessions.filter((session) => session >= xnysTradingCalendarV2.coverageStart && session <= xnysTradingCalendarV2.coverageEnd);
  const overlapV2 = sessionsV2.filter((session) => session >= xnysTradingCalendarV1.coverageStart && session <= xnysTradingCalendarV1.coverageEnd);
  if (overlap.length !== overlapV2.length || overlap.some((session, index) => session !== overlapV2[index])) {
    throw new Error("CALENDAR_OVERLAP_DRIFT");
  }
}

export function assertXnysCoverageV2(date: string): void {
  if (compareCivilDateV1(date, xnysTradingCalendarV2.coverageStart) < 0 || compareCivilDateV1(date, xnysTradingCalendarV2.coverageEnd) > 0) {
    throw new Error("CALENDAR_OUT_OF_RANGE");
  }
}

export function isXnysSessionV2(date: string): boolean {
  assertXnysCoverageV2(date);
  return sessionSetV2.has(date);
}

export function xnysSessionsInRangeV2(start: string, end: string): readonly string[] {
  assertXnysCoverageV2(start);
  assertXnysCoverageV2(end);
  return sessionsV2.filter((session) => session >= start && session <= end);
}

export function previousXnysSessionV2(date: string): string | null {
  assertXnysCoverageV2(date);
  const index = sessionsV2.indexOf(date);
  if (index <= 0) return null;
  return sessionsV2[index - 1]!;
}

export function nextXnysSessionV2(date: string): string | null {
  assertXnysCoverageV2(date);
  const index = sessionsV2.indexOf(date);
  if (index < 0 || index + 1 >= sessionsV2.length) return null;
  return sessionsV2[index + 1]!;
}

export function latestXnysSessionOnOrBeforeV2(date: string): string | null {
  assertXnysCoverageV2(date);
  let low = 0;
  let high = sessionsV2.length - 1;
  let found: string | null = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const session = sessionsV2[mid]!;
    if (session <= date) {
      found = session;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export function rebalanceSessionsV2(valuationSessions: readonly string[], schedule: RebalanceScheduleV1): ReadonlySet<string> {
  if (schedule === "DAILY") return new Set(valuationSessions);
  const key = schedule === "WEEKLY" ? isoWeekKeyV1 : schedule === "MONTHLY" ? monthKeyV1 : schedule === "QUARTERLY" ? quarterKeyV1 : annualKeyV1;
  const lastByKey = new Map<string, string>();
  for (const session of valuationSessions) lastByKey.set(key(session), session);
  return new Set(lastByKey.values());
}
