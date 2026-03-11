import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import type { Dimension, DimensionNode, Snapshot, AllocationTypeConfig, SeniorityConfig, AiStatus, OllamaModel } from '../types';
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

  useEffect(() => { load(); loadSnapshots(); loadAllocTypes(); loadSeniorityConfigs(); loadAiStatus(); }, []);

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
