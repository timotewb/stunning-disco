export interface TeamMember {
  id: string;
  name: string;
  role: string;
  seniority: string;
  tags: string[];
  notes: string;
  isLeaving: boolean;
  hasLeft: boolean;
  baselineFte: number;
  startDate?: string | null;
  endDate?: string | null;
  capacityChanges?: CapacityChange[];
  createdAt: string;
}

/**
 * A deviation from a member's baseline FTE. `effectiveTo: null` is an
 * open-ended step change; a set `effectiveTo` is a bounded period that
 * automatically reverts to whatever applied before it.
 */
export interface CapacityChange {
  id: string;
  teamMemberId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  fte: number;
  reason: string;
  notes?: string | null;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  createdAt: string;
}

export interface CapacityBucket {
  start: string;
  end: string;
  label: string;
}

export interface CapacitySeries {
  key: string;
  capacity: number[];
  leave: number[];
  available: number[];
  demand: number[];
  /** Unstaffed demand from the initiative pipeline, in absolute FTE. */
  planned: number[];
  overcommitted: boolean[];
  overcommittedWithPlanned: boolean[];
}

export interface PlannedBreakdown {
  initiativeId: string;
  initiativeName: string;
  confidence: Confidence;
  color: string;
  planned: number[];
}

export interface CapacityReduction {
  bucketIndex: number;
  memberName: string;
  from: number;
  to: number;
  reason: string;
}

export interface CapacityResponse {
  buckets: CapacityBucket[];
  series: CapacitySeries[];
  plannedBreakdown: PlannedBreakdown[];
  reductions: CapacityReduction[];
  totals: {
    capacityFteNow: number;
    availableFteNow: number;
    demandFteNow: number;
    plannedFteNow: number;
    headroomFteNow: number;
    headroomWithPlannedFteNow: number;
    overcommittedBuckets: number;
    pressureBuckets: number;
  };
  hoursPerFte: number;
}

// ── Demand planning ──────────────────────────────────────────────────────────

export const CONFIDENCE_LEVELS = ['committed', 'probable', 'candidate'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * An unstaffed ask. `fte` is ABSOLUTE (2.0 = two full-time people), unlike
 * WorkRequest.allocationFte which is a fraction of one person's capacity.
 *
 * `role` is free text on purpose: demand for a role the team does not employ
 * yet is the hiring signal this view exists to surface.
 */
export interface RoleDemand {
  id: string;
  projectId: string;
  role: string;
  seniority: string | null;
  fte: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  /** When set, a real person covers this ask and the engine skips the row. */
  fulfilledByRequestId: string | null;
}

export interface InitiativeProject {
  id: string;
  initiativeId: string;
  name: string;
  notes: string;
  startDate: string | null;
  endDate: string | null;
  orderIndex: number;
  roleDemands: RoleDemand[];
}

export interface Initiative {
  id: string;
  name: string;
  description: string;
  confidence: Confidence;
  color: string;
  orderIndex: number;
  projects: InitiativeProject[];
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
  /** Fraction (0–1) of the assignee's capacity this allocation consumes. */
  allocationFte?: number;
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
  /** Whether work of this type subtracts from available capacity (e.g. leave). */
  reducesCapacity: boolean;
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
  /** Real filename on disk, preserved verbatim for manually added files. */
  file: string;
  /** False for binary/unknown file types, which can be listed but not previewed. */
  editable: boolean;
}

export interface Folder {
  slug: string;
  /** URI-encoded, `~`-joined path relative to the context root. */
  path: string;
  name: string;
  notes: FolderNote[];
  children: Folder[];
}

export interface FolderNoteContent {
  slug: string;
  name: string;
  file: string;
  editable: boolean;
  content: string;
}

export interface FolderRefreshResult {
  added: number;
  removed: number;
  foldersAdded: number;
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
