import type {
  Habit,
  LoginPayload,
  Project,
  ProjectCreate,
  ProjectPatch,
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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
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
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (project: ProjectCreate) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(project) }),
  updateProject: (id: number, patch: ProjectPatch) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
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
  listHabits: () => request<Habit[]>('/api/habits'),
  setHabitLog: (habitId: number, day: string, state: number) =>
    request<Habit>(`/api/habits/${habitId}/log`, {
      method: 'PUT',
      body: JSON.stringify({ day, state }),
    }),
}
