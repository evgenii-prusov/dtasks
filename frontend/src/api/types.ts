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
  position: number
}

export interface Project {
  id: number
  name: string
  group: string
  description: string
  notes: string
  position: number
  tasks: Task[]
}

// Every group gets one server-managed catch-all project (name reserved as
// "...") for tasks that don't belong to a specific project. It can't be
// renamed, moved, or deleted (enforced server-side too).
export const DEFAULT_PROJECT_NAME = '...'

export function isDefaultProject(project: Pick<Project, 'name'>): boolean {
  return project.name === DEFAULT_PROJECT_NAME
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
