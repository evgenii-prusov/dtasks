import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './client'
import type { Habit, Project, ProjectCreate, ProjectPatch, TaskCreate, TaskPatch } from './types'

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: api.listProjects })
}

export function useHabits() {
  return useQuery({ queryKey: ['habits'], queryFn: api.listHabits })
}

/** Count of active Must Have tasks (assigned today, not completed). */
export function mustHaveCount(projects: Project[]): number {
  return projects
    .flatMap((p) => p.tasks)
    .filter((t) => t.must_have && t.assigned_today && !t.completed).length
}

function patchTaskInCache(projects: Project[], taskId: number, patch: TaskPatch): Project[] {
  return projects.map((p) => ({
    ...p,
    tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  }))
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) => api.updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['projects'] })
      const previous = qc.getQueryData<Project[]>(['projects'])
      if (previous) {
        // Mirror server-side rules so the UI doesn't flicker
        const derived = { ...patch }
        if (patch.assigned_today === false) derived.must_have = false
        if (patch.must_have === true) derived.assigned_today = true
        qc.setQueryData(['projects'], patchTaskInCache(previous, id, derived))
      }
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['projects'], ctx.previous)
      if (err instanceof ApiError && err.status === 409) alert(err.message)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, task }: { projectId: number; task: TaskCreate }) =>
      api.createTask(projectId, task),
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['projects'] })
      const previous = qc.getQueryData<Project[]>(['projects'])
      if (previous) {
        qc.setQueryData(
          ['projects'],
          previous.map((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) })),
        )
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['projects'], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useReorderTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      api.reorderTask(id, direction),
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (project: ProjectCreate) => api.createProject(project),
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ProjectPatch }) =>
      api.updateProject(id, patch),
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['projects'] })
      const previous = qc.getQueryData<Project[]>(['projects'])
      if (previous) {
        qc.setQueryData(
          ['projects'],
          previous.filter((p) => p.id !== id),
        )
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['projects'], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useSetHabitLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ habitId, day, state }: { habitId: number; day: string; state: number }) =>
      api.setHabitLog(habitId, day, state),
    onMutate: async ({ habitId, day, state }) => {
      await qc.cancelQueries({ queryKey: ['habits'] })
      const previous = qc.getQueryData<Habit[]>(['habits'])
      if (previous) {
        qc.setQueryData(
          ['habits'],
          previous.map((h) => (h.id === habitId ? { ...h, log: { ...h.log, [day]: state } } : h)),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['habits'], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })
}
