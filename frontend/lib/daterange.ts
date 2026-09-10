// Helpers for Postgres `daterange` columns (rate_periods.stay_period,
// fee_rules.valid_period), always stored canonically as "[start,end)".

export function toDateRange(start: string, end: string): string {
  return `[${start},${end})`;
}

export function parseDateRange(value: string): { start: string; end: string } | null {
  const match = /^[[(](\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})[)\]]$/.exec(value.trim());
  if (!match) return null;
  return { start: match[1], end: match[2] };
}
