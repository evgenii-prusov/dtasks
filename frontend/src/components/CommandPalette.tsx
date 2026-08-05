import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useCreateTask, useProjects } from '../api/hooks'
import { isDefaultProject } from '../api/types'
import {
  GROUP_ORDER,
  useCommandItems,
  type CommandItem,
  type CommandKind,
} from '../lib/commands/useCommandItems'
import { setPendingQuickAdd } from '../lib/pendingQuickAdd'
import { parseTaskInput } from '../lib/taskInput'
import type { LabelKey } from '../lib/hotkeys/bindings'
import { Kbd } from './Kbd'
import { Ic } from './Icon'

const GROUP_LABEL_KEYS: Record<CommandKind, LabelKey> = {
  page: 'palette.groupPages',
  project: 'palette.groupProjects',
  task: 'palette.groupTasks',
  action: 'palette.groupActions',
}

/**
 * One overlay for navigating anywhere and creating anything.
 *
 * Focus never leaves the input — results are `role="option"` divs tracked by
 * `aria-activedescendant`, which is also why Tab is swallowed rather than
 * needing a real focus trap.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createTask = useCreateTask()
  const { data: projects = [] } = useProjects()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { groups, flat } = useCommandItems(query)

  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const currentProjectId = useMemo(() => {
    const match = pathname.match(/^\/projects\/(\d+)/)
    return match ? Number(match[1]) : null
  }, [pathname])

  const itemRanRef = useRef(false)

  useEffect(() => setActiveIndex(0), [query])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => {
      if (!itemRanRef.current && previous && document.contains(previous)) previous.focus()
    }
  }, [])

  // Keep the highlighted row visible without moving focus off the input.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const createTaskFromQuery = () => {
    const title = query.trim()
    if (!title) return
    const userProjects = projects.filter((p) => !isDefaultProject(p))
    const parsed = parseTaskInput(title, userProjects)

    // Unambiguous: an explicit #tag, or we are already inside a project.
    const projectId = parsed.projectId ?? currentProjectId
    if (projectId !== null && !parsed.newProjectName) {
      createTask.mutate({ projectId, task: { title: parsed.cleanTitle } })
      return
    }

    // Otherwise hand the raw text to QuickAddTask, which owns the
    // tag-autocreate and Work/Personal flows.
    setPendingQuickAdd(title)
    navigate({ to: '/' })
  }

  const run = (item: CommandItem) => {
    itemRanRef.current = true
    switch (item.target.type) {
      case 'page':
        navigate({ to: item.target.to })
        break
      case 'project':
        navigate({
          to: '/projects/$projectId',
          params: { projectId: String(item.target.projectId) },
        })
        break
      case 'task':
        navigate({
          to: '/projects/$projectId',
          params: { projectId: String(item.target.projectId) },
          search: { task: item.target.taskId },
        })
        break
      case 'createTask':
        createTaskFromQuery()
        break
    }
    onClose()
  }

  const move = (delta: number) => {
    if (flat.length === 0) return
    // Clamped, not wrapped: in a 30-item grouped list, wrapping disorients.
    setActiveIndex((i) => Math.min(flat.length - 1, Math.max(0, i + delta)))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(Math.max(0, flat.length - 1))
        break
      case 'Tab':
        // The input is the only focusable thing in here; keep it that way.
        e.preventDefault()
        move(e.shiftKey ? -1 : 1)
        break
      case 'Enter': {
        e.preventDefault()
        const item = flat[activeIndex]
        if (item) run(item)
        break
      }
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose()
        break
      default:
        if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'p')) {
          e.preventDefault()
          move(e.key === 'n' ? 1 : -1)
        }
    }
  }

  let renderIndex = -1

  return (
    <>
      <div className="overlay-backdrop" aria-hidden onClick={onClose} />
      <div
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        data-hotkeys-off
      >
        <div className="cmdk-input-row">
          <Ic n="search" s={14} />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('palette.placeholder')}
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            aria-activedescendant={flat[activeIndex] ? `cmdk-opt-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="overlay-body" id="cmdk-list" role="listbox" ref={listRef}>
          {flat.length === 0 && <div className="cmdk-empty">{t('palette.empty')}</div>}

          {GROUP_ORDER.map((kind) => {
            const group = groups.find((g) => g.kind === kind)
            if (!group || group.items.length === 0) return null
            return (
              <div key={kind}>
                <div className="kbd-group-label">{t(GROUP_LABEL_KEYS[kind])}</div>
                {group.items.map((item) => {
                  renderIndex += 1
                  const index = renderIndex
                  return (
                    <div
                      key={item.id}
                      id={`cmdk-opt-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`cmdk-item ${item.muted ? 'muted' : ''}`}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => run(item)}
                    >
                      <span className="cmdk-item-label">{item.label}</span>
                      {item.hint && <span className="cmdk-item-hint">{item.hint}</span>}
                      {item.chord && (
                        <span className="kbd-keys">
                          <Kbd chord={item.chord} />
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
