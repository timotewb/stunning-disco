import React, { useEffect, useState } from 'react';
import { Users, Briefcase, Star, AlertTriangle } from 'lucide-react';
import type { TeamMember, WorkRequest, SMEAssignment, MatrixEntry, Dimension, DimensionNode, AllocationTypeConfig } from '../types';
import { getTeam, getWorkRequests, getSME, getMatrix, getDimensions, getAllocationTypes } from '../api/client';

type CoverageItem =
  | { type: 'dimension-header'; name: string }
  | { type: 'group-header'; name: string }
  | { type: 'bar'; name: string; avg: number; indented: boolean };

function getLeafDescendants(nodes: DimensionNode[], nodeId: string): DimensionNode[] {
  const children = nodes
    .filter((n) => n.parentId === nodeId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (children.length === 0) {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? [node] : [];
  }
  return children.flatMap((c) => getLeafDescendants(nodes, c.id));
}

function buildCoverageItems(
  dimensions: Dimension[],
  entries: MatrixEntry[]
): CoverageItem[] {
  const avgFor = (nodeId: string) => {
    const ne = entries.filter((e) => e.dimensionNodeId === nodeId);
    return ne.length > 0 ? ne.reduce((s, e) => s + e.value, 0) / ne.length : 0;
  };

  const items: CoverageItem[] = [];

  for (const dim of dimensions) {
    const nodes = dim.nodes;
    const rootNodes = nodes
      .filter((n) => !n.parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    if (rootNodes.length === 0) continue;

    items.push({ type: 'dimension-header', name: dim.name });

    const hasAnyChildren = rootNodes.some((r) => nodes.some((n) => n.parentId === r.id));

    if (!hasAnyChildren) {
      for (const node of rootNodes) {
        items.push({ type: 'bar', name: node.name, avg: avgFor(node.id), indented: false });
      }
    } else {
      for (const root of rootNodes) {
        const children = nodes.filter((n) => n.parentId === root.id);
        if (children.length === 0) {
          items.push({ type: 'bar', name: root.name, avg: avgFor(root.id), indented: false });
        } else {
          items.push({ type: 'group-header', name: root.name });
          for (const leaf of getLeafDescendants(nodes, root.id)) {
            items.push({ type: 'bar', name: leaf.name, avg: avgFor(leaf.id), indented: true });
          }
        }
      }
    }
  }

  return items;
}

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
  const [allocations, setAllocations] = useState<WorkRequest[]>([]);
  const [sme, setSme] = useState<SMEAssignment[]>([]);
  const [entries, setEntries] = useState<MatrixEntry[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [allocationTypes, setAllocationTypes] = useState<AllocationTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTeam(), getWorkRequests({ isAllocated: true }), getSME(), getMatrix({}), getDimensions(), getAllocationTypes()])
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
        const s = new Date(a.allocationStartDate!);
        const e = new Date(a.allocationEndDate!);
        return s <= today && e >= today;
      })
      .map((a) => a.title)
  ).size;

  const currentWeekAllocs = allocations.filter((a) => {
    const s = new Date(a.allocationStartDate!);
    const e = new Date(a.allocationEndDate!);
    return s <= weekEnd && e >= weekStart;
  });

  // Coverage: average skill per leaf node, grouped by dimension and parent
  const coverageItems = buildCoverageItems(dimensions, entries);

  const leavingMembers = team.filter((m) => m.isLeaving);
  const memberById = new Map(team.map((m) => [m.id, m]));

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
      <div className="grid grid-cols-4 gap-6">
        <StatCard icon={<Users size={22} />} label="Team Size" value={team.length} />
        <StatCard icon={<Briefcase size={22} />} label="Active Projects" value={activeProjects} />
        <StatCard icon={<Star size={22} />} label="SME Assignments" value={sme.length} />
        <StatCard
          icon={<AlertTriangle size={22} />}
          label="Leaving"
          value={leavingMembers.length}
          warning={leavingMembers.length > 0}
        />
      </div>

      {leavingMembers.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={18} className="text-orange-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Potential coverage gaps</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {leavingMembers.map((m) => m.name).join(', ')} {leavingMembers.length === 1 ? 'is' : 'are'} marked as leaving. Review the Matrices and Capabilities pages to identify gaps.
            </p>
          </div>
        </div>
      )}

      {/* Current week allocations */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          This Week ({weekStart.toLocaleDateString()} – {weekEnd.toLocaleDateString()})
        </h3>
        {currentWeekAllocs.length === 0 ? (
          <p className="text-gray-400 text-sm">No allocations this week.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {currentWeekAllocs.map((a) => {
              const member = memberById.get(a.assigneeId ?? '');
              const isLeaving = member?.isLeaving ?? false;
              return (
                <div key={a.id} className={`px-5 py-3 flex items-center justify-between ${isLeaving ? 'bg-amber-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    {isLeaving && <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />}
                    <span className={`font-medium ${isLeaving ? 'text-amber-800' : 'text-gray-800'}`}>{a.assignee?.name ?? member?.name}</span>
                    <span className="text-gray-500 text-sm">{a.title}</span>
                  </div>
                  <span
                    className={`text-xs text-white px-2 py-0.5 rounded-full ${typeColorMap[a.allocationType ?? ''] ?? typeColorMap.uncategorised}`}
                  >
                    {a.allocationType && typeColorMap[a.allocationType] ? a.allocationType : 'uncategorised'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Capability Coverage */}
      {coverageItems.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Capability Coverage</h3>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            {coverageItems.map((item, i) => {
              if (item.type === 'dimension-header') {
                return (
                  <div key={`dh-${i}`} className="pt-2 first:pt-0">
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                      {item.name}
                    </span>
                  </div>
                );
              }
              if (item.type === 'group-header') {
                return (
                  <div key={`gh-${i}`} className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1">
                    {item.name}
                  </div>
                );
              }
              return (
                <div key={`bar-${i}`} className={item.indented ? 'pl-4' : ''}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{item.name}</span>
                    <span className="text-gray-500">{item.avg.toFixed(1)} / 4</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(item.avg / 4) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; warning?: boolean }> = ({
  icon,
  label,
  value,
  warning,
}) => (
  <div className={`rounded-xl border p-6 flex items-center gap-4 ${warning && value > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
    <div className={`p-3 rounded-lg ${warning && value > 0 ? 'bg-orange-100 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>{icon}</div>
    <div>
      <p className={`text-sm ${warning && value > 0 ? 'text-amber-700' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-3xl font-bold ${warning && value > 0 ? 'text-amber-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  </div>
);

export default Dashboard;
