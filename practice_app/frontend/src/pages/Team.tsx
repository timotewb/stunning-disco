import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import type { TeamMember, SeniorityConfig } from '../types';
import { getTeam, createMember, updateMember, deleteMember, getSeniorityConfigs } from '../api/client';

const PRESET_BADGE_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  amber:  'bg-amber-100 text-amber-700',
  green:  'bg-green-100 text-green-700',
  blue:   'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  rose:   'bg-rose-100 text-rose-700',
  teal:   'bg-teal-100 text-teal-700',
  orange: 'bg-orange-100 text-orange-700',
  cyan:   'bg-cyan-100 text-cyan-700',
  pink:   'bg-pink-100 text-pink-700',
  gray:   'bg-gray-100 text-gray-600',
};

const emptyForm = { name: '', role: '', seniority: '', tags: [] as string[], notes: '' };

const Team: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [seniorityConfigs, setSeniorityConfigs] = useState<SeniorityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [tagInput, setTagInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [members, configs] = await Promise.all([getTeam(), getSeniorityConfigs()]);
      setMembers(members);
      setSeniorityConfigs(configs);
    } catch {
      setError('Failed to load team.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const seniorityBadge = (seniority: string): string => {
    const cfg = seniorityConfigs.find((s) => s.name === seniority);
    return cfg ? (PRESET_BADGE_COLORS[cfg.color] ?? PRESET_BADGE_COLORS.gray) : PRESET_BADGE_COLORS.gray;
  };

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ ...emptyForm, seniority: seniorityConfigs[0]?.name ?? '' });
    setTagInput('');
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (m: TeamMember) => {
    setForm({ name: m.name, role: m.role, seniority: m.seniority, tags: [...m.tags], notes: m.notes });
    setTagInput('');
    setEditingId(m.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.role.trim()) return;
    try {
      if (editingId) {
        await updateMember(editingId, form);
      } else {
        await createMember(form);
      }
      setShowModal(false);
      load();
    } catch {
      setError('Failed to save member.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMember(id);
      setDeleteConfirm(null);
      load();
    } catch {
      setError('Failed to delete member.');
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput('');
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Team</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Member
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      <input
        type="text"
        placeholder="Search by name or role…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-6 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">No team members found.</div>
          ) : (
            filtered.map((m) => (
              <div key={m.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{m.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${seniorityBadge(m.seniority)}`}
                    >
                      {m.seniority || '—'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{m.role}</div>
                  {m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {m.tags.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => openEdit(m)}
                    className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  {deleteConfirm === m.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(m.id)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
            <h3 className="text-lg font-bold mb-6">{editingId ? 'Edit Member' : 'Add Member'}</h3>
            <div className="space-y-4">
              <Field label="Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </Field>
              <Field label="Role">
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </Field>
              <Field label="Seniority">
                <select
                  value={form.seniority}
                  onChange={(e) => setForm((f) => ({ ...f, seniority: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {seniorityConfigs.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags">
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1"
                    >
                      {t}
                      <button
                        onClick={() =>
                          setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))
                        }
                        className="hover:text-red-500"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="Add tag…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    onClick={addTag}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm"
                  >
                    Add
                  </button>
                </div>
              </Field>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim() || !form.role.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
              >
                {editingId ? 'Save' : 'Add'}
              </button>
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

export default Team;
