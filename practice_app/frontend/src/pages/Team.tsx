import React, { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Check, AlertTriangle, UserX, UserCheck } from 'lucide-react';
import type { TeamMember, SeniorityConfig, Contact, CapacityChange } from '../types';
import {
  getTeam, createMember, updateMember, deleteMember, getSeniorityConfigs,
  getContacts, createContact, updateContact, deleteContact,
  getCapacityChanges, createCapacityChange, deleteCapacityChange,
} from '../api/client';

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

const emptyForm = {
  name: '',
  role: '',
  seniority: '',
  tags: [] as string[],
  notes: '',
  isLeaving: false,
  hasLeft: false,
  baselineFte: 1,
  startDate: '',
  endDate: '',
};

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
  const [roleSuggestions, setRoleSuggestions] = useState<string[]>([]);
  const roleInputRef = useRef<HTMLInputElement>(null);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [newContact, setNewContact] = useState({ name: '', role: '', team: '', email: '' });
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState<string | null>(null);

  // Capacity changes for the member currently open in the modal
  const [changes, setChanges] = useState<CapacityChange[]>([]);
  const [changeForm, setChangeForm] = useState({
    effectiveFrom: '',
    effectiveTo: '',
    fte: 0.5,
    reason: '',
  });
  const [changeError, setChangeError] = useState('');

  const loadChanges = async (memberId: string) => {
    try {
      setChanges(await getCapacityChanges(memberId));
    } catch {
      setChanges([]);
    }
    setChangeForm({ effectiveFrom: '', effectiveTo: '', fte: 0.5, reason: '' });
    setChangeError('');
  };

  const handleAddChange = async () => {
    if (!editingId || !changeForm.effectiveFrom || !changeForm.reason.trim()) return;
    try {
      await createCapacityChange({
        teamMemberId: editingId,
        effectiveFrom: changeForm.effectiveFrom,
        effectiveTo: changeForm.effectiveTo || null,
        fte: changeForm.fte,
        reason: changeForm.reason.trim(),
      });
      setChangeError('');
      loadChanges(editingId);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setChangeError(msg || 'Failed to add capacity change.');
    }
  };

  const handleDeleteChange = async (id: string) => {
    if (!editingId) return;
    try {
      await deleteCapacityChange(id);
      loadChanges(editingId);
    } catch {
      setChangeError('Failed to remove capacity change.');
    }
  };

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

  const loadContacts = async () => {
    setContactsLoading(true);
    try { setContacts(await getContacts()); } finally { setContactsLoading(false); }
  };

  useEffect(() => { load(); loadContacts(); }, []);

  const seniorityBadge = (seniority: string): string => {
    const cfg = seniorityConfigs.find((s) => s.name === seniority);
    return cfg ? (PRESET_BADGE_COLORS[cfg.color] ?? PRESET_BADGE_COLORS.gray) : PRESET_BADGE_COLORS.gray;
  };

  const knownRoles = Array.from(new Set(members.map((m) => m.role).filter(Boolean))).sort();

  const handleRoleChange = (value: string) => {
    setForm((f) => ({ ...f, role: value }));
    const trimmed = value.trim().toLowerCase();
    if (trimmed) {
      setRoleSuggestions(knownRoles.filter((r) => r.toLowerCase().includes(trimmed) && r.toLowerCase() !== trimmed));
    } else {
      setRoleSuggestions([]);
    }
  };

  const selectRole = (role: string) => {
    setForm((f) => ({ ...f, role }));
    setRoleSuggestions([]);
    roleInputRef.current?.focus();
  };

  const filtered = members
    .filter(
      (m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.role.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (a.hasLeft === b.hasLeft) return a.name.localeCompare(b.name);
      return a.hasLeft ? 1 : -1;
    });

  const handleReinstate = async (id: string) => {
    try {
      await updateMember(id, { hasLeft: false, isLeaving: false });
      load();
    } catch {
      setError('Failed to reinstate member.');
    }
  };

  const openAdd = () => {
    setForm({ ...emptyForm, seniority: seniorityConfigs[0]?.name ?? '' });
    setTagInput('');
    setRoleSuggestions([]);
    setEditingId(null);
    setChanges([]);
    setShowModal(true);
  };

  const openEdit = (m: TeamMember) => {
    setForm({
      name: m.name,
      role: m.role,
      seniority: m.seniority,
      tags: [...m.tags],
      notes: m.notes,
      isLeaving: m.isLeaving,
      hasLeft: m.hasLeft,
      baselineFte: m.baselineFte ?? 1,
      startDate: m.startDate ? m.startDate.slice(0, 10) : '',
      endDate: m.endDate ? m.endDate.slice(0, 10) : '',
    });
    setTagInput('');
    setRoleSuggestions([]);
    setEditingId(m.id);
    loadChanges(m.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.role.trim()) return;
    // Empty date strings must become null, not '', or the API rejects them.
    const payload = {
      ...form,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    };
    try {
      if (editingId) {
        await updateMember(editingId, payload);
      } else {
        await createMember(payload);
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
        <h2 className="text-2xl font-bold text-gray-900">Team &amp; Contacts</h2>
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
              <div key={m.id} className={`px-5 py-4 flex items-center justify-between ${m.hasLeft ? 'bg-gray-50 opacity-60' : m.isLeaving ? 'bg-amber-50 border-l-4 border-amber-400' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold ${m.hasLeft ? 'text-gray-400 line-through' : m.isLeaving ? 'text-amber-800' : 'text-gray-900'}`}>{m.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.hasLeft ? 'bg-gray-100 text-gray-400' : seniorityBadge(m.seniority)}`}
                    >
                      {m.seniority || '—'}
                    </span>
                    {m.hasLeft && (
                      <span className="flex items-center gap-1 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                        <UserX size={10} /> Left
                      </span>
                    )}
                    {!m.hasLeft && m.isLeaving && (
                      <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                        <AlertTriangle size={10} /> Leaving
                      </span>
                    )}
                  </div>
                  <div className={`text-sm mt-0.5 ${m.hasLeft ? 'text-gray-400' : 'text-gray-500'}`}>{m.role}</div>
                  {!m.hasLeft && m.tags.length > 0 && (
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
                  {m.hasLeft ? (
                    <button
                      onClick={() => handleReinstate(m.id)}
                      title="Reinstate to team"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <UserCheck size={13} /> Reinstate
                    </button>
                  ) : (
                    <button
                      onClick={() => openEdit(m)}
                      className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
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

      {/* ── Contacts ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-12 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Contact Directory</h3>
          <p className="text-sm text-gray-500 mt-0.5">External requestors who raise work — separate from team members.</p>
        </div>
      </div>

      {/* Add / edit contact form */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={editingContact ? editingContact.name : newContact.name}
            onChange={(e) => editingContact
              ? setEditingContact({ ...editingContact, name: e.target.value })
              : setNewContact({ ...newContact, name: e.target.value })}
            placeholder="Name *"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            value={editingContact ? (editingContact.role ?? '') : newContact.role}
            onChange={(e) => editingContact
              ? setEditingContact({ ...editingContact, role: e.target.value })
              : setNewContact({ ...newContact, role: e.target.value })}
            placeholder="Role"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            value={editingContact ? (editingContact.team ?? '') : newContact.team}
            onChange={(e) => editingContact
              ? setEditingContact({ ...editingContact, team: e.target.value })
              : setNewContact({ ...newContact, team: e.target.value })}
            placeholder="Team / Organisation"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            value={editingContact ? (editingContact.email ?? '') : newContact.email}
            onChange={(e) => editingContact
              ? setEditingContact({ ...editingContact, email: e.target.value })
              : setNewContact({ ...newContact, email: e.target.value })}
            placeholder="Email (optional)"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex gap-2">
          {editingContact ? (
            <>
              <button
                onClick={async () => {
                  if (!editingContact.name.trim()) return;
                  await updateContact(editingContact.id, editingContact);
                  setEditingContact(null);
                  loadContacts();
                }}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >Save</button>
              <button
                onClick={() => setEditingContact(null)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >Cancel</button>
            </>
          ) : (
            <button
              onClick={async () => {
                if (!newContact.name.trim()) return;
                await createContact(newContact);
                setNewContact({ name: '', role: '', team: '', email: '' });
                loadContacts();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            ><Plus size={14} /> Add Contact</button>
          )}
        </div>
      </div>

      {contactsLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
          No contacts yet. Add requestors above.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-gray-800">{c.name}</span>
                {(c.role || c.team) && (
                  <span className="ml-2 text-xs text-gray-400">{[c.role, c.team].filter(Boolean).join(' · ')}</span>
                )}
                {c.email && (
                  <span className="ml-2 text-xs text-gray-400">{c.email}</span>
                )}
              </div>
              <button onClick={() => setEditingContact(c)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
                <Pencil size={13} />
              </button>
              {deleteConfirmContact === c.id ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => { await deleteContact(c.id); setDeleteConfirmContact(null); loadContacts(); }}
                    className="text-red-600 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
                  ><Check size={12} /> Confirm</button>
                  <button onClick={() => setDeleteConfirmContact(null)} className="text-gray-400 p-1 rounded hover:bg-gray-100"><X size={12} /></button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirmContact(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Member modal ─────────────────────────────────────────────────── */}
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
                <div className="relative">
                  <input
                    ref={roleInputRef}
                    type="text"
                    value={form.role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    onBlur={() => setTimeout(() => setRoleSuggestions([]), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRoleSuggestions([]);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    autoComplete="off"
                  />
                  {roleSuggestions.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {roleSuggestions.map((r) => (
                        <li key={r}>
                          <button
                            type="button"
                            onMouseDown={() => selectRole(r)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            {r}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-amber-800">Leaving the team</p>
                  <p className="text-xs text-amber-600 mt-0.5">Highlights this member across all views to show coverage gaps</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isLeaving: !f.isLeaving }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.isLeaving ? 'bg-orange-500' : 'bg-gray-200'}`}
                  role="switch"
                  aria-checked={form.isLeaving}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${form.isLeaving ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700">Has left the team</p>
                  <p className="text-xs text-gray-500 mt-0.5">Retains all data but hides this member from stats, matrices, and charts</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, hasLeft: !f.hasLeft, isLeaving: f.hasLeft ? f.isLeaving : false }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.hasLeft ? 'bg-gray-600' : 'bg-gray-200'}`}
                  role="switch"
                  aria-checked={form.hasLeft}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${form.hasLeft ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {/* ── Capacity ──────────────────────────────────────────────── */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-sm font-semibold text-gray-800 mb-1">Capacity</p>
                <p className="text-xs text-gray-500 mb-3">
                  1.0 FTE is full time. Start and end dates bound when this person counts
                  toward team capacity.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Baseline FTE">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={form.baselineFte}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, baselineFte: Number(e.target.value) }))
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </Field>
                  <Field label="Start date">
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </Field>
                  <Field label="End date">
                    <input
                      type="date"
                      value={form.endDate}
                      min={form.startDate || undefined}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </Field>
                </div>

                {editingId ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-700 mb-2">
                      Capacity changes
                    </p>
                    {changes.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {changes.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                          >
                            <div className="text-xs text-gray-700">
                              <span className="font-medium">{c.fte} FTE</span>{' '}
                              <span className="text-gray-500">
                                from {c.effectiveFrom.slice(0, 10)}
                                {c.effectiveTo
                                  ? ` to ${c.effectiveTo.slice(0, 10)}`
                                  : ' onwards'}
                              </span>
                              {c.reason && (
                                <span className="text-gray-400"> — {c.reason}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteChange(c.id)}
                              className="text-gray-400 hover:text-red-600"
                              aria-label="Remove capacity change"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <label className="block text-[11px] text-gray-500 mb-1">From</label>
                        <input
                          type="date"
                          value={changeForm.effectiveFrom}
                          onChange={(e) =>
                            setChangeForm((c) => ({ ...c, effectiveFrom: e.target.value }))
                          }
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[11px] text-gray-500 mb-1">
                          To <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="date"
                          value={changeForm.effectiveTo}
                          min={changeForm.effectiveFrom || undefined}
                          onChange={(e) =>
                            setChangeForm((c) => ({ ...c, effectiveTo: e.target.value }))
                          }
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] text-gray-500 mb-1">FTE</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={changeForm.fte}
                          onChange={(e) =>
                            setChangeForm((c) => ({ ...c, fte: Number(e.target.value) }))
                          }
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[11px] text-gray-500 mb-1">Reason</label>
                        <input
                          type="text"
                          value={changeForm.reason}
                          placeholder="Parental leave"
                          onChange={(e) =>
                            setChangeForm((c) => ({ ...c, reason: e.target.value }))
                          }
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div className="col-span-1">
                        <button
                          type="button"
                          onClick={handleAddChange}
                          disabled={!changeForm.effectiveFrom || !changeForm.reason.trim()}
                          className="w-full flex items-center justify-center px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40"
                          aria-label="Add capacity change"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      Leave "To" blank for a permanent change. Set it for a temporary one —
                      capacity reverts automatically afterwards.
                    </p>
                    {changeError && (
                      <p className="text-xs text-red-600 mt-1.5">{changeError}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-3">
                    Save this member to add capacity changes.
                  </p>
                )}
              </div>
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
