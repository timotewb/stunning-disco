import axios from 'axios';
import type {
  TeamMember,
  Dimension,
  DimensionNode,
  Snapshot,
  MatrixEntry,
  Allocation,
  WorkRequest,
  AllocationTypeConfig,
  SeniorityConfig,
  SMEAssignment,
  NoteListItem,
  Note,
  NoteSearchResult,
  Folder,
  FolderNote,
  FolderNoteContent,
} from '../types';

const api = axios.create({ baseURL: '/api' });

// Team
export const getTeam = () => api.get<TeamMember[]>('/team').then((r) => r.data);
export const createMember = (data: Omit<TeamMember, 'id' | 'createdAt'>) =>
  api.post<TeamMember>('/team', data).then((r) => r.data);
export const updateMember = (id: string, data: Partial<TeamMember>) =>
  api.put<TeamMember>(`/team/${id}`, data).then((r) => r.data);
export const deleteMember = (id: string) => api.delete(`/team/${id}`);

// Dimensions
export const getDimensions = () => api.get<Dimension[]>('/dimensions').then((r) => r.data);
export const createDimension = (data: { name: string; type?: string; description?: string }) =>
  api.post<Dimension>('/dimensions', data).then((r) => r.data);
export const updateDimension = (id: string, data: Partial<Dimension>) =>
  api.put<Dimension>(`/dimensions/${id}`, data).then((r) => r.data);
export const deleteDimension = (id: string) => api.delete(`/dimensions/${id}`);
export const getDimensionNodes = (dimensionId?: string) =>
  api
    .get<DimensionNode[]>('/dimension-nodes', { params: dimensionId ? { dimensionId } : {} })
    .then((r) => r.data);
export const createNode = (data: {
  dimensionId: string;
  parentId?: string | null;
  name: string;
  orderIndex?: number;
}) => api.post<DimensionNode>('/dimension-nodes', data).then((r) => r.data);
export const updateNode = (id: string, data: Partial<DimensionNode>) =>
  api.put<DimensionNode>(`/dimension-nodes/${id}`, data).then((r) => r.data);
export const deleteNode = (id: string) => api.delete(`/dimension-nodes/${id}`);

// Snapshots
export const getSnapshots = () => api.get<Snapshot[]>('/snapshots').then((r) => r.data);
export const createSnapshot = (data?: { timestamp?: string }) =>
  api.post<Snapshot>('/snapshots', data ?? {}).then((r) => r.data);
export const deleteSnapshot = (id: string) => api.delete(`/snapshots/${id}`);
export const deleteSnapshots = (ids: string[]) => api.delete('/snapshots/bulk', { data: { ids } });

// Matrix
export const getMatrix = (params: { dimensionId?: string; snapshotId?: string }) =>
  api.get<MatrixEntry[]>('/matrix', { params }).then((r) => r.data);
export const upsertMatrixEntry = (data: {
  teamMemberId: string;
  dimensionNodeId: string;
  snapshotId: string;
  value: number;
}) => api.post<MatrixEntry>('/matrix-entry', data).then((r) => r.data);
export const deleteMatrixEntry = (id: string) => api.delete(`/matrix-entry/${id}`);

// Allocations (legacy — kept for backward compatibility during transition)
export const getAllocations = () => api.get<Allocation[]>('/allocations').then((r) => r.data);
export const createAllocation = (data: Omit<Allocation, 'id' | 'teamMember'>) =>
  api.post<Allocation>('/allocations', data).then((r) => r.data);
export const updateAllocation = (id: string, data: Partial<Allocation>) =>
  api.put<Allocation>(`/allocations/${id}`, data).then((r) => r.data);
export const deleteAllocation = (id: string) => api.delete(`/allocations/${id}`);

// Work Requests
export const getWorkRequests = (params?: { isAllocated?: boolean }) =>
  api.get<WorkRequest[]>('/requests', { params }).then((r) => r.data);
export const createWorkRequest = (data: Partial<WorkRequest>) =>
  api.post<WorkRequest>('/requests', data).then((r) => r.data);
export const updateWorkRequest = (id: string, data: Partial<WorkRequest>) =>
  api.put<WorkRequest>(`/requests/${id}`, data).then((r) => r.data);
export const deleteWorkRequest = (id: string) => api.delete(`/requests/${id}`);

// Allocation Types
export const getAllocationTypes = () =>
  api.get<AllocationTypeConfig[]>('/allocation-types').then((r) => r.data);
export const createAllocationType = (data: { name: string; color: string }) =>
  api.post<AllocationTypeConfig>('/allocation-types', data).then((r) => r.data);
export const deleteAllocationType = (id: string) => api.delete(`/allocation-types/${id}`);

// Seniority Config
export const getSeniorityConfigs = () =>
  api.get<SeniorityConfig[]>('/seniority-config').then((r) => r.data);
export const createSeniorityConfig = (data: { name: string; color: string }) =>
  api.post<SeniorityConfig>('/seniority-config', data).then((r) => r.data);
export const deleteSeniorityConfig = (id: string) => api.delete(`/seniority-config/${id}`);

// SME
export const getSME = () => api.get<SMEAssignment[]>('/sme').then((r) => r.data);
export const upsertSME = (data: {
  dimensionNodeId: string;
  primaryMemberId: string;
  backupMemberId?: string | null;
  snapshotId: string;
}) => api.post<SMEAssignment>('/sme', data).then((r) => r.data);
export const deleteSME = (id: string) => api.delete(`/sme/${id}`);

// Export
export const exportMatrix = () => api.get('/export/matrix').then((r) => r.data);
export const exportTimeline = () => api.get('/export/timeline').then((r) => r.data);
export const exportCapabilities = () => api.get('/export/capabilities').then((r) => r.data);

// Notes
export const getNotes = () => api.get<NoteListItem[]>('/notes').then((r) => r.data);
export const getNote = (date: string) => api.get<Note>(`/notes/${date}`).then((r) => r.data);
export const saveNote = (date: string, content: string) =>
  api.put<Note>(`/notes/${date}`, { content }).then((r) => r.data);
export const searchNotes = (q: string) =>
  api.get<NoteSearchResult[]>('/notes/search', { params: { q } }).then((r) => r.data);

// Member notes
export const getMemberNotes = (slug: string) =>
  api.get<NoteListItem[]>(`/notes/members/${slug}`).then((r) => r.data);
export const getMemberNote = (slug: string, date: string) =>
  api.get<Note>(`/notes/members/${slug}/${date}`).then((r) => r.data);
export const saveMemberNote = (slug: string, date: string, content: string) =>
  api.put<Note>(`/notes/members/${slug}/${date}`, { content }).then((r) => r.data);
export const searchMemberNotes = (slug: string, q: string) =>
  api.get<NoteSearchResult[]>(`/notes/members/${slug}/search`, { params: { q } }).then((r) => r.data);

// Folder notes (global — Folders tab)
export const getFolders = () =>
  api.get<Folder[]>('/notes/folders').then((r) => r.data);
export const createFolder = (name: string) =>
  api.post<Folder>('/notes/folders', { name }).then((r) => r.data);
export const renameFolder = (folderSlug: string, name: string) =>
  api.patch<{ slug: string; name: string }>(`/notes/folders/${folderSlug}`, { name }).then((r) => r.data);
export const deleteFolder = (folderSlug: string) =>
  api.delete(`/notes/folders/${folderSlug}`);
export const createFolderNote = (folderSlug: string, name: string) =>
  api.post<FolderNoteContent>(`/notes/folders/${folderSlug}/notes`, { name }).then((r) => r.data);
export const getFolderNote = (folderSlug: string, noteSlug: string) =>
  api.get<FolderNoteContent>(`/notes/folders/${folderSlug}/notes/${noteSlug}`).then((r) => r.data);
export const saveFolderNote = (folderSlug: string, noteSlug: string, content: string) =>
  api.put<FolderNoteContent>(`/notes/folders/${folderSlug}/notes/${noteSlug}`, { content }).then((r) => r.data);
export const renameFolderNote = (folderSlug: string, noteSlug: string, name: string) =>
  api.patch<FolderNote>(`/notes/folders/${folderSlug}/notes/${noteSlug}`, { name }).then((r) => r.data);
export const deleteFolderNote = (folderSlug: string, noteSlug: string) =>
  api.delete(`/notes/folders/${folderSlug}/notes/${noteSlug}`);
export const moveFolderNote = (folderSlug: string, noteSlug: string, targetFolderSlug: string) =>
  api.post<{ ok: boolean; newSlug: string; targetFolderSlug: string }>(
    `/notes/folders/${folderSlug}/notes/${noteSlug}/move`,
    { targetFolderSlug }
  ).then((r) => r.data);

// Context folders (inline within Daily Notes or Team Member Notes sidebars)
const ctxBase = (ctx: 'daily' | 'member', memberSlug?: string) =>
  ctx === 'daily' ? '/notes/daily-folders' : `/notes/members/${memberSlug}/folders`;

export const getCtxFolders = (ctx: 'daily' | 'member', memberSlug?: string) =>
  api.get<Folder[]>(ctxBase(ctx, memberSlug)).then((r) => r.data);
export const createCtxFolder = (ctx: 'daily' | 'member', name: string, memberSlug?: string) =>
  api.post<Folder>(ctxBase(ctx, memberSlug), { name }).then((r) => r.data);
export const renameCtxFolder = (ctx: 'daily' | 'member', folderSlug: string, name: string, memberSlug?: string) =>
  api.patch<{ slug: string; name: string }>(`${ctxBase(ctx, memberSlug)}/${folderSlug}`, { name }).then((r) => r.data);
export const deleteCtxFolder = (ctx: 'daily' | 'member', folderSlug: string, memberSlug?: string) =>
  api.delete(`${ctxBase(ctx, memberSlug)}/${folderSlug}`);
export const createCtxFolderNote = (ctx: 'daily' | 'member', folderSlug: string, name: string, memberSlug?: string) =>
  api.post<FolderNoteContent>(`${ctxBase(ctx, memberSlug)}/${folderSlug}/notes`, { name }).then((r) => r.data);
export const getCtxFolderNote = (ctx: 'daily' | 'member', folderSlug: string, noteSlug: string, memberSlug?: string) =>
  api.get<FolderNoteContent>(`${ctxBase(ctx, memberSlug)}/${folderSlug}/notes/${noteSlug}`).then((r) => r.data);
export const saveCtxFolderNote = (ctx: 'daily' | 'member', folderSlug: string, noteSlug: string, content: string, memberSlug?: string) =>
  api.put<FolderNoteContent>(`${ctxBase(ctx, memberSlug)}/${folderSlug}/notes/${noteSlug}`, { content }).then((r) => r.data);
export const renameCtxFolderNote = (ctx: 'daily' | 'member', folderSlug: string, noteSlug: string, name: string, memberSlug?: string) =>
  api.patch<FolderNote>(`${ctxBase(ctx, memberSlug)}/${folderSlug}/notes/${noteSlug}`, { name }).then((r) => r.data);
export const deleteCtxFolderNote = (ctx: 'daily' | 'member', folderSlug: string, noteSlug: string, memberSlug?: string) =>
  api.delete(`${ctxBase(ctx, memberSlug)}/${folderSlug}/notes/${noteSlug}`);
export const moveCtxFolderNote = (
  ctx: 'daily' | 'member',
  folderSlug: string,
  noteSlug: string,
  targetFolderSlug: string,
  memberSlug?: string,
) =>
  api.post<{ ok: boolean; newSlug: string; targetFolderSlug: string }>(
    `${ctxBase(ctx, memberSlug)}/${folderSlug}/notes/${noteSlug}/move`,
    { targetFolderSlug }
  ).then((r) => r.data);

// ── AI / Ollama ───────────────────────────────────────────────────────────────
import type { AiConfig, AiStatus, OllamaModel, AiPrompts } from '../types';

export const getAiStatus  = () => api.get<AiStatus>('/ai/status').then((r) => r.data);
export const getAiConfig  = () => api.get<AiConfig>('/ai/config').then((r) => r.data);
export const saveAiConfig = (cfg: Pick<AiConfig, 'mode' | 'customUrl'>) =>
  api.put<AiConfig>('/ai/config', cfg).then((r) => r.data);
export const getAiModels  = () => api.get<OllamaModel[]>('/ai/models').then((r) => r.data);
export const deleteAiModel = (name: string) =>
  api.delete(`/ai/models/${encodeURIComponent(name)}`);

export async function* pullAiModel(
  name: string,
): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
  const response = await fetch('/api/ai/models/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) { try { yield JSON.parse(line); } catch { /* skip */ } }
    }
  }
}

export const summariseNote = (content: string, model?: string) =>
  api.post<{ summary: string }>('/ai/summarise', { content, model }).then((r) => r.data);

export const getAiPrompts  = () => api.get<AiPrompts>('/ai/prompts').then((r) => r.data);
export const saveAiPrompts = (prompts: Partial<AiPrompts>) =>
  api.put<AiPrompts>('/ai/prompts', prompts).then((r) => r.data);
export const resetAiPrompt = (key: keyof AiPrompts) =>
  api.delete<AiPrompts>(`/ai/prompts/${key}`).then((r) => r.data);
