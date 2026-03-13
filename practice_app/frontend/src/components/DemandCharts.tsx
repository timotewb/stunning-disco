import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
} from 'recharts';
import type {
  RequestAnalytics,
  RequestSourceConfig,
  RequestTypeConfig,
  RequestPriorityConfig,
  RequestStatusConfig,
  DimensionNode,
} from '../types';
import SkillsPressureMap from './SkillsPressureMap';

// ── Colour helpers ────────────────────────────────────────────────────────────

const PALETTE: Record<string, string> = {
  indigo:  '#6366f1',
  rose:    '#f43f5e',
  amber:   '#f59e0b',
  green:   '#22c55e',
  blue:    '#3b82f6',
  teal:    '#14b8a6',
  purple:  '#a855f7',
  orange:  '#f97316',
  cyan:    '#06b6d4',
  pink:    '#ec4899',
  gray:    '#9ca3af',
};

const FALLBACK_COLORS = Object.values(PALETTE);

function colorFor(name: string, configs: { name: string; color: string }[]): string {
  const cfg = configs.find((c) => c.name === name);
  return cfg ? (PALETTE[cfg.color] ?? PALETTE.gray) : PALETTE.gray;
}

function autoColor(index: number): string {
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const CustomBarTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label} — {total} total</p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="flex items-center gap-1.5 mb-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Active shape for donut chart ──────────────────────────────────────────────

const renderActiveShape = (props: unknown) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props as {
    cx: number; cy: number; innerRadius: number; outerRadius: number;
    startAngle: number; endAngle: number; fill: string;
    payload: { name: string }; percent: number; value: number;
  };
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#374151" className="text-sm font-semibold" fontSize={13} fontWeight={600}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#6b7280" fontSize={12}>
        {value} ({(percent * 100).toFixed(0)}%)
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  analytics: RequestAnalytics;
  groupBy: 'week' | 'month';
  onGroupByChange: (v: 'week' | 'month') => void;
  sources: RequestSourceConfig[];
  types: RequestTypeConfig[];
  priorities: RequestPriorityConfig[];
  statuses: RequestStatusConfig[];
  onSourceFilter?: (source: string) => void;
  onTypeFilter?: (type: string) => void;
  dimensionNodes?: DimensionNode[];
  onNodeFilter?: (nodeId: string, nodeName: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DemandCharts: React.FC<Props> = ({
  analytics,
  groupBy,
  onGroupByChange,
  sources,
  types,
  priorities,
  statuses,
  onSourceFilter,
  onTypeFilter,
  dimensionNodes,
  onNodeFilter,
}) => {
  const [volBreakdown, setVolBreakdown] = useState<'source' | 'type' | 'priority'>('source');
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const [activeTypeIdx, setActiveTypeIdx] = useState(0);

  // ── Volume Over Time data ──────────────────────────────────────────────────
  const volData = analytics.volumeOverTime;

  // Collect all unique breakdown keys in order of total count
  const volKeys = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of volData) {
      const map = volBreakdown === 'source' ? p.bySource
        : volBreakdown === 'type' ? p.byType
        : p.byPriority;
      for (const [k, v] of Object.entries(map)) {
        counts[k] = (counts[k] ?? 0) + v;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [volData, volBreakdown]);

  const volChartData = useMemo(() =>
    volData.map((p) => {
      const row: Record<string, unknown> = { period: p.period };
      const map = volBreakdown === 'source' ? p.bySource
        : volBreakdown === 'type' ? p.byType
        : p.byPriority;
      for (const k of volKeys) row[k] = map[k] ?? 0;
      return row;
    }),
    [volData, volBreakdown, volKeys]
  );

  const configsFor = (key: string) =>
    volBreakdown === 'source' ? sources
    : volBreakdown === 'type' ? types
    : priorities;

  // ── Donut chart data ───────────────────────────────────────────────────────
  const sourceDonut = analytics.bySource.map((d, i) => ({
    name: d.source,
    value: d.count,
    fill: colorFor(d.source, sources) ?? autoColor(i),
  }));

  const typeDonut = analytics.byType.map((d, i) => ({
    name: d.type,
    value: d.count,
    fill: colorFor(d.type, types) ?? autoColor(i),
  }));

  // ── Assignee Load data ────────────────────────────────────────────────────
  const priorityOrder = priorities.map((p) => p.name);
  const PRIORITY_FILL: Record<string, string> = {
    critical: PALETTE.rose,
    high:     PALETTE.amber,
    medium:   PALETTE.indigo,
    low:      PALETTE.gray,
  };
  const priorityColor = (p: string) => {
    const cfg = priorities.find((c) => c.name === p);
    return cfg ? (PALETTE[cfg.color] ?? PALETTE.gray) : PRIORITY_FILL[p.toLowerCase()] ?? PALETTE.gray;
  };

  const loadData = useMemo(() =>
    analytics.assigneeLoad.map((a) => {
      const row: Record<string, unknown> = {
        name: a.name,
        scheduledCount: a.scheduledCount,
        unscheduledCount: a.unscheduledCount,
        _requests: a.requests,
      };
      for (const p of priorityOrder) {
        row[`pri_${p}`] = a.byPriority[p] ?? 0;
      }
      return row;
    }),
    [analytics.assigneeLoad, priorityOrder]
  );

  const isEmpty = (arr: unknown[]) => arr.length === 0;
  const noData = isEmpty(volData) && isEmpty(sourceDonut) && isEmpty(analytics.assigneeLoad);

  if (noData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <p className="text-sm">No request data yet — start logging requests to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-8">

      {/* ── 1. Volume Over Time ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Volume Over Time</h3>
            <p className="text-xs text-gray-500 mt-0.5">Requests logged per {groupBy}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Group-by toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(['week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onGroupByChange(v)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    groupBy === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            {/* Breakdown toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(['source', 'type', 'priority'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVolBreakdown(v)}
                  className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                    volBreakdown === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isEmpty(volChartData) ? (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data in range</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={volChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomBarTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {volKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="vol"
                  fill={colorFor(key, configsFor(key)) ?? autoColor(i)}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ── 2. Source & Type Breakdown ───────────────────────────────────────── */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-4">Breakdown by Source &amp; Type</h3>
        <p className="text-xs text-gray-500 mb-4">Click a segment to filter the request log.</p>
        <div className="grid grid-cols-2 gap-6">
          {/* Source donut */}
          <div>
            <h4 className="text-sm font-medium text-gray-600 text-center mb-2">By Source</h4>
            {isEmpty(sourceDonut) ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    activeIndex={activeSourceIdx}
                    activeShape={renderActiveShape}
                    data={sourceDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    onMouseEnter={(_, index) => setActiveSourceIdx(index)}
                    onClick={(entry) => onSourceFilter?.(entry.name)}
                    style={{ cursor: onSourceFilter ? 'pointer' : 'default' }}
                  >
                    {sourceDonut.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Type donut */}
          <div>
            <h4 className="text-sm font-medium text-gray-600 text-center mb-2">By Type</h4>
            {isEmpty(typeDonut) ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    activeIndex={activeTypeIdx}
                    activeShape={renderActiveShape}
                    data={typeDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    onMouseEnter={(_, index) => setActiveTypeIdx(index)}
                    onClick={(entry) => onTypeFilter?.(entry.name)}
                    style={{ cursor: onTypeFilter ? 'pointer' : 'default' }}
                  >
                    {typeDonut.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Legend row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {sourceDonut.map((d) => (
            <span key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.fill }} />
              {d.name}
            </span>
          ))}
        </div>
      </section>

      {/* ── 3. Assignee Load ─────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-800">Assignee Load</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            In-flight requests per person — darker bars are scheduled on the Timeline, lighter are unscheduled.
          </p>
        </div>

        {isEmpty(analytics.assigneeLoad) ? (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
            No in-flight requests assigned yet
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(160, analytics.assigneeLoad.length * 48)}>
              <BarChart
                layout="vertical"
                data={loadData}
                margin={{ top: 4, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                    // Find the row to show request titles
                    const row = loadData.find((d) => d.name === label);
                    const reqs = (row?._requests as { title: string; priority: string; isAllocated: boolean }[]) ?? [];
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs max-w-xs">
                        <p className="font-semibold text-gray-700 mb-1">{label} — {total} in-flight</p>
                        {payload.map((p) => Number(p.value) > 0 && (
                          <div key={p.dataKey} className="flex items-center gap-1.5 mb-0.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: String(p.fill) }} />
                            <span className="text-gray-600">{String(p.dataKey).replace('pri_', '')}: {p.value}</span>
                          </div>
                        ))}
                        {reqs.length > 0 && (
                          <div className="border-t border-gray-100 mt-1.5 pt-1.5 space-y-0.5">
                            {reqs.slice(0, 5).map((r, i) => (
                              <div key={i} className="text-gray-500 truncate max-w-[200px]">
                                {r.isAllocated ? '●' : '○'} {r.title}
                              </div>
                            ))}
                            {reqs.length > 5 && <div className="text-gray-400">+{reqs.length - 5} more</div>}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(v) => String(v).replace('pri_', '')}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {/* Scheduled bar (solid, priority breakdown) */}
                {priorityOrder.map((p, i) => (
                  <Bar
                    key={`pri_${p}`}
                    dataKey={`pri_${p}`}
                    name={`pri_${p}`}
                    stackId="load"
                    fill={priorityColor(p)}
                    maxBarSize={24}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Scheduled vs unscheduled summary */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {analytics.assigneeLoad.map((a) => (
                <div key={a.assigneeId} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-medium text-gray-700 mb-1 truncate">{a.name}</div>
                  <div className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1 text-green-700">
                      <span className="inline-block w-2 h-2 rounded-sm bg-green-500 flex-shrink-0" />
                      {a.scheduledCount} scheduled
                    </span>
                    <span className="flex items-center gap-1 text-amber-700">
                      <span className="inline-block w-2 h-2 rounded-sm border border-amber-400 flex-shrink-0" />
                      {a.unscheduledCount} unscheduled
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── 4. Skills Pressure ──────────────────────────────────────────────── */}
      {analytics.skillsPressure && analytics.skillsPressure.length > 0 && (
        <section>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-gray-800">Skills Pressure</h3>
            <p className="text-xs text-gray-500 mt-0.5">Open requests by capability area.</p>
          </div>
          <SkillsPressureMap
            skillsPressure={analytics.skillsPressure}
            dimensionNodes={dimensionNodes ?? []}
            onNodeClick={onNodeFilter}
          />
        </section>
      )}

      {/* ── 5. Resolution Funnel ────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-800">Resolution Funnel</h3>
          <p className="text-xs text-gray-500 mt-0.5">Request counts and median dwell time per status stage.</p>
        </div>
        {analytics.byStatus.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-gray-400 text-sm">No status data yet</div>
        ) : (
          <div className="space-y-2">
            {(() => {
              const STATUS_ORDER = ['draft', 'new', 'assessed', 'in-flight', 'resolved'];
              const sorted = [...analytics.byStatus].sort((a, b) => {
                const ai = STATUS_ORDER.indexOf(a.status);
                const bi = STATUS_ORDER.indexOf(b.status);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
              });
              const maxCount = Math.max(1, ...sorted.map((s) => s.count));
              return sorted.map((s) => {
                const cfg = statuses.find((c) => c.name === s.status);
                const color = cfg ? (PALETTE[cfg.color] ?? PALETTE.gray) : PALETTE.gray;
                const barPct = (s.count / maxCount) * 100;
                const dwell = analytics.medianDwellDays?.[s.status];
                return (
                  <div key={s.status} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-24 truncate">{s.status}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-6 rounded transition-all flex items-center pl-2"
                        style={{ width: `${barPct}%`, background: color }}
                      >
                        <span className="text-xs text-white font-semibold drop-shadow">{s.count}</span>
                      </div>
                    </div>
                    {dwell !== undefined && (
                      <span className="text-xs text-gray-400 w-20 text-right">avg {dwell.toFixed(1)}d</span>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </section>

      {/* ── Status distribution strip ─────────────────────────────────────────── */}
      {analytics.byStatus.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-gray-800 mb-3">Status Distribution</h3>
          <div className="flex h-6 rounded-full overflow-hidden gap-px">
            {analytics.byStatus.map((s, i) => {
              const cfg = statuses.find((c) => c.name === s.status);
              const color = cfg ? (PALETTE[cfg.color] ?? PALETTE.gray) : PALETTE.gray;
              const total = analytics.byStatus.reduce((sum, x) => sum + x.count, 0);
              const pct = total > 0 ? (s.count / total) * 100 : 0;
              return (
                <div
                  key={s.status}
                  title={`${s.status}: ${s.count}`}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? 4 : 0, background: color }}
                  className="transition-all"
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
            {analytics.byStatus.map((s) => {
              const cfg = statuses.find((c) => c.name === s.status);
              const color = cfg ? (PALETTE[cfg.color] ?? PALETTE.gray) : PALETTE.gray;
              return (
                <span key={s.status} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  {s.status} ({s.count})
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default DemandCharts;
