import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateProject, useCreateRecurrence, useCreateTask, useProjects } from '../api/hooks'
import { isDefaultProject, isInboxProject, type Project } from '../api/types'
import { track } from '../lib/analytics'
import { weekdayShortLabels } from '../lib/dates'
import { weekdaysToMask } from '../lib/recurrence'
import { parseTaskInput } from '../lib/taskInput'
import { clearPendingQuickAdd, usePendingQuickAdd } from '../lib/pendingQuickAdd'
import { HOTKEYS } from '../lib/hotkeys/bindings'
import { useHotkey } from '../lib/hotkeys/useHotkey'
import { Ic } from './Icon'
import { managedProjectAliases, useProjectTagMenu } from './ProjectTagMenu'

export function QuickAddTask({ autoFocus = false }: { autoFocus?: boolean } = {}) {
  const { t, i18n } = useTranslation()
  const { data: projects = [] } = useProjects()
  const createTask = useCreateTask()
  const createRecurrence = useCreateRecurrence()
  const createProject = useCreateProject()

  const [title, setTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [repeating, setRepeating] = useState(false)
  const [weekdays, setWeekdays] = useState(new Set<number>([0, 1, 2, 3, 4, 5, 6]))

  const inputRef = useRef<HTMLInputElement>(null)
  const pendingTitle = usePendingQuickAdd()

  useHotkey(
    HOTKEYS.newTask.chords,
    () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    },
    { name: 'newTask' },
  )

  // Lets a parent that renders this conditionally (e.g. Plan while searching)
  // hand focus over as soon as the field appears.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // The command palette parks text here when it cannot resolve a project on
  // its own; picking it up keeps all the #tag and Work/Personal logic here.
  useEffect(() => {
    if (pendingTitle === null) return
    setTitle(pendingTitle)
    clearPendingQuickAdd()
    inputRef.current?.focus()
  }, [pendingTitle])

  // Only real projects are tag targets; the server-managed ones come from the
  // shared alias list, which the menu offers and `parseTaskInput` resolves.
  const inboxProj = projects.find(isInboxProject)
  const userProjects = projects.filter((p) => !isDefaultProject(p) && !isInboxProject(p))
  const defaultAliases = managedProjectAliases(projects, t).map((c) => ({
    project: c.project,
    aliases: [c.group, c.label],
  }))

  const tagMenu = useProjectTagMenu({
    value: title,
    onValueChange: setTitle,
    onPick: (project, viaKeyboard) => {
      setSelectedProjectId(project.id)
      // Picking with the keyboard on a titled task is the whole gesture: file
      // it and submit, rather than making Enter mean two different things.
      if (viaKeyboard) {
        const cleanTitle = tagMenu.withoutTag(title)
        if (cleanTitle) handleAdd(project.id)
      }
    },
    // Quick add is where a tag may name a project that does not exist yet; the
    // name stays in the text and `handleAdd` creates it on submit.
    onCreate: () => {},
    onShown: (option_count) => track('quickadd.autocomplete_shown', { option_count }),
    onSelect: (option) =>
      track('quickadd.autocomplete_select', {
        is_new: option.isNew,
        is_default: option.isDefault === true,
      }),
  })

  const projectLabel = (p: Project) => {
    if (isInboxProject(p)) return t('inbox.title')
    if (!isDefaultProject(p)) return `#${p.name}`
    return p.group === 'Work' ? t('quickAdd.workDefault') : t('quickAdd.personalDefault')
  }

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const handleAdd = async (preselectedProjectId?: number) => {
    const rawTitle = title.trim()
    if (!rawTitle) return
    if (repeating && weekdays.size === 0) return

    let cleanTitle = rawTitle
    let targetProjectId: number | null = preselectedProjectId ?? selectedProjectId
    let resolved: 'preselected' | 'tag' | 'inbox' = targetProjectId !== null ? 'preselected' : 'tag'

    if (targetProjectId !== null) {
      // Project already known — strip any trailing #tag from the (possibly stale) title
      cleanTitle = rawTitle.replace(/\s*#[^\s#]*$/, '').trim() || rawTitle
    } else {
      // No pre-selected project — find or create one from a #tag in the title.
      const parsed = parseTaskInput(rawTitle, userProjects, defaultAliases)
      cleanTitle = parsed.cleanTitle
      targetProjectId = parsed.projectId

      if (parsed.newProjectName) {
        try {
          const newProj = await createProject.mutateAsync({
            name: parsed.newProjectName,
            group: 'Work',
          })
          targetProjectId = newProj.id
        } catch {
          // Fallback if creation fails
        }
      }

      if (targetProjectId === null) {
        // Nothing named a project. Parking an idea must never cost a
        // Work-vs-Personal decision, so it goes to the Inbox and gets sorted
        // in the Inbox phase of a review.
        targetProjectId = inboxProj?.id ?? null
        resolved = 'inbox'
      }
    }

    if (targetProjectId === null) return

    // `resolved` says which route through the #tag rules the user actually
    // took, which is the useful thing about quick add -- derived from the
    // parse result rather than measured inside the (pure) parser.
    track('quickadd.submit', {
      resolved,
      had_hash: rawTitle.includes('#'),
      repeating,
      weekday_count: repeating ? weekdays.size : 0,
    })
    if (repeating) {
      createRecurrence.mutate({
        projectId: targetProjectId,
        rule: {
          title: cleanTitle,
          weekdays: weekdaysToMask(weekdays),
        },
      })
    } else {
      createTask.mutate({
        projectId: targetProjectId,
        task: { title: cleanTitle },
      })
    }
    reset()
  }

  const reset = () => {
    setTitle('')
    setSelectedProjectId(null)
    setRepeating(false)
    setWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]))
  }

  return (
    <div className="card p-3 mb-6 bg-surface !overflow-visible relative" data-hotkeys-off>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              ref={(el) => {
                inputRef.current = el
                tagMenu.anchorRef.current = el
              }}
              className="input w-full animate-[fadeIn_0.2s_ease]"
              title={t('common.newTaskHotkey')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                // The menu answers Enter, Tab, Escape and the arrows while open.
                if (tagMenu.onKeyDown(e)) return
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') {
                  reset()
                  // Release focus so the hotkey can re-open the field.
                  inputRef.current?.blur()
                }
              }}
              placeholder={t('quickAdd.placeholder')}
            />
            {tagMenu.menu}
          </div>

          <button
            type="button"
            className={`asgn gap-1 h-[34px] px-3 ${repeating ? 'on' : ''}`}
            onClick={() => setRepeating((v) => !v)}
            title={t('task.repeatTooltip')}
          >
            <Ic n="plan" s={11} /> {t('task.repeatToggle')}
          </button>

          <button
            className="btn btn-p btn-s h-[34px] px-4 font-semibold shrink-0"
            onClick={() => handleAdd()}
            disabled={!title.trim() || (repeating && weekdays.size === 0)}
          >
            <Ic n="plus" s={12} />
            {t('quickAdd.submit')}
          </button>
        </div>

        {selectedProjectId === null && title.trim() !== '' && !tagMenu.open && (
          <div className="text-[11px] text-ink-3 animate-[fadeIn_0.15s_ease]">
            {t('quickAdd.inboxHint')}
          </div>
        )}

        {selectedProjectId !== null && (() => {
          const proj = projects.find((p) => p.id === selectedProjectId)
          return proj ? (
            <div className="flex items-center gap-1.5 text-xs text-ink-2 animate-[fadeIn_0.15s_ease]">
              <span className="text-ink-3">{t('quickAdd.projectLabel')}:</span>
              <span className="font-medium text-accent">{projectLabel(proj)}</span>
              <button
                type="button"
                className="text-ink-3 hover:text-ink ml-0.5"
                onClick={() => setSelectedProjectId(null)}
                title={t('common.cancel')}
              >
                <Ic n="x" s={10} />
              </button>
            </div>
          ) : null
        })()}

        {repeating && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {weekdayShortLabels(i18n.language).map((label, day) => (
              <button
                key={day}
                type="button"
                className={`asgn gap-1 ${weekdays.has(day) ? 'on' : ''}`}
                onClick={() => toggleWeekday(day)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

