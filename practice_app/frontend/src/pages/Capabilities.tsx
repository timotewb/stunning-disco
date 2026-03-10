import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, AlertTriangle } from 'lucide-react';
import type { Dimension, DimensionNode, TeamMember, SMEAssignment } from '../types';
import { getDimensions, getTeam, getSME, upsertSME, getMatrix } from '../api/client';
import { useSnapshot } from '../context/SnapshotContext';
import TimelineSlider from '../components/TimelineSlider';

type Tab = 'coverage' | 'sme';

interface BarData {
  name: string;
  avg: number;
  nodeId: string;
}

interface CoverageGroup {
  key: string;
  dimensionName: string;
  parentNodeName: string | null;
  isFirstInDimension: boolean;
  bars: BarData[];
}

interface SMERow {
  dimensionName: string;
  parentNodeName: string | null;
  isFirstInDimension: boolean;
  isFirstInGroup: boolean;
  node: DimensionNode;
}

/** Recursively collect all leaf descendants of a node (nodes with no children). */
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

function buildCoverageGroups(
  dimensions: Dimension[],
  avgMap: Map<string, number>
): CoverageGroup[] {
  const groups: CoverageGroup[] = [];

  for (const dim of dimensions) {
    const nodes = dim.nodes;
    const rootNodes = nodes
      .filter((n) => !n.parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (rootNodes.length === 0) continue;

    const hasAnyChildren = rootNodes.some((r) => nodes.some((n) => n.parentId === r.id));

    if (!hasAnyChildren) {
      // Flat dimension — one group with all root nodes as bars
      groups.push({
        key: `${dim.id}-flat`,
        dimensionName: dim.name,
        parentNodeName: null,
        isFirstInDimension: true,
        bars: rootNodes.map((n) => ({
          name: n.name,
          avg: parseFloat((avgMap.get(n.id) ?? 0).toFixed(2)),
          nodeId: n.id,
        })),
      });
    } else {
      // Hierarchical — one group per root node, bars are its leaf descendants
      rootNodes.forEach((root, i) => {
        const children = nodes.filter((n) => n.parentId === root.id);
        if (children.length === 0) {
          // This root is a leaf in an otherwise hierarchical dimension
          groups.push({
            key: `${dim.id}-${root.id}`,
            dimensionName: dim.name,
            parentNodeName: null,
            isFirstInDimension: i === 0,
            bars: [
              {
                name: root.name,
                avg: parseFloat((avgMap.get(root.id) ?? 0).toFixed(2)),
                nodeId: root.id,
              },
            ],
          });
        } else {
          const leaves = getLeafDescendants(nodes, root.id);
          groups.push({
            key: `${dim.id}-${root.id}`,
            dimensionName: dim.name,
            parentNodeName: root.name,
            isFirstInDimension: i === 0,
            bars: leaves.map((n) => ({
              name: n.name,
              avg: parseFloat((avgMap.get(n.id) ?? 0).toFixed(2)),
              nodeId: n.id,
            })),
          });
        }
      });
    }
  }

  return groups;
}

function buildSMERows(dimensions: Dimension[]): SMERow[] {
  const rows: SMERow[] = [];

  for (const dim of dimensions) {
    const nodes = dim.nodes;
    const rootNodes = nodes
      .filter((n) => !n.parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (rootNodes.length === 0) continue;

    const hasAnyChildren = rootNodes.some((r) => nodes.some((n) => n.parentId === r.id));

    if (!hasAnyChildren) {
      rootNodes.forEach((node, i) => {
        rows.push({
          dimensionName: dim.name,
          parentNodeName: null,
          isFirstInDimension: i === 0,
          isFirstInGroup: i === 0,
          node,
        });
      });
    } else {
      let isFirstDim = true;
      for (const root of rootNodes) {
        const children = nodes.filter((n) => n.parentId === root.id);
        if (children.length === 0) {
          rows.push({
            dimensionName: dim.name,
            parentNodeName: null,
            isFirstInDimension: isFirstDim,
            isFirstInGroup: true,
            node: root,
          });
          isFirstDim = false;
        } else {
          const leaves = getLeafDescendants(nodes, root.id);
          leaves.forEach((node, i) => {
            rows.push({
              dimensionName: dim.name,
              parentNodeName: root.name,
              isFirstInDimension: isFirstDim && i === 0,
              isFirstInGroup: i === 0,
              node,
            });
          });
          isFirstDim = false;
        }
      }
    }
  }

  return rows;
}

const Capabilities: React.FC = () => {
  const { activeSnapshot } = useSnapshot();
  const [tab, setTab] = useState<Tab>('coverage');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [smeAssignments, setSmeAssignments] = useState<SMEAssignment[]>([]);
  const [coverageGroups, setCoverageGroups] = useState<CoverageGroup[]>([]);
  const [smeRows, setSmeRows] = useState<SMERow[]>([]);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  const snapshotId = activeSnapshot?.id ?? '';

  const load = async () => {
    setLoading(true);
    try {
      const [dims, members, sme] = await Promise.all([getDimensions(), getTeam(), getSME()]);
      setDimensions(dims);
      setTeam(members);
      setSmeAssignments(sme);
      setSmeRows(buildSMERows(dims));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!snapshotId || dimensions.length === 0) return;
    getMatrix({ snapshotId }).then((entries) => {
      const avgMap = new Map<string, number>();
      for (const dim of dimensions) {
        for (const node of dim.nodes) {
          const nodeEntries = entries.filter((e) => e.dimensionNodeId === node.id);
          avgMap.set(
            node.id,
            nodeEntries.length > 0
              ? nodeEntries.reduce((s, e) => s + e.value, 0) / nodeEntries.length
              : 0
          );
        }
      }
      setCoverageGroups(buildCoverageGroups(dimensions, avgMap));
    });
  }, [snapshotId, dimensions]);

  const handleSMEChange = async (
    dimensionNodeId: string,
    field: 'primaryMemberId' | 'backupMemberId',
    memberId: string
  ) => {
    if (!snapshotId) return;
    const existing = smeAssignments.find(
      (s) => s.dimensionNodeId === dimensionNodeId && s.snapshotId === snapshotId
    );
    await upsertSME({
      dimensionNodeId,
      snapshotId,
      primaryMemberId:
        field === 'primaryMemberId' ? memberId : existing?.primaryMemberId ?? team[0]?.id ?? '',
      backupMemberId:
        field === 'backupMemberId' ? (memberId || null) : existing?.backupMemberId ?? null,
    });
    const sme = await getSME();
    setSmeAssignments(sme);
  };

  const handleExport = async (format: 'png' | 'pdf') => {
    if (!contentRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(contentRef.current);
    if (format === 'png') {
      const link = document.createElement('a');
      link.download = 'capabilities.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape' });
      const imgData = canvas.toDataURL('image/png');
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height / canvas.width) * w;
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      pdf.save('capabilities.pdf');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8" ref={contentRef}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Capabilities</h2>
          <ExportDropdown onExport={handleExport} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {(['coverage', 'sme'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'sme' ? 'SME' : 'Coverage'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : tab === 'coverage' ? (
          <CoverageTab coverageGroups={coverageGroups} snapshotId={snapshotId} />
        ) : (
          <SMETab
            smeRows={smeRows}
            smeAssignments={smeAssignments}
            team={team}
            snapshotId={snapshotId}
            onSMEChange={handleSMEChange}
          />
        )}
      </div>
      <TimelineSlider />
    </div>
  );
};

const CoverageTab: React.FC<{ coverageGroups: CoverageGroup[]; snapshotId: string }> = ({
  coverageGroups,
  snapshotId,
}) => {
  if (!snapshotId) {
    return (
      <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
        Select a snapshot to see coverage data.
      </div>
    );
  }
  if (coverageGroups.length === 0) {
    return (
      <div className="text-gray-400 text-sm">
        No data yet. Configure dimensions and add matrix ratings.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {coverageGroups.map((group) => (
        <div key={group.key}>
          {group.isFirstInDimension && (
            <div className="mt-4 mb-2 first:mt-0">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                {group.dimensionName}
              </span>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {group.parentNodeName && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {group.parentNodeName}
                </span>
              </div>
            )}
            <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(60, group.bars.length * 44)}>
                <BarChart
                  layout="vertical"
                  data={group.bars}
                  margin={{ top: 0, right: 40, left: 20, bottom: 0 }}
                >
                  <XAxis type="number" domain={[0, 4]} tickCount={5} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: number) => [v.toFixed(2), 'Avg Rating']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                    {group.bars.map((entry) => (
                      <Cell
                        key={entry.nodeId}
                        fill={`rgba(99, 102, 241, ${0.2 + (entry.avg / 4) * 0.8})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SMETab: React.FC<{
  smeRows: SMERow[];
  smeAssignments: SMEAssignment[];
  team: TeamMember[];
  snapshotId: string;
  onSMEChange: (
    nodeId: string,
    field: 'primaryMemberId' | 'backupMemberId',
    memberId: string
  ) => Promise<void>;
}> = ({ smeRows, smeAssignments, team, snapshotId, onSMEChange }) => {
  if (!snapshotId) {
    return (
      <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
        Select a snapshot to manage SME assignments.
      </div>
    );
  }
  if (smeRows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-gray-400 text-sm">
        No capabilities configured. Add dimension nodes in Settings.
      </div>
    );
  }
  const teamById = new Map(team.map((m) => [m.id, m]));
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Capability
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Primary SME
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Backup SME
            </th>
          </tr>
        </thead>
        <tbody>
          {smeRows.map((row) => {
            const assignment = smeAssignments.find(
              (s) => s.dimensionNodeId === row.node.id && s.snapshotId === snapshotId
            );
            const primaryLeaving = assignment?.primaryMemberId
              ? (teamById.get(assignment.primaryMemberId)?.isLeaving ?? false)
              : false;
            const backupLeaving = assignment?.backupMemberId
              ? (teamById.get(assignment.backupMemberId)?.isLeaving ?? false)
              : false;
            const rowWarning = primaryLeaving || backupLeaving;
            return (
              <React.Fragment key={row.node.id}>
                {row.isFirstInDimension && (
                  <tr className="bg-indigo-50 border-b border-indigo-100">
                    <td
                      colSpan={3}
                      className="px-5 py-2 text-xs font-bold uppercase tracking-widest text-indigo-700"
                    >
                      {row.dimensionName}
                    </td>
                  </tr>
                )}
                {row.parentNodeName !== null && row.isFirstInGroup && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td
                      colSpan={3}
                      className="px-8 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {row.parentNodeName}
                    </td>
                  </tr>
                )}
                <tr className={`border-b ${rowWarning ? 'bg-amber-50 hover:bg-amber-100 border-amber-100' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <td
                    className={`py-3 font-medium text-gray-800 ${
                      row.parentNodeName ? 'pl-12 pr-5' : 'px-5'
                    }`}
                  >
                    {row.node.name}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {primaryLeaving && <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />}
                      <select
                        value={assignment?.primaryMemberId ?? ''}
                        onChange={(e) =>
                          snapshotId && onSMEChange(row.node.id, 'primaryMemberId', e.target.value)
                        }
                        disabled={!snapshotId}
                        className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 ${primaryLeaving ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
                      >
                        <option value="">— None —</option>
                        {team.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.isLeaving ? ' (leaving)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {backupLeaving && <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />}
                      <select
                        value={assignment?.backupMemberId ?? ''}
                        onChange={(e) =>
                          snapshotId && onSMEChange(row.node.id, 'backupMemberId', e.target.value)
                        }
                        disabled={!snapshotId}
                        className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 ${backupLeaving ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
                      >
                        <option value="">— None —</option>
                        {team.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.isLeaving ? ' (leaving)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const ExportDropdown: React.FC<{ onExport: (f: 'png' | 'pdf') => void }> = ({ onExport }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <Download size={14} /> Export
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <button
            onClick={() => { onExport('png'); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
          >
            PNG
          </button>
          <button
            onClick={() => { onExport('pdf'); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
          >
            PDF
          </button>
        </div>
      )}
    </div>
  );
};

export default Capabilities;
