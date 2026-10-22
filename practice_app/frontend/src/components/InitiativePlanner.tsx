import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import type { Confidence, Initiative, InitiativeProject, RoleDemand } from '../types';
import { CONFIDENCE_LEVELS } from '../types';
import {
  createInitiative, createProject, createRoleDemand,
  deleteInitiative, deleteProject, deleteRoleDemand,
  getDemandRoles, getInitiatives,
  updateInitiative, updateProject, updateRoleDemand,
} from '../api/client';

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  committed: 'Committed',
  probable: 'Probable',
  candidate: 'Candidate',
};

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  committed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  probable: 'bg-amber-50 text-amber-700 border-amber-200',
  candidate: 'bg-gray-100 text-gray-600 border-gray-200',
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sensible default window for a new demand: today, for three months. */
function defaultDemandDates(project: InitiativeProject): { startDate: string; endDate: string } {
  if (project.startDate && project.endDate) {
    return { startDate: project.startDate.slice(0, 10), endDate: project.endDate.slice(0, 10) };
  }
  const start = new Date();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 3);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

interface Props {
  onClose: () => void;
  /** Called after any change, so the chart behind can refresh. */
  onChanged: () => void;
}

const InitiativePlanner: React.FC<Props> = ({ onClose, onChanged }) => {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, roleList] = await Promise.all([getInitiatives(), getDemandRoles()]);
      setInitiatives(list);
      setRoles(roleList);
      setError('');
    } catch {
      setError('Failed to load the pipeline.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every mutation refreshes from the server rather than patching local state,
  // so the tree can never drift from what the chart is computed against.
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setError('');
        await load();
        onChanged();
      } catch (e) {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'That change could not be saved.');
      }
    },
    [load, onChanged]
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalDemand = useMemo(
    () =>
      initiatives.reduce(
        (acc, i) => acc + i.projects.reduce((a, p) => a + p.roleDemands.length, 0),
        0
      ),
    [initiatives]
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-full flex flex-col">
        <div className="px-8 pt-8 pb-5 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Delivery pipeline</h2>
            <p className="text-sm text-gray-500 mt-1">
              Initiatives and their projects, with the roles each will need. This is the
              forward ask — nobody is assigned to it yet.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-2">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
          ) : initiatives.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500">No initiatives yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Add one to start mapping future demand against your team's capacity.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {initiatives.map((init) => (
                <InitiativeRow
                  key={init.id}
                  initiative={init}
                  roles={roles}
                  expanded={expanded}
                  onToggle={toggle}
                  run={run}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => run(() => createInitiative({ name: 'New initiative' }))}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50"
          >
            <Plus size={15} /> Add initiative
          </button>
        </div>

        <div className="px-8 py-5 shrink-0 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {initiatives.length} {initiatives.length === 1 ? 'initiative' : 'initiatives'},{' '}
            {totalDemand} {totalDemand === 1 ? 'role demand' : 'role demands'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Initiative ───────────────────────────────────────────────────────────────

const InitiativeRow: React.FC<{
  initiative: Initiative;
  roles: string[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}> = ({ initiative, roles, expanded, onToggle, run }) => {
  const open = expanded.has(initiative.id);
  const demandCount = initiative.projects.reduce((a, p) => a + p.roleDemands.length, 0);
  const totalFte = initiative.projects.reduce(
    (a, p) => a + p.roleDemands.reduce((x, d) => x + (d.fulfilledByRequestId ? 0 : d.fte), 0),
    0
  );

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
        <button onClick={() => onToggle(initiative.id)} className="text-gray-400 hover:text-gray-600">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <input
          value={initiative.name}
          onChange={(e) => run(() => updateInitiative(initiative.id, { name: e.target.value }))}
          className="flex-1 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none focus:bg-white focus:px-2 focus:py-1 focus:rounded"
        />
        <select
          value={initiative.confidence}
          onChange={(e) =>
            run(() => updateInitiative(initiative.id, { confidence: e.target.value as Confidence }))
          }
          className={`text-xs border rounded-full px-2.5 py-1 font-medium ${CONFIDENCE_STYLES[initiative.confidence]}`}
        >
          {CONFIDENCE_LEVELS.map((c) => (
            <option key={c} value={c}>
              {CONFIDENCE_LABELS[c]}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500 tabular-nums w-24 text-right">
          {totalFte.toFixed(1)} FTE · {demandCount}
        </span>
        <button
          onClick={() => {
            if (
              confirm(
                `Delete "${initiative.name}"? Its projects and role demands will go with it.`
              )
            ) {
              run(() => deleteInitiative(initiative.id));
            }
          }}
          className="text-gray-300 hover:text-red-500"
          aria-label="Delete initiative"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {open && (
        <div className="p-3 space-y-2">
          {initiative.projects.map((p) => (
            <ProjectRow key={p.id} project={p} roles={roles} run={run} />
          ))}
          <button
            onClick={() =>
              run(() => createProject({ initiativeId: initiative.id, name: 'New project' }))
            }
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Plus size={13} /> Add project
          </button>
        </div>
      )}
    </div>
  );
};

// ── Project ──────────────────────────────────────────────────────────────────

const ProjectRow: React.FC<{
  project: InitiativeProject;
  roles: string[];
  run: (fn: () => Promise<unknown>) => Promise<void>;
}> = ({ project, roles, run }) => (
  <div className="border border-gray-200 rounded-lg">
    <div className="flex items-center gap-2 px-3 py-2">
      <input
        value={project.name}
        onChange={(e) => run(() => updateProject(project.id, { name: e.target.value }))}
        className="flex-1 bg-transparent text-sm text-gray-700 focus:outline-none"
      />
      <button
        onClick={() => {
          if (confirm(`Delete "${project.name}" and its role demands?`)) {
            run(() => deleteProject(project.id));
          }
        }}
        className="text-gray-300 hover:text-red-500"
        aria-label="Delete project"
      >
        <Trash2 size={14} />
      </button>
    </div>

    <div className="px-3 pb-3 space-y-1.5">
      {project.roleDemands.length > 0 && (
        <div className="grid grid-cols-[1fr_72px_120px_120px_28px] gap-2 text-[10px] uppercase tracking-wide text-gray-400 px-1">
          <span>Role</span>
          <span>FTE</span>
          <span>From</span>
          <span>To</span>
          <span />
        </div>
      )}
      {project.roleDemands.map((d) => (
        <DemandRow key={d.id} demand={d} roles={roles} run={run} />
      ))}
      <button
        onClick={() =>
          run(() =>
            createRoleDemand({
              projectId: project.id,
              role: roles[0] ?? 'Engineer',
              fte: 1,
              ...defaultDemandDates(project),
            })
          )
        }
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-400 hover:text-indigo-600"
      >
        <Plus size={12} /> Add role demand
      </button>
    </div>
  </div>
);

// ── Role demand ──────────────────────────────────────────────────────────────

const DemandRow: React.FC<{
  demand: RoleDemand;
  roles: string[];
  run: (fn: () => Promise<unknown>) => Promise<void>;
}> = ({ demand, roles, run }) => {
  // Local draft so typing a role does not fire a request per keystroke; the
  // other fields commit on change because they are discrete.
  const [role, setRole] = useState(demand.role);
  useEffect(() => setRole(demand.role), [demand.role]);

  const save = (patch: Partial<RoleDemand>) =>
    run(() =>
      updateRoleDemand(demand.id, {
        role: demand.role,
        seniority: demand.seniority,
        fte: demand.fte,
        startDate: demand.startDate.slice(0, 10),
        endDate: demand.endDate.slice(0, 10),
        notes: demand.notes,
        fulfilledByRequestId: demand.fulfilledByRequestId,
        ...patch,
      })
    );

  const staffed = Boolean(demand.fulfilledByRequestId);

  return (
    <div
      className={`grid grid-cols-[1fr_72px_120px_120px_28px] gap-2 items-center ${
        staffed ? 'opacity-50' : ''
      }`}
      title={staffed ? 'Staffed by an allocated request — counted as committed work, not planned' : undefined}
    >
      <input
        list="demand-roles"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        onBlur={() => role.trim() && role !== demand.role && save({ role: role.trim() })}
        className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      <input
        type="number"
        min="0.1"
        step="0.1"
        value={demand.fte}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v > 0) save({ fte: v });
        }}
        className="border border-gray-200 rounded px-2 py-1 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      <input
        type="date"
        value={demand.startDate.slice(0, 10)}
        onChange={(e) => e.target.value && save({ startDate: e.target.value })}
        className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      <input
        type="date"
        value={demand.endDate.slice(0, 10)}
        min={demand.startDate.slice(0, 10)}
        onChange={(e) => e.target.value && save({ endDate: e.target.value })}
        className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      <button
        onClick={() => run(() => deleteRoleDemand(demand.id))}
        className="text-gray-300 hover:text-red-500"
        aria-label="Delete demand"
      >
        <Trash2 size={13} />
      </button>
      <datalist id="demand-roles">
        {roles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
};

export default InitiativePlanner;
