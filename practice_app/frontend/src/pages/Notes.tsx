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
} from '../api/client';
import type { NoteListItem, NoteSearchResult, TeamMember, Folder, FolderNote } from '../types';

type Mode = 'edit' | 'split' | 'preview';
type SaveStatus = 'idle' | 'saving' | 'saved';
type NoteContext = 'daily' | 'member' | 'folders';

type ModalKind =
  | { type: 'new-folder' }
  | { type: 'rename-folder'; slug: string; currentName: string }
  | { type: 'delete-folder'; slug: string; name: string }
  | { type: 'new-note'; folderSlug: string }
  | { type: 'rename-note'; folderSlug: string; noteSlug: string; currentName: string }
  | { type: 'delete-note'; folderSlug: string; noteSlug: string; name: string }
  | { type: 'move-note'; folderSlug: string; noteSlug: string; noteName: string };

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

function groupByMonth(dates: string[]): { label: string; dates: string[] }[] {
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
    return { label, dates: ds };
  });
}

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ── Small reusable modal ──────────────────────────────────────────────────────

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
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 ${
            danger
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ── Folder context sidebar ────────────────────────────────────────────────────

interface FolderSidebarProps {
  folders: Folder[];
  expandedFolders: Set<string>;
  selectedFolderSlug: string | null;
  selectedNoteSlug: string | null;
  onToggleFolder: (slug: string) => void;
  onSelectNote: (folderSlug: string, noteSlug: string) => void;
  onOpenModal: (modal: ModalKind) => void;
}

const FolderSidebar: React.FC<FolderSidebarProps> = ({
  folders, expandedFolders, selectedFolderSlug, selectedNoteSlug,
  onToggleFolder, onSelectNote, onOpenModal,
}) => {
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [noteMenu, setNoteMenu] = useState<string | null>(null);

  const closeMenus = () => { setFolderMenu(null); setNoteMenu(null); };

  return (
    <div className="flex-1 overflow-y-auto p-2" onClick={closeMenus}>
      {folders.length === 0 ? (
        <div className="text-xs text-gray-400 px-2 py-6 text-center leading-relaxed">
          No folders yet.<br />Click <strong>+ New Folder</strong> to start.
        </div>
      ) : (
        folders.map((folder) => {
          const isExpanded = expandedFolders.has(folder.slug);
          return (
            <div key={folder.slug} className="mb-1">
              {/* Folder row */}
              <div className="flex items-center gap-1 group rounded-lg hover:bg-gray-50 pr-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFolder(folder.slug); }}
                  className="flex items-center gap-1.5 flex-1 px-2 py-1.5 text-sm font-medium text-gray-700 min-w-0"
                >
                  {isExpanded ? <ChevronDown size={12} className="flex-shrink-0 text-gray-400" /> : <ChevronRight size={12} className="flex-shrink-0 text-gray-400" />}
                  {isExpanded ? <FolderOpen size={13} className="flex-shrink-0 text-indigo-500" /> : <FolderIcon size={13} className="flex-shrink-0 text-gray-400" />}
                  <span className="truncate">{folder.name}</span>
                </button>
                <div className="relative flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setFolderMenu(folderMenu === folder.slug ? null : folder.slug); setNoteMenu(null); }}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100"
                    title="Folder actions"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  {folderMenu === folder.slug && (
                    <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => { closeMenus(); onOpenModal({ type: 'rename-folder', slug: folder.slug, currentName: folder.name }); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil size={12} /> Rename
                      </button>
                      <button
                        onClick={() => { closeMenus(); onOpenModal({ type: 'new-note', folderSlug: folder.slug }); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Plus size={12} /> New Note
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { closeMenus(); onOpenModal({ type: 'delete-folder', slug: folder.slug, name: folder.name }); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
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
                          className={`flex items-center gap-1.5 flex-1 px-2 py-1.5 text-sm min-w-0 ${
                            isSelected ? 'text-indigo-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          <FileText size={11} className="flex-shrink-0 opacity-50" />
                          <span className="truncate">{note.name}</span>
                        </button>
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setNoteMenu(noteMenu === menuKey ? null : menuKey); setFolderMenu(null); }}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100"
                            title="Note actions"
                          >
                            <MoreHorizontal size={12} />
                          </button>
                          {noteMenu === menuKey && (
                            <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => { closeMenus(); onOpenModal({ type: 'rename-note', folderSlug: folder.slug, noteSlug: note.slug, currentName: note.name }); }}
                                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil size={12} /> Rename
                              </button>
                              <button
                                onClick={() => { closeMenus(); onOpenModal({ type: 'move-note', folderSlug: folder.slug, noteSlug: note.slug, noteName: note.name }); }}
                                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <MoveRight size={12} /> Move to…
                              </button>
                              <div className="border-t border-gray-100 my-1" />
                              <button
                                onClick={() => { closeMenus(); onOpenModal({ type: 'delete-note', folderSlug: folder.slug, noteSlug: note.slug, name: note.name }); }}
                                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Add note button inside folder */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenModal({ type: 'new-note', folderSlug: folder.slug }); }}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  >
                    <Plus size={11} /> New note
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

// ── Main Notes component ──────────────────────────────────────────────────────

const Notes: React.FC = () => {
  const [noteContext, setNoteContext] = useState<NoteContext>('daily');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Daily / member state
  const [noteList, setNoteList] = useState<NoteListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayDate());
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<Mode>('edit');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);

  // Folders state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderSlug, setSelectedFolderSlug] = useState<string | null>(null);
  const [selectedNoteSlug, setSelectedNoteSlug] = useState<string | null>(null);
  const [selectedNoteName, setSelectedNoteName] = useState<string>('');
  const [folderContent, setFolderContent] = useState('');

  // Modal state
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalMoveTarget, setModalMoveTarget] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch team members once
  useEffect(() => {
    getTeam().then((data) => {
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      setMembers(sorted);
      setSelectedMember(sorted[0] ?? null);
    });
  }, []);

  const slug = selectedMember ? nameToSlug(selectedMember.name) : '';

  // ── Folders helpers ──────────────────────────────────────────────────────

  const refreshFolders = useCallback(async () => {
    const data = await getFolders();
    setFolders(data);
    return data;
  }, []);

  useEffect(() => {
    if (noteContext === 'folders') refreshFolders();
  }, [noteContext]);

  const handleSelectNote = useCallback(async (folderSlug: string, noteSlug: string) => {
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

  const handleFolderContentChange = (val: string) => {
    setFolderContent(val);
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (selectedFolderSlug && selectedNoteSlug) {
        await saveFolderNote(selectedFolderSlug, selectedNoteSlug, val);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
  };

  // ── Modal handlers ───────────────────────────────────────────────────────

  const openModal = (m: ModalKind) => {
    setModalInput(
      m.type === 'rename-folder' ? m.currentName :
      m.type === 'rename-note' ? m.currentName : ''
    );
    if (m.type === 'move-note') {
      const others = folders.filter((f) => f.slug !== m.folderSlug);
      setModalMoveTarget(others[0]?.slug ?? '');
    }
    setModal(m);
  };

  const closeModal = () => { setModal(null); setModalInput(''); setModalLoading(false); };

  const handleModalConfirm = async () => {
    if (!modal) return;
    setModalLoading(true);
    try {
      if (modal.type === 'new-folder') {
        if (!modalInput.trim()) return;
        await createFolder(modalInput.trim());
        await refreshFolders();
      } else if (modal.type === 'rename-folder') {
        if (!modalInput.trim()) return;
        await renameFolder(modal.slug, modalInput.trim());
        await refreshFolders();
      } else if (modal.type === 'delete-folder') {
        await deleteFolder(modal.slug);
        if (selectedFolderSlug === modal.slug) {
          setSelectedFolderSlug(null);
          setSelectedNoteSlug(null);
          setFolderContent('');
          setSelectedNoteName('');
        }
        setExpandedFolders((prev) => { const s = new Set(prev); s.delete(modal.slug); return s; });
        await refreshFolders();
      } else if (modal.type === 'new-note') {
        if (!modalInput.trim()) return;
        const note = await createFolderNote(modal.folderSlug, modalInput.trim());
        const data = await refreshFolders();
        setExpandedFolders((prev) => new Set([...prev, modal.folderSlug]));
        // Auto-select the new note
        setSelectedFolderSlug(modal.folderSlug);
        setSelectedNoteSlug(note.slug);
        setSelectedNoteName(note.name);
        setFolderContent('');
        setSaveStatus('idle');
      } else if (modal.type === 'rename-note') {
        if (!modalInput.trim()) return;
        await renameFolderNote(modal.folderSlug, modal.noteSlug, modalInput.trim());
        if (selectedFolderSlug === modal.folderSlug && selectedNoteSlug === modal.noteSlug) {
          setSelectedNoteName(modalInput.trim());
        }
        await refreshFolders();
      } else if (modal.type === 'delete-note') {
        await deleteFolderNote(modal.folderSlug, modal.noteSlug);
        if (selectedFolderSlug === modal.folderSlug && selectedNoteSlug === modal.noteSlug) {
          setSelectedFolderSlug(null);
          setSelectedNoteSlug(null);
          setFolderContent('');
          setSelectedNoteName('');
        }
        await refreshFolders();
      } else if (modal.type === 'move-note') {
        if (!modalMoveTarget) return;
        const result = await moveFolderNote(modal.folderSlug, modal.noteSlug, modalMoveTarget);
        if (selectedFolderSlug === modal.folderSlug && selectedNoteSlug === modal.noteSlug) {
          setSelectedFolderSlug(result.targetFolderSlug);
          setSelectedNoteSlug(result.newSlug);
        }
        setExpandedFolders((prev) => new Set([...prev, modalMoveTarget]));
        await refreshFolders();
      }
      closeModal();
    } catch {
      setModalLoading(false);
    }
  };

  // ── Daily / member helpers ───────────────────────────────────────────────

  const refreshList = useCallback(async () => {
    if (noteContext === 'daily') {
      setNoteList(await getNotes());
    } else if (noteContext === 'member' && slug) {
      setNoteList(await getMemberNotes(slug));
    }
  }, [noteContext, slug]);

  const loadNote = useCallback(async (date: string) => {
    setLoading(true);
    setSelectedDate(date);
    setSaveStatus('idle');
    setSearch('');
    setSearchResults([]);
    try {
      let note;
      if (noteContext === 'daily') {
        note = await getNote(date);
      } else if (noteContext === 'member' && slug) {
        note = await getMemberNote(slug, date);
      } else {
        note = { date, content: '' };
      }
      setContent(note.content);
    } finally {
      setLoading(false);
    }
  }, [noteContext, slug]);

  useEffect(() => {
    if (noteContext !== 'folders') {
      refreshList();
      loadNote(todayDate());
    }
  }, [noteContext, slug]);

  const handleContentChange = (val: string) => {
    setContent(val);
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (noteContext === 'daily') {
        await saveNote(selectedDate, val);
      } else if (noteContext === 'member' && slug) {
        await saveMemberNote(slug, selectedDate, val);
      }
      setSaveStatus('saved');
      refreshList();
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
  };

  const handleSearchChange = (q: string) => {
    setSearch(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      let results: NoteSearchResult[];
      if (noteContext === 'daily') {
        results = await searchNotes(q.trim());
      } else if (noteContext === 'member' && slug) {
        results = await searchMemberNotes(slug, q.trim());
      } else {
        results = [];
      }
      setSearchResults(results);
      setSearching(false);
    }, 400);
  };

  const openToday = () => loadNote(todayDate());
  const today = todayDate();
  const isToday = selectedDate === today;
  const noteExists = noteList.some((n) => n.date === selectedDate);
  const groups = groupByMonth(noteList.map((n) => n.date));
  const showSearch = search.trim().length > 0;

  // ── Render ───────────────────────────────────────────────────────────────

  const isFolders = noteContext === 'folders';
  const activeContent = isFolders ? folderContent : content;
  const handleActiveContentChange = isFolders ? handleFolderContentChange : handleContentChange;
  const hasActiveNote = isFolders ? (selectedFolderSlug !== null && selectedNoteSlug !== null) : true;

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
            <CalendarDays size={14} />
            Daily Notes
          </button>
          <button
            onClick={() => setNoteContext('member')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-medium transition-colors ${
              noteContext === 'member' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <User size={14} />
            Team Member Notes
          </button>
          <button
            onClick={() => setNoteContext('folders')}
            className={`flex items-center gap-1.5 px-4 py-1.5 font-medium transition-colors ${
              noteContext === 'folders' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <FolderOpen size={14} />
            Folders
          </button>
        </div>

        {noteContext === 'member' && (
          <select
            value={selectedMember?.id ?? ''}
            onChange={(e) => {
              const m = members.find((x) => x.id === e.target.value) ?? null;
              setSelectedMember(m);
            }}
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
          {/* Top action */}
          <div className="p-3 border-b border-gray-200">
            {isFolders ? (
              <button
                onClick={() => openModal({ type: 'new-folder' })}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
              >
                <Plus size={15} />
                New Folder
              </button>
            ) : (
              <button
                onClick={openToday}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isToday ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
              >
                <NotebookPen size={15} />
                Today's Note
              </button>
            )}
          </div>

          {/* Search (daily/member only) */}
          {!isFolders && (
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
          )}

          {/* Note / folder list */}
          {isFolders ? (
            <FolderSidebar
              folders={folders}
              expandedFolders={expandedFolders}
              selectedFolderSlug={selectedFolderSlug}
              selectedNoteSlug={selectedNoteSlug}
              onToggleFolder={(s) => setExpandedFolders((prev) => {
                const next = new Set(prev);
                next.has(s) ? next.delete(s) : next.add(s);
                return next;
              })}
              onSelectNote={handleSelectNote}
              onOpenModal={openModal}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-2">
              {noteContext === 'member' && !selectedMember ? (
                <p className="text-xs text-gray-400 px-2 py-6 text-center">Select a team member above.</p>
              ) : showSearch ? (
                searching ? (
                  <p className="text-xs text-gray-400 px-2 py-3 text-center">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-3 text-center">No results.</p>
                ) : (
                  searchResults.map((r) => (
                    <button
                      key={r.date}
                      onClick={() => loadNote(r.date)}
                      className={`w-full text-left px-2 py-2 rounded-lg mb-1 transition-colors ${
                        selectedDate === r.date ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="text-xs font-semibold mb-0.5">{r.date}</div>
                      <div className="text-xs text-gray-500 line-clamp-2">{r.snippet}</div>
                    </button>
                  ))
                )
              ) : groups.length === 0 ? (
                <div className="text-xs text-gray-400 px-2 py-6 text-center leading-relaxed">
                  No notes yet.<br />Click <strong>Today's Note</strong> to start.
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">{group.label}</p>
                    {group.dates.map((date) => (
                      <button
                        key={date}
                        onClick={() => loadNote(date)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                          selectedDate === date ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <FileText size={12} className="flex-shrink-0 opacity-50" />
                        {date}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {isFolders && !hasActiveNote ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm flex-col gap-2">
              <FolderOpen size={32} className="opacity-30" />
              <p>Select a note or create a new one</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    {isFolders ? selectedNoteName : formatDisplayDate(selectedDate)}
                  </h2>
                  {noteContext === 'member' && selectedMember && (
                    <p className="text-xs text-indigo-600 font-medium mt-0.5">{selectedMember.name}</p>
                  )}
                  {!isFolders && !noteExists && !loading && content === '' && (
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
                    {(
                      [['edit', Edit3, 'Edit'], ['split', Columns, 'Split'], ['preview', Eye, 'Preview']] as [Mode, React.ElementType, string][]
                    ).map(([m, Icon, label]) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        title={label}
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                          mode === m ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={13} />
                        {label}
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
                        onChange={(e) => handleActiveContentChange(e.target.value)}
                        placeholder={isFolders ? `# ${selectedNoteName}\n\nStart writing in Markdown…` : `# Notes for ${selectedDate}\n\nStart writing in Markdown…`}
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
            <SimpleModal
              title="New Folder"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Create"
              confirmDisabled={!modalInput.trim() || modalLoading}
            >
              <input
                autoFocus
                type="text"
                placeholder="Folder name"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </SimpleModal>
          )}

          {modal.type === 'rename-folder' && (
            <SimpleModal
              title="Rename Folder"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Rename"
              confirmDisabled={!modalInput.trim() || modalLoading}
            >
              <input
                autoFocus
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </SimpleModal>
          )}

          {modal.type === 'delete-folder' && (
            <SimpleModal
              title="Delete Folder"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Delete"
              danger
              confirmDisabled={modalLoading}
            >
              <p className="text-sm text-gray-600">
                Delete <strong>{modal.name}</strong> and all its notes? This cannot be undone.
              </p>
            </SimpleModal>
          )}

          {modal.type === 'new-note' && (
            <SimpleModal
              title="New Note"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Create"
              confirmDisabled={!modalInput.trim() || modalLoading}
            >
              <input
                autoFocus
                type="text"
                placeholder="Note name"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </SimpleModal>
          )}

          {modal.type === 'rename-note' && (
            <SimpleModal
              title="Rename Note"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Rename"
              confirmDisabled={!modalInput.trim() || modalLoading}
            >
              <input
                autoFocus
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalConfirm()}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </SimpleModal>
          )}

          {modal.type === 'delete-note' && (
            <SimpleModal
              title="Delete Note"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Delete"
              danger
              confirmDisabled={modalLoading}
            >
              <p className="text-sm text-gray-600">
                Delete <strong>{modal.name}</strong>? This cannot be undone.
              </p>
            </SimpleModal>
          )}

          {modal.type === 'move-note' && (
            <SimpleModal
              title="Move Note"
              onClose={closeModal}
              onConfirm={handleModalConfirm}
              confirmLabel="Move"
              confirmDisabled={!modalMoveTarget || modalLoading}
            >
              <p className="text-sm text-gray-600 mb-3">Move <strong>{modal.noteName}</strong> to:</p>
              <select
                value={modalMoveTarget}
                onChange={(e) => setModalMoveTarget(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {folders
                  .filter((f) => f.slug !== (modal as { folderSlug: string }).folderSlug)
                  .map((f) => (
                    <option key={f.slug} value={f.slug}>{f.name}</option>
                  ))}
              </select>
            </SimpleModal>
          )}
        </>
      )}
    </div>
  );
};

export default Notes;

