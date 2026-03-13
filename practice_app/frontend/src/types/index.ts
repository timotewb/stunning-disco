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

export interface WorkRequest {
  id: string;
  title: string;
  description?: string;
  source: string;
  sourceDetail?: string;
  type: string;
  priority: string;
  status: string;
  isDraft: boolean;
  effort?: string;
  dateRaised: string;
  dateResolved?: string;
  requestorId?: string;
  requestor?: Contact;
  assigneeId?: string;
  assignee?: TeamMember;
  isAllocated: boolean;
  allocationType?: string;
  allocationStartDate?: string;
  allocationEndDate?: string;
  allocationNotes?: string;
  noteRef?: string;
  tags: string[];
  externalRef?: string;
  dimensionNodeIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  role?: string;
  team?: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestSourceConfig {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  createdAt: string;
}

export interface RequestTypeConfig {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  createdAt: string;
}

export interface RequestPriorityConfig {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  createdAt: string;
}

export interface RequestStatusConfig {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  createdAt: string;
}

export interface RequestEffortConfig {
  id: string;
  name: string;
  value: string;
  orderIndex: number;
  createdAt: string;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface VolumePoint {
  period: string;
  total: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

export interface AssigneeLoadEntry {
  assigneeId: string;
  name: string;
  inFlightCount: number;
  scheduledCount: number;
  unscheduledCount: number;
  byPriority: Record<string, number>;
  requests: { id: string; title: string; priority: string; isAllocated: boolean }[];
}

export interface RequestAnalytics {
  volumeOverTime: VolumePoint[];
  bySource: { source: string; count: number }[];
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  assigneeLoad: AssigneeLoadEntry[];
  skillsPressure: { dimensionNodeId: string; name: string; openCount: number }[];
  medianDwellDays: Record<string, number>;
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

export interface NoteListItem {
  date: string;
}

export interface Note {
  date: string;
  content: string;
}

export interface NoteSearchResult {
  date: string;
  snippet: string;
}

export interface FolderNote {
  slug: string;
  name: string;
}

export interface Folder {
  slug: string;
  name: string;
  notes: FolderNote[];
}

export interface FolderNoteContent {
  slug: string;
  name: string;
  content: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface AiConfig {
  mode: 'local' | 'docker';
  customUrl: string | null;
  resolvedUrl: string;
}

export interface AiStatus extends AiConfig {
  connected: boolean;
  version?: string;
  models: string[];
}

export interface AiPrompts {
  noteSummarise: string;
  requestExtract: string;
  requestParse: string;
}

export interface NotesScanResult {
  draftsCreated: number;
  skippedAlreadyScanned: number;
  notesScanned: number;
}

export interface ScannerConfig {
  lookbackDays: number;
  autoScan: boolean;
  includeDailyNotes: boolean;
  includeFolders: string[];
}
