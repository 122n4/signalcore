export type CivilDatePartsV1 = Readonly<{ year: number; month: number; day: number }>;

export function assertCivilDateV1(value: string): string {
  parseCivilDateV1(value);
  return value;
}

export function parseCivilDateV1(value: string): CivilDatePartsV1 {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u.exec(value);
  if (!match) throw new Error("INVALID_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidGregorianDateV1(year, month, day)) throw new Error("INVALID_DATE");
  return { year, month, day };
}

export function isValidGregorianDateV1(year: number, month: number, day: number): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonthV1(year, month);
}

export function compareCivilDateV1(left: string, right: string): -1 | 0 | 1 {
  assertCivilDateV1(left);
  assertCivilDateV1(right);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function subtractCalendarMonthsV1(value: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) throw new Error("INVALID_MONTH_DELTA");
  const parts = parseCivilDateV1(value);
  const zeroMonth = parts.year * 12 + (parts.month - 1) - months;
  const year = Math.floor(zeroMonth / 12);
  const month = zeroMonth % 12 + 1;
  const day = Math.min(parts.day, daysInMonthV1(year, month));
  return renderCivilDateV1({ year, month, day });
}

export function monthKeyV1(value: string): string {
  const d = parseCivilDateV1(value);
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}`;
}

export function quarterKeyV1(value: string): string {
  const d = parseCivilDateV1(value);
  return `${String(d.year).padStart(4, "0")}-Q${Math.floor((d.month - 1) / 3) + 1}`;
}

export function annualKeyV1(value: string): string {
  return String(parseCivilDateV1(value).year).padStart(4, "0");
}

export function isoWeekKeyV1(value: string): string {
  const ordinal = ordinalDayV1(value);
  const weekday = isoWeekdayV1(value);
  const thursdayOrdinal = ordinal + (4 - weekday);
  const weekYear = yearFromOrdinal(thursdayOrdinal);
  const firstThursday = ordinalDayV1(`${String(weekYear).padStart(4, "0")}-01-04`);
  const week = Math.floor((thursdayOrdinal - firstThursday) / 7) + 1;
  return `${String(weekYear).padStart(4, "0")}-W${String(week).padStart(2, "0")}`;
}

export function ordinalDayV1(value: string): number {
  const d = parseCivilDateV1(value);
  let days = 0;
  for (let year = 1; year < d.year; year += 1) days += isLeapYearV1(year) ? 366 : 365;
  for (let month = 1; month < d.month; month += 1) days += daysInMonthV1(d.year, month);
  return days + d.day;
}

export function isoWeekdayV1(value: string): number {
  return ((ordinalDayV1(value) - 1) % 7) + 1;
}

export function renderCivilDateV1(parts: CivilDatePartsV1): string {
  if (!isValidGregorianDateV1(parts.year, parts.month, parts.day)) throw new Error("INVALID_DATE");
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function daysInMonthV1(year: number, month: number): number {
  return [31, isLeapYearV1(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

export function isLeapYearV1(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function yearFromOrdinal(ordinal: number): number {
  let year = 1;
  let remaining = ordinal;
  while (remaining > (isLeapYearV1(year) ? 366 : 365)) {
    remaining -= isLeapYearV1(year) ? 366 : 365;
    year += 1;
  }
  return year;
}
