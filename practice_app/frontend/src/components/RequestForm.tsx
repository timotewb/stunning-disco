import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Sparkles, Loader2 } from 'lucide-react';
import type {
  WorkRequest,
  Contact,
  TeamMember,
  AllocationTypeConfig,
  RequestSourceConfig,
  RequestTypeConfig,
  RequestPriorityConfig,
  RequestStatusConfig,
  RequestEffortConfig,
} from '../types';
import {
  createWorkRequest,
  updateWorkRequest,
  getContacts,
  createContact,
  parseRequest,
} from '../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (request: WorkRequest) => void;
  editing?: WorkRequest | null;
  team: TeamMember[];
  allocationTypes: AllocationTypeConfig[];
  sources: RequestSourceConfig[];
  types: RequestTypeConfig[];
  priorities: RequestPriorityConfig[];
  statuses: RequestStatusConfig[];
  efforts: RequestEffortConfig[];
  defaultSource?: string;
  defaultType?: string;
  /** Pre-fill assigneeId + dates + isAllocated (e.g. from drag-to-create on Timeline) */
  prefill?: Partial<WorkRequest>;
}

function toDateInput(d: string | Date | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

const COLORS: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  rose:   'bg-rose-100 text-rose-700',
  amber:  'bg-amber-100 text-amber-700',
  green:  'bg-green-100 text-green-700',
  blue:   'bg-blue-100 text-blue-700',
  teal:   'bg-teal-100 text-teal-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  cyan:   'bg-cyan-100 text-cyan-700',
  gray:   'bg-gray-100 text-gray-600',
};

export const badgeClass = (color: string) => COLORS[color] ?? COLORS.gray;

const RequestForm: React.FC<Props> = ({
  open,
  onClose,
  onSaved,
  editing,
  team,
  allocationTypes,
  sources,
  types,
  priorities,
  statuses,
  efforts,
  defaultSource,
  defaultType,
  prefill,
}) => {
  const firstField = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Paste & parse state
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsePending, setParsePending] = useState(false);
  const [parseError, setParseError] = useState('');

  // Contact picker
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);

  const blankForm = (): Partial<WorkRequest> => ({
    title: '',
    source: defaultSource ?? sources[0]?.name ?? 'other',
    type: defaultType ?? types[0]?.name ?? 'other',
    priority: priorities.find((p) => p.name === 'medium')?.name ?? priorities[0]?.name ?? 'medium',
    status: statuses.find((s) => s.name === 'new')?.name ?? statuses[0]?.name ?? 'new',
    effort: undefined,
    dateRaised: toDateInput(new Date()),
    isDraft: false,
    isAllocated: false,
    assigneeId: '',
    requestorId: '',
    description: '',
    notes: '',
    externalRef: '',
    sourceDetail: '',
    allocationStartDate: '',
    allocationEndDate: '',
    allocationNotes: '',
    allocationType: allocationTypes[0]?.name ?? '',
    ...prefill,
  });

  const [form, setForm] = useState<Partial<WorkRequest>>(blankForm);

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        ...editing,
        allocationStartDate: toDateInput(editing.allocationStartDate),
        allocationEndDate: toDateInput(editing.allocationEndDate),
        dateRaised: toDateInput(editing.dateRaised),
      } : blankForm());
      setExpanded(!!editing);
      setError('');
      setContactSearch('');
      setTimeout(() => firstField.current?.focus(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  useEffect(() => {
    getContacts().then(setContacts).catch(() => {});
  }, [open]);

  const filteredContacts = contacts.filter((c) =>
    contactSearch === '' ||
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.team ?? '').toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handleCreateContact = async () => {
    const nameToCreate = (newContactName || contactSearch).trim();
    if (!nameToCreate) return;
    setCreatingContact(true);
    try {
      const c = await createContact({ name: nameToCreate });
      setContacts((prev) => [...prev, c]);
      setForm((f) => ({ ...f, requestorId: c.id }));
      setContactSearch(c.name);
      setShowContactDropdown(false);
      setNewContactName('');
    } finally {
      setCreatingContact(false);
    }
  };

  const set = (key: keyof WorkRequest, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title?.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: Partial<WorkRequest> = {
        ...form,
        assigneeId: form.assigneeId || undefined,
        requestorId: form.requestorId || undefined,
        allocationType: form.allocationType || undefined,
        allocationStartDate: form.allocationStartDate || undefined,
        allocationEndDate: form.allocationEndDate || undefined,
        allocationNotes: form.allocationNotes || undefined,
        effort: form.effort || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
        externalRef: form.externalRef || undefined,
        sourceDetail: form.sourceDetail || undefined,
      };

      const saved = editing
        ? await updateWorkRequest(editing.id, payload)
        : await createWorkRequest(payload);

      onSaved(saved);
      if (!editing) {
        // Keep panel open for batch entry — reset to blank
        setForm(blankForm());
        setExpanded(false);
        firstField.current?.focus();
      } else {
        onClose();
      }
    } catch {
      setError('Failed to save request.');
    } finally {
      setSaving(false);
    }
  };

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    setParsePending(true);
    setParseError('');
    try {
      const model = localStorage.getItem('kaimahi_ai_model') ?? 'llama3.2:3b';
      const result = await parseRequest(pasteText, model);
      const s = result.suggestion;
      setForm((prev) => ({
        ...prev,
        title: s.title ?? prev.title,
        description: s.description ?? prev.description,
        source: sources.find((src) => src.name.toLowerCase() === s.suggestedSource?.toLowerCase())?.name ?? prev.source,
        type: types.find((t) => t.name.toLowerCase() === s.suggestedType?.toLowerCase())?.name ?? prev.type,
        priority: priorities.find((p) => p.name.toLowerCase() === s.suggestedPriority?.toLowerCase())?.name ?? prev.priority,
      }));
      setPasteOpen(false);
      setPasteText('');
    } catch {
      setParseError('Could not parse — please try again or fill in manually.');
    } finally {
      setParsePending(false);
    }
  };

  const selectedContact = contacts.find((c) => c.id === form.requestorId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white shadow-xl border-l border-gray-200 w-full max-w-md flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {editing ? 'Edit Request' : 'New Request'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* ── Paste & Parse ─────────────────────────────────────────── */}
          {!pasteOpen ? (
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium mb-3"
            >
              <Sparkles size={12} /> Paste &amp; Parse
            </button>
          ) : (
            <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                  <Sparkles size={12} /> Paste &amp; Parse
                </span>
                <button type="button" onClick={() => { setPasteOpen(false); setPasteText(''); setParseError(''); }} className="text-amber-600 hover:text-amber-800">
                  <X size={14} />
                </button>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste a Slack message, email, or note…"
                rows={4}
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white resize-none"
              />
              {parseError && <p className="text-xs text-rose-600">{parseError}</p>}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={parsePending || !pasteText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
                >
                  {parsePending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Parse
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              ref={firstField}
              value={form.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder="What was requested?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select
                value={form.source ?? ''}
                onChange={(e) => set('source', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.type ?? ''}
                onChange={(e) => set('type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {/* Date Raised + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date Raised</label>
              <input
                type="date"
                value={form.dateRaised ?? ''}
                onChange={(e) => set('dateRaised', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={form.priority ?? ''}
                onChange={(e) => set('priority', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide optional fields' : 'Show all fields'}
          </button>

          {expanded && (
            <div className="space-y-4 border-t border-gray-100 pt-4">
              {/* Status + Effort */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={form.status ?? ''}
                    onChange={(e) => set('status', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {statuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Effort</label>
                  <select
                    value={form.effort ?? ''}
                    onChange={(e) => set('effort', e.target.value || undefined)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">— unknown</option>
                    {efforts.map((e) => <option key={e.id} value={e.value}>{e.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assignee</label>
                <select
                  value={form.assigneeId ?? ''}
                  onChange={(e) => set('assigneeId', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">— unassigned</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {/* Requestor */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Requestor</label>
                <input
                  type="text"
                  value={selectedContact ? selectedContact.name : contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    set('requestorId', '');
                    setShowContactDropdown(true);
                  }}
                  onFocus={() => setShowContactDropdown(true)}
                  onBlur={() => setTimeout(() => setShowContactDropdown(false), 150)}
                  placeholder="Search contacts…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {showContactDropdown && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.length === 0 && contactSearch === '' && (
                      <div className="px-3 py-2 text-xs text-gray-400">No contacts yet</div>
                    )}
                    {filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex flex-col"
                        onMouseDown={() => {
                          set('requestorId', c.id);
                          setContactSearch(c.name);
                          setShowContactDropdown(false);
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {(c.role || c.team) && (
                          <span className="text-xs text-gray-400">{[c.role, c.team].filter(Boolean).join(' · ')}</span>
                        )}
                      </button>
                    ))}
                    {contactSearch.trim() && !filteredContacts.find((c) => c.name.toLowerCase() === contactSearch.toLowerCase()) && (
                      <div className="border-t border-gray-100 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newContactName || contactSearch}
                            onChange={(e) => setNewContactName(e.target.value)}
                            placeholder="New contact name"
                            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={creatingContact}
                            onMouseDown={handleCreateContact}
                            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                  placeholder="Full context, pasted message, meeting notes…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Source detail + External Ref */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source Detail</label>
                  <input
                    type="text"
                    value={form.sourceDetail ?? ''}
                    onChange={(e) => set('sourceDetail', e.target.value)}
                    placeholder="#channel, meeting name…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">External Ref</label>
                  <input
                    type="text"
                    value={form.externalRef ?? ''}
                    onChange={(e) => set('externalRef', e.target.value)}
                    placeholder="Jira ID, URL…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Private notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Private Notes</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  placeholder="Follow-up actions, context…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* ── Allocation section ── */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Allocation</span>
                  <button
                    type="button"
                    onClick={() => set('isAllocated', !form.isAllocated)}
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-indigo-600"
                  >
                    {form.isAllocated
                      ? <ToggleRight size={22} className="text-indigo-600" />
                      : <ToggleLeft size={22} className="text-gray-400" />
                    }
                    <span className={form.isAllocated ? 'text-indigo-600 font-medium' : ''}>
                      {form.isAllocated ? 'Allocated' : 'Not allocated'}
                    </span>
                  </button>
                </div>

                {form.isAllocated && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Type</label>
                      <select
                        value={form.allocationType ?? ''}
                        onChange={(e) => set('allocationType', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        <option value="">— select type</option>
                        {allocationTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={form.allocationStartDate ?? ''}
                          onChange={(e) => set('allocationStartDate', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                        <input
                          type="date"
                          value={form.allocationEndDate ?? ''}
                          onChange={(e) => set('allocationEndDate', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Notes</label>
                      <textarea
                        value={form.allocationNotes ?? ''}
                        onChange={(e) => set('allocationNotes', e.target.value)}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 flex justify-between items-center gap-3">
          <p className="text-xs text-gray-400">
            {editing ? 'Editing request' : 'Panel stays open — log multiple quickly'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {editing ? 'Cancel' : 'Close'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.title?.trim()}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Save' : 'Add Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestForm;
