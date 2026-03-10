import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search, Eye, Edit3, Columns, Check, Loader2, NotebookPen, FileText,
  CalendarDays, User, FolderOpen, Folder as FolderIcon, Plus, MoreHorizontal,
  ChevronDown, ChevronRight, Trash2, Pencil, MoveRight, X,
} from 'lucide-react';
import {
  getNotes, getNote, saveNote, searchNotes,
  getMemberNotes, getMemberNote, saveMemberNote, searchMemberNotes,
  getTeam,
  getFolders, createFolder, renameFolder, deleteFolder,
  createFolderNote, getFolderNote, saveFolderNote,
  renameFolderNote, deleteFolderNote, moveFolderNote,
  getCtxFolders, createCtxFolder, renameCtxFolder, deleteCtxFolder,
  createCtxFolderNote, getCtxFolderNote, saveCtxFolderNote,
  renameCtxFolderNote, deleteCtxFolderNote, moveCtxFolderNote,
} from '../api/client';
import type { NoteListItem, NoteSearchResult, TeamMember, Folder } from '../types';

type Mode = 'edit' | 'split' | 'preview';
type SaveStatus = 'idle' | 'saving' | 'saved';
type NoteContext = 'daily' | 'member' | 'folders';
// Which pane is active in daily/member contexts
type ActivePane = 'date' | 'ctx-folder';

type ModalKind =
  | { type: 'new-folder'; scope: 'global' | 'ctx' }
  | { type: 'rename-folder'; scope: 'global' | 'ctx'; slug: string; currentName: string }
  | { type: 'delete-folder'; scope: 'global' | 'ctx'; slug: string; name: string }
  | { type: 'new-note'; scope: 'global' | 'ctx'; folderSlug: string }
  | { type: 'rename-note'; scope: 'global' | 'ctx'; folderSlug: string; noteSlug: string; currentName: string }
  | { type: 'delete-note'; scope: 'global' | 'ctx'; folderSlug: string; noteSlug: string; name: string }
  | { type: 'move-note'; scope: 'global' | 'ctx'; folderSlug: string; noteSlug: string; noteName: string };

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function groupByMonth(dates: string[]): { key: string; label: string; dates: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const d of dates) {
    const [year, month] = d.split('-');
    const key = `${year}-${month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return Array.from(groups.entries()).map(([key, ds]) => {
    const [year, month] = key.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
    return { key, label, dates: ds };
  });
}

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ── SimpleModal ───────────────────────────────────────────────────────────────

interface SimpleModalProps {
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

const SimpleModal: React.FC<SimpleModalProps> = ({
  title, onClose, onConfirm, confirmLabel = 'Confirm', confirmDisabled, danger, children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
    <div className="bg-white rounded-xl shadow-xl w-80 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>
      {children}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 ${
            danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ── FolderSidebar ─────────────────────────────────────────────────────────────

interface FolderSidebarProps {
  folders: Folder[];
  expandedFolders: Set<string>;
  selectedFolderSlug: string | null;
  selectedNoteSlug: string | null;
  onToggleFolder: (slug: string) => void;
  onSelectNote: (folderSlug: string, noteSlug: string) => void;
  onOpenModal: (modal: ModalKind) => void;
  scope: 'global' | 'ctx';
}

const FolderSidebar: React.FC<FolderSidebarProps> = ({
  folders, expandedFolders, selectedFolderSlug, selectedNoteSlug,
  onToggleFolder, onSelectNote, onOpenModal, scope,
}) => {
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [noteMenu, setNoteMenu] = useState<string | null>(null);
  const closeMenus = () => { setFolderMenu(null); setNoteMenu(null); };

  if (folders.length === 0) {
    return (
      <div className="text-xs text-gray-400 px-2 py-4 text-center leading-relaxed">
        No folders yet.<br />Click <strong>+ New Folder</strong> to start.
      </div>
    );
  }

  return (
    <div onClick={closeMenus}>
      {folders.map((folder) => {
        const isExpanded = expandedFolders.has(folder.slug);
        return (
          <div key={folder.slug} className="mb-1">
            {/* Folder row */}
            <div className="flex items-center gap-1 group rounded-lg hover:bg-gray-50 pr-1">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFolder(folder.slug); }}
                className="flex items-center gap-1.5 flex-1 px-2 py-1.5 text-sm font-medium text-gray-700 min-w-0"
              >
                {isExpanded
                  ? <ChevronDown size={12} className="flex-shrink-0 text-gray-400" />
                  : <ChevronRight size={12} className="flex-shrink-0 text-gray-400" />}
                {isExpanded
                  ? <FolderOpen size={13} className="flex-shrink-0 text-indigo-500" />
                  : <FolderIcon size={13} className="flex-shrink-0 text-gray-400" />}
                <span className="truncate">{folder.name}</span>
              </button>
              <div className="relative flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setFolderMenu(folderMenu === folder.slug ? null : folder.slug); setNoteMenu(null); }}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100"
                >
                  <MoreHorizontal size={13} />
                </button>
                {folderMenu === folder.slug && (
                  <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { closeMenus(); onOpenModal({ type: 'rename-folder', scope, slug: folder.slug, currentName: folder.name }); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <Pencil size={12} /> Rename
                    </button>
                    <button onClick={() => { closeMenus(); onOpenModal({ type: 'new-note', scope, folderSlug: folder.slug }); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <Plus size={12} /> New Note
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { closeMenus(); onOpenModal({ type: 'delete-folder', scope, slug: folder.slug, name: folder.name }); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Notes inside folder */}
            {isExpanded && (
              <div className="ml-5 border-l border-gray-100 pl-2">
                {folder.notes.map((note) => {
                  const isSelected = selectedFolderSlug === folder.slug && selectedNoteSlug === note.slug;
                  const menuKey = `${folder.slug}::${note.slug}`;
                  return (
                    <div key={note.slug} className="flex items-center gap-1 group rounded-lg hover:bg-gray-50 pr-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectNote(folder.slug, note.slug); }}
                        className={`flex items-center gap-1.5 flex-1 px-2 py-1.5 text-sm min-w-0 ${isSelected ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}
                      >
                        <FileText size={11} className="flex-shrink-0 opacity-50" />
                        <span className="truncate">{note.name}</span>
                      </button>
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setNoteMenu(noteMenu === menuKey ? null : menuKey); setFolderMenu(null); }}
                          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={12} />
                        </button>
                        {noteMenu === menuKey && (
                          <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { closeMenus(); onOpenModal({ type: 'rename-note', scope, folderSlug: folder.slug, noteSlug: note.slug, currentName: note.name }); }}
                              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                              <Pencil size={12} /> Rename
                            </button>
                            <button onClick={() => { closeMenus(); onOpenModal({ type: 'move-note', scope, folderSlug: folder.slug, noteSlug: note.slug, noteName: note.name }); }}
                              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                              <MoveRight size={12} /> Move to…
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                            <button onClick={() => { closeMenus(); onOpenModal({ type: 'delete-note', scope, folderSlug: folder.slug, noteSlug: note.slug, name: note.name }); }}
                              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenModal({ type: 'new-note', scope, folderSlug: folder.slug }); }}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                >
                  <Plus size={11} /> New note
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Main Notes component ──────────────────────────────────────────────────────

const Notes: React.FC = () => {
  const [noteContext, setNoteContext] = useState<NoteContext>('daily');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // ── Date-based note state (daily / member) ────────────────────────────────
  const [noteList, setNoteList] = useState<NoteListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayDate());
  const [content, setContent] = useState('');
  const [activePane, setActivePane] = useState<ActivePane>('date');

  // ── Context-folder state (inline folders in daily/member sidebars) ────────
  const [ctxFolders, setCtxFolders] = useState<Folder[]>([]);
  const [expandedCtxFolders, setExpandedCtxFolders] = useState<Set<string>>(new Set());
  const [ctxFolderSlug, setCtxFolderSlug] = useState<string | null>(null);
  const [ctxNoteSlug, setCtxNoteSlug] = useState<string | null>(null);
  const [ctxNoteName, setCtxNoteName] = useState('');

  // ── Month group collapse state ────────────────────────────────────────────
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set(['all'])); // 'all' sentinel = all expanded initially

  // ── Global folders tab state ──────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderSlug, setSelectedFolderSlug] = useState<string | null>(null);
  const [selectedNoteSlug, setSelectedNoteSlug] = useState<string | null>(null);
  const [selectedNoteName, setSelectedNoteName] = useState<string>('');
  const [folderContent, setFolderContent] = useState('');

  // ── Shared UI state ───────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('edit');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalMoveTarget, setModalMoveTarget] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const slug = selectedMember ? nameToSlug(selectedMember.name) : '';
  const isFolders = noteContext === 'folders';

  // ── Team members ──────────────────────────────────────────────────────────
  useEffect(() => {
    getTeam().then((data) => {
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      setMembers(sorted);
      setSelectedMember(sorted[0] ?? null);
    });
  }, []);

  // ── Context folders helpers ───────────────────────────────────────────────

  const refreshCtxFolders = useCallback(async () => {
    if (noteContext === 'folders') return [];
    const ctx = noteContext as 'daily' | 'member';
    const memberSlug = ctx === 'member' ? slug : undefined;
    if (ctx === 'member' && !memberSlug) return [];
    const data = await getCtxFolders(ctx, memberSlug);
    setCtxFolders(data);
    return data;
  }, [noteContext, slug]);

  useEffect(() => {
    if (noteContext !== 'folders') refreshCtxFolders();
  }, [noteContext, slug]);

  const handleSelectCtxNote = useCallback(async (folderSlug: string, noteSlug: string) => {
    setLoading(true);
    setCtxFolderSlug(folderSlug);
    setCtxNoteSlug(noteSlug);
    setActivePane('ctx-folder');
    setSaveStatus('idle');
    try {
      const ctx = noteContext as 'daily' | 'member';
      const note = await getCtxFolderNote(ctx, folderSlug, noteSlug, ctx === 'member' ? slug : undefined);
      setContent(note.content);
      setCtxNoteName(note.name);
    } finally {
      setLoading(false);
    }
  }, [noteContext, slug]);

  // ── Global folders helpers ────────────────────────────────────────────────

  const refreshFolders = useCallback(async () => {
    const data = await getFolders();
    setFolders(data);
    return data;
  }, []);

  useEffect(() => {
    if (noteContext === 'folders') refreshFolders();
  }, [noteContext]);

  const handleSelectGlobalNote = useCallback(async (folderSlug: string, noteSlug: string) => {
    setLoading(true);
    setSelectedFolderSlug(folderSlug);
    setSelectedNoteSlug(noteSlug);
    setSaveStatus('idle');
    try {
      const note = await getFolderNote(folderSlug, noteSlug);
      setFolderContent(note.content);
      setSelectedNoteName(note.name);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Date note helpers ─────────────────────────────────────────────────────

  const refreshList = useCallback(async () => {
    if (noteContext === 'daily') setNoteList(await getNotes());
    else if (noteContext === 'member' && slug) setNoteList(await getMemberNotes(slug));
  }, [noteContext, slug]);

  const loadDateNote = useCallback(async (date: string) => {
    setLoading(true);
    setSelectedDate(date);
    setActivePane('date');
    setSaveStatus('idle');
    setSearch('');
    setSearchResults([]);
    try {
      let note;
      if (noteContext === 'daily') note = await getNote(date);
      else if (noteContext === 'member' && slug) note = await getMemberNote(slug, date);
      else note = { date, content: '' };
      setContent(note.content);
    } finally {
      setLoading(false);
    }
  }, [noteContext, slug]);

  // On context/member change: reload list and today's note, reset to date pane
  useEffect(() => {
    if (noteContext !== 'folders') {
      setActivePane('date');
      setCtxFolderSlug(null);
      setCtxNoteSlug(null);
      refreshList();
      loadDateNote(todayDate());
    }
  }, [noteContext, slug]);

  // ── Auto-initialise expanded months ──────────────────────────────────────
  useEffect(() => {
    if (noteList.length > 0) {
      const groups = groupByMonth(noteList.map((n) => n.date));
      // Expand the most-recent month by default if nothing is explicitly collapsed
      setExpandedMonths((prev) => {
        if (prev.has('all')) {
          // First load: expand all months
          return new Set(groups.map((g) => g.key));
        }
        return prev;
      });
    }
  }, [noteList]);

  // ── Save handlers ─────────────────────────────────────────────────────────

  const scheduleSave = (val: string) => {
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (activePane === 'date') {
        if (noteContext === 'daily') await saveNote(selectedDate, val);
        else if (noteContext === 'member' && slug) await saveMemberNote(slug, selectedDate, val);
        refreshList();
      } else if (activePane === 'ctx-folder' && ctxFolderSlug && ctxNoteSlug) {
        const ctx = noteContext as 'daily' | 'member';
        await saveCtxFolderNote(ctx, ctxFolderSlug, ctxNoteSlug, val, ctx === 'member' ? slug : undefined);
      } else if (isFolders && selectedFolderSlug && selectedNoteSlug) {
        await saveFolderNote(selectedFolderSlug, selectedNoteSlug, val);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
  };

  const handleContentChange = (val: string) => {
    if (isFolders) setFolderContent(val);
    else setContent(val);
    scheduleSave(val);
  };

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearchChange = (q: string) => {
    setSearch(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      let results: NoteSearchResult[] = [];
      if (noteContext === 'daily') results = await searchNotes(q.trim());
      else if (noteContext === 'member' && slug) results = await searchMemberNotes(slug, q.trim());
      setSearchResults(results);
      setSearching(false);
    }, 400);
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const openModal = (m: ModalKind) => {
    setModalInput(
      m.type === 'rename-folder' ? m.currentName :
      m.type === 'rename-note' ? m.currentName : ''
    );
    if (m.type === 'move-note') {
      const pool = m.scope === 'global' ? folders : ctxFolders;
      const others = pool.filter((f) => f.slug !== m.folderSlug);
      setModalMoveTarget(others[0]?.slug ?? '');
    }
    setModal(m);
  };

  const closeModal = () => { setModal(null); setModalInput(''); setModalLoading(false); };

  const handleModalConfirm = async () => {
    if (!modal) return;
    setModalLoading(true);
    const isCtx = modal.scope === 'ctx';
    const ctx = noteContext as 'daily' | 'member';
    const memberSlug = ctx === 'member' ? slug : undefined;

    try {
      if (modal.type === 'new-folder') {
        if (!modalInput.trim()) return;
        if (isCtx) await createCtxFolder(ctx, modalInput.trim(), memberSlug);
        else await createFolder(modalInput.trim());
        isCtx ? await refreshCtxFolders() : await refreshFolders();

      } else if (modal.type === 'rename-folder') {
        if (!modalInput.trim()) return;
        if (isCtx) await renameCtxFolder(ctx, modal.slug, modalInput.trim(), memberSlug);
        else await renameFolder(modal.slug, modalInput.trim());
        isCtx ? await refreshCtxFolders() : await refreshFolders();

      } else if (modal.type === 'delete-folder') {
        if (isCtx) {
          await deleteCtxFolder(ctx, modal.slug, memberSlug);
          if (ctxFolderSlug === modal.slug) { setCtxFolderSlug(null); setCtxNoteSlug(null); setContent(''); setCtxNoteName(''); setActivePane('date'); }
          setExpandedCtxFolders((p) => { const s = new Set(p); s.delete(modal.slug); return s; });
          await refreshCtxFolders();
        } else {
          await deleteFolder(modal.slug);
          if (selectedFolderSlug === modal.slug) { setSelectedFolderSlug(null); setSelectedNoteSlug(null); setFolderContent(''); setSelectedNoteName(''); }
          setExpandedFolders((p) => { const s = new Set(p); s.delete(modal.slug); return s; });
          await refreshFolders();
        }

      } else if (modal.type === 'new-note') {
        if (!modalInput.trim()) return;
        if (isCtx) {
          const note = await createCtxFolderNote(ctx, modal.folderSlug, modalInput.trim(), memberSlug);
          await refreshCtxFolders();
          setExpandedCtxFolders((p) => new Set([...p, modal.folderSlug]));
          setCtxFolderSlug(modal.folderSlug);
          setCtxNoteSlug(note.slug);
          setCtxNoteName(note.name);
          setContent('');
          setActivePane('ctx-folder');
          setSaveStatus('idle');
        } else {
          const note = await createFolderNote(modal.folderSlug, modalInput.trim());
          await refreshFolders();
          setExpandedFolders((p) => new Set([...p, modal.folderSlug]));
          setSelectedFolderSlug(modal.folderSlug);
          setSelectedNoteSlug(note.slug);
          setSelectedNoteName(note.name);
          setFolderContent('');
          setSaveStatus('idle');
        }

      } else if (modal.type === 'rename-note') {
        if (!modalInput.trim()) return;
        if (isCtx) {
          await renameCtxFolderNote(ctx, modal.folderSlug, modal.noteSlug, modalInput.trim(), memberSlug);
          if (ctxFolderSlug === modal.folderSlug && ctxNoteSlug === modal.noteSlug) setCtxNoteName(modalInput.trim());
          await refreshCtxFolders();
        } else {
          await renameFolderNote(modal.folderSlug, modal.noteSlug, modalInput.trim());
          if (selectedFolderSlug === modal.folderSlug && selectedNoteSlug === modal.noteSlug) setSelectedNoteName(modalInput.trim());
          await refreshFolders();
        }

      } else if (modal.type === 'delete-note') {
        if (isCtx) {
          await deleteCtxFolderNote(ctx, modal.folderSlug, modal.noteSlug, memberSlug);
          if (ctxFolderSlug === modal.folderSlug && ctxNoteSlug === modal.noteSlug) { setCtxFolderSlug(null); setCtxNoteSlug(null); setContent(''); setCtxNoteName(''); setActivePane('date'); }
          await refreshCtxFolders();
        } else {
          await deleteFolderNote(modal.folderSlug, modal.noteSlug);
          if (selectedFolderSlug === modal.folderSlug && selectedNoteSlug === modal.noteSlug) { setSelectedFolderSlug(null); setSelectedNoteSlug(null); setFolderContent(''); setSelectedNoteName(''); }
          await refreshFolders();
        }

      } else if (modal.type === 'move-note') {
        if (!modalMoveTarget) return;
        if (isCtx) {
          const result = await moveCtxFolderNote(ctx, modal.folderSlug, modal.noteSlug, modalMoveTarget, memberSlug);
          if (ctxFolderSlug === modal.folderSlug && ctxNoteSlug === modal.noteSlug) { setCtxFolderSlug(result.targetFolderSlug); setCtxNoteSlug(result.newSlug); }
          setExpandedCtxFolders((p) => new Set([...p, modalMoveTarget]));
          await refreshCtxFolders();
        } else {
          const result = await moveFolderNote(modal.folderSlug, modal.noteSlug, modalMoveTarget);
          if (selectedFolderSlug === modal.folderSlug && selectedNoteSlug === modal.noteSlug) { setSelectedFolderSlug(result.targetFolderSlug); setSelectedNoteSlug(result.newSlug); }
          setExpandedFolders((p) => new Set([...p, modalMoveTarget]));
          await refreshFolders();
        }
      }
      closeModal();
    } catch { setModalLoading(false); }
  };

  // ── Derived display values ────────────────────────────────────────────────

  const openToday = () => loadDateNote(todayDate());
  const today = todayDate();
  const isToday = selectedDate === today;
  const noteExists = noteList.some((n) => n.date === selectedDate);
  const groups = groupByMonth(noteList.map((n) => n.date));
  const showSearch = search.trim().length > 0;

  const activeContent = isFolders ? folderContent : content;
  const rightPaneTitle = isFolders
    ? selectedNoteName
    : activePane === 'ctx-folder'
    ? ctxNoteName
    : formatDisplayDate(selectedDate);

  const hasActiveFolderNote = isFolders
    ? selectedFolderSlug !== null && selectedNoteSlug !== null
    : true;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden flex-col">
      {/* ── Context toggle bar ── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-4">
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button
            onClick={() => setNoteContext('daily')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-medium transition-colors ${
              noteContext === 'daily' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <CalendarDays size={14} /> Daily Notes
          </button>
          <button
            onClick={() => setNoteContext('member')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-medium transition-colors ${
              noteContext === 'member' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <User size={14} /> Team Member Notes
          </button>
          <button
            onClick={() => setNoteContext('folders')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-medium transition-colors ${
              noteContext === 'folders' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <FolderOpen size={14} /> Folders
          </button>
        </div>
        {noteContext === 'member' && (
          <select
            value={selectedMember?.id ?? ''}
            onChange={(e) => { const m = members.find((x) => x.id === e.target.value) ?? null; setSelectedMember(m); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[180px]"
          >
            {members.length === 0 && <option value="">No team members</option>}
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.isLeaving ? ' (leaving)' : ''}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">

          {/* ── Folders tab sidebar ── */}
          {isFolders ? (
            <>
              <div className="p-3 border-b border-gray-200">
                <button
                  onClick={() => openModal({ type: 'new-folder', scope: 'global' })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={15} /> New Folder
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <FolderSidebar
                  folders={folders}
                  expandedFolders={expandedFolders}
                  selectedFolderSlug={selectedFolderSlug}
                  selectedNoteSlug={selectedNoteSlug}
                  onToggleFolder={(s) => setExpandedFolders((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; })}
                  onSelectNote={handleSelectGlobalNote}
                  onOpenModal={openModal}
                  scope="global"
                />
              </div>
            </>
          ) : (
            /* ── Daily / Member sidebar ── */
            <>
              {/* Action buttons row */}
              <div className="p-3 border-b border-gray-200 flex items-center gap-2">
                <button
                  onClick={openToday}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isToday && activePane === 'date'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  <NotebookPen size={15} /> Today's Note
                </button>
                <button
                  onClick={() => openModal({ type: 'new-folder', scope: 'ctx' })}
                  title="New folder"
                  className="p-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                >
                  <FolderIcon size={15} />
                </button>
              </div>

              {/* Search */}
              <div className="p-3 border-b border-gray-200">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search notes…"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {noteContext === 'member' && !selectedMember ? (
                  <p className="text-xs text-gray-400 px-2 py-6 text-center">Select a team member above.</p>
                ) : showSearch ? (
                  /* Search results */
                  searching ? (
                    <p className="text-xs text-gray-400 px-2 py-3 text-center">Searching…</p>
                  ) : searchResults.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-3 text-center">No results.</p>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        key={r.date}
                        onClick={() => loadDateNote(r.date)}
                        className={`w-full text-left px-2 py-2 rounded-lg mb-1 transition-colors ${
                          selectedDate === r.date && activePane === 'date' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="text-xs font-semibold mb-0.5">{r.date}</div>
                        <div className="text-xs text-gray-500 line-clamp-2">{r.snippet}</div>
                      </button>
                    ))
                  )
                ) : (
                  <>
                    {/* Custom folders section */}
                    {ctxFolders.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">Folders</p>
                        <FolderSidebar
                          folders={ctxFolders}
                          expandedFolders={expandedCtxFolders}
                          selectedFolderSlug={ctxFolderSlug}
                          selectedNoteSlug={ctxNoteSlug}
                          onToggleFolder={(s) => setExpandedCtxFolders((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; })}
                          onSelectNote={handleSelectCtxNote}
                          onOpenModal={openModal}
                          scope="ctx"
                        />
                        <div className="border-t border-gray-100 mt-2 mb-2" />
                      </div>
                    )}

                    {/* Month-grouped date notes (collapsible) */}
                    {groups.length === 0 ? (
                      <div className="text-xs text-gray-400 px-2 py-6 text-center leading-relaxed">
                        No notes yet.<br />Click <strong>Today's Note</strong> to start.
                      </div>
                    ) : (
                      groups.map((group) => {
                        const isOpen = expandedMonths.has(group.key);
                        return (
                          <div key={group.key} className="mb-2">
                            <button
                              onClick={() => setExpandedMonths((p) => {
                                const n = new Set(p);
                                n.has(group.key) ? n.delete(group.key) : n.add(group.key);
                                return n;
                              })}
                              className="w-full flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              {isOpen
                                ? <ChevronDown size={11} className="text-gray-400 flex-shrink-0" />
                                : <ChevronRight size={11} className="text-gray-400 flex-shrink-0" />}
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{group.label}</span>
                            </button>
                            {isOpen && group.dates.map((date) => (
                              <button
                                key={date}
                                onClick={() => loadDateNote(date)}
                                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                                  selectedDate === date && activePane === 'date'
                                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <FileText size={12} className="flex-shrink-0 opacity-50" />
                                {date}
                              </button>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {isFolders && !hasActiveFolderNote ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm flex-col gap-2">
              <FolderOpen size={32} className="opacity-30" />
              <p>Select a note or create a new one</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">{rightPaneTitle}</h2>
                  {noteContext === 'member' && selectedMember && activePane === 'date' && (
                    <p className="text-xs text-indigo-600 font-medium mt-0.5">{selectedMember.name}</p>
                  )}
                  {activePane === 'ctx-folder' && (
                    <p className="text-xs text-indigo-600 font-medium mt-0.5">
                      {noteContext === 'member' && selectedMember ? `${selectedMember.name} · ` : ''}
                      {ctxFolders.find((f) => f.slug === ctxFolderSlug)?.name ?? ''}
                    </p>
                  )}
                  {!isFolders && activePane === 'date' && !noteExists && !loading && content === '' && (
                    <p className="text-xs text-gray-400 mt-0.5">New note — start typing to save automatically</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span className="text-xs w-20 text-right">
                    {saveStatus === 'saving' && (
                      <span className="flex items-center justify-end gap-1 text-amber-500">
                        <Loader2 size={11} className="animate-spin" /> Saving…
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="flex items-center justify-end gap-1 text-green-600">
                        <Check size={11} /> Saved
                      </span>
                    )}
                  </span>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
                    {([['edit', Edit3, 'Edit'], ['split', Columns, 'Split'], ['preview', Eye, 'Preview']] as [Mode, React.ElementType, string][]).map(([m, Icon, label]) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        title={label}
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                          mode === m ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Editor / Preview */}
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
              ) : (
                <div className="flex-1 flex min-h-0">
                  {(mode === 'edit' || mode === 'split') && (
                    <div className={`flex flex-col ${mode === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'}`}>
                      <textarea
                        value={activeContent}
                        onChange={(e) => handleContentChange(e.target.value)}
                        placeholder={
                          isFolders || activePane === 'ctx-folder'
                            ? `# ${rightPaneTitle}\n\nStart writing in Markdown…`
                            : `# Notes for ${selectedDate}\n\nStart writing in Markdown…`
                        }
                        spellCheck
                        className="flex-1 w-full p-6 text-sm font-mono leading-relaxed text-gray-800 bg-white resize-none focus:outline-none"
                      />
                    </div>
                  )}
                  {(mode === 'preview' || mode === 'split') && (
                    <div className={`overflow-y-auto p-6 bg-white ${mode === 'split' ? 'w-1/2' : 'w-full'}`}>
                      {activeContent.trim() ? (
                        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-indigo-600">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm italic">Nothing to preview yet.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal && (
        <>
          {(modal.type === 'new-folder') && (
            <SimpleModal title="New Folder" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Create" confirmDisabled={!modalInput.trim() || modalLoading}>
              <input autoFocus type="text" placeholder="Folder name" value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </SimpleModal>
          )}
          {modal.type === 'rename-folder' && (
            <SimpleModal title="Rename Folder" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Rename" confirmDisabled={!modalInput.trim() || modalLoading}>
              <input autoFocus type="text" value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </SimpleModal>
          )}
          {modal.type === 'delete-folder' && (
            <SimpleModal title="Delete Folder" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Delete" danger confirmDisabled={modalLoading}>
              <p className="text-sm text-gray-600">Delete <strong>{modal.name}</strong> and all its notes? This cannot be undone.</p>
            </SimpleModal>
          )}
          {modal.type === 'new-note' && (
            <SimpleModal title="New Note" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Create" confirmDisabled={!modalInput.trim() || modalLoading}>
              <input autoFocus type="text" placeholder="Note name" value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </SimpleModal>
          )}
          {modal.type === 'rename-note' && (
            <SimpleModal title="Rename Note" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Rename" confirmDisabled={!modalInput.trim() || modalLoading}>
              <input autoFocus type="text" value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </SimpleModal>
          )}
          {modal.type === 'delete-note' && (
            <SimpleModal title="Delete Note" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Delete" danger confirmDisabled={modalLoading}>
              <p className="text-sm text-gray-600">Delete <strong>{modal.name}</strong>? This cannot be undone.</p>
            </SimpleModal>
          )}
          {modal.type === 'move-note' && (
            <SimpleModal title="Move Note" onClose={closeModal} onConfirm={handleModalConfirm}
              confirmLabel="Move" confirmDisabled={!modalMoveTarget || modalLoading}>
              <p className="text-sm text-gray-600 mb-3">Move <strong>{modal.noteName}</strong> to:</p>
              <select value={modalMoveTarget} onChange={(e) => setModalMoveTarget(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {(modal.scope === 'global' ? folders : ctxFolders)
                  .filter((f) => f.slug !== modal.folderSlug)
                  .map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
              </select>
            </SimpleModal>
          )}
        </>
      )}
    </div>
  );
};

export default Notes;
