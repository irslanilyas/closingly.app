import type { CapacityWeek } from "@/lib/types";

interface CapacityDeal {
  id: string;
  estimated_hours: number;
  start_date: string;
  target_end_date: string;
}

/** Monday of the week containing `date`, as a UTC date at midnight. */
function startOfWeek(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Spreads each deal's estimated hours evenly across the ISO weeks between its
 * start and end date, then sums that load against a fixed weekly capacity.
 *
 * Deliberately simple: even distribution, not a real staffing model. The goal
 * is a rough "you're about to overcommit" signal, not a precise schedule.
 */
export function computeCapacityWeeks(
  deals: CapacityDeal[],
  weeklyCapacityHours: number,
  weeksAhead = 12,
  now = new Date()
): CapacityWeek[] {
  const firstWeek = startOfWeek(now);
  const buckets = new Map<string, number>();
  for (let i = 0; i < weeksAhead; i++) {
    buckets.set(toISODate(addDays(firstWeek, i * 7)), 0);
  }

  for (const deal of deals) {
    const start = startOfWeek(new Date(deal.start_date));
    const end = startOfWeek(new Date(deal.target_end_date));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const weekCount = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 604_800_000) + 1
    );
    const hoursPerWeek = deal.estimated_hours / weekCount;

    for (let i = 0; i < weekCount; i++) {
      const key = toISODate(addDays(start, i * 7));
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + hoursPerWeek);
      }
    }
  }

  return Array.from(buckets.entries()).map(([week_start, hours_committed]) => ({
    week_start,
    hours_committed: Math.round(hours_committed * 10) / 10,
    capacity_hours: weeklyCapacityHours,
    over_capacity: hours_committed > weeklyCapacityHours,
  }));
}
