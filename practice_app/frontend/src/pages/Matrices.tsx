import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Plus, Download } from 'lucide-react';
import type { Dimension, TeamMember, Snapshot, MatrixEntry, DimensionNode } from '../types';
import {
  getDimensions,
  getTeam,
  getSnapshots,
  getMatrix,
  upsertMatrixEntry,
  createSnapshot,
} from '../api/client';
import { useSnapshot } from '../context/SnapshotContext';
import TimelineSlider from '../components/TimelineSlider';

const RATING_LABELS = ['None', 'Awareness', 'Working', 'Skilled', 'Expert'];

const cellBg = (v: number) => {
  const colors = [
    'bg-gray-100 text-gray-400',
    'bg-indigo-100 text-indigo-600',
    'bg-indigo-200 text-indigo-700',
    'bg-indigo-400 text-white',
    'bg-indigo-700 text-white',
  ];
  return colors[v] ?? 'bg-white';
};

const Matrices: React.FC = () => {
  const { activeSnapshot, refresh: refreshSnapshots } = useSnapshot();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedDimId, setSelectedDimId] = useState<string>('');
  const [entries, setEntries] = useState<MatrixEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ memberId: string; nodeId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberFilter, setMemberFilter] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const currentSnapshotId = activeSnapshot?.id ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dims, members, snaps] = await Promise.all([getDimensions(), getTeam(), getSnapshots()]);
      setDimensions(dims);
      setTeam(members);
      setSnapshots(snaps);
      if (!selectedDimId && dims.length > 0) setSelectedDimId(dims[0].id);
    } finally {
      setLoading(false);
    }
  }, [selectedDimId]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!currentSnapshotId || !selectedDimId) return;
    getMatrix({ dimensionId: selectedDimId, snapshotId: currentSnapshotId }).then(setEntries);
  }, [currentSnapshotId, selectedDimId]);

  const dimension = dimensions.find((d) => d.id === selectedDimId);
  const leafNodes: DimensionNode[] = useMemo(
    () =>
      dimension
        ? dimension.nodes.filter((n) => !dimension.nodes.some((c) => c.parentId === n.id))
        : [],
    [dimension]
  );

  const filteredTeam = useMemo(
    () => team.filter((m) => m.name.toLowerCase().includes(memberFilter.toLowerCase())),
    [team, memberFilter]
  );

  const getEntry = useCallback(
    (memberId: string, nodeId: string) =>
      entries.find((e) => e.teamMemberId === memberId && e.dimensionNodeId === nodeId),
    [entries]
  );

  const handleCellClick = useCallback(
    async (memberId: string, nodeId: string, value: number) => {
      if (!currentSnapshotId || saving) return;
      setSaving(true);
      try {
        await upsertMatrixEntry({ teamMemberId: memberId, dimensionNodeId: nodeId, snapshotId: currentSnapshotId, value });
        const updated = await getMatrix({ dimensionId: selectedDimId, snapshotId: currentSnapshotId });
        setEntries(updated);
        setEditingCell(null);
      } catch {
        // keep editing state on error so user can retry
      } finally {
        setSaving(false);
      }
    },
    [currentSnapshotId, selectedDimId, saving]
  );

  // Dismiss edit mode on Escape or click outside the table
  useEffect(() => {
    if (!editingCell) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditingCell(null); };
    const onClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        setEditingCell(null);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [editingCell]);

  const handleCreateSnapshot = async () => {
    await createSnapshot();
    await refreshSnapshots();
    const snaps = await getSnapshots();
    setSnapshots(snaps);
  };

  const handleExport = async (format: 'png' | 'pdf') => {
    if (!contentRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(contentRef.current);
    if (format === 'png') {
      const link = document.createElement('a');
      link.download = 'matrix.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape' });
      const imgData = canvas.toDataURL('image/png');
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height / canvas.width) * w;
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      pdf.save('matrix.pdf');
    }
  };

  const columns: ColumnDef<TeamMember>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Member',
        accessorFn: (m) => m.name,
        cell: (info) => (
          <span className="font-medium text-gray-800 whitespace-nowrap">{info.getValue() as string}</span>
        ),
        size: 160,
      },
      ...leafNodes.map((node) => ({
        id: node.id,
        header: node.name,
        cell: ({ row }: { row: { original: TeamMember } }) => {
          const entry = getEntry(row.original.id, node.id);
          const val = entry?.value ?? 0;
          const isEditing = editingCell?.memberId === row.original.id && editingCell?.nodeId === node.id;
          if (isEditing) {
            return (
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((v) => (
                  <button
                    key={v}
                    onClick={() => handleCellClick(row.original.id, node.id, v)}
                    disabled={saving}
                    className={`w-7 h-7 text-xs rounded font-medium border transition-opacity ${saving ? 'opacity-50 cursor-wait' : ''} ${v === val ? 'border-indigo-500' : 'border-transparent'} ${cellBg(v)}`}
                    title={RATING_LABELS[v]}
                  >
                    {v}
                  </button>
                ))}
                <button
                  onClick={() => setEditingCell(null)}
                  disabled={saving}
                  className="ml-1 w-5 h-7 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  title="Cancel (Esc)"
                >
                  ✕
                </button>
              </div>
            );
          }
          return (
            <button
              onClick={() => setEditingCell({ memberId: row.original.id, nodeId: node.id })}
              className={`w-9 h-9 rounded text-sm font-semibold transition-colors ${cellBg(val)}`}
              title={`${RATING_LABELS[val]} — click to edit`}
            >
              {val > 0 ? val : ''}
            </button>
          );
        },
      })),
    ],
    [leafNodes, editingCell, saving, getEntry, handleCellClick]
  );

  const table = useReactTable({
    data: filteredTeam,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8" ref={contentRef}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Matrices</h2>
          <div className="flex items-center gap-2">
            <ExportDropdown onExport={handleExport} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={selectedDimId}
            onChange={(e) => setSelectedDimId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {dimensions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <input
            placeholder="Filter members…"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />

          <button
              onClick={handleCreateSnapshot}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
            >
              <Plus size={14} /> New Snapshot
            </button>
        </div>

        {!currentSnapshotId && (
          <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
            No snapshot selected. Create a snapshot first to start rating.
          </div>
        )}

        {loading ? (
          <div className="text-gray-400">Loading…</div>
        ) : leafNodes.length === 0 ? (
          <div className="text-gray-400 text-sm">
            No dimension nodes configured. Go to Settings to add nodes.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
            <table className="text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-gray-200">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                        style={{ minWidth: h.id === 'name' ? 160 : 80 }}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
          <span>Rating scale:</span>
          {RATING_LABELS.map((label, i) => (
            <span key={i} className={`px-2 py-0.5 rounded font-medium ${cellBg(i)}`}>
              {i} – {label}
            </span>
          ))}
        </div>
      </div>
      <TimelineSlider />
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
          >PNG</button>
          <button
            onClick={() => { onExport('pdf'); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
          >PDF</button>
        </div>
      )}
    </div>
  );
};

export default Matrices;
