import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronDown } from 'lucide-react';
import type { Dimension, DimensionNode } from '../types';
import {
  getDimensions,
  createDimension,
  updateDimension,
  deleteDimension,
  createNode,
  updateNode,
  deleteNode,
} from '../api/client';

const Settings: React.FC = () => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDimName, setNewDimName] = useState('');
  const [newDimType, setNewDimType] = useState('skills');
  const [editingDimId, setEditingDimId] = useState<string | null>(null);
  const [editingDimName, setEditingDimName] = useState('');
  const [deleteConfirmDim, setDeleteConfirmDim] = useState<string | null>(null);
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setDimensions(await getDimensions());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
            <option value="competency">Competency</option>
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
