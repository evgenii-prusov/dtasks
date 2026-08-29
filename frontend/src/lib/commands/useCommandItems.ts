import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjects } from '../../api/hooks'
import { isDefaultProject, isInboxProject, type Project, type Task } from '../../api/types'
import { HOTKEYS } from '../hotkeys/bindings'
import { score } from './score'

export type CommandKind = 'page' | 'project' | 'task' | 'action'

export interface CommandItem {
  id: string
  kind: CommandKind
  label: string
  /** Right-hand context: a project's group, a task's project name. */
  hint?: string
  /** Chord badge, for items that also have a keyboard shortcut. */
  chord?: string
  muted?: boolean
  target:
    | { type: 'page'; to: string }
    | { type: 'project'; projectId: number }
    | { type: 'task'; projectId: number; taskId: number }
    | { type: 'createTask' }
}

/** Kind weighting, so `pl` surfaces the Plan page above a task named "planning". */
const KIND_WEIGHT: Record<CommandKind, number> = {
  page: 1.3,
  project: 1.2,
  task: 1.0,
  action: 0.9,
}

const PER_GROUP_LIMIT = 8

export const GROUP_ORDER: CommandKind[] = ['page', 'project', 'task', 'action']

export interface CommandGroup {
  kind: CommandKind
  items: CommandItem[]
}

/**
 * Everything the palette can act on, filtered and ranked for `query`.
 *
 * Tasks are already embedded in each project by `useProjects`, so this costs
 * no extra request.
 */
export function useCommandItems(query: string): { groups: CommandGroup[]; flat: CommandItem[] } {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()

  const all = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = [
      { id: 'page:/', kind: 'page', label: t('nav.today'), chord: HOTKEYS.goToday.chords[0], target: { type: 'page', to: '/' } },
      { id: 'page:/plan', kind: 'page', label: t('nav.plan'), chord: HOTKEYS.goPlan.chords[0], target: { type: 'page', to: '/plan' } },
      { id: 'page:/review', kind: 'page', label: t('nav.review'), chord: HOTKEYS.goReview.chords[0], target: { type: 'page', to: '/review' } },
      { id: 'page:/habits', kind: 'page', label: t('nav.habits'), chord: HOTKEYS.goHabits.chords[0], target: { type: 'page', to: '/habits' } },
      { id: 'page:/report', kind: 'page', label: t('nav.report'), chord: HOTKEYS.goReport.chords[0], target: { type: 'page', to: '/report' } },
      { id: 'page:/worklog', kind: 'page', label: t('nav.worklog'), chord: HOTKEYS.goWorkLog.chords[0], target: { type: 'page', to: '/worklog' } },
    ]

    const projectItems: CommandItem[] = projects.map((p: Project) => ({
      id: `project:${p.id}`,
      kind: 'project',
      label: isInboxProject(p) ? t('inbox.title') : isDefaultProject(p) ? t('quickAdd.noProject') : p.name,
      hint: isInboxProject(p) ? undefined : p.group,
      // The Inbox is a project row but reachable like a page, so it teaches its
      // chord here the way the pages above do.
      chord: isInboxProject(p) ? HOTKEYS.goInbox.chords[0] : undefined,
      target: { type: 'project', projectId: p.id },
    }))

    const taskItems: CommandItem[] = projects.flatMap((p: Project) =>
      p.tasks.map((task: Task) => ({
        id: `task:${task.id}`,
        kind: 'task' as const,
        label: task.title,
        hint: isDefaultProject(p) ? undefined : isInboxProject(p) ? t('inbox.title') : p.name,
        muted: task.completed,
        target: { type: 'task' as const, projectId: p.id, taskId: task.id },
      })),
    )

    return [...pages, ...projectItems, ...taskItems]
  }, [projects, t])

  return useMemo(() => {
    const trimmed = query.trim()

    const scored = all
      .map((item) => {
        const raw = score(trimmed, item.label)
        if (raw === null) return null
        // Completed tasks stay findable but never outrank open work.
        const penalty = item.muted ? 500 : 0
        return { item, value: raw * KIND_WEIGHT[item.kind] - penalty }
      })
      .filter((x): x is { item: CommandItem; value: number } => x !== null)
      .sort((a, b) => b.value - a.value)

    const groups: CommandGroup[] = GROUP_ORDER.map((kind) => ({
      kind,
      items: scored
        .filter((s) => s.item.kind === kind)
        .slice(0, PER_GROUP_LIMIT)
        .map((s) => s.item),
    }))

    if (trimmed) {
      groups[GROUP_ORDER.indexOf('action')].items.push({
        id: 'action:createTask',
        kind: 'action',
        label: t('palette.createTask', { title: trimmed }),
        chord: HOTKEYS.newTask.chords[0],
        target: { type: 'createTask' },
      })
    } else {
      // With no query, an unfiltered task dump is noise — show where to go.
      groups[GROUP_ORDER.indexOf('task')].items = []
    }

    return { groups, flat: groups.flatMap((g) => g.items) }
  }, [all, query, t])
}
