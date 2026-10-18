import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { AlertTriangle, TrendingDown, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CapacityResponse, TeamMember } from '../types';
import { getCapacity, getUndatedLeavers } from '../api/client';

const COLORS = {
  available: '#6366f1',
  leave: '#f59e0b',
  demand: '#f43f5e',
  series: ['#6366f1', '#14b8a6', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#22c55e', '#3b82f6'],
};

type Bucket = 'week' | 'month';
type GroupBy = 'none' | 'role' | 'seniority' | 'tag';

const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Whole team',
  role: 'By role',
  seniority: 'By seniority',
  tag: 'By tag',
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Default window: today through twelve months out. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 0));
  return { from: isoDate(from), to: isoDate(to) };
}

function fmtFte(n: number, hoursPerFte: number, showHours: boolean): string {
  return showHours ? `${(n * hoursPerFte).toFixed(1)} h` : `${n.toFixed(2)} FTE`;
}

const Capacity: React.FC = () => {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [bucket, setBucket] = useState<Bucket>('month');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [showHours, setShowHours] = useState(false);

  const [data, setData] = useState<CapacityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [leavers, setLeavers] = useState<TeamMember[]>([]);
  const [dismissedLeavers, setDismissedLeavers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getCapacity({ from, to, bucket, groupBy }));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to load capacity.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, bucket, groupBy]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getUndatedLeavers()
      .then(setLeavers)
      .catch(() => setLeavers([]));
  }, []);

  const hoursPerFte = data?.hoursPerFte ?? 37.5;
  const grouped = groupBy !== 'none';

  // Recharts wants one row per bucket with every series flattened onto it.
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b, i) => {
      const row: Record<string, string | number | boolean> = { label: b.label };
      for (const s of data.series) {
        row[`available__${s.key}`] = s.available[i];
        row[`leave__${s.key}`] = s.leave[i];
        row[`demand__${s.key}`] = s.demand[i];
        row[`over__${s.key}`] = s.overcommitted[i];
      }
      return row;
    });
  }, [data]);

  const reductionsByBucket = useMemo(() => {
    const map = new Map<number, CapacityResponse['reductions']>();
    for (const r of data?.reductions ?? []) {
      const list = map.get(r.bucketIndex) ?? [];
      list.push(r);
      map.set(r.bucketIndex, list);
    }
    return map;
  }, [data]);

  const totals = data?.totals;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Capacity</h1>
        <p className="text-sm text-gray-500 mt-1">
          What the team can deliver over time, and how much is already committed.
        </p>
      </div>

      {leavers.length > 0 && !dismissedLeavers && (
        <div className="mb-5 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-900">
              {leavers.length} {leavers.length === 1 ? 'person is' : 'people are'} marked as
              leaving without an end date
            </p>
            <p className="text-amber-700 mt-0.5">
              {leavers.map((l) => l.name).join(', ')} — they are counted at full capacity
              until an end date is set.{' '}
              <Link to="/team" className="underline font-medium">
                Set end dates
              </Link>
            </p>
          </div>
          <button
            onClick={() => setDismissedLeavers(true)}
            className="text-amber-500 hover:text-amber-700"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Interval</label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['week', 'month'] as Bucket[]).map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  bucket === b ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Group by</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <label className="block text-xs font-medium text-gray-600 mb-1">Units</label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowHours(false)}
              className={`px-3 py-1.5 text-sm ${
                !showHours ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              FTE
            </button>
            <button
              onClick={() => setShowHours(true)}
              className={`px-3 py-1.5 text-sm ${
                showHours ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Hours
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Summary tiles ─────────────────────────────────────────────────── */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <Tile
            label="Capacity today"
            value={fmtFte(totals.capacityFteNow, hoursPerFte, showHours)}
            hint="Total team capacity right now"
          />
          <Tile
            label="Available today"
            value={fmtFte(totals.availableFteNow, hoursPerFte, showHours)}
            hint="After leave is deducted"
          />
          <Tile
            label="Committed today"
            value={fmtFte(totals.demandFteNow, hoursPerFte, showHours)}
            hint="Allocated project work"
          />
          <Tile
            label="Headroom today"
            value={fmtFte(totals.headroomFteNow, hoursPerFte, showHours)}
            hint={
              totals.headroomFteNow < 0
                ? 'Overcommitted — demand exceeds availability'
                : 'Spare capacity for new work'
            }
            tone={totals.headroomFteNow < 0 ? 'danger' : 'default'}
          />
        </div>
      )}

      {totals && totals.overcommittedBuckets > 0 && (
        <div className="mb-5 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            <strong>{totals.overcommittedBuckets}</strong>{' '}
            {totals.overcommittedBuckets === 1 ? bucket : `${bucket}s`} in this range are
            overcommitted — committed work exceeds available capacity.
          </span>
        </div>
      )}

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        {loading ? (
          <div className="h-[380px] flex items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        ) : !data || data.series.length === 0 ? (
          <div className="h-[380px] flex flex-col items-center justify-center text-sm text-gray-400">
            <TrendingDown size={28} className="mb-2 text-gray-300" />
            No capacity data for this range.
            <Link to="/team" className="text-indigo-600 hover:underline mt-1">
              Add team members
            </Link>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis
                domain={[0, 'auto']}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v: number) =>
                  showHours ? `${Math.round(v * hoursPerFte)}` : v.toFixed(1)
                }
                label={{
                  value: showHours ? 'Hours / week' : 'FTE',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: '#94a3b8' },
                }}
              />
              <Tooltip
                content={
                  <CapacityTooltip
                    series={data.series}
                    hoursPerFte={hoursPerFte}
                    showHours={showHours}
                    grouped={grouped}
                    reductions={reductionsByBucket}
                    buckets={data.buckets}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#cbd5e1" />

              {grouped
                ? data.series.map((s, i) => (
                    <Area
                      key={s.key}
                      type="linear"
                      dataKey={`available__${s.key}`}
                      name={s.key}
                      stroke={COLORS.series[i % COLORS.series.length]}
                      fill={COLORS.series[i % COLORS.series.length]}
                      fillOpacity={0.18}
                    />
                  ))
                : [
                    <Area
                      key="available"
                      type="linear"
                      dataKey="available__All"
                      name="Available"
                      stackId="cap"
                      stroke={COLORS.available}
                      fill={COLORS.available}
                      fillOpacity={0.3}
                    />,
                    <Area
                      key="leave"
                      type="linear"
                      dataKey="leave__All"
                      name="On leave"
                      stackId="cap"
                      stroke={COLORS.leave}
                      fill={COLORS.leave}
                      fillOpacity={0.3}
                    />,
                  ]}

              {grouped ? (
                data.series.map((s, i) => (
                  <Line
                    key={`d-${s.key}`}
                    type="linear"
                    dataKey={`demand__${s.key}`}
                    name={`${s.key} committed`}
                    stroke={COLORS.series[i % COLORS.series.length]}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                  />
                ))
              ) : (
                <Line
                  type="linear"
                  dataKey="demand__All"
                  name="Committed work"
                  stroke={COLORS.demand}
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Breakdown table ───────────────────────────────────────────────── */}
      {data && data.series.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-800">Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium sticky left-0 bg-gray-50">
                    {grouped ? GROUP_LABELS[groupBy].replace('By ', '') : 'Measure'}
                  </th>
                  {data.buckets.map((b) => (
                    <th key={b.start} className="text-right px-3 py-2 font-medium whitespace-nowrap">
                      {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? data.series.map((s) => (
                      <React.Fragment key={s.key}>
                        <Row
                          label={s.key}
                          values={s.available}
                          over={s.overcommitted}
                          hoursPerFte={hoursPerFte}
                          showHours={showHours}
                          bold
                        />
                        <Row
                          label="  committed"
                          values={s.demand}
                          over={s.overcommitted}
                          hoursPerFte={hoursPerFte}
                          showHours={showHours}
                          muted
                        />
                      </React.Fragment>
                    ))
                  : data.series.slice(0, 1).flatMap((s) => [
                      <Row
                        key="cap"
                        label="Capacity"
                        values={s.capacity}
                        hoursPerFte={hoursPerFte}
                        showHours={showHours}
                      />,
                      <Row
                        key="leave"
                        label="On leave"
                        values={s.leave}
                        hoursPerFte={hoursPerFte}
                        showHours={showHours}
                        muted
                      />,
                      <Row
                        key="avail"
                        label="Available"
                        values={s.available}
                        hoursPerFte={hoursPerFte}
                        showHours={showHours}
                        bold
                      />,
                      <Row
                        key="demand"
                        label="Committed"
                        values={s.demand}
                        hoursPerFte={hoursPerFte}
                        showHours={showHours}
                      />,
                      <Row
                        key="head"
                        label="Headroom"
                        values={s.available.map((a, i) => a - s.demand[i])}
                        over={s.overcommitted}
                        hoursPerFte={hoursPerFte}
                        showHours={showHours}
                        bold
                      />,
                    ])}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Pieces ────────────────────────────────────────────────────────────────────

const Tile: React.FC<{
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'danger';
}> = ({ label, value, hint, tone = 'default' }) => (
  <div
    className={`rounded-xl border p-4 ${
      tone === 'danger' ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-200'
    }`}
  >
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p
      className={`text-2xl font-bold mt-1 ${
        tone === 'danger' ? 'text-rose-700' : 'text-gray-900'
      }`}
    >
      {value}
    </p>
    <p className="text-[11px] text-gray-400 mt-1">{hint}</p>
  </div>
);

const Row: React.FC<{
  label: string;
  values: number[];
  over?: boolean[];
  hoursPerFte: number;
  showHours: boolean;
  bold?: boolean;
  muted?: boolean;
}> = ({ label, values, over, hoursPerFte, showHours, bold, muted }) => (
  <tr className="border-t border-gray-100">
    <td
      className={`px-4 py-2 sticky left-0 bg-white whitespace-pre ${
        bold ? 'font-semibold text-gray-800' : muted ? 'text-gray-400' : 'text-gray-600'
      }`}
    >
      {label}
    </td>
    {values.map((v, i) => (
      <td
        key={i}
        className={`px-3 py-2 text-right tabular-nums ${
          v < 0 || over?.[i] ? 'text-rose-600 font-medium' : muted ? 'text-gray-400' : 'text-gray-700'
        }`}
      >
        {showHours ? (v * hoursPerFte).toFixed(1) : v.toFixed(2)}
      </td>
    ))}
  </tr>
);

const CapacityTooltip = ({
  active,
  label,
  series,
  hoursPerFte,
  showHours,
  grouped,
  reductions,
  buckets,
}: {
  active?: boolean;
  label?: string;
  series: CapacityResponse['series'];
  hoursPerFte: number;
  showHours: boolean;
  grouped: boolean;
  reductions: Map<number, CapacityResponse['reductions']>;
  buckets: CapacityResponse['buckets'];
}) => {
  if (!active || !label) return null;
  const idx = buckets.findIndex((b) => b.label === label);
  if (idx < 0) return null;

  const notes = reductions.get(idx) ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs max-w-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {series.map((s, i) => {
        const headroom = s.available[idx] - s.demand[idx];
        return (
          <div key={s.key} className={i > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
            {grouped && <p className="font-medium text-gray-600 mb-0.5">{s.key}</p>}
            <Stat label="Capacity" v={s.capacity[idx]} h={hoursPerFte} showHours={showHours} />
            {s.leave[idx] > 0 && (
              <Stat label="On leave" v={s.leave[idx]} h={hoursPerFte} showHours={showHours} />
            )}
            <Stat label="Available" v={s.available[idx]} h={hoursPerFte} showHours={showHours} />
            <Stat label="Committed" v={s.demand[idx]} h={hoursPerFte} showHours={showHours} />
            <div
              className={`flex justify-between gap-4 font-medium ${
                headroom < 0 ? 'text-rose-600' : 'text-gray-700'
              }`}
            >
              <span>Headroom</span>
              <span>{fmtFte(headroom, hoursPerFte, showHours)}</span>
            </div>
          </div>
        );
      })}
      {notes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          {notes.map((n, i) => (
            <p key={i} className="text-amber-700">
              {n.memberName}: {n.from} → {n.to} FTE ({n.reason})
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; v: number; h: number; showHours: boolean }> = ({
  label,
  v,
  h,
  showHours,
}) => (
  <div className="flex justify-between gap-4 text-gray-500">
    <span>{label}</span>
    <span>{fmtFte(v, h, showHours)}</span>
  </div>
);

export default Capacity;
