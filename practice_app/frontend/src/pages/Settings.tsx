import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronDown, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type {
  Dimension, DimensionNode, Snapshot, AllocationTypeConfig, SeniorityConfig, AiStatus, OllamaModel, AiPrompts,
  RequestSourceConfig, RequestTypeConfig, RequestPriorityConfig, RequestStatusConfig, RequestEffortConfig,
  ScannerConfig,
} from '../types';
import {
  getDimensions,
  createDimension,
  updateDimension,
  deleteDimension,
  createNode,
  updateNode,
  deleteNode,
  getSnapshots,
  deleteSnapshot,
  deleteSnapshots,
  getAllocationTypes,
  createAllocationType,
  deleteAllocationType,
  getSeniorityConfigs,
  createSeniorityConfig,
  deleteSeniorityConfig,
  getAiStatus,
  saveAiConfig,
  getAiModels,
  deleteAiModel,
  pullAiModel,
  getAiPrompts,
  saveAiPrompts,
  resetAiPrompt,
  getRequestSourceConfigs,
  createRequestSourceConfig,
  deleteRequestSourceConfig,
  getRequestTypeConfigs,
  createRequestTypeConfig,
  deleteRequestTypeConfig,
  getRequestPriorityConfigs,
  createRequestPriorityConfig,
  deleteRequestPriorityConfig,
  getRequestStatusConfigs,
  createRequestStatusConfig,
  deleteRequestStatusConfig,
  getRequestEffortConfigs,
  createRequestEffortConfig,
  deleteRequestEffortConfig,
  getScannerConfig,
  saveScannerConfig,
} from '../api/client';
import { useSnapshot } from '../context/SnapshotContext';

const Settings: React.FC = () => {
  const { activeSnapshot, setActiveSnapshot, refresh: refreshSnapshots } = useSnapshot();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDimName, setNewDimName] = useState('');
  const [newDimType, setNewDimType] = useState('skills');
  const [editingDimId, setEditingDimId] = useState<string | null>(null);
  const [editingDimName, setEditingDimName] = useState('');
  const [deleteConfirmDim, setDeleteConfirmDim] = useState<string | null>(null);
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  // Snapshot management state
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapsLoading, setSnapsLoading] = useState(true);
  const [selectedSnaps, setSelectedSnaps] = useState<Set<string>>(new Set());
  const [deletingSnaps, setDeletingSnaps] = useState(false);
  const [confirmDeleteSnaps, setConfirmDeleteSnaps] = useState<string[] | null>(null);

  // Allocation type state
  const [allocTypes, setAllocTypes] = useState<AllocationTypeConfig[]>([]);
  const [allocTypesLoading, setAllocTypesLoading] = useState(true);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('gray');
  const [deleteConfirmType, setDeleteConfirmType] = useState<string | null>(null);

  // Seniority config state
  const [seniorityConfigs, setSeniorityConfigs] = useState<SeniorityConfig[]>([]);
  const [seniorityLoading, setSeniorityLoading] = useState(true);
  const [newSeniorityName, setNewSeniorityName] = useState('');
  const [newSeniorityColor, setNewSeniorityColor] = useState('gray');
  const [deleteConfirmSeniority, setDeleteConfirmSeniority] = useState<string | null>(null);

  // AI / Ollama state
  const MODEL_KEY = 'kaimahi_ai_model';
  const [aiStatus, setAiStatus]         = useState<AiStatus | null>(null);
  const [aiChecking, setAiChecking]     = useState(false);
  const [aiSaving, setAiSaving]         = useState(false);
  const [customUrl, setCustomUrl]       = useState('');
  const [models, setModels]             = useState<OllamaModel[]>([]);
  const [activeModel, setActiveModel]   = useState(() => localStorage.getItem('kaimahi_ai_model') ?? 'llama3.2:3b');
  const [pullName, setPullName]         = useState('');
  const [pulling, setPulling]           = useState(false);
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);

  // AI Prompts state
  const [aiPrompts, setAiPrompts]               = useState<AiPrompts | null>(null);
  const [promptDraft, setPromptDraft]           = useState<Partial<AiPrompts>>({});
  const [promptSaving, setPromptSaving]         = useState<keyof AiPrompts | null>(null);
  const [promptSaved, setPromptSaved]           = useState<keyof AiPrompts | null>(null);
  const [promptResetting, setPromptResetting]   = useState<keyof AiPrompts | null>(null);

  // Scanner config state
  const [scannerCfg, setScannerCfg] = useState<ScannerConfig | null>(null);
  const [scannerSaving, setScannerSaving] = useState(false);
  const [scannerSaved, setScannerSaved] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState('');

  // Request taxonomy config state
  const [reqSources, setReqSources] = useState<RequestSourceConfig[]>([]);
  const [newReqSource, setNewReqSource] = useState({ name: '', color: 'gray' });
  const [deleteConfirmReqSource, setDeleteConfirmReqSource] = useState<string | null>(null);

  const [reqTypes, setReqTypes] = useState<RequestTypeConfig[]>([]);
  const [newReqType, setNewReqType] = useState({ name: '', color: 'gray' });
  const [deleteConfirmReqType, setDeleteConfirmReqType] = useState<string | null>(null);

  const [reqPriorities, setReqPriorities] = useState<RequestPriorityConfig[]>([]);
  const [newReqPriority, setNewReqPriority] = useState({ name: '', color: 'gray' });
  const [deleteConfirmReqPriority, setDeleteConfirmReqPriority] = useState<string | null>(null);

  const [reqStatuses, setReqStatuses] = useState<RequestStatusConfig[]>([]);
  const [newReqStatus, setNewReqStatus] = useState({ name: '', color: 'gray' });
  const [deleteConfirmReqStatus, setDeleteConfirmReqStatus] = useState<string | null>(null);

  const [reqEfforts, setReqEfforts] = useState<RequestEffortConfig[]>([]);
  const [newReqEffort, setNewReqEffort] = useState({ name: '', value: '' });
  const [deleteConfirmReqEffort, setDeleteConfirmReqEffort] = useState<string | null>(null);

  const AVAILABLE_COLORS = ['indigo','amber','green','blue','purple','rose','teal','orange','cyan','pink','gray'];
  const COLOR_SWATCHES: Record<string, string> = {
    indigo: 'bg-indigo-500', amber: 'bg-amber-400', green: 'bg-green-500', blue: 'bg-blue-500',
    purple: 'bg-purple-500', rose: 'bg-rose-500', teal: 'bg-teal-500', orange: 'bg-orange-500',
    cyan: 'bg-cyan-500', pink: 'bg-pink-500', gray: 'bg-gray-400',
  };

  const load = async () => {
    setLoading(true);
    try {
      setDimensions(await getDimensions());
    } finally {
      setLoading(false);
    }
  };

  const loadSnapshots = async () => {
    setSnapsLoading(true);
    try {
      setSnapshots(await getSnapshots());
    } finally {
      setSnapsLoading(false);
    }
  };

  const loadAllocTypes = async () => {
    setAllocTypesLoading(true);
    try {
      setAllocTypes(await getAllocationTypes());
    } finally {
      setAllocTypesLoading(false);
    }
  };

  const loadSeniorityConfigs = async () => {
    setSeniorityLoading(true);
    try {
      setSeniorityConfigs(await getSeniorityConfigs());
    } finally {
      setSeniorityLoading(false);
    }
  };

  const loadAiStatus = async () => {
    setAiChecking(true);
    try {
      const s = await getAiStatus();
      setAiStatus(s);
      setCustomUrl(s.customUrl ?? '');
      if (s.connected) setModels(await getAiModels());
    } finally {
      setAiChecking(false);
    }
  };

  const loadAiPrompts = async () => {
    const p = await getAiPrompts();
    setAiPrompts(p);
    setPromptDraft({ noteSummarise: p.noteSummarise, requestExtract: p.requestExtract, requestParse: p.requestParse });
  };

  const loadReqConfigs = async () => {
    const [src, typ, pri, sts, eff] = await Promise.all([
      getRequestSourceConfigs(),
      getRequestTypeConfigs(),
      getRequestPriorityConfigs(),
      getRequestStatusConfigs(),
      getRequestEffortConfigs(),
    ]);
    setReqSources(src);
    setReqTypes(typ);
    setReqPriorities(pri);
    setReqStatuses(sts);
    setReqEfforts(eff);
  };

  useEffect(() => {
    load(); loadSnapshots(); loadAllocTypes(); loadSeniorityConfigs(); loadAiStatus(); loadAiPrompts();
    loadReqConfigs();
  }, []);

  useEffect(() => {
    getScannerConfig().then(setScannerCfg).catch(() => {});
  }, []);

  const toggleDim = (id: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddDimension = async () => {
    if (!newDimName.trim()) return;
    try {
      await createDimension({ name: newDimName.trim(), type: newDimType });
      setNewDimName('');
      load();
    } catch {
      setError('Failed to create dimension.');
    }
  };

  const handleRenameDimension = async (id: string) => {
    if (!editingDimName.trim()) return;
    try {
      await updateDimension(id, { name: editingDimName.trim() });
      setEditingDimId(null);
      load();
    } catch {
      setError('Failed to rename dimension.');
    }
  };

  const handleDeleteDimension = async (id: string) => {
    try {
      await deleteDimension(id);
      setDeleteConfirmDim(null);
      load();
    } catch {
      setError('Failed to delete dimension.');
    }
  };

  const handleAddRootNode = async (dimensionId: string) => {
    const name = prompt('Node name:');
    if (!name?.trim()) return;
    try {
      await createNode({ dimensionId, name: name.trim() });
      load();
    } catch {
      setError('Failed to add node.');
    }
  };

  // Snapshot helpers
  const allSelected = snapshots.length > 0 && selectedSnaps.size === snapshots.length;
  const toggleSelectAll = () =>
    setSelectedSnaps(allSelected ? new Set() : new Set(snapshots.map((s) => s.id)));
  const toggleSnap = (id: string) =>
    setSelectedSnaps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const doDeleteSnapshots = async (ids: string[]) => {
    setDeletingSnaps(true);
    try {
      if (ids.length === 1) {
        await deleteSnapshot(ids[0]);
      } else {
        await deleteSnapshots(ids);
      }
      setSelectedSnaps((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      // If active snapshot was deleted, clear it
      if (activeSnapshot && ids.includes(activeSnapshot.id)) {
        setActiveSnapshot(null);
      }
      await loadSnapshots();
      await refreshSnapshots();
    } catch {
      setError('Failed to delete snapshot(s).');
    } finally {
      setDeletingSnaps(false);
      setConfirmDeleteSnaps(null);
    }
  };

  // Allocation type handlers
  const handleAddAllocType = async () => {
    if (!newTypeName.trim()) return;
    try {
      await createAllocationType({ name: newTypeName.trim().toLowerCase(), color: newTypeColor });
      setNewTypeName('');
      setNewTypeColor('gray');
      loadAllocTypes();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create allocation type.');
    }
  };

  const handleDeleteAllocType = async (id: string) => {
    try {
      await deleteAllocationType(id);
      setDeleteConfirmType(null);
      loadAllocTypes();
    } catch {
      setError('Failed to delete allocation type.');
    }
  };

  // Seniority config handlers
  const handleAddSeniority = async () => {
    if (!newSeniorityName.trim()) return;
    try {
      await createSeniorityConfig({ name: newSeniorityName.trim(), color: newSeniorityColor });
      setNewSeniorityName('');
      setNewSeniorityColor('gray');
      loadSeniorityConfigs();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create seniority.');
    }
  };

  const handleDeleteSeniority = async (id: string) => {
    try {
      await deleteSeniorityConfig(id);
      setDeleteConfirmSeniority(null);
      loadSeniorityConfigs();
    } catch {
      setError('Failed to delete seniority.');
    }
  };

  // AI / Ollama handlers
  const handleModeChange = async (mode: 'local' | 'docker') => {
    if (!aiStatus || aiSaving) return;
    setAiSaving(true);
    try {
      await saveAiConfig({ mode, customUrl: aiStatus.customUrl });
      await loadAiStatus();
    } finally {
      setAiSaving(false);
    }
  };

  const handleCustomUrlSave = async () => {
    if (!aiStatus || aiSaving) return;
    setAiSaving(true);
    try {
      await saveAiConfig({ mode: aiStatus.mode, customUrl: customUrl.trim() || null });
      await loadAiStatus();
    } finally {
      setAiSaving(false);
    }
  };

  const handleSelectModel = (name: string) => {
    setActiveModel(name);
    localStorage.setItem(MODEL_KEY, name);
  };

  const handlePull = async () => {
    if (!pullName.trim() || pulling) return;
    setPulling(true);
    setPullProgress(null);
    try {
      for await (const p of pullAiModel(pullName.trim())) {
        setPullProgress(p);
      }
      const refreshed = await getAiModels();
      setModels(refreshed);
      handleSelectModel(pullName.trim());
      setPullName('');
    } finally {
      setPulling(false);
      setPullProgress(null);
    }
  };

  const handleDeleteModel = async (name: string) => {
    await deleteAiModel(name);
    setModels((prev) => prev.filter((m) => m.name !== name));
    if (activeModel === name) {
      const next = models.find((m) => m.name !== name)?.name ?? '';
      handleSelectModel(next);
    }
    setConfirmDeleteModel(null);
  };

  const handleSavePrompt = async (key: keyof AiPrompts) => {
    if (promptSaving) return;
    setPromptSaving(key);
    try {
      const updated = await saveAiPrompts({ [key]: promptDraft[key] });
      setAiPrompts(updated);
      setPromptSaved(key);
      setTimeout(() => setPromptSaved(null), 2000);
    } finally {
      setPromptSaving(null);
    }
  };

  const handleResetPrompt = async (key: keyof AiPrompts) => {
    if (promptResetting) return;
    setPromptResetting(key);
    try {
      const updated = await resetAiPrompt(key);
      setAiPrompts(updated);
      setPromptDraft((d) => ({ ...d, [key]: updated[key] }));
    } finally {
      setPromptResetting(null);
    }
  };

  const handleSaveScannerCfg = async () => {
    if (!scannerCfg) return;
    setScannerSaving(true);
    try {
      const updated = await saveScannerConfig(scannerCfg);
      setScannerCfg(updated);
      setScannerSaved(true);
      setTimeout(() => setScannerSaved(false), 2000);
    } finally {
      setScannerSaving(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center justify-between">
          {error} <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      <section>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Dimensions</h3>

        {/* Add dimension */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="New dimension name…"
            value={newDimName}
            onChange={(e) => setNewDimName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDimension()}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <select
            value={newDimType}
            onChange={(e) => setNewDimType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="skills">Skills</option>
            <option value="knowledge">Knowledge</option>
          </select>
          <button
            onClick={handleAddDimension}
            disabled={!newDimName.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : dimensions.length === 0 ? (
          <div className="text-gray-400 text-sm">No dimensions yet. Add one above.</div>
        ) : (
          <div className="space-y-3">
            {dimensions.map((dim) => (
              <div key={dim.id} className="bg-white rounded-xl border border-gray-200">
                {/* Dimension header */}
                <div className="flex items-center px-4 py-3 gap-2">
                  <button
                    onClick={() => toggleDim(dim.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {expandedDims.has(dim.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {editingDimId === dim.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={editingDimName}
                        onChange={(e) => setEditingDimName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameDimension(dim.id);
                          if (e.key === 'Escape') setEditingDimId(null);
                        }}
                        autoFocus
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <button onClick={() => handleRenameDimension(dim.id)} className="text-indigo-600 hover:text-indigo-700">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditingDimId(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{dim.name}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{dim.type}</span>
                    </div>
                  )}

                  {editingDimId !== dim.id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingDimId(dim.id);
                          setEditingDimName(dim.name);
                        }}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleAddRootNode(dim.id)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                        title="Add root node"
                      >
                        <Plus size={13} />
                      </button>
                      {deleteConfirmDim === dim.id ? (
                        <>
                          <button onClick={() => handleDeleteDimension(dim.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Check size={13} /></button>
                          <button onClick={() => setDeleteConfirmDim(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={13} /></button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteConfirmDim(dim.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Node tree */}
                {expandedDims.has(dim.id) && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    <NodeTree
                      nodes={dim.nodes}
                      parentId={null}
                      dimensionId={dim.id}
                      onRefresh={load}
                      setError={setError}
                      depth={0}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Snapshot Management */}
      <section className="mt-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Snapshots</h3>

        {/* Confirmation dialog */}
        {confirmDeleteSnaps && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm">
            <p className="text-red-700 font-medium mb-3">
              Delete {confirmDeleteSnaps.length} snapshot{confirmDeleteSnaps.length > 1 ? 's' : ''}?
              This will also remove all matrix entries and SME assignments in {confirmDeleteSnaps.length > 1 ? 'those snapshots' : 'that snapshot'}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => doDeleteSnapshots(confirmDeleteSnaps)}
                disabled={deletingSnaps}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {deletingSnaps ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDeleteSnaps(null)}
                disabled={deletingSnaps}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bulk actions toolbar */}
        {selectedSnaps.size > 0 && !confirmDeleteSnaps && (
          <div className="mb-3 flex items-center gap-3 p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
            <span className="text-xs text-indigo-700 font-medium">{selectedSnaps.size} selected</span>
            <button
              onClick={() => setConfirmDeleteSnaps(Array.from(selectedSnaps))}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium"
            >
              <Trash2 size={12} /> Delete selected
            </button>
            <button
              onClick={() => setSelectedSnaps(new Set())}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              Clear selection
            </button>
          </div>
        )}

        {snapsLoading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : snapshots.length === 0 ? (
          <div className="text-gray-400 text-sm">No snapshots yet.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                      title="Select all"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date / Label</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => {
                  const isActive = activeSnapshot?.id === snap.id;
                  return (
                    <tr
                      key={snap.id}
                      className={`border-b border-gray-100 last:border-0 ${selectedSnaps.has(snap.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedSnaps.has(snap.id)}
                          onChange={() => toggleSnap(snap.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-700 font-mono text-xs">
                        {new Date(snap.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        {isActive && (
                          <span className="inline-flex items-center px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setConfirmDeleteSnaps([snap.id])}
                          disabled={deletingSnaps}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
                          title="Delete snapshot"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Allocation Types */}
      <section className="mt-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Allocation Types</h3>
        <p className="text-sm text-gray-500 mb-4">
          Define the types available when creating allocations on the Timeline. Removing a type that is already in use will display those allocations as <span className="font-medium text-gray-700">uncategorised</span>.
        </p>

        {/* Add new type */}
        <div className="flex items-center gap-2 mb-5">
          <input
            type="text"
            placeholder="New type name…"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddAllocType(); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48"
          />
          <div className="flex items-center gap-1">
            {AVAILABLE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewTypeColor(c)}
                className={`w-5 h-5 rounded-full ${COLOR_SWATCHES[c]} ${newTypeColor === c ? 'ring-2 ring-offset-1 ring-gray-600' : ''}`}
                title={c}
              />
            ))}
          </div>
          <button
            onClick={handleAddAllocType}
            disabled={!newTypeName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {allocTypesLoading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : allocTypes.length === 0 ? (
          <div className="text-sm text-gray-400">No allocation types configured.</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {allocTypes.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${COLOR_SWATCHES[t.color] ?? 'bg-gray-400'}`} />
                  <span className="text-sm text-gray-800">{t.name}</span>
                </div>
                {deleteConfirmType === t.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Delete?</span>
                    <button onClick={() => handleDeleteAllocType(t.id)} className="text-red-600 text-sm flex items-center gap-1"><Check size={13} /> Yes</button>
                    <button onClick={() => setDeleteConfirmType(null)} className="text-gray-400 text-sm"><X size={13} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmType(t.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                    title="Delete type"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Seniority Types */}
      <section className="mt-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Seniority Levels</h3>
        <p className="text-sm text-gray-500 mb-4">
          Define the seniority levels available when adding or editing team members. Removing a level that is already assigned will display those members with a <span className="font-medium text-gray-700">gray</span> badge.
        </p>

        {/* Add new seniority */}
        <div className="flex items-center gap-2 mb-5">
          <input
            type="text"
            placeholder="New seniority level…"
            value={newSeniorityName}
            onChange={(e) => setNewSeniorityName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSeniority(); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48"
          />
          <div className="flex items-center gap-1">
            {AVAILABLE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewSeniorityColor(c)}
                className={`w-5 h-5 rounded-full ${COLOR_SWATCHES[c]} ${newSeniorityColor === c ? 'ring-2 ring-offset-1 ring-gray-600' : ''}`}
                title={c}
              />
            ))}
          </div>
          <button
            onClick={handleAddSeniority}
            disabled={!newSeniorityName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {seniorityLoading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : seniorityConfigs.length === 0 ? (
          <div className="text-sm text-gray-400">No seniority levels configured.</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {seniorityConfigs.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${COLOR_SWATCHES[s.color] ?? 'bg-gray-400'}`} />
                  <span className="text-sm text-gray-800">{s.name}</span>
                </div>
                {deleteConfirmSeniority === s.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Delete?</span>
                    <button onClick={() => handleDeleteSeniority(s.id)} className="text-red-600 text-sm flex items-center gap-1"><Check size={13} /> Yes</button>
                    <button onClick={() => setDeleteConfirmSeniority(null)} className="text-gray-400 text-sm"><X size={13} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmSeniority(s.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                    title="Delete seniority level"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── AI / Ollama ──────────────────────────────────────── */}
      <section className="mt-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">AI / Ollama</h3>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          {/* Source selector */}
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700 mb-2">Ollama source</p>
            <div className="flex gap-4">
              {(['local', 'docker'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ollamaMode"
                    value={m}
                    checked={aiStatus?.mode === m}
                    disabled={aiSaving}
                    onChange={() => handleModeChange(m)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">
                    {m === 'local' ? 'Local installation' : 'Docker container'}
                  </span>
                </label>
              ))}
            </div>

            {/* Contextual setup instructions */}
            {aiStatus?.mode === 'local' && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 font-mono">
                brew install ollama &amp;&amp; brew services start ollama
              </div>
            )}
            {aiStatus?.mode === 'docker' && (
              <p className="mt-3 text-xs text-gray-500">
                The <code>ollama</code> service in docker-compose.yml will be used.
                Run <code className="bg-gray-100 px-1 rounded">docker compose up</code> to start it.
              </p>
            )}
          </div>

          {/* Resolved URL + custom override */}
          {aiStatus && (
            <div className="mb-5">
              <p className="text-xs text-gray-500 mb-1">
                Active URL: <code className="bg-gray-100 px-1 rounded">{aiStatus.resolvedUrl}</code>
              </p>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="Custom URL override (optional)"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  onClick={handleCustomUrlSave}
                  disabled={aiSaving}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg
                             hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Connection status */}
          <div className="flex items-center gap-3">
            {aiChecking ? (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 size={12} className="animate-spin" /> Checking…
              </span>
            ) : aiStatus?.connected ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Connected — Ollama {aiStatus.version}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-red-500">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Not connected — is Ollama running?
              </span>
            )}
            <button
              onClick={loadAiStatus}
              disabled={aiChecking}
              className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors">
              Re-check
            </button>
          </div>

          {aiStatus?.connected && (
            <>
              {/* Active model selector */}
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Active model</p>
                {models.length === 0 ? (
                  <p className="text-xs text-gray-400">No models installed. Pull one below.</p>
                ) : (
                  <select
                    value={activeModel}
                    onChange={(e) => handleSelectModel(e.target.value)}
                    className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Installed models table */}
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-3">Installed models</p>
                {models.length === 0 ? (
                  <p className="text-xs text-gray-400">None yet.</p>
                ) : (
                  <div className="space-y-1">
                    {models.map((m) => (
                      <div key={m.name}
                        className="flex items-center justify-between px-3 py-2 rounded-lg
                                   bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div>
                          <span className="text-sm text-gray-800">{m.name}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            {(m.size / 1e9).toFixed(1)} GB
                          </span>
                        </div>
                        {confirmDeleteModel === m.name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-500">Delete?</span>
                            <button onClick={() => handleDeleteModel(m.name)}
                              className="text-xs text-red-600 font-medium hover:text-red-800">Yes</button>
                            <button onClick={() => setConfirmDeleteModel(null)}
                              className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteModel(m.name)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pull model */}
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Pull a model</p>
                <p className="text-xs text-gray-400 mb-3">
                  Find models at{' '}
                  <a href="https://ollama.com/library" target="_blank" rel="noreferrer"
                    className="text-indigo-500 hover:underline">ollama.com/library</a>.
                  Suggested: <code>llama3.2:3b</code>, <code>qwen2.5:7b</code>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pullName}
                    onChange={(e) => setPullName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePull()}
                    placeholder="e.g. llama3.2:3b"
                    disabled={pulling}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-indigo-300
                               disabled:opacity-50"
                  />
                  <button
                    onClick={handlePull}
                    disabled={pulling || !pullName.trim()}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg
                               hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                    {pulling && <Loader2 size={12} className="animate-spin" />}
                    Pull
                  </button>
                </div>
                {pullProgress && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">{pullProgress.status}</p>
                    {pullProgress.total ? (
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.round(((pullProgress.completed ?? 0) / pullProgress.total) * 100)}%` }}
                        />
                      </div>
                    ) : (
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 bg-indigo-400 rounded-full animate-pulse w-1/3" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── AI Prompts ───────────────────────────────────────── */}
      <section className="mt-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">AI Prompts</h3>
        <p className="text-sm text-gray-500 mb-4">
          Customise the system prompts sent to Ollama for each AI feature.
          Use <code className="bg-gray-100 px-1 rounded text-xs">{'{date}'}</code> and it will be replaced with today's date at call time.
        </p>

        {!aiPrompts ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="space-y-6">

            {/* Notes: Summarise */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-800">Notes — Summarise</p>
                <button
                  onClick={() => handleResetPrompt('noteSummarise')}
                  disabled={!!promptResetting}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors">
                  {promptResetting === 'noteSummarise' ? 'Resetting…' : 'Reset to default'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Sent as the system instruction when the Summarise button is clicked in the Notes editor.
              </p>
              <textarea
                value={promptDraft.noteSummarise ?? ''}
                onChange={(e) => setPromptDraft((d) => ({ ...d, noteSummarise: e.target.value }))}
                rows={12}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => handleSavePrompt('noteSummarise')}
                  disabled={!!promptSaving}
                  className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg
                             hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                  {promptSaving === 'noteSummarise' && <Loader2 size={12} className="animate-spin" />}
                  Save
                </button>
                {promptSaved === 'noteSummarise' && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check size={12} /> Saved
                  </span>
                )}
              </div>
            </div>

            {/* Work Request — Extract from Notes */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Work Request — Extract from Notes</p>
                  <p className="text-xs text-gray-500">Sent as the system instruction when scanning notes for work requests.</p>
                </div>
                <button
                  onClick={() => handleResetPrompt('requestExtract')}
                  disabled={promptResetting === 'requestExtract'}
                  className="text-xs text-gray-400 hover:text-rose-500 disabled:opacity-50"
                >
                  {promptResetting === 'requestExtract' ? 'Resetting…' : 'Reset'}
                </button>
              </div>
              <textarea
                rows={4}
                value={promptDraft.requestExtract ?? aiPrompts?.requestExtract ?? ''}
                onChange={(e) => setPromptDraft((prev) => ({ ...prev, requestExtract: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => handleSavePrompt('requestExtract')}
                  disabled={promptSaving === 'requestExtract'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                  {promptSaving === 'requestExtract' ? 'Saving…' : promptSaved === 'requestExtract' ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>

            {/* Work Request — Paste & Parse */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Work Request — Paste &amp; Parse</p>
                  <p className="text-xs text-gray-500">Sent as the system instruction when parsing pasted text into a work request.</p>
                </div>
                <button
                  onClick={() => handleResetPrompt('requestParse')}
                  disabled={promptResetting === 'requestParse'}
                  className="text-xs text-gray-400 hover:text-rose-500 disabled:opacity-50"
                >
                  {promptResetting === 'requestParse' ? 'Resetting…' : 'Reset'}
                </button>
              </div>
              <textarea
                rows={4}
                value={promptDraft.requestParse ?? aiPrompts?.requestParse ?? ''}
                onChange={(e) => setPromptDraft((prev) => ({ ...prev, requestParse: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => handleSavePrompt('requestParse')}
                  disabled={promptSaving === 'requestParse'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                  {promptSaving === 'requestParse' ? 'Saving…' : promptSaved === 'requestParse' ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>

          </div>
        )}
      </section>

      {/* ── Notes Scanner ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Notes Scanner</h2>
        <p className="text-sm text-gray-500 mb-4">Configure how the AI scans your notes for work requests.</p>

        {scannerCfg === null ? (
          <div className="text-sm text-gray-400">Loading scanner config…</div>
        ) : (
          <div className="space-y-4 max-w-lg">
            {/* Lookback window */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lookback window (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={scannerCfg.lookbackDays}
                onChange={(e) => setScannerCfg((prev) => prev ? { ...prev, lookbackDays: parseInt(e.target.value) || 7 } : prev)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <p className="text-xs text-gray-400 mt-1">How many days back to scan for new notes</p>
            </div>

            {/* Auto-scan toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Auto-scan on startup</p>
                <p className="text-xs text-gray-400">Automatically scan notes when the app loads</p>
              </div>
              <button
                type="button"
                onClick={() => setScannerCfg((prev) => prev ? { ...prev, autoScan: !prev.autoScan } : prev)}
                className={`text-2xl ${scannerCfg.autoScan ? 'text-indigo-600' : 'text-gray-300'}`}
              >
                {scannerCfg.autoScan ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            {/* Include daily notes toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Include daily notes</p>
                <p className="text-xs text-gray-400">Scan the daily notes section</p>
              </div>
              <button
                type="button"
                onClick={() => setScannerCfg((prev) => prev ? { ...prev, includeDailyNotes: !prev.includeDailyNotes } : prev)}
                className={`text-2xl ${scannerCfg.includeDailyNotes ? 'text-indigo-600' : 'text-gray-300'}`}
              >
                {scannerCfg.includeDailyNotes ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            {/* Include folders */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Include folders</label>
              <div className="space-y-1.5 mb-2">
                {scannerCfg.includeFolders.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 flex-1">{f}</span>
                    <button
                      type="button"
                      onClick={() => setScannerCfg((prev) => prev ? { ...prev, includeFolders: prev.includeFolders.filter((x) => x !== f) } : prev)}
                      className="text-gray-400 hover:text-rose-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  placeholder="folder-slug"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderInput.trim()) {
                      setScannerCfg((prev) => prev ? { ...prev, includeFolders: [...prev.includeFolders, newFolderInput.trim()] } : prev);
                      setNewFolderInput('');
                    }
                  }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newFolderInput.trim()) {
                      setScannerCfg((prev) => prev ? { ...prev, includeFolders: [...prev.includeFolders, newFolderInput.trim()] } : prev);
                      setNewFolderInput('');
                    }
                  }}
                  className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Add folder slugs to scan (e.g. meeting-notes)</p>
            </div>

            <button
              type="button"
              onClick={handleSaveScannerCfg}
              disabled={scannerSaving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
            >
              {scannerSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {scannerSaved ? 'Saved!' : 'Save Scanner Config'}
            </button>
          </div>
        )}
      </section>

      {/* ── Request Taxonomies ────────────────────────────────── */}
      <section className="mt-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Request Taxonomies</h3>
        <p className="text-sm text-gray-500 mb-6">
          Configure the drop-down values used in the Demand Ledger. All taxonomies are fully customisable.
        </p>

        {/* Helper: compact taxonomy config block */}
        {[
          { label: 'Sources', items: reqSources, newState: newReqSource, setNew: setNewReqSource, deleteConfirm: deleteConfirmReqSource, setDelete: setDeleteConfirmReqSource, hasColor: true, hasValue: false,
            onCreate: async () => { if (!newReqSource.name.trim()) return; await createRequestSourceConfig({ name: newReqSource.name, color: newReqSource.color, orderIndex: reqSources.length }); setNewReqSource({ name: '', color: 'gray' }); loadReqConfigs(); },
            onDelete: async (id: string) => { await deleteRequestSourceConfig(id); setDeleteConfirmReqSource(null); loadReqConfigs(); },
          },
          { label: 'Types', items: reqTypes, newState: newReqType, setNew: setNewReqType, deleteConfirm: deleteConfirmReqType, setDelete: setDeleteConfirmReqType, hasColor: true, hasValue: false,
            onCreate: async () => { if (!newReqType.name.trim()) return; await createRequestTypeConfig({ name: newReqType.name, color: newReqType.color, orderIndex: reqTypes.length }); setNewReqType({ name: '', color: 'gray' }); loadReqConfigs(); },
            onDelete: async (id: string) => { await deleteRequestTypeConfig(id); setDeleteConfirmReqType(null); loadReqConfigs(); },
          },
          { label: 'Priorities', items: reqPriorities, newState: newReqPriority, setNew: setNewReqPriority, deleteConfirm: deleteConfirmReqPriority, setDelete: setDeleteConfirmReqPriority, hasColor: true, hasValue: false,
            onCreate: async () => { if (!newReqPriority.name.trim()) return; await createRequestPriorityConfig({ name: newReqPriority.name, color: newReqPriority.color, orderIndex: reqPriorities.length }); setNewReqPriority({ name: '', color: 'gray' }); loadReqConfigs(); },
            onDelete: async (id: string) => { await deleteRequestPriorityConfig(id); setDeleteConfirmReqPriority(null); loadReqConfigs(); },
          },
          { label: 'Statuses', items: reqStatuses, newState: newReqStatus, setNew: setNewReqStatus, deleteConfirm: deleteConfirmReqStatus, setDelete: setDeleteConfirmReqStatus, hasColor: true, hasValue: false,
            onCreate: async () => { if (!newReqStatus.name.trim()) return; await createRequestStatusConfig({ name: newReqStatus.name, color: newReqStatus.color, orderIndex: reqStatuses.length }); setNewReqStatus({ name: '', color: 'gray' }); loadReqConfigs(); },
            onDelete: async (id: string) => { await deleteRequestStatusConfig(id); setDeleteConfirmReqStatus(null); loadReqConfigs(); },
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ].map(({ label, items, newState, setNew, deleteConfirm: dc, setDelete, hasColor, onCreate, onDelete }: any) => (
          <div key={label} className="mb-8">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">{label}</h4>
            <div className="flex items-center gap-2 mb-3">
              <input
                value={newState.name}
                onChange={(e) => setNew({ ...newState, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && onCreate()}
                placeholder={`New ${label.toLowerCase().slice(0, -1)}…`}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {hasColor && (
                <select
                  value={newState.color}
                  onChange={(e) => setNew({ ...newState, color: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                >
                  {AVAILABLE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button
                onClick={onCreate}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              ><Plus size={14}/> Add</button>
            </div>
            <div className="space-y-1">
              {items.map((item: RequestSourceConfig) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg hover:bg-gray-50">
                  {hasColor && (
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${COLOR_SWATCHES[item.color] ?? 'bg-gray-400'}`} />
                  )}
                  <span className="flex-1 text-sm text-gray-700">{item.name}</span>
                  {dc === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onDelete(item.id)} className="text-red-600 text-xs flex items-center gap-1"><Check size={12}/> Confirm</button>
                      <button onClick={() => setDelete(null)} className="text-gray-400"><X size={12}/></button>
                    </div>
                  ) : (
                    <button onClick={() => setDelete(item.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13}/></button>
                  )}
                </div>
              ))}
              {items.length === 0 && <div className="text-xs text-gray-400">None configured.</div>}
            </div>
          </div>
        ))}

        {/* Effort — has both name and value fields */}
        <div className="mb-8">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Effort Sizes</h4>
          <div className="flex items-center gap-2 mb-3">
            <input
              value={newReqEffort.name}
              onChange={(e) => setNewReqEffort({ ...newReqEffort, name: e.target.value })}
              placeholder="Label (e.g. S — 1–2 days)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <input
              value={newReqEffort.value}
              onChange={(e) => setNewReqEffort({ ...newReqEffort, value: e.target.value })}
              placeholder="Value (e.g. s)"
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={async () => {
                if (!newReqEffort.name.trim() || !newReqEffort.value.trim()) return;
                await createRequestEffortConfig({ name: newReqEffort.name, value: newReqEffort.value, orderIndex: reqEfforts.length });
                setNewReqEffort({ name: '', value: '' });
                loadReqConfigs();
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            ><Plus size={14}/> Add</button>
          </div>
          <div className="space-y-1">
            {reqEfforts.map((e) => (
              <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg hover:bg-gray-50">
                <span className="text-xs font-mono text-gray-400 w-8">{e.value}</span>
                <span className="flex-1 text-sm text-gray-700">{e.name}</span>
                {deleteConfirmReqEffort === e.id ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={async () => { await deleteRequestEffortConfig(e.id); setDeleteConfirmReqEffort(null); loadReqConfigs(); }} className="text-red-600 text-xs flex items-center gap-1"><Check size={12}/> Confirm</button>
                    <button onClick={() => setDeleteConfirmReqEffort(null)} className="text-gray-400"><X size={12}/></button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmReqEffort(e.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13}/></button>
                )}
              </div>
            ))}
            {reqEfforts.length === 0 && <div className="text-xs text-gray-400">None configured.</div>}
          </div>
        </div>
      </section>
    </div>
  );
};

interface NodeTreeProps {
  nodes: DimensionNode[];
  parentId: string | null;
  dimensionId: string;
  onRefresh: () => void;
  setError: (e: string) => void;
  depth: number;
}

const NodeTree: React.FC<NodeTreeProps> = ({ nodes, parentId, dimensionId, onRefresh, setError, depth }) => {
  const children = nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.orderIndex - b.orderIndex);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateNode(id, { name: editName.trim() });
      setEditingId(null);
      onRefresh();
    } catch {
      setError('Failed to rename node.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      setDeleteConfirm(null);
      onRefresh();
    } catch {
      setError('Failed to delete node.');
    }
  };

  const handleAddChild = async (parentNodeId: string) => {
    const name = prompt('Child node name:');
    if (!name?.trim()) return;
    const siblings = nodes.filter((n) => n.parentId === parentNodeId);
    try {
      await createNode({ dimensionId, parentId: parentNodeId, name: name.trim(), orderIndex: siblings.length });
      onRefresh();
    } catch {
      setError('Failed to add child node.');
    }
  };

  const handleAddSibling = async () => {
    const name = prompt('Sibling node name:');
    if (!name?.trim()) return;
    const siblings = nodes.filter((n) => n.parentId === parentId);
    try {
      await createNode({ dimensionId, parentId: parentId ?? undefined, name: name.trim(), orderIndex: siblings.length });
      onRefresh();
    } catch {
      setError('Failed to add sibling node.');
    }
  };

  if (children.length === 0 && depth > 0) return null;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      {children.map((node) => (
        <div key={node.id} className="mb-1">
          <div className="flex items-center gap-1.5 py-1 group">
            {editingId === node.id ? (
              <div className="flex-1 flex items-center gap-1.5">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(node.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button onClick={() => handleRename(node.id)} className="text-indigo-600"><Check size={13} /></button>
                <button onClick={() => setEditingId(null)} className="text-gray-400"><X size={13} /></button>
              </div>
            ) : (
              <>
                <span className="text-gray-300 text-xs">{'─'}</span>
                <span className="text-sm text-gray-700 flex-1">{node.name}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                  <button
                    onClick={() => { setEditingId(node.id); setEditName(node.name); }}
                    className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleAddChild(node.id)}
                    className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                    title="Add child"
                  >
                    <Plus size={12} />
                  </button>
                  {deleteConfirm === node.id ? (
                    <>
                      <button onClick={() => handleDelete(node.id)} className="p-1 text-red-500"><Check size={12} /></button>
                      <button onClick={() => setDeleteConfirm(null)} className="p-1 text-gray-400"><X size={12} /></button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(node.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {/* Recurse into children */}
          <NodeTree
            nodes={nodes}
            parentId={node.id}
            dimensionId={dimensionId}
            onRefresh={onRefresh}
            setError={setError}
            depth={depth + 1}
          />
        </div>
      ))}
      {/* Add sibling button for root level */}
      {depth === 0 && (
        <button
          onClick={handleAddSibling}
          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-1"
        >
          <Plus size={11} /> Add node
        </button>
      )}
    </div>
  );
};

export default Settings;
