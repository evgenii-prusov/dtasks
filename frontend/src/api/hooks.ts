import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api, ApiError } from './client'
import { toISODate } from '../lib/dates'
import type {
  DateRange,
  Habit,
  HabitCreate,
  LoginPayload,
  Project,
  ProjectCreate,
  ProjectPatch,
  RecurrenceRuleCreate,
  RecurrenceRulePatch,
  RollupPeriod,
  SignupPayload,
  Task,
  TaskCreate,
  TaskPatch,
  WorkLogDay,
  WorkLogEntry,
  WorkLogEntryCreate,
  WorkLogEntryPatch,
} from './types'

/** Session query, shared by useCurrentUser and the router's auth guards. */
export const currentUserQueryOptions = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: api.authMe,
  retry: false,
  staleTime: Infinity,
})

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions)
}

export function useSignup() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (payload: SignupPayload) => api.signup(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      navigate({ to: '/' })
    },
  })
}

export function useLogin() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (payload: LoginPayload) => api.login(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      navigate({ to: '/' })
    },
  })
}

/** Which OAuth providers are configured server-side. Public — used on /welcome
 * before a session exists, so it must not depend on auth state. */
export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: api.authProviders,
    retry: false,
    staleTime: Infinity,
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.clear()
      navigate({ to: '/welcome' })
    },
  })
}

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
  if (patch.project_id === undefined) {
    return projects.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }))
  }
  let movedTask: (typeof projects)[0]['tasks'][0] | undefined
  const without = projects.map((p) => ({
    ...p,
    tasks: p.tasks.filter((t) => {
      if (t.id === taskId) {
        movedTask = { ...t, ...patch }
        return false
      }
      return true
    }),
  }))
  if (!movedTask) return without
  const task = movedTask
  return without.map((p) => (p.id === patch.project_id ? { ...p, tasks: [...p.tasks, task] } : p))
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

export function useCreateRecurrence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, rule }: { projectId: number; rule: RecurrenceRuleCreate }) =>
      api.createRecurrence(projectId, rule),
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateRecurrence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: RecurrenceRulePatch }) =>
      api.updateRecurrence(id, patch),
    onSettled: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteRecurrence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteRecurrence(id),
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

export function useReorderProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      api.reorderProject(id, direction),
    onMutate: async ({ id, direction }) => {
      await qc.cancelQueries({ queryKey: ['projects'] })
      const previous = qc.getQueryData<Project[]>(['projects'])
      if (previous) {
        const target = previous.find((p) => p.id === id)
        if (target) {
          const group = target.group
          const inGroup = previous.filter((p) => p.group === group)
          const i = inGroup.findIndex((p) => p.id === id)
          const j = direction === 'up' ? i - 1 : i + 1
          if (j >= 0 && j < inGroup.length) {
            const next = [...previous]
            const idxI = next.findIndex((p) => p.id === inGroup[i].id)
            const idxJ = next.findIndex((p) => p.id === inGroup[j].id)
            const temp = next[idxI].position
            next[idxI] = { ...next[idxI], position: next[idxJ].position }
            next[idxJ] = { ...next[idxJ], position: temp }
            next.sort((a, b) => a.position - b.position)
            qc.setQueryData(['projects'], next)
          }
        }
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
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

export function useCreateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (habit: HabitCreate) => api.createHabit(habit),
    onSettled: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })
}

export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteHabit(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['habits'] })
      const previous = qc.getQueryData<Habit[]>(['habits'])
      if (previous) {
        qc.setQueryData(
          ['habits'],
          previous.filter((h) => h.id !== id),
        )
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['habits'], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })
}

// ── Work log ───────────────────────────────────────────────────────────────
// Every key nests under 'worklog' so one prefix invalidation refreshes the
// entry list, the day signals and the rollups together. Writing an entry changes
// all three, and flat sibling keys would silently leave the rollup stale.
const WORKLOG_KEY = ['worklog'] as const

export function useWorkLogEntries(range: DateRange) {
  return useQuery({
    queryKey: [...WORKLOG_KEY, 'entries', range.start, range.end],
    queryFn: () => api.listWorkLogEntries(range),
  })
}

export function useWorkLogDays(range: DateRange) {
  return useQuery({
    queryKey: [...WORKLOG_KEY, 'days', range.start, range.end],
    queryFn: () => api.listWorkLogDays(range),
  })
}

export function useWorkLogRollup(period: RollupPeriod) {
  return useQuery({
    queryKey: [...WORKLOG_KEY, 'rollup', period],
    queryFn: () => api.worklogRollup(period),
  })
}

function invalidateWorkLog(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: WORKLOG_KEY })
}

export function useCreateWorkLogEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entry: WorkLogEntryCreate) => api.createWorkLogEntry(entry),
    onSettled: () => invalidateWorkLog(qc),
  })
}

export function useUpdateWorkLogEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: WorkLogEntryPatch }) =>
      api.updateWorkLogEntry(id, patch),
    onSettled: () => invalidateWorkLog(qc),
  })
}

export function useDeleteWorkLogEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteWorkLogEntry(id),
    onSettled: () => invalidateWorkLog(qc),
  })
}

/** Upsert the day's energy/friction signal. Optimistic: the picker must feel
 * instant, the same reasoning as useSetHabitLog. */
export function useSetWorkLogDay(range: DateRange) {
  const qc = useQueryClient()
  const key = [...WORKLOG_KEY, 'days', range.start, range.end]
  return useMutation({
    mutationFn: (day: WorkLogDay) => api.setWorkLogDay(day),
    onMutate: async (day) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<WorkLogDay[]>(key)
      if (previous) {
        const without = previous.filter((d) => d.day !== day.day)
        qc.setQueryData(key, [day, ...without])
      }
      return { previous }
    },
    onError: (_err, _day, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => invalidateWorkLog(qc),
  })
}

/**
 * Tasks the user finished on `day` that no entry references yet.
 *
 * Derived from the projects query rather than fetched: completed tasks are
 * already in the cache, so the promote list costs no extra request.
 *
 * `completed_at` is a UTC instant while `day` is the user's local date, so the
 * timestamp is converted before comparing. Slicing the ISO string instead would
 * hide a task finished this evening from anyone east of UTC (and show yesterday's
 * to anyone west of it).
 */
export function unloggedCompletedTasks(
  projects: Project[],
  entries: WorkLogEntry[],
  day: string,
): { task: Task; projectName: string }[] {
  const logged = new Set(entries.map((e) => e.task_id).filter((id): id is number => id != null))
  const completedOn = (t: Task) =>
    t.completed_at != null && toISODate(new Date(t.completed_at)) === day
  return projects.flatMap((p) =>
    p.tasks
      .filter((t) => t.completed && completedOn(t) && !logged.has(t.id))
      .map((task) => ({ task, projectName: p.name })),
  )
}
