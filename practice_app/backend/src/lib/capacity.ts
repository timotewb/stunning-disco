/**
 * Capacity and demand computation.
 *
 * Pure functions over already-fetched data so the rules are testable and the
 * HTTP layer stays thin. See capacity-planning-design.md for the full rationale.
 *
 * Core ideas:
 *  - Capacity is measured in FTE (1.0 = full time). Hours are a display concern.
 *  - A member's FTE on a day is a step function: tenure window, then the most
 *    recently-started CapacityChange covering that day, else their baseline.
 *  - Weekends are excluded from the working-day set entirely. Holidays are NOT —
 *    they are working days with zero capacity, so the dip stays visible.
 *  - Leave and project demand are the same calculation, split by whether the
 *    allocation type reduces capacity.
 */

export interface MemberInput {
  id: string;
  name: string;
  role: string;
  seniority: string;
  tags: string[];
  baselineFte: number;
  startDate: Date | null;
  endDate: Date | null;
  capacityChanges: {
    effectiveFrom: Date;
    effectiveTo: Date | null;
    fte: number;
    reason: string | null;
  }[];
}

export interface AllocationInput {
  id: string;
  title: string;
  assigneeId: string | null;
  allocationType: string | null;
  allocationStartDate: Date | null;
  allocationEndDate: Date | null;
  allocationFte: number;
}

export type Bucket = 'week' | 'month';
export type GroupBy = 'none' | 'role' | 'seniority' | 'tag';

export interface BucketMeta {
  start: string;
  end: string;
  label: string;
}

export interface Series {
  key: string;
  capacity: number[];
  leave: number[];
  available: number[];
  demand: number[];
  overcommitted: boolean[];
}

export interface ReductionNote {
  bucketIndex: number;
  memberName: string;
  from: number;
  to: number;
  reason: string | null;
}

export interface CapacityResult {
  buckets: BucketMeta[];
  series: Series[];
  reductions: ReductionNote[];
  totals: {
    capacityFteNow: number;
    availableFteNow: number;
    demandFteNow: number;
    headroomFteNow: number;
    overcommittedBuckets: number;
  };
}

// ── Date helpers ─────────────────────────────────────────────────────────────
// Every date is handled at UTC midnight. Capacity deals in whole calendar days,
// so anchoring to UTC keeps results identical regardless of server timezone.

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function parseDateKey(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

/** Monday–Friday. Weekends are excluded from the working-day set entirely. */
function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/** Inclusive on both ends; null bounds are treated as unbounded. */
function withinRange(d: Date, from: Date | null, to: Date | null): boolean {
  if (from && d < utcDay(from)) return false;
  if (to && d > utcDay(to)) return false;
  return true;
}

// ── Effective FTE ────────────────────────────────────────────────────────────

export interface EffectiveFte {
  fte: number;
  /** The change that applied, when one did — used to explain dips in the UI. */
  change: { fte: number; reason: string | null } | null;
}

/**
 * A member's FTE on a given day.
 *
 * Resolution order (design §3.2):
 *   1. Outside the tenure window → 0
 *   2. Otherwise collect every change covering the day, i.e.
 *      effectiveFrom <= d AND (effectiveTo is null OR d <= effectiveTo)
 *   3. The greatest effectiveFrom wins — most recent change takes precedence
 *   4. No match → baselineFte
 *
 * Step 3 is what lets a bounded temporary reduction nest inside an open-ended
 * permanent change and then correctly unwind once its period passes.
 */
export function effectiveFte(member: MemberInput, day: Date): EffectiveFte {
  if (!withinRange(day, member.startDate, member.endDate)) {
    return { fte: 0, change: null };
  }

  let winner: MemberInput['capacityChanges'][number] | null = null;
  for (const change of member.capacityChanges) {
    const from = utcDay(change.effectiveFrom);
    if (day < from) continue;
    if (change.effectiveTo && day > utcDay(change.effectiveTo)) continue;
    if (!winner || from > utcDay(winner.effectiveFrom)) winner = change;
  }

  if (!winner) return { fte: member.baselineFte, change: null };
  return { fte: winner.fte, change: { fte: winner.fte, reason: winner.reason } };
}

// ── Bucketing ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  // Monday-anchored: Sunday (0) belongs to the week that began six days earlier.
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(d, delta);
}

/**
 * Splits the range into display buckets, each carrying its weekday list.
 *
 * Buckets are clipped to the requested range so a part-week at either end
 * averages over the days actually asked for rather than inventing days outside it.
 */
export function buildBuckets(from: Date, to: Date, bucket: Bucket): { meta: BucketMeta; days: Date[] }[] {
  const out: { meta: BucketMeta; days: Date[] }[] = [];
  if (to < from) return out;

  let cursor = bucket === 'week'
    ? startOfWeek(from)
    : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));

  while (cursor <= to) {
    const next = bucket === 'week'
      ? addDays(cursor, 7)
      : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));

    const spanStart = cursor < from ? from : cursor;
    const lastOfBucket = addDays(next, -1);
    const spanEnd = lastOfBucket > to ? to : lastOfBucket;

    const days: Date[] = [];
    for (let d = new Date(spanStart); d <= spanEnd; d = addDays(d, 1)) {
      if (isWeekday(d)) days.push(new Date(d));
    }

    // A bucket of pure weekend (possible at a range edge) carries no signal.
    if (days.length > 0) {
      out.push({
        meta: {
          start: dateKey(spanStart),
          end: dateKey(spanEnd),
          label: bucket === 'week'
            ? `${spanStart.getUTCDate()} ${MONTHS[spanStart.getUTCMonth()]}`
            : `${MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
        },
        days,
      });
    }
    cursor = next;
  }
  return out;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Group keys for a member. Tags return multiple keys, so a member with two tags
 * contributes to both series — totals across a tag-grouped chart will therefore
 * exceed real headcount, which is expected for an overlapping dimension.
 */
function groupKeys(member: MemberInput, groupBy: GroupBy): string[] {
  switch (groupBy) {
    case 'role':      return [member.role || 'Unassigned'];
    case 'seniority': return [member.seniority || 'Unassigned'];
    case 'tag':       return member.tags.length ? member.tags : ['Untagged'];
    default:          return ['All'];
  }
}

// ── Main computation ─────────────────────────────────────────────────────────

export interface ComputeArgs {
  members: MemberInput[];
  allocations: AllocationInput[];
  /** Allocation type names flagged `reducesCapacity`. */
  leaveTypes: Set<string>;
  /** YYYY-MM-DD keys of public holidays. */
  holidays: Set<string>;
  from: Date;
  to: Date;
  bucket: Bucket;
  groupBy: GroupBy;
  /** "Now" for the summary tiles; injectable so results are deterministic. */
  today?: Date;
}

export function computeCapacity(args: ComputeArgs): CapacityResult {
  const { members, allocations, leaveTypes, holidays, from, to, bucket, groupBy } = args;
  const buckets = buildBuckets(utcDay(from), utcDay(to), bucket);

  // Allocations indexed by assignee so the per-day loop stays proportional to
  // that member's own allocations rather than the whole table.
  const byAssignee = new Map<string, AllocationInput[]>();
  for (const a of allocations) {
    if (!a.assigneeId || !a.allocationStartDate || !a.allocationEndDate) continue;
    const list = byAssignee.get(a.assigneeId) ?? [];
    list.push(a);
    byAssignee.set(a.assigneeId, list);
  }

  const keys: string[] = [];
  const seriesByKey = new Map<string, Series>();
  const ensureSeries = (key: string): Series => {
    let s = seriesByKey.get(key);
    if (!s) {
      s = {
        key,
        capacity: new Array(buckets.length).fill(0),
        leave: new Array(buckets.length).fill(0),
        available: new Array(buckets.length).fill(0),
        demand: new Array(buckets.length).fill(0),
        overcommitted: new Array(buckets.length).fill(false),
      };
      seriesByKey.set(key, s);
      keys.push(key);
    }
    return s;
  };

  const reductions: ReductionNote[] = [];
  const seenReduction = new Set<string>();

  buckets.forEach((b, bi) => {
    const workingDays = b.days.length;
    if (workingDays === 0) return;

    for (const member of members) {
      const memberAllocs = byAssignee.get(member.id) ?? [];
      let capSum = 0;
      let leaveSum = 0;
      let demandSum = 0;

      for (const day of b.days) {
        const isHoliday = holidays.has(dateKey(day));
        const eff = effectiveFte(member, day);

        // Holidays zero out capacity AND demand. Zeroing only capacity would
        // manufacture phantom overcommitment in every holiday week.
        const capacity = isHoliday ? 0 : eff.fte;
        capSum += capacity;

        if (!isHoliday && eff.change && eff.change.fte < member.baselineFte) {
          const sig = `${bi}|${member.id}|${eff.change.fte}`;
          if (!seenReduction.has(sig)) {
            seenReduction.add(sig);
            reductions.push({
              bucketIndex: bi,
              memberName: member.name,
              from: member.baselineFte,
              to: eff.change.fte,
              reason: eff.change.reason,
            });
          }
        }

        if (capacity === 0) continue;

        for (const a of memberAllocs) {
          if (!withinRange(day, a.allocationStartDate, a.allocationEndDate)) continue;
          // Contribution is relative to the person, so a 0.6 FTE member fully
          // allocated contributes 0.6 FTE — not 1.0. Design §3.4.
          const contribution = capacity * a.allocationFte;
          if (a.allocationType && leaveTypes.has(a.allocationType)) leaveSum += contribution;
          else demandSum += contribution;
        }
      }

      const capacityAvg = capSum / workingDays;
      // Clamp before aggregating: overlapping leave entries could otherwise sum
      // past the member's own capacity and drag the group's available negative.
      const leaveAvg = Math.min(leaveSum / workingDays, capacityAvg);
      const demandAvg = demandSum / workingDays;

      for (const key of groupKeys(member, groupBy)) {
        const s = ensureSeries(key);
        s.capacity[bi] += capacityAvg;
        s.leave[bi] += leaveAvg;
        s.available[bi] += Math.max(0, capacityAvg - leaveAvg);
        s.demand[bi] += demandAvg;
      }
    }
  });

  const round = (n: number) => Math.round(n * 100) / 100;
  for (const s of seriesByKey.values()) {
    for (let i = 0; i < buckets.length; i++) {
      s.capacity[i] = round(s.capacity[i]);
      s.leave[i] = round(s.leave[i]);
      s.available[i] = round(s.available[i]);
      s.demand[i] = round(s.demand[i]);
      s.overcommitted[i] = s.demand[i] > s.available[i] + 1e-9;
    }
  }

  // Counted once per bucket rather than once per series, so a tag-grouped view
  // doesn't inflate the figure through members belonging to two groups.
  let overcommittedBuckets = 0;
  for (let i = 0; i < buckets.length; i++) {
    if ([...seriesByKey.values()].some((s) => s.overcommitted[i])) overcommittedBuckets++;
  }

  const today = utcDay(args.today ?? new Date());
  const nowIndex = buckets.findIndex(
    (b) => parseDateKey(b.meta.start) <= today && today <= parseDateKey(b.meta.end)
  );
  const sumAt = (pick: (s: Series) => number[]) =>
    nowIndex === -1 ? 0 : round([...seriesByKey.values()].reduce((acc, s) => acc + pick(s)[nowIndex], 0));

  const capacityFteNow = sumAt((s) => s.capacity);
  const availableFteNow = sumAt((s) => s.available);
  const demandFteNow = sumAt((s) => s.demand);

  return {
    buckets: buckets.map((b) => b.meta),
    series: keys.sort((a, b) => a.localeCompare(b)).map((k) => seriesByKey.get(k)!),
    reductions,
    totals: {
      capacityFteNow,
      availableFteNow,
      demandFteNow,
      headroomFteNow: round(availableFteNow - demandFteNow),
      overcommittedBuckets,
    },
  };
}
