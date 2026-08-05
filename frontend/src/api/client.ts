import { currentSurface } from '../lib/analytics'
import { currentModality } from '../lib/inputModality'
import type {
  AuthProviders,
  Habit,
  HabitCreate,
  LoginPayload,
  Project,
  ProjectCreate,
  ProjectPatch,
  RecurrenceRule,
  RecurrenceRuleCreate,
  RecurrenceRulePatch,
  SignupPayload,
  Task,
  TaskCreate,
  TaskPatch,
  User,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Tells the backend which input drove this request, so the event it records
 * carries a modality. One place covers every mutation the app makes, now and
 * later -- which is what keeps the mouse-vs-keyboard ratio honest as features
 * are added.
 */
function analyticsHeaders(method: string): Record<string, string> {
  if (method === 'GET' || method === 'HEAD') return {}
  const headers: Record<string, string> = { 'x-dtask-input': currentModality() }
  const surface = currentSurface()
  if (surface) headers['x-dtask-surface'] = surface
  try {
    if (typeof __APP_VERSION__ === 'string') headers['x-dtask-version'] = __APP_VERSION__
  } catch {
    /* version not defined in this build */
  }
  return headers
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...analyticsHeaders(init?.method ?? 'GET'),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  authMe: () => request<User>('/api/auth/me'),
  signup: (payload: SignupPayload) =>
    request<User>('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: LoginPayload) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  authProviders: () => request<AuthProviders>('/api/auth/providers'),
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (project: ProjectCreate) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(project) }),
  updateProject: (id: number, patch: ProjectPatch) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  reorderProject: (id: number, direction: 'up' | 'down') =>
    request<Project[]>(`/api/projects/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  createTask: (projectId: number, task: TaskCreate) =>
    request<Task>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    }),
  updateTask: (id: number, patch: TaskPatch) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  reorderTask: (id: number, direction: 'up' | 'down') =>
    request<Task[]>(`/api/tasks/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  createRecurrence: (projectId: number, rule: RecurrenceRuleCreate) =>
    request<RecurrenceRule>(`/api/projects/${projectId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  updateRecurrence: (id: number, patch: RecurrenceRulePatch) =>
    request<RecurrenceRule>(`/api/recurrences/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRecurrence: (id: number) => request<void>(`/api/recurrences/${id}`, { method: 'DELETE' }),
  listHabits: () => request<Habit[]>('/api/habits'),
  createHabit: (habit: HabitCreate) =>
    request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(habit) }),
  setHabitLog: (habitId: number, day: string, state: number) =>
    request<Habit>(`/api/habits/${habitId}/log`, {
      method: 'PUT',
      body: JSON.stringify({ day, state }),
    }),
  deleteHabit: (id: number) => request<void>(`/api/habits/${id}`, { method: 'DELETE' }),
}
