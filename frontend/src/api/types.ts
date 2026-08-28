export type Complexity = 'low' | 'high'

export interface Task {
  id: number
  project_id: number
  title: string
  notes: string
  complexity: Complexity
  assigned_today: boolean
  assigned_week: boolean
  must_have: boolean
  is_green: boolean
  completed: boolean
  completed_at: string | null
  position: number
  recurrence_rule_id: number | null
  occurrence_date: string | null
}

// Weekday recurrence rule: a bitmask where bit i (0=Mon..6=Sun) marks that
// weekday as due. Each due day, the backend lazily materializes today's
// occurrence as a normal Task tagged with recurrence_rule_id/occurrence_date.
export interface RecurrenceRule {
  id: number
  project_id: number
  title: string
  notes: string
  complexity: Complexity
  is_green: boolean
  weekdays: number
}

export interface Project {
  id: number
  name: string
  group: string
  description: string
  notes: string
  position: number
  tasks: Task[]
  recurrences: RecurrenceRule[]
}

// Every group gets one server-managed catch-all project (name reserved as
// "...") for tasks that don't belong to a specific project. It can't be
// renamed, moved, or deleted (enforced server-side too).
export const DEFAULT_PROJECT_NAME = '...'

export function isDefaultProject(project: Pick<Project, 'name'>): boolean {
  return project.name === DEFAULT_PROJECT_NAME
}

// The Inbox is one server-managed project in a group of its own, always sorted
// first. It exists so parking an idea never costs a Work-vs-Personal decision;
// the choice is made later, in the Inbox phase of a review.
export const INBOX_GROUP = 'Inbox'

export function isInboxProject(project: Pick<Project, 'group'>): boolean {
  return project.group === INBOX_GROUP
}

/** The Inbox first, then everything else in the order the server gave. */
export function inboxFirst(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => Number(isInboxProject(b)) - Number(isInboxProject(a)))
}

export interface Habit {
  id: number
  name: string
  subtitle: string
  position: number
  log: Record<string, number> // ISO date -> 0 | 1 | 2
}

export interface TaskPatch {
  title?: string
  notes?: string
  complexity?: Complexity
  assigned_today?: boolean
  assigned_week?: boolean
  must_have?: boolean
  is_green?: boolean
  completed?: boolean
  project_id?: number
}

export interface TaskCreate {
  title: string
  notes?: string
  complexity?: Complexity
  is_green?: boolean
  assigned_today?: boolean
  assigned_week?: boolean
}

export interface RecurrenceRuleCreate {
  title: string
  weekdays: number
  notes?: string
  complexity?: Complexity
  is_green?: boolean
}

export interface RecurrenceRulePatch {
  title?: string
  notes?: string
  complexity?: Complexity
  is_green?: boolean
  weekdays?: number
}

export interface ProjectPatch {
  name?: string
  group?: string
  description?: string
  notes?: string
}

export interface ProjectCreate {
  name: string
  group?: string
}

export interface HabitCreate {
  name: string
  subtitle?: string
}

// ── Work log ───────────────────────────────────────────────────────────────
// The four kinds of contribution a day's work falls into. Stored server-side as
// a plain string; the union lives here, like Complexity above.
export type EntryCategory = 'shipped' | 'operational' | 'glue' | 'learning'

export const ENTRY_CATEGORIES: EntryCategory[] = ['shipped', 'operational', 'glue', 'learning']

export type LinkKind = 'pr' | 'rfc' | 'doc' | 'incident' | 'link'

export const LINK_KINDS: LinkKind[] = ['pr', 'rfc', 'doc', 'incident', 'link']

export interface WorkLogLink {
  id: number
  kind: LinkKind
  url: string
  label: string
}

export interface WorkLogEntry {
  id: number
  day: string // YYYY-MM-DD, the user's local day
  category: EntryCategory
  title: string
  context: string
  impact: string
  task_id: number | null
  created_at: string
  links: WorkLogLink[]
}

export interface WorkLogDay {
  day: string
  energy: number // 0 unset | 1 drained .. 5 strong
  friction: number // 0 unset | 1 smooth .. 5 blocked
  note: string
}

export interface WorkLogLinkInput {
  url: string
  kind?: LinkKind
  label?: string
}

export interface WorkLogEntryCreate {
  day: string
  category: EntryCategory
  title: string
  context?: string
  impact?: string
  task_id?: number | null
  links?: WorkLogLinkInput[]
}

export interface WorkLogEntryPatch {
  day?: string
  category?: EntryCategory
  title?: string
  context?: string
  impact?: string
  task_id?: number | null
  /** Sent whole or not at all: present replaces the entry's links. */
  links?: WorkLogLinkInput[]
}

export interface WorkLogBucket {
  key: string // "2026-W34" | "2026-08"
  start: string
  end: string
  total: number
  by_category: Record<EntryCategory, number>
  links_by_kind: Record<LinkKind, number>
  with_impact: number
  days_logged: number
  avg_energy: number | null
  avg_friction: number | null
  friction_notes: string[]
  entries: WorkLogEntry[]
}

export interface WorkLogRollup {
  period: RollupPeriod
  buckets: WorkLogBucket[]
}

export type RollupPeriod = 'week' | 'month'

export interface DateRange {
  start: string
  end: string
}

export interface User {
  id: number
  email: string
}

export interface SignupPayload {
  email: string
  password: string
  invite_code: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthProviders {
  google: boolean
  github: boolean
}
