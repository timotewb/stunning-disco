export interface TeamMember {
  id: string;
  name: string;
  role: string;
  seniority: string;
  tags: string[];
  notes: string;
  isLeaving: boolean;
  createdAt: string;
}

export interface Dimension {
  id: string;
  name: string;
  type: string;
  description: string;
  nodes: DimensionNode[];
}

export interface DimensionNode {
  id: string;
  dimensionId: string;
  parentId: string | null;
  name: string;
  orderIndex: number;
  children?: DimensionNode[];
}

export interface Snapshot {
  id: string;
  timestamp: string;
}

export interface MatrixEntry {
  id: string;
  teamMemberId: string;
  dimensionNodeId: string;
  snapshotId: string;
  value: number;
  teamMember?: TeamMember;
  dimensionNode?: DimensionNode;
  snapshot?: Snapshot;
}

export interface Allocation {
  id: string;
  teamMemberId: string;
  projectName: string;
  type: string;
  startDate: string;
  endDate: string;
  notes: string;
  teamMember?: TeamMember;
}

export interface AllocationTypeConfig {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface SeniorityConfig {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface SMEAssignment {
  id: string;
  dimensionNodeId: string;
  primaryMemberId: string;
  backupMemberId: string | null;
  snapshotId: string;
  dimensionNode?: DimensionNode;
  primaryMember?: TeamMember;
  backupMember?: TeamMember | null;
  snapshot?: Snapshot;
}

export type AllocationType = string;
