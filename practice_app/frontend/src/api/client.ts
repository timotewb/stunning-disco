import axios from 'axios';
import type {
  TeamMember,
  Dimension,
  DimensionNode,
  Snapshot,
  MatrixEntry,
  Allocation,
  AllocationTypeConfig,
  SMEAssignment,
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

// Allocations
export const getAllocations = () => api.get<Allocation[]>('/allocations').then((r) => r.data);
export const createAllocation = (data: Omit<Allocation, 'id' | 'teamMember'>) =>
  api.post<Allocation>('/allocations', data).then((r) => r.data);
export const updateAllocation = (id: string, data: Partial<Allocation>) =>
  api.put<Allocation>(`/allocations/${id}`, data).then((r) => r.data);
export const deleteAllocation = (id: string) => api.delete(`/allocations/${id}`);

// Allocation Types
export const getAllocationTypes = () =>
  api.get<AllocationTypeConfig[]>('/allocation-types').then((r) => r.data);
export const createAllocationType = (data: { name: string; color: string }) =>
  api.post<AllocationTypeConfig>('/allocation-types', data).then((r) => r.data);
export const deleteAllocationType = (id: string) => api.delete(`/allocation-types/${id}`);

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
