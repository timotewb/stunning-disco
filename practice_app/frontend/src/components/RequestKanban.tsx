import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import type { WorkRequest, RequestStatusConfig, RequestSourceConfig, RequestPriorityConfig, TeamMember } from '../types';

interface Props {
  requests: WorkRequest[];
  statuses: RequestStatusConfig[];
  sources: RequestSourceConfig[];
  priorities: RequestPriorityConfig[];
  team: TeamMember[];
  onOpenRequest: (r: WorkRequest) => void;
  onStatusChange: (id: string, newStatus: string) => void;
}

const COLOUR_MAP: Record<string, { bg: string; text: string }> = {
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  green:   { bg: 'bg-green-100',   text: 'text-green-700'   },
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-700'    },
  purple:  { bg: 'bg-purple-100',  text: 'text-purple-700'  },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-700'  },
  cyan:    { bg: 'bg-cyan-100',    text: 'text-cyan-700'    },
  gray:    { bg: 'bg-gray-100',    text: 'text-gray-600'    },
};

const PALETTE: Record<string, string> = {
  indigo: '#6366f1', rose: '#f43f5e', amber: '#f59e0b', green: '#22c55e',
  blue: '#3b82f6', teal: '#14b8a6', purple: '#a855f7', orange: '#f97316',
  cyan: '#06b6d4', gray: '#9ca3af',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500', high: 'bg-amber-400', medium: 'bg-indigo-400', low: 'bg-gray-300',
};

const RequestKanban: React.FC<Props> = ({
  requests, statuses, sources, priorities, team, onOpenRequest, onStatusChange,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const teamById = Object.fromEntries(team.map((m) => [m.id, m]));
  const sourceColorMap = Object.fromEntries(sources.map((s) => [s.name, s.color]));

  const byStatus = (status: string) => requests.filter((r) => r.status === status);

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-2">
      {statuses.map((status) => {
        const cards = byStatus(status.name);
        const colColor = PALETTE[status.color] ?? PALETTE.gray;
        const isDragTarget = dragOverStatus === status.name;

        return (
          <div
            key={status.id}
            className={`flex flex-col min-w-[240px] w-60 flex-shrink-0 rounded-xl border transition-colors ${
              isDragTarget ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status.name); }}
            onDragLeave={() => setDragOverStatus(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingId) {
                onStatusChange(draggingId, status.name);
                setDraggingId(null);
              }
              setDragOverStatus(null);
            }}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colColor }} />
              <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{status.name}</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                COLOUR_MAP[status.color]?.bg ?? 'bg-gray-100'
              } ${COLOUR_MAP[status.color]?.text ?? 'text-gray-600'}`}>
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-220px)]">
              {cards.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No requests</p>
              ) : (
                cards.map((r) => {
                  const assignee = r.assigneeId ? teamById[r.assigneeId] : null;
                  const srcColor = sourceColorMap[r.source] ?? 'gray';
                  const dotClass = PRIORITY_DOT[r.priority?.toLowerCase()] ?? 'bg-gray-300';

                  return (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={() => setDraggingId(r.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => onOpenRequest(r)}
                      className={`bg-white border rounded-lg px-3 py-2.5 cursor-pointer hover:shadow-sm transition-shadow select-none ${
                        draggingId === r.id ? 'opacity-50 shadow-lg' : 'border-gray-200'
                      }`}
                    >
                      {/* Source + priority row */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          COLOUR_MAP[srcColor]?.bg ?? 'bg-gray-100'
                        } ${COLOUR_MAP[srcColor]?.text ?? 'text-gray-600'}`}>
                          {r.source}
                        </span>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ml-auto ${dotClass}`} title={r.priority} />
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{r.title}</p>

                      {/* Footer */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {assignee && (
                          <span className="text-xs text-gray-500 flex-1 truncate">{assignee.name}</span>
                        )}
                        {r.isAllocated && (
                          <Calendar size={12} className="text-green-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RequestKanban;
