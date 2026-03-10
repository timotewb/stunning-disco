import React, { useEffect, useState } from 'react';
import { Users, Briefcase, Star } from 'lucide-react';
import type { TeamMember, Allocation, SMEAssignment, MatrixEntry, Dimension, AllocationTypeConfig } from '../types';
import { getTeam, getAllocations, getSME, getMatrix, getDimensions, getAllocationTypes } from '../api/client';

const PRESET_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-500',
  amber:  'bg-amber-400',
  green:  'bg-green-500',
  blue:   'bg-blue-500',
  purple: 'bg-purple-500',
  rose:   'bg-rose-500',
  teal:   'bg-teal-500',
  orange: 'bg-orange-500',
  cyan:   'bg-cyan-500',
  pink:   'bg-pink-500',
  gray:   'bg-gray-400',
};

const Dashboard: React.FC = () => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [sme, setSme] = useState<SMEAssignment[]>([]);
  const [entries, setEntries] = useState<MatrixEntry[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [allocationTypes, setAllocationTypes] = useState<AllocationTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTeam(), getAllocations(), getSME(), getMatrix({}), getDimensions(), getAllocationTypes()])
      .then(([t, a, s, e, d, at]) => {
        setTeam(t);
        setAllocations(a);
        setSme(s);
        setEntries(e);
        setDimensions(d);
        setAllocationTypes(at);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const activeProjects = new Set(
    allocations
      .filter((a) => {
        const s = new Date(a.startDate);
        const e = new Date(a.endDate);
        return s <= today && e >= today;
      })
      .map((a) => a.projectName)
  ).size;

  const currentWeekAllocs = allocations.filter((a) => {
    const s = new Date(a.startDate);
    const e = new Date(a.endDate);
    return s <= weekEnd && e >= weekStart;
  });

  // Coverage: average skill per top-level node across latest snapshot entries
  const coverageData = dimensions.map((dim) => {
    const topNodes = dim.nodes.filter((n) => !n.parentId);
    return topNodes.map((node) => {
      const nodeEntries = entries.filter((e) => e.dimensionNodeId === node.id);
      const avg =
        nodeEntries.length > 0
          ? nodeEntries.reduce((sum, e) => sum + e.value, 0) / nodeEntries.length
          : 0;
      return { name: node.name, avg, max: 4 };
    });
  }).flat();

  const typeColorMap: Record<string, string> = { uncategorised: 'bg-gray-400' };
  for (const t of allocationTypes) {
    typeColorMap[t.name] = PRESET_COLORS[t.color] ?? 'bg-gray-400';
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-6">
        <StatCard icon={<Users size={22} />} label="Team Size" value={team.length} />
        <StatCard icon={<Briefcase size={22} />} label="Active Projects" value={activeProjects} />
        <StatCard icon={<Star size={22} />} label="SME Assignments" value={sme.length} />
      </div>

      {/* Current week allocations */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          This Week ({weekStart.toLocaleDateString()} – {weekEnd.toLocaleDateString()})
        </h3>
        {currentWeekAllocs.length === 0 ? (
          <p className="text-gray-400 text-sm">No allocations this week.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {currentWeekAllocs.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-800">{a.teamMember?.name}</span>
                  <span className="text-gray-500 ml-2 text-sm">{a.projectName}</span>
                </div>
                  <span
                    className={`text-xs text-white px-2 py-0.5 rounded-full ${typeColorMap[a.type] ?? typeColorMap.uncategorised}`}
                  >
                    {typeColorMap[a.type] ? a.type : 'uncategorised'}
                  </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Capability Coverage */}
      {coverageData.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Capability Coverage</h3>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            {coverageData.map(({ name, avg, max }) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{name}</span>
                  <span className="text-gray-500">{avg.toFixed(1)} / {max}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${(avg / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({
  icon,
  label,
  value,
}) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
    <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">{icon}</div>
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

export default Dashboard;
