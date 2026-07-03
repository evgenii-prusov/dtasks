export type Complexity = 'low' | 'high'

export interface Task {
  id: number
  project_id: number
  title: string
  notes: string
  complexity: Complexity
  recurring: boolean
  assigned_today: boolean
  assigned_week: boolean
  must_have: boolean
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
  recurring?: boolean
  assigned_today?: boolean
  assigned_week?: boolean
  must_have?: boolean
  completed?: boolean
}

export interface TaskCreate {
  title: string
  notes?: string
  complexity?: Complexity
  recurring?: boolean
}

export interface ProjectPatch {
  name?: string
  group?: string
  description?: string
  notes?: string
}
