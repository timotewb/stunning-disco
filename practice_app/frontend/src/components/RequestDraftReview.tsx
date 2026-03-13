import React, { useState } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import type { WorkRequest, TeamMember, RequestSourceConfig, RequestTypeConfig, RequestPriorityConfig } from '../types';

interface Props {
  drafts: WorkRequest[];
  team: TeamMember[];
  sources: RequestSourceConfig[];
  types: RequestTypeConfig[];
  priorities: RequestPriorityConfig[];
  onConfirmed: (id: string, updates: Partial<WorkRequest>) => void;
  onDiscarded: (id: string) => void;
  onClose: () => void;
}

const RequestDraftReview: React.FC<Props> = ({
  drafts, team, sources, types, priorities, onConfirmed, onDiscarded, onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [edits, setEdits] = useState<Partial<WorkRequest>>({});

  const advance = () => {
    setCurrentIndex((i) => i + 1);
    setEdits({});
  };

  const draft = drafts[currentIndex];

  if (currentIndex >= drafts.length) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">All done!</h2>
          <p className="text-gray-500 text-sm mb-6">All {drafts.length} draft{drafts.length !== 1 ? 's' : ''} have been reviewed.</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const currentEdits = {
    title: edits.title ?? draft.title,
    source: edits.source ?? draft.source,
    type: edits.type ?? draft.type,
    priority: edits.priority ?? draft.priority,
    assigneeId: edits.assigneeId ?? draft.assigneeId ?? '',
    effort: edits.effort ?? draft.effort ?? '',
  };

  const handleConfirm = (saveEdits = true) => {
    const updates: Partial<WorkRequest> = { isDraft: false, status: 'new' };
    if (saveEdits) Object.assign(updates, currentEdits);
    onConfirmed(draft.id, updates);
    advance();
  };

  const handleDiscard = () => {
    onDiscarded(draft.id);
    advance();
  };

  const progressPct = drafts.length > 0 ? ((currentIndex) / drafts.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Reviewing draft {currentIndex + 1} of {drafts.length}
            </h2>
            <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full w-48">
              <div
                className="h-1.5 bg-indigo-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Note excerpt */}
          {draft.description && (
            <blockquote className="border-l-4 border-amber-300 bg-amber-50 px-4 py-3 rounded-r-lg">
              <p className="text-xs font-medium text-amber-700 mb-1">From your notes</p>
              <p className="text-sm text-amber-900 line-clamp-4">{draft.description}</p>
            </blockquote>
          )}

          {/* Note ref */}
          {draft.noteRef && (
            <p className="text-xs text-gray-400">Source: {draft.noteRef}</p>
          )}

          {/* Editable fields */}
          <div className="space-y-3">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                type="text"
                value={currentEdits.title}
                onChange={(e) => setEdits((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Source */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                <select
                  value={currentEdits.source}
                  onChange={(e) => setEdits((prev) => ({ ...prev, source: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={currentEdits.type}
                  onChange={(e) => setEdits((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select
                  value={currentEdits.priority}
                  onChange={(e) => setEdits((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assignee <span className="font-normal text-gray-400">(optional)</span></label>
                <select
                  value={currentEdits.assigneeId}
                  onChange={(e) => setEdits((prev) => ({ ...prev, assigneeId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">— unassigned —</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>

            {/* Effort */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Effort <span className="font-normal text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={currentEdits.effort ?? ''}
                onChange={(e) => setEdits((prev) => ({ ...prev, effort: e.target.value }))}
                placeholder="e.g. small, 3 days…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 gap-3">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg"
          >
            <Trash2 size={14} /> Discard
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleConfirm(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg"
            >
              <Check size={14} /> Confirm as-is
            </button>
            <button
              onClick={() => handleConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
            >
              Save &amp; Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestDraftReview;
