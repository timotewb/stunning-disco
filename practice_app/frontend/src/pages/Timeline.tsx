import React, { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Check, Download, AlertTriangle } from 'lucide-react';
import type { Allocation, TeamMember, AllocationTypeConfig } from '../types';
import { getAllocations, getTeam, createAllocation, updateAllocation, deleteAllocation, getAllocationTypes } from '../api/client';

const LANE_H = 30; // px per lane slot (bar height + gap)
const V_PAD = 4;   // vertical padding inside the track area

/** Assigns each allocation to the lowest available lane so overlapping bars stack vertically. */
function assignLanes(allocs: Allocation[]): { alloc: Allocation; lane: number }[] {
  const sorted = [...allocs].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  const laneEnds: Date[] = [];
  const result: { alloc: Allocation; lane: number }[] = [];
  for (const alloc of sorted) {
    const s = new Date(alloc.startDate);
    const e = new Date(alloc.endDate);
    let idx = laneEnds.findIndex((end) => s >= end);
    if (idx === -1) {
      idx = laneEnds.length;
      laneEnds.push(e);
    } else {
      laneEnds[idx] = e;
    }
    result.push({ alloc, lane: idx });
  }
  return result;
}

const PRESET_COLORS: Record<string, { bar: string; badge: string }> = {
  indigo: { bar: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  amber:  { bar: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700'  },
  green:  { bar: 'bg-green-500',  badge: 'bg-green-100 text-green-700'  },
  blue:   { bar: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700'    },
  purple: { bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  rose:   { bar: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-700'    },
  teal:   { bar: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700'    },
  orange: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  cyan:   { bar: 'bg-cyan-500',   badge: 'bg-cyan-100 text-cyan-700'    },
  pink:   { bar: 'bg-pink-500',   badge: 'bg-pink-100 text-pink-700'    },
  gray:   { bar: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600'    },
};

function typeColors(allocationTypes: AllocationTypeConfig[]): Record<string, { bar: string; badge: string }> {
  const map: Record<string, { bar: string; badge: string }> = {
    uncategorised: PRESET_COLORS.gray,
  };
  for (const t of allocationTypes) {
    map[t.name] = PRESET_COLORS[t.color] ?? PRESET_COLORS.gray;
  }
  return map;
}

function getQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { start, end };
}

function toDateInput(d: Date) {
  return d.toISOString().split('T')[0];
}

const emptyForm = {
  teamMemberId: '',
  projectName: '',
  type: 'project',
  startDate: '',
  endDate: '',
  notes: '',
};

const Timeline: React.FC = () => {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allocationTypes, setAllocationTypes] = useState<AllocationTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeStart, setRangeStart] = useState(() => toDateInput(getQuarterRange().start));
  const [rangeEnd, setRangeEnd] = useState(() => toDateInput(getQuarterRange().end));
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, t, at] = await Promise.all([getAllocations(), getTeam(), getAllocationTypes()]);
      setAllocations(a);
      setTeam(t);
      setAllocationTypes(at);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));

  const visibleAllocations = allocations.filter((a) => {
    const as = new Date(a.startDate);
    const ae = new Date(a.endDate);
    return as <= end && ae >= start;
  });

  const clamp = (d: Date) => {
    if (d < start) return start;
    if (d > end) return end;
    return d;
  };

  const leftPct = (d: Date) =>
    ((clamp(d).getTime() - start.getTime()) / (totalDays * 86400000)) * 100;
  const widthPct = (s: Date, e: Date) => {
    const cs = clamp(s);
    const ce = clamp(e);
    return Math.max(0.5, ((ce.getTime() - cs.getTime()) / (totalDays * 86400000)) * 100);
  };

  const openAdd = () => {
    const defaultType = allocationTypes[0]?.name ?? 'project';
    setForm({ ...emptyForm, teamMemberId: team[0]?.id ?? '', type: defaultType, startDate: rangeStart, endDate: rangeEnd });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (a: Allocation) => {
    setForm({
      teamMemberId: a.teamMemberId,
      projectName: a.projectName,
      type: a.type,
      startDate: toDateInput(new Date(a.startDate)),
      endDate: toDateInput(new Date(a.endDate)),
      notes: a.notes,
    });
    setEditingId(a.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.projectName.trim() || !form.teamMemberId) return;
    try {
      if (editingId) {
        await updateAllocation(editingId, form);
      } else {
        await createAllocation(form);
      }
      setShowModal(false);
      load();
    } catch {
      setError('Failed to save allocation.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAllocation(id);
      setDeleteConfirm(null);
      load();
    } catch {
      setError('Failed to delete allocation.');
    }
  };

  const handleExport = async (format: 'png' | 'pdf') => {
    if (!contentRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(contentRef.current);
    if (format === 'png') {
      const link = document.createElement('a');
      link.download = 'timeline.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape' });
      const imgData = canvas.toDataURL('image/png');
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height / canvas.width) * w;
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      pdf.save('timeline.pdf');
    }
  };

  // Generate month markers
  const months: { label: string; left: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const left = ((cur.getTime() - start.getTime()) / (totalDays * 86400000)) * 100;
    months.push({ label: cur.toLocaleDateString('en', { month: 'short', year: '2-digit' }), left });
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div className="p-8 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Timeline</h2>
        <div className="flex items-center gap-2">
          <ExportDropdown onExport={handleExport} />
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={15} /> Add Allocation
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center justify-between">
          {error} <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* Date range */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-gray-600">From</label>
        <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <label className="text-sm text-gray-600">To</label>
        <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {allocationTypes.map((t) => (
          <span key={t.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${(PRESET_COLORS[t.color] ?? PRESET_COLORS.gray).badge}`}>
            {t.name}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1" ref={contentRef}>
          {/* Month header */}
          <div className="relative h-8 border-b border-gray-200 bg-gray-50">
            <div className="absolute inset-0 ml-40">
              {months.map((m) => (
                <span
                  key={m.label}
                  className="absolute text-xs text-gray-400 top-2"
                  style={{ left: `${m.left}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            {(() => {
              const colors = typeColors(allocationTypes);
              return team.map((member) => {
                const memberAllocs = visibleAllocations.filter((a) => a.teamMemberId === member.id);
                const laned = assignLanes(memberAllocs);
                const numLanes = Math.max(1, ...laned.map(({ lane }) => lane + 1));
                const rowHeight = V_PAD * 2 + numLanes * LANE_H;
                return (
                  <div key={member.id} className={`flex border-b ${member.isLeaving ? 'bg-amber-50 hover:bg-amber-100 border-amber-100' : 'border-gray-100 hover:bg-gray-50'}`} style={{ minHeight: rowHeight }}>
                    <div className={`w-40 flex-shrink-0 px-4 flex items-center gap-1.5 text-sm font-medium border-r ${member.isLeaving ? 'text-amber-700 border-amber-200' : 'text-gray-800 border-gray-100'}`}>
                      {member.isLeaving && <AlertTriangle size={12} className="text-orange-500 flex-shrink-0" />}
                      <span className="truncate">{member.name}</span>
                    </div>
                    <div className="flex-1 relative" style={{ minHeight: rowHeight }}>
                      {laned.map(({ alloc: a, lane }) => {
                        const s = new Date(a.startDate);
                        const e = new Date(a.endDate);
                        const left = leftPct(s);
                        const width = widthPct(s, e);
                        const displayType = colors[a.type] ? a.type : 'uncategorised';
                        const barTop = V_PAD + lane * LANE_H;
                        const barHeight = LANE_H - 4;
                        return (
                          <div
                            key={a.id}
                            className={`absolute rounded-md flex items-center px-2 text-xs text-white cursor-pointer ${colors[displayType].bar}`}
                            style={{ left: `${left}%`, width: `${width}%`, top: barTop, height: barHeight }}
                            onClick={() => openEdit(a)}
                            title={`${a.projectName} (${displayType})`}
                          >
                            <span className="truncate">{a.projectName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
            <h3 className="text-lg font-bold mb-6">{editingId ? 'Edit Allocation' : 'Add Allocation'}</h3>
            <div className="space-y-4">
              <Field label="Team Member">
                <select
                  value={form.teamMemberId}
                  onChange={(e) => setForm((f) => ({ ...f, teamMemberId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Project / Activity Name">
                <input
                  type="text"
                  value={form.projectName}
                  onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </Field>
              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {allocationTypes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </Field>
                <Field label="End Date">
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </Field>
            </div>
            <div className="flex justify-between mt-6">
              <div>
                {editingId && (
                  deleteConfirm === editingId ? (
                    <div className="flex gap-2">
                      <button onClick={() => handleDelete(editingId)} className="text-red-600 text-sm flex items-center gap-1"><Check size={14} /> Confirm</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 text-sm"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(editingId)} className="text-red-500 text-sm flex items-center gap-1"><Trash2 size={14} /> Delete</button>
                  )
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.projectName.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                  {editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
  </div>
);

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

export default Timeline;
