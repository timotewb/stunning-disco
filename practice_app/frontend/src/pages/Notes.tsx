import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, Eye, Edit3, Columns, Check, Loader2, NotebookPen, FileText } from 'lucide-react';
import { getNotes, getNote, saveNote, searchNotes } from '../api/client';
import type { NoteListItem, NoteSearchResult } from '../types';

type Mode = 'edit' | 'split' | 'preview';
type SaveStatus = 'idle' | 'saving' | 'saved';

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
    const label = new Date(year, month - 1, 1).toLocaleDateString('en', {
      month: 'long',
      year: 'numeric',
    });
    return { label, dates: ds };
  });
}

const Notes: React.FC = () => {
  const [noteList, setNoteList] = useState<NoteListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayDate());
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<Mode>('edit');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = useCallback(async () => {
    const list = await getNotes();
    setNoteList(list);
  }, []);

  const loadNote = useCallback(async (date: string) => {
    setLoading(true);
    setSelectedDate(date);
    setSaveStatus('idle');
    try {
      const note = await getNote(date);
      setContent(note.content);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
    loadNote(todayDate());
  }, []);

  const handleContentChange = (val: string) => {
    setContent(val);
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await saveNote(selectedDate, val);
      setSaveStatus('saved');
      refreshList();
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
  };

  const handleSearchChange = (q: string) => {
    setSearch(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchNotes(q.trim());
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Today button */}
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={openToday}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isToday
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
            }`}
          >
            <NotebookPen size={15} />
            Today's Note
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

        {/* Note list */}
        <div className="flex-1 overflow-y-auto p-2">
          {showSearch ? (
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
                    selectedDate === r.date
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="text-xs font-semibold mb-0.5">{r.date}</div>
                  <div className="text-xs text-gray-500 line-clamp-2">{r.snippet}</div>
                </button>
              ))
            )
          ) : groups.length === 0 ? (
            <div className="text-xs text-gray-400 px-2 py-6 text-center leading-relaxed">
              No notes yet.
              <br />
              Click <strong>Today's Note</strong> to start.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">
                  {group.label}
                </p>
                {group.dates.map((date) => (
                  <button
                    key={date}
                    onClick={() => loadNote(date)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedDate === date
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
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
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">
              {formatDisplayDate(selectedDate)}
            </h2>
            {!noteExists && !loading && content === '' && (
              <p className="text-xs text-gray-400 mt-0.5">New note — start typing to save automatically</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            {/* Save status indicator */}
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

            {/* Mode toggle */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
              {(
                [
                  ['edit', Edit3, 'Edit'],
                  ['split', Columns, 'Split'],
                  ['preview', Eye, 'Preview'],
                ] as [Mode, React.ElementType, string][]
              ).map(([m, Icon, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={label}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                    mode === m
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-500 hover:bg-gray-50'
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
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Loading…
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Editor pane */}
            {(mode === 'edit' || mode === 'split') && (
              <div
                className={`flex flex-col ${
                  mode === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'
                }`}
              >
                <textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder={`# Notes for ${selectedDate}\n\nStart writing in Markdown…`}
                  spellCheck
                  className="flex-1 w-full p-6 text-sm font-mono leading-relaxed text-gray-800 bg-white resize-none focus:outline-none"
                />
              </div>
            )}

            {/* Preview pane */}
            {(mode === 'preview' || mode === 'split') && (
              <div
                className={`overflow-y-auto p-6 bg-white ${
                  mode === 'split' ? 'w-1/2' : 'w-full'
                }`}
              >
                {content.trim() ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-indigo-600">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm italic">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notes;
