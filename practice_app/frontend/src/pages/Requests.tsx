import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Sparkles, ExternalLink, BarChart2, List, LayoutGrid, ScanLine, Download } from 'lucide-react';
import type {
  WorkRequest,
  TeamMember,
  AllocationTypeConfig,
  RequestSourceConfig,
  RequestTypeConfig,
  RequestPriorityConfig,
  RequestStatusConfig,
  RequestEffortConfig,
  RequestAnalytics,
  DimensionNode,
} from '../types';
import {
  getWorkRequests,
  deleteWorkRequest,
  updateWorkRequest,
  getTeam,
  getAllocationTypes,
  getRequestSourceConfigs,
  getRequestTypeConfigs,
  getRequestPriorityConfigs,
  getRequestStatusConfigs,
  getRequestEffortConfigs,
  getRequestAnalytics,
  scanNotes,
  getDimensionNodes,
} from '../api/client';
import RequestForm from '../components/RequestForm';
import DemandCharts from '../components/DemandCharts';
import RequestDraftReview from '../components/RequestDraftReview';
import RequestKanban from '../components/RequestKanban';
import SkillsPressureMap from '../components/SkillsPressureMap';

// ── Colour helpers ────────────────────────────────────────────────────────────

const COLOUR_MAP: Record<string, { bg: string; text: string }> = {
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  green:   { bg: 'bg-green-100',   text: 'text-green-700'   },
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-700'    },
  purple:  { bg: 'bg-purple-100',  text: 'text-purple-700'  },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-700'  },
  cyan:    { bg: 'bg-cyan-100',    text: 'text-cyan-700'    },
  gray:    { bg: 'bg-gray-100',    text: 'text-gray-600'    },
};

function badge(color: string, label: string) {
  const c = COLOUR_MAP[color] ?? COLOUR_MAP.gray;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {label}
    </span>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-400',
  medium:   'bg-indigo-400',
  low:      'bg-gray-300',
};

function priorityDot(priority: string, configs: RequestPriorityConfig[]) {
  const cfg = configs.find((p) => p.name === priority);
  const dotClass = PRIORITY_DOT[priority.toLowerCase()] ?? `bg-gray-300`;
  const colour = cfg ? (COLOUR_MAP[cfg.color] ?? COLOUR_MAP.gray) : COLOUR_MAP.gray;
  return (
    <span title={priority} className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
      <span className={`text-xs font-medium ${colour.text}`}>{priority}</span>
    </span>
  );
}

function relativeDate(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const Requests: React.FC = () => {
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allocationTypes, setAllocationTypes] = useState<AllocationTypeConfig[]>([]);
  const [sources, setSources] = useState<RequestSourceConfig[]>([]);
  const [types, setTypes] = useState<RequestTypeConfig[]>([]);
  const [priorities, setPriorities] = useState<RequestPriorityConfig[]>([]);
  const [statuses, setStatuses] = useState<RequestStatusConfig[]>([]);
  const [efforts, setEfforts] = useState<RequestEffortConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab + analytics
  const [activeTab, setActiveTab] = useState<'log' | 'kanban' | 'analytics'>('log');
  const [analytics, setAnalytics] = useState<RequestAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<'week' | 'month'>('month');

  // Form panel
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRequest | null>(null);

  // Filters
  const [q, setQ] = useState('');
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);
  const [filterDraftsOnly, setFilterDraftsOnly] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Scan notes
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  // Draft review
  const [draftReviewOpen, setDraftReviewOpen] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<WorkRequest[]>([]);

  // Dimension nodes for skills pressure
  const [dimensionNodes, setDimensionNodes] = useState<DimensionNode[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, t, at, src, typ, pri, sts, eff, dimNodes] = await Promise.all([
        getWorkRequests(),
        getTeam(),
        getAllocationTypes(),
        getRequestSourceConfigs(),
        getRequestTypeConfigs(),
        getRequestPriorityConfigs(),
        getRequestStatusConfigs(),
        getRequestEffortConfigs(),
        getDimensionNodes(),
      ]);
      setRequests(reqs);
      setTeam(t);
      setAllocationTypes(at);
      setSources(src);
      setTypes(typ);
      setPriorities(pri);
      setStatuses(sts);
      setEfforts(eff);
      setDimensionNodes(dimNodes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load analytics when tab is switched or groupBy changes
  useEffect(() => {
    if (activeTab !== 'analytics') return;
    setAnalyticsLoading(true);
    getRequestAnalytics({ groupBy })
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, groupBy]);

  const draftCount = requests.filter((r) => r.isDraft).length;

  const filtered = useMemo(() => {
    let list = requests;
    if (filterDraftsOnly) list = list.filter((r) => r.isDraft);
    if (filterSource.length) list = list.filter((r) => filterSource.includes(r.source));
    if (filterType.length) list = list.filter((r) => filterType.includes(r.type));
    if (filterPriority.length) list = list.filter((r) => filterPriority.includes(r.priority));
    if (filterStatus.length) list = list.filter((r) => filterStatus.includes(r.status));
    if (filterAssignee.length) list = list.filter((r) => r.assigneeId && filterAssignee.includes(r.assigneeId));
    if (q.trim()) {
      const lq = q.toLowerCase();
      list = list.filter((r) =>
        r.title.toLowerCase().includes(lq) ||
        (r.description ?? '').toLowerCase().includes(lq) ||
        (r.externalRef ?? '').toLowerCase().includes(lq) ||
        (r.requestor?.name ?? '').toLowerCase().includes(lq) ||
        (r.requestor?.team ?? '').toLowerCase().includes(lq)
      );
    }
    return list;
  }, [requests, q, filterSource, filterType, filterPriority, filterStatus, filterAssignee, filterDraftsOnly]);

  const toggleFilter = (
    val: string,
    current: string[],
    set: React.Dispatch<React.SetStateAction<string[]>>
  ) => set(current.includes(val) ? current.filter((v) => v !== val) : [...current, val]);

  const clearFilters = () => {
    setQ('');
    setFilterSource([]);
    setFilterType([]);
    setFilterPriority([]);
    setFilterStatus([]);
    setFilterAssignee([]);
    setFilterDraftsOnly(false);
  };

  const hasFilters = q || filterSource.length || filterType.length || filterPriority.length ||
    filterStatus.length || filterAssignee.length || filterDraftsOnly;

  const handleSaved = (saved: WorkRequest) => {
    setRequests((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleDelete = async (id: string) => {
    await deleteWorkRequest(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    setDeleteConfirm(null);
    if (editing?.id === id) { setEditing(null); setFormOpen(false); }
  };

  const teamById = useMemo(() => Object.fromEntries(team.map((m) => [m.id, m])), [team]);
  const sourceColorMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.name, s.color])), [sources]);
  const typeColorMap = useMemo(() => Object.fromEntries(types.map((t) => [t.name, t.color])), [types]);
  const statusColorMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.name, s.color])), [statuses]);
  const effortLabelMap = useMemo(() => Object.fromEntries(efforts.map((e) => [e.value, e.name])), [efforts]);

  const handleScanNotes = async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      const model = localStorage.getItem('kaimahi_ai_model') ?? 'llama3.2:3b';
      const result = await scanNotes({ model });
      setScanMsg(`${result.draftsCreated} draft${result.draftsCreated !== 1 ? 's' : ''} found in ${result.notesScanned} notes scanned`);
      await load();
    } catch {
      setScanMsg('Scan failed');
    } finally {
      setScanning(false);
      setTimeout(() => setScanMsg(null), 5000);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date Raised','Title','Source','Type','Priority','Status','Effort','Assignee','Allocated','Allocation Type','Start Date','End Date','External Ref'];
    const rows = filtered.map((r) => [
      new Date(r.dateRaised).toLocaleDateString(),
      `"${r.title.replace(/"/g, '""')}"`,
      r.source, r.type, r.priority, r.status,
      r.effort ?? '',
      r.assigneeId ? (teamById[r.assigneeId]?.name ?? '') : '',
      r.isAllocated ? 'Yes' : 'No',
      r.allocationType ?? '',
      r.allocationStartDate ? new Date(r.allocationStartDate).toLocaleDateString() : '',
      r.allocationEndDate ? new Date(r.allocationEndDate).toLocaleDateString() : '',
      `"${(r.externalRef ?? '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demand-ledger-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDraftConfirm = async (id: string, updates: Partial<WorkRequest>) => {
    await updateWorkRequest(id, updates);
    setReviewDrafts((prev) => prev.filter((d) => d.id !== id));
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
  };

  const handleDraftDiscard = async (id: string) => {
    await deleteWorkRequest(id);
    setReviewDrafts((prev) => prev.filter((d) => d.id !== id));
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Demand Ledger</h1>
            <p className="text-sm text-gray-500 mt-0.5">{requests.length} requests logged</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Tab toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button
                onClick={() => setActiveTab('log')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'log' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <List size={14} /> Log
              </button>
              <button
                onClick={() => setActiveTab('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'kanban' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid size={14} /> Kanban
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <BarChart2 size={14} /> Analytics
              </button>
            </div>
            {/* Scan notes button */}
            <button
              onClick={handleScanNotes}
              disabled={scanning}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
            >
              {scanning ? <span className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" /> : <ScanLine size={16} />}
              Scan Notes
            </button>
            {/* CSV export */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
              title="Export CSV"
            >
              <Download size={16} />
            </button>
            {activeTab === 'log' && (
              <button
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
              >
                <Plus size={16} /> New Request
              </button>
            )}
          </div>
        </div>

        {/* Draft banner — log tab only */}
        {activeTab === 'log' && draftCount > 0 && (
          <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            <Sparkles size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800 flex-1">
              <strong>{draftCount}</strong> draft {draftCount === 1 ? 'request' : 'requests'} extracted from your notes — review now
            </span>
            <button
              onClick={() => {
                const drafts = requests.filter((r) => r.isDraft);
                setReviewDrafts(drafts);
                setDraftReviewOpen(true);
              }}
              className="text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded-full"
            >
              Review drafts
            </button>
          </div>
        )}

        {/* Search + filters — log tab only */}
        {activeTab === 'log' && (
          <div className="space-y-2 pb-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search title, description, requestor…"
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-indigo-600 hover:text-indigo-800 whitespace-nowrap flex items-center gap-1">
                  <X size={12} /> Clear filters
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {/* Drafts */}
              <button
                onClick={() => setFilterDraftsOnly(!filterDraftsOnly)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterDraftsOnly
                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                ✦ Drafts
              </button>

              {/* Source */}
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleFilter(s.name, filterSource, setFilterSource)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterSource.includes(s.name)
                      ? `${COLOUR_MAP[s.color]?.bg ?? 'bg-gray-100'} ${COLOUR_MAP[s.color]?.text ?? 'text-gray-600'} border-transparent`
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s.name}
                </button>
              ))}

              {/* Priority */}
              {priorities.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleFilter(p.name, filterPriority, setFilterPriority)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterPriority.includes(p.name)
                      ? `${COLOUR_MAP[p.color]?.bg ?? 'bg-gray-100'} ${COLOUR_MAP[p.color]?.text ?? 'text-gray-600'} border-transparent`
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p.name}
                </button>
              ))}

              {/* Status */}
              {statuses.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleFilter(s.name, filterStatus, setFilterStatus)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterStatus.includes(s.name)
                      ? `${COLOUR_MAP[s.color]?.bg ?? 'bg-gray-100'} ${COLOUR_MAP[s.color]?.text ?? 'text-gray-600'} border-transparent`
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Log tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div className="flex-1 overflow-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-sm">{hasFilters ? 'No requests match the current filters.' : 'No requests yet.'}</p>
              {!hasFilters && (
                <button
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Log your first request →
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 font-medium">
                  <th className="text-left py-2 pr-3 whitespace-nowrap">Date Raised</th>
                  <th className="text-left py-2 pr-3">Title</th>
                  <th className="text-left py-2 pr-3 whitespace-nowrap">Source</th>
                  <th className="text-left py-2 pr-3">Type</th>
                  <th className="text-left py-2 pr-3">Priority</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Effort</th>
                  <th className="text-left py-2 pr-3">Assignee</th>
                  <th className="text-left py-2 pr-3">Allocation</th>
                  <th className="text-left py-2">Ref</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const assignee = r.assigneeId ? teamById[r.assigneeId] : null;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                        editing?.id === r.id ? 'bg-indigo-50' : ''
                      }`}
                      onClick={() => { setEditing(r); setFormOpen(true); }}
                    >
                      {/* Date */}
                      <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        <span title={new Date(r.dateRaised).toLocaleDateString()}>
                          {relativeDate(r.dateRaised)}
                        </span>
                      </td>

                      {/* Title */}
                      <td className="py-2.5 pr-3 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          {r.isDraft && (
                            <span title="AI draft" className="text-amber-500 flex-shrink-0">
                              <Sparkles size={12} />
                            </span>
                          )}
                          <span className="truncate font-medium text-gray-900" title={r.title}>
                            {r.title}
                          </span>
                        </div>
                        {r.requestor && (
                          <div className="text-xs text-gray-400 truncate">
                            {r.requestor.name}{r.requestor.team ? ` · ${r.requestor.team}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Source */}
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {badge(sourceColorMap[r.source] ?? 'gray', r.source)}
                      </td>

                      {/* Type */}
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {badge(typeColorMap[r.type] ?? 'gray', r.type)}
                      </td>

                      {/* Priority */}
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {priorityDot(r.priority, priorities)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {r.status === 'draft'
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50">draft</span>
                          : badge(statusColorMap[r.status] ?? 'gray', r.status)
                        }
                      </td>

                      {/* Effort */}
                      <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-gray-500">
                        {r.effort ? (effortLabelMap[r.effort] ?? r.effort) : '—'}
                      </td>

                      {/* Assignee */}
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {assignee
                          ? <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700">{assignee.name}</span>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>

                      {/* Allocation */}
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {r.isAllocated && r.allocationStartDate && r.allocationEndDate
                          ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs">
                              {new Date(r.allocationStartDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                              {' → '}
                              {new Date(r.allocationEndDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                            </span>
                          )
                          : <span className="text-xs text-gray-300">— not scheduled</span>
                        }
                      </td>

                      {/* External Ref */}
                      <td className="py-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        {r.externalRef
                          ? r.externalRef.startsWith('http')
                            ? (
                              <a
                                href={r.externalRef}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline flex items-center gap-0.5"
                              >
                                <ExternalLink size={11} /> link
                              </a>
                            )
                            : <span className="text-gray-500">{r.externalRef}</span>
                          : null
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Kanban tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'kanban' && (
        <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
          <RequestKanban
            requests={filtered}
            statuses={statuses}
            sources={sources}
            priorities={priorities}
            team={team}
            onOpenRequest={(r) => { setEditing(r); setFormOpen(true); }}
            onStatusChange={async (id, newStatus) => {
              await updateWorkRequest(id, { status: newStatus });
              setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: newStatus } : r));
            }}
          />
        </div>
      )}

      {/* ── Analytics tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
          {analyticsLoading || !analytics ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              {analyticsLoading ? 'Loading analytics…' : 'No data available.'}
            </div>
          ) : (
            <DemandCharts
              analytics={analytics}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              sources={sources}
              types={types}
              priorities={priorities}
              statuses={statuses}
              dimensionNodes={dimensionNodes}
              onNodeFilter={(nodeId, nodeName) => {
                setActiveTab('log');
              }}
              onSourceFilter={(src) => {
                setActiveTab('log');
                setFilterSource([src]);
              }}
              onTypeFilter={(typ) => {
                setActiveTab('log');
                setFilterType([typ]);
              }}
            />
          )}
        </div>
      )}

      {/* Request form side panel */}
      <RequestForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
        editing={editing}
        team={team}
        allocationTypes={allocationTypes}
        sources={sources}
        types={types}
        priorities={priorities}
        statuses={statuses}
        efforts={efforts}
      />

      {/* Draft review overlay */}
      {draftReviewOpen && reviewDrafts.length > 0 && (
        <RequestDraftReview
          drafts={reviewDrafts}
          team={team}
          sources={sources}
          types={types}
          priorities={priorities}
          onConfirmed={handleDraftConfirm}
          onDiscarded={handleDraftDiscard}
          onClose={() => setDraftReviewOpen(false)}
        />
      )}

      {/* Scan toast */}
      {scanMsg && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          {scanMsg}
          <button onClick={() => setScanMsg(null)} className="text-gray-400 hover:text-white ml-1"><X size={14} /></button>
        </div>
      )}
    </div>
  );
};

export default Requests;
