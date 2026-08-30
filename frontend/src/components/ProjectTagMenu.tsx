import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useProjects } from '../api/hooks'
import { isDefaultProject, isInboxProject, type Project } from '../api/types'
import { Ic } from './Icon'

/** What a `#` menu row offers: an existing project, or a project to create. */
export interface ProjectTagOption {
  isNew: boolean
  /** Project name, the readable label of a server-managed one, or the new name. */
  name: string
  /** True for the Inbox and the two "..." catch-alls, which get friendlier labels. */
  isDefault?: boolean
  project?: Project
}

/** A `#tag` being typed: at the end of the value, or just before whitespace. */
const TAG_AT_CARET = /(?:^|\s)#([^\s#]*)$/

/**
 * The server-managed projects a tag can name, with the aliases that reach them:
 * the English group name and the localized label.
 *
 * Exported because `parseTaskInput` needs the same list to resolve a tag the
 * user typed out in full -- the menu and the parser must agree on what `#Work`
 * means.
 */
export function managedProjectAliases(
  projects: Project[],
  t: TFunction,
): { project: Project; group: string; label: string }[] {
  const byGroup = (group: string) =>
    projects.find((p) => isDefaultProject(p) && p.group === group)
  return [
    { project: projects.find(isInboxProject), group: 'Inbox', label: t('quickAdd.inboxDefault') },
    { project: byGroup('Work'), group: 'Work', label: t('quickAdd.workDefault') },
    { project: byGroup('Personal'), group: 'Personal', label: t('quickAdd.personalDefault') },
  ].filter((c): c is typeof c & { project: Project } => c.project !== undefined)
}

export interface UseProjectTagMenu {
  open: boolean
  options: ProjectTagOption[]
  /** Attach to the input the menu hangs off; also anchors it and click-outside. */
  anchorRef: RefObject<HTMLInputElement | null>
  /** Call first from the input's onKeyDown; true means the menu consumed the key. */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => boolean
  /** The menu itself, or null. Render it anywhere -- it positions itself. */
  menu: React.ReactNode
  /** The value with the `#tag` being typed removed. */
  withoutTag: (value: string) => string
}

/**
 * The `#project` menu, shared by every field that names a project.
 *
 * One implementation on purpose: `parseTaskInput` already exists so the typed-out
 * rules cannot drift between call sites, and a second copy of the menu would let
 * the *offered* ones drift instead.
 *
 * The menu is viewport-fixed rather than absolutely positioned, because its
 * fields live inside `.card`, which clips (`overflow: hidden`) -- the same reason
 * the habit heatmap's hint is fixed. Like that hint, it hides on scroll rather
 * than tracking the anchor.
 */
export function useProjectTagMenu({
  value,
  onValueChange,
  onPick,
  onCreate,
  onShown,
  onSelect,
}: {
  value: string
  onValueChange: (next: string) => void
  /** A project was chosen. `viaKeyboard` distinguishes Enter/Tab from a click. */
  onPick: (project: Project, viaKeyboard: boolean) => void
  /** Omit to offer existing projects only -- no "create project" row. */
  onCreate?: (name: string) => void
  onShown?: (optionCount: number) => void
  onSelect?: (option: ProjectTagOption) => void
}): UseProjectTagMenu {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const [dismissed, setDismissed] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const anchorRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null)

  const userProjects = projects.filter((p) => !isDefaultProject(p) && !isInboxProject(p))
  // The server-managed destinations lead, under readable labels rather than
  // their reserved names: "#" then Enter parks in the Inbox without deciding.
  const managed = managedProjectAliases(projects, t)

  const match = value.match(TAG_AT_CARET)
  const query = match ? match[1] : null

  const options: ProjectTagOption[] = []
  if (query !== null) {
    const q = query.toLowerCase()
    // Both the English group name and the translated label are searchable, so
    // "#wo" and "#Рабо" each find the Work default.
    managed
      .filter((c) => c.group.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
      .forEach((c) => options.push({ isNew: false, isDefault: true, name: c.label, project: c.project }))

    userProjects
      .filter((p) => p.name.toLowerCase().includes(q))
      .forEach((p) => options.push({ isNew: false, name: p.name, project: p }))

    const exact = userProjects.some((p) => p.name.toLowerCase() === q)
    if (onCreate && query.trim().length > 0 && !exact) {
      options.push({ isNew: true, name: query.trim() })
    }
  }

  const open = query !== null && options.length > 0 && !dismissed

  // Reopening is the caret returning to a tag, so a dismissal only lasts as long
  // as the tag the user escaped out of.
  useEffect(() => {
    if (query === null) setDismissed(false)
  }, [query])

  useEffect(() => {
    if (!open) return
    setSelectedIndex(0)
    onShown?.(options.length)
    setRect(() => {
      const r = anchorRef.current?.getBoundingClientRect()
      return r ? { left: r.left, top: r.bottom + 4 } : null
    })
    // Only the tag itself should re-measure and re-announce, not every keystroke
    // that leaves the same query in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, options.length])

  // Fixed to the viewport, so a scroll would leave it detached from its field.
  useEffect(() => {
    if (!open) return
    const hide = () => setDismissed(true)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      setDismissed(true)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const withoutTag = (v: string) => v.replace(TAG_AT_CARET, '').trim()

  const choose = (option: ProjectTagOption, viaKeyboard: boolean) => {
    onSelect?.(option)
    if (option.isNew) {
      // Leave the tag in the text: the project does not exist yet, so the name
      // has to survive until whoever creates it reads the value back.
      onValueChange(value.replace(TAG_AT_CARET, ` #${option.name}`).trimStart())
      onCreate?.(option.name)
    } else if (option.project) {
      onValueChange(withoutTag(value))
      onPick(option.project, viaKeyboard)
    }
    setDismissed(true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!open) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % options.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + options.length) % options.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(options[selectedIndex], true)
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setDismissed(true)
      return true
    }
    return false
  }

  const menu = open ? (
    <div
      ref={menuRef}
      // Plain buttons, not a listbox: focus stays in the field, so the full
      // combobox pattern would need aria-activedescendant wiring this does not
      // have -- and a half-declared listbox reads worse than no role at all.
      className="fixed z-50 max-h-48 w-64 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-md animate-[fadeIn_0.15s_ease]"
      style={{ left: rect?.left ?? 0, top: rect?.top ?? 0 }}
    >
      {options.map((option, idx) => (
        <button
          key={option.isNew ? `new-${option.name}` : `proj-${option.project!.id}`}
          type="button"
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
            idx === selectedIndex ? 'bg-accent-2 text-accent font-medium' : 'hover:bg-surface-2 text-ink'
          }`}
          // The field would otherwise blur first, and a blur-to-save editor
          // (the task row) would commit before the click ever landed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(option, false)}
        >
          {option.isNew ? (
            <>
              <Ic n="plus" s={12} />
              <span>{t('quickAdd.createProject', { name: option.name })}</span>
            </>
          ) : option.isDefault ? (
            <>
              <Ic n={isInboxProject(option.project!) ? 'inbox' : 'folder'} s={12} />
              <span className="flex-1">{option.name}</span>
              <span className="text-[10px] text-ink-3 uppercase">{option.project!.group}</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-ink-3">#</span>
              <span className="flex-1">{option.project!.name}</span>
              <span className="text-[10px] text-ink-3 uppercase">{option.project!.group}</span>
            </>
          )}
        </button>
      ))}
    </div>
  ) : null

  return { open, options, anchorRef, onKeyDown, menu, withoutTag }
}
