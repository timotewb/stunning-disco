import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download } from 'lucide-react';
import type { Dimension, TeamMember, SMEAssignment } from '../types';
import { getDimensions, getTeam, getSME, upsertSME, getMatrix } from '../api/client';
import { useSnapshot } from '../context/SnapshotContext';
import TimelineSlider from '../components/TimelineSlider';

type Tab = 'coverage' | 'sme';

const Capabilities: React.FC = () => {
  const { activeSnapshot } = useSnapshot();
  const [tab, setTab] = useState<Tab>('coverage');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [smeAssignments, setSmeAssignments] = useState<SMEAssignment[]>([]);
  const [coverageData, setCoverageData] = useState<{ name: string; avg: number }[]>([]);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!snapshotId) return;
    getMatrix({ snapshotId }).then((entries) => {
      const data = dimensions.flatMap((dim) =>
        dim.nodes
          .filter((n) => !n.parentId)
          .map((node) => {
            const nodeEntries = entries.filter((e) => e.dimensionNodeId === node.id);
            const avg =
              nodeEntries.length > 0
                ? nodeEntries.reduce((sum, e) => sum + e.value, 0) / nodeEntries.length
                : 0;
            return { name: node.name, avg: parseFloat(avg.toFixed(2)) };
          })
      );
      setCoverageData(data);
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

  const allLeafNodes = dimensions.flatMap((dim) =>
    dim.nodes.filter((n) => !dim.nodes.some((c) => c.parentId === n.id))
  );

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
          <div>
            {!snapshotId && (
              <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                Select a snapshot to see coverage data.
              </div>
            )}
            {coverageData.length === 0 ? (
              <div className="text-gray-400 text-sm">No data yet. Configure dimensions and add matrix ratings.</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <ResponsiveContainer width="100%" height={Math.max(200, coverageData.length * 44)}>
                  <BarChart
                    layout="vertical"
                    data={coverageData}
                    margin={{ top: 0, right: 40, left: 20, bottom: 0 }}
                  >
                    <XAxis type="number" domain={[0, 4]} tickCount={5} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(v: number) => [v.toFixed(2), 'Avg Rating']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                      {coverageData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={`rgba(99, 102, 241, ${0.2 + (entry.avg / 4) * 0.8})`}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <div>
            {!snapshotId && (
              <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                Select a snapshot to manage SME assignments.
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Capability</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Primary SME</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Backup SME</th>
                  </tr>
                </thead>
                <tbody>
                  {allLeafNodes.map((node) => {
                    const assignment = smeAssignments.find(
                      (s) => s.dimensionNodeId === node.id && s.snapshotId === snapshotId
                    );
                    return (
                      <tr key={node.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800">{node.name}</td>
                        <td className="px-5 py-3">
                          <select
                            value={assignment?.primaryMemberId ?? ''}
                            onChange={(e) =>
                              snapshotId && handleSMEChange(node.id, 'primaryMemberId', e.target.value)
                            }
                            disabled={!snapshotId}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                          >
                            <option value="">— None —</option>
                            {team.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3">
                          <select
                            value={assignment?.backupMemberId ?? ''}
                            onChange={(e) =>
                              snapshotId && handleSMEChange(node.id, 'backupMemberId', e.target.value)
                            }
                            disabled={!snapshotId}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                          >
                            <option value="">— None —</option>
                            {team.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {allLeafNodes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-gray-400 text-sm">
                        No capabilities configured. Add dimension nodes in Settings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <TimelineSlider />
    </div>
  );
};

const ExportDropdown: React.FC<{ onExport: (f: 'png' | 'pdf') => void }> = ({ onExport }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
        <Download size={14} /> Export
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <button onClick={() => { onExport('png'); setOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">PNG</button>
          <button onClick={() => { onExport('pdf'); setOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">PDF</button>
        </div>
      )}
    </div>
  );
};

export default Capabilities;
