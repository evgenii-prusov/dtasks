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

interface AutocompleteOption {
  isNew: boolean
  /** What the option is called: a project name, a new tag, or a default label. */
  name: string
  /** True for the two catch-all "..." projects, which get a friendlier label. */
  isDefault?: boolean
  project?: Project
}

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

  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
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

  // Find default projects (named '...') and the one Inbox
  const inboxProj = projects.find(isInboxProject)
  const defaultWorkProj = projects.find((p) => isDefaultProject(p) && p.group === 'Work')
  const defaultPersonalProj = projects.find((p) => isDefaultProject(p) && p.group === 'Personal')

  const userProjects = projects.filter((p) => !isDefaultProject(p) && !isInboxProject(p))

  // The server-managed destinations, offered by the #-menu under readable labels
  // instead of their reserved names. The Inbox leads -- "#" then Enter parks the
  // task without deciding anything -- followed by the two catch-alls.
  const defaultChoices = [
    { project: inboxProj, group: 'Inbox', label: t('quickAdd.inboxDefault') },
    { project: defaultWorkProj, group: 'Work', label: t('quickAdd.workDefault') },
    { project: defaultPersonalProj, group: 'Personal', label: t('quickAdd.personalDefault') },
  ].filter((c): c is typeof c & { project: Project } => c.project !== undefined)

  const defaultAliases = defaultChoices.map((c) => ({
    project: c.project,
    aliases: [c.group, c.label],
  }))

  // Detect #tag query in title (at current end or before whitespace)
  const hashMatch = title.match(/(?:^|\s)#([^\s#]*)$/)
  const tagQuery = hashMatch ? hashMatch[1] : null

  // Generate autocomplete options
  const autocompleteOptions: AutocompleteOption[] = []
  if (tagQuery !== null) {
    const qLower = tagQuery.toLowerCase()
    // Both the English group name and the translated label are searchable, so
    // "#wo" and "#Рабо" each find the Work default.
    defaultChoices
      .filter(
        (c) => c.group.toLowerCase().includes(qLower) || c.label.toLowerCase().includes(qLower),
      )
      .forEach((c) => {
        autocompleteOptions.push({ isNew: false, isDefault: true, name: c.label, project: c.project })
      })

    const matching = userProjects.filter((p) => p.name.toLowerCase().includes(qLower))
    matching.forEach((p) => {
      autocompleteOptions.push({ isNew: false, name: p.name, project: p })
    })

    const hasExactMatch = userProjects.some((p) => p.name.toLowerCase() === qLower)
    if (tagQuery.trim().length > 0 && !hasExactMatch) {
      autocompleteOptions.push({ isNew: true, name: tagQuery.trim() })
    }
  }

  const projectLabel = (p: Project) => {
    if (isInboxProject(p)) return t('inbox.title')
    if (!isDefaultProject(p)) return `#${p.name}`
    return p.group === 'Work' ? t('quickAdd.workDefault') : t('quickAdd.personalDefault')
  }

  useEffect(() => {
    if (tagQuery !== null && autocompleteOptions.length > 0) {
      track('quickadd.autocomplete_shown', { option_count: autocompleteOptions.length })
      setShowAutocomplete(true)
      setSelectedIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [tagQuery, autocompleteOptions.length])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const selectOption = (opt: AutocompleteOption) => {
    track('quickadd.autocomplete_select', { is_new: opt.isNew, is_default: opt.isDefault === true })
    if (opt.isNew) {
      setTitle((prev) => prev.replace(/(?:^|\s)#([^\s#]*)$/, ` #${opt.name}`).trimStart())
    } else if (opt.project) {
      setSelectedProjectId(opt.project.id)
      setTitle((prev) => prev.replace(/(?:^|\s)#([^\s#]*)$/, '').trim())
    }
    setShowAutocomplete(false)
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
    setShowAutocomplete(false)
    setRepeating(false)
    setWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]))
  }

  return (
    <div className="card p-3 mb-6 bg-surface !overflow-visible relative" data-hotkeys-off>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1" ref={dropdownRef}>
            <input
              ref={inputRef}
              className="input w-full animate-[fadeIn_0.2s_ease]"
              title={t('common.newTaskHotkey')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (showAutocomplete && autocompleteOptions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIndex((prev) => (prev + 1) % autocompleteOptions.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIndex((prev) => (prev - 1 + autocompleteOptions.length) % autocompleteOptions.length)
                    return
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    const opt = autocompleteOptions[selectedIndex]
                    selectOption(opt)
                    // For existing projects with a non-empty title, submit immediately.
                    // Pass the project ID directly to avoid reading stale selectedProjectId state.
                    if (!opt.isNew && opt.project) {
                      const cleanTitle = title.replace(/(?:^|\s)#([^\s#]*)$/, '').trim()
                      if (cleanTitle) handleAdd(opt.project.id)
                    }
                    return
                  }
                }
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') {
                  if (showAutocomplete) setShowAutocomplete(false)
                  else {
                    reset()
                    // Release focus so the hotkey can re-open the field.
                    inputRef.current?.blur()
                  }
                }
              }}
              placeholder={t('quickAdd.placeholder')}
            />

            {showAutocomplete && autocompleteOptions.length > 0 && (
              <div className="absolute top-full left-0 z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-md animate-[fadeIn_0.15s_ease]">
                {autocompleteOptions.map((opt, idx) => (
                  <button
                    key={opt.isNew ? `new-${opt.name}` : `proj-${opt.project!.id}`}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                      idx === selectedIndex
                        ? 'bg-accent-2 text-accent font-medium'
                        : 'hover:bg-surface-2 text-ink'
                    }`}
                    onClick={() => selectOption(opt)}
                  >
                    {opt.isNew ? (
                      <>
                        <Ic n="plus" s={12} />
                        <span>{t('quickAdd.createProject', { name: opt.name })}</span>
                      </>
                    ) : opt.isDefault ? (
                      <>
                        <Ic n="folder" s={12} />
                        <span className="flex-1">{opt.name}</span>
                        <span className="text-[10px] text-ink-3 uppercase">{opt.project!.group}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-ink-3">#</span>
                        <span className="flex-1">{opt.project!.name}</span>
                        <span className="text-[10px] text-ink-3 uppercase">{opt.project!.group}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
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

        {selectedProjectId === null && title.trim() !== '' && !tagQuery && (
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

