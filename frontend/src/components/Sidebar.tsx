import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client'
import {
  useCreateProject,
  useCurrentUser,
  useLogout,
  useProjects,
  mustHaveCount,
  useReorderProject,
} from '../api/hooks'
import { useTheme } from '../theme'
import { groupLabel, useLanguage } from '../i18n'
import { isDefaultProject, isInboxProject } from '../api/types'
import { setNavCause, track } from '../lib/analytics'
import { Ic, type IconName } from './Icon'
import { Kbd } from './Kbd'
import { HOTKEYS } from '../lib/hotkeys/bindings'
import { useOverlayOpen } from '../lib/hotkeys/HotkeyProvider'
import { useOverlays } from './OverlayHost'

const DEFAULT_GROUPS = ['Work', 'Personal']

function NavLink({
  to,
  icon,
  label,
  badge,
  badgeMust,
  chord,
  onClick,
}: {
  to: string
  icon: IconName
  label: string
  badge?: number | null
  badgeMust?: boolean
  chord?: string
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      className="nav"
      activeProps={{ className: 'nav on' }}
      onClick={() => {
        // Separates clicking the sidebar from the `g` jumps and the palette,
        // which all end at the same route.
        setNavCause('sidebar')
        onClick?.()
      }}
    >
      <Ic n={icon} s={14} /> {label}
      {badge != null && <span className={`nav-badge ${badgeMust ? 'must' : ''}`}>{badge}</span>}
      {/* Teaches the shortcut in place. Hidden on touch layouts, where the
          badge also competes for the same slot. */}
      {chord && badge == null && (
        <span className="ml-auto hidden opacity-60 md:inline-flex">
          <Kbd chord={chord} />
        </span>
      )}
    </Link>
  )
}

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const { data: user } = useCurrentUser()
  const { theme, toggle } = useTheme()
  const { lang, toggle: toggleLang } = useLanguage()
  const createProject = useCreateProject()
  const reorderProject = useReorderProject()
  const logout = useLogout()
  const navigate = useNavigate()

  const overlayOpen = useOverlayOpen()
  const { openPalette, openHelp } = useOverlays()
  const [addingGroup, setAddingGroup] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const submittingRef = useRef(false)

  const allTasks = projects.flatMap((p) => p.tasks)
  const mustCount = mustHaveCount(projects)
  const todayCount = allTasks.filter((t) => t.assigned_today && !t.completed).length

  // The Inbox is a project, but it is not one of the groups you file into --
  // it gets its own entry above them, next to the other views.
  const inbox = projects.find(isInboxProject)
  const inboxCount = inbox ? inbox.tasks.filter((t) => !t.completed).length : 0

  const groups = new Map<string, typeof projects>()
  for (const g of DEFAULT_GROUPS) groups.set(g, [])
  for (const p of projects) {
    if (isInboxProject(p)) continue
    if (!groups.has(p.group)) groups.set(p.group, [])
    groups.get(p.group)!.push(p)
  }

  const startAdding = (group: string) => {
    setAddingGroup(group)
    setNewName('')
  }
  const cancelAdding = () => {
    setAddingGroup(null)
    setNewName('')
  }
  const submitAdding = (group: string) => {
    if (submittingRef.current) return
    const name = newName.trim()
    if (!name) {
      cancelAdding()
      return
    }
    submittingRef.current = true
    createProject.mutate(
      { name, group },
      {
        onSuccess: (project) => {
          submittingRef.current = false
          cancelAdding()
          navigate({ to: '/projects/$projectId', params: { projectId: String(project.id) } })
        },
        onError: (err) => {
          submittingRef.current = false
          alert(err instanceof ApiError ? err.message : t('sidebar.createProjectError'))
        },
      },
    )
  }

  const close = () => onClose?.()

  return (
    <div
      className={[
        'flex w-[230px] min-w-[230px] flex-col overflow-y-auto border-r border-line bg-surface py-3.5',
        'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
        'md:relative md:translate-x-0 md:transition-none',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
    >
      <div className="flex items-center gap-[7px] px-[18px] pt-1 pb-[18px] font-serif text-[17px] font-semibold tracking-[-0.3px] text-accent">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect width="20" height="20" rx="5" fill="var(--accent)" />
          <path d="M5 7h10M5 10h7M5 13h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        DTask
      </div>

      <button
        type="button"
        className="nav"
        onClick={() => {
          close()
          openPalette()
        }}
      >
        <Ic n="search" s={14} /> {t('palette.openLabel')}
        <span className="ml-auto hidden opacity-60 md:inline-flex">
          <Kbd chord={HOTKEYS.palette.chords[0]} />
        </span>
      </button>

      {inbox && (
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(inbox.id) }}
          className="nav"
          activeProps={{ className: 'nav on' }}
          onClick={() => {
            setNavCause('sidebar')
            close()
          }}
        >
          <Ic n="inbox" s={14} /> {t('inbox.title')}
          {inboxCount > 0 && (
            <span className="nav-badge" title={t('inbox.badgeTooltip', { count: inboxCount })}>
              {inboxCount}
            </span>
          )}
        </Link>
      )}

      <NavLink
        to="/"
        icon="today"
        label={t('nav.today')}
        badge={todayCount > 0 ? todayCount : null}
        badgeMust={mustCount > 0}
        chord={HOTKEYS.goToday.chords[0]}
        onClick={close}
      />
      <NavLink
        to="/plan"
        icon="plan"
        label={t('nav.plan')}
        chord={HOTKEYS.goPlan.chords[0]}
        onClick={close}
      />
      <NavLink
        to="/review"
        icon="review"
        label={t('nav.review')}
        chord={HOTKEYS.goReview.chords[0]}
        onClick={close}
      />
      <NavLink
        to="/habits"
        icon="habits"
        label={t('nav.habits')}
        chord={HOTKEYS.goHabits.chords[0]}
        onClick={close}
      />
      <NavLink
        to="/report"
        icon="chart"
        label={t('nav.report')}
        chord={HOTKEYS.goReport.chords[0]}
        onClick={close}
      />
      <NavLink
        to="/worklog"
        icon="log"
        label={t('nav.worklog')}
        chord={HOTKEYS.goWorkLog.chords[0]}
        onClick={close}
      />

      <hr className="s-divider" />

      {[...groups.entries()].map(([group, ps]) => (
        <div key={group}>
          <div className="s-lbl flex items-center justify-between pr-2">
            <span>{groupLabel(t, group)}</span>
            <button
              className="text-ink-3 hover:text-accent"
              onClick={() => startAdding(group)}
              title={t('sidebar.addProjectTo', { group: groupLabel(t, group) })}
            >
              <Ic n="plus" s={11} />
            </button>
          </div>
          {(() => {
            const defaultProject = ps.find(isDefaultProject)
            const regularProjects = ps.filter((p) => !isDefaultProject(p))
            return (
              <>
                {defaultProject && (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: String(defaultProject.id) }}
                    className="nav italic text-ink-3"
                    activeProps={{ className: 'nav on' }}
                    onClick={() => {
                      setNavCause('sidebar')
                      close()
                    }}
                  >
                    <Ic n="folder" s={13} />
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {t('quickAdd.noProject')}
                    </span>
                  </Link>
                )}
                {regularProjects.map((p, idx) => (
                  <div key={p.id} className="group/project relative flex items-center w-full">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: String(p.id) }}
                      className="nav !pr-[52px]"
                      activeProps={{ className: 'nav on' }}
                      onClick={() => {
                        setNavCause('sidebar')
                        close()
                      }}
                    >
                      <Ic n="folder" s={13} />
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {p.name}
                      </span>
                    </Link>
                    <div className="absolute right-4.5 hidden group-hover/project:flex items-center gap-0.5 z-10">
                      <button
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          reorderProject.mutate({ id: p.id, direction: 'up' })
                        }}
                        className="flex items-center justify-center h-4.5 w-4.5 rounded border border-line bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-surface cursor-pointer text-[8px] leading-none"
                        title={t('project.moveUp')}
                      >
                        ▲
                      </button>
                      <button
                        disabled={idx === regularProjects.length - 1}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          reorderProject.mutate({ id: p.id, direction: 'down' })
                        }}
                        className="flex items-center justify-center h-4.5 w-4.5 rounded border border-line bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-surface cursor-pointer text-[8px] leading-none"
                        title={t('project.moveDown')}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )
          })()}
          {addingGroup === group && (
            <div className="px-[18px] py-1">
              <input
                autoFocus
                className="input w-full px-2 py-1 text-[12px]"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdding(group)
                  if (e.key === 'Escape') cancelAdding()
                }}
                // An overlay opening steals focus; that must not count as
                // confirming a half-typed project name.
                onBlur={() => {
                  if (!overlayOpen) submitAdding(group)
                }}
                placeholder={t('sidebar.projectNamePlaceholder')}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex-1" />
      <hr className="s-divider" />
      {user && (
        <>
          <div
            className="overflow-hidden px-[18px] pb-1 text-[11px] text-ellipsis whitespace-nowrap text-ink-3"
            title={user.email}
          >
            {user.email}
          </div>
          <button className="nav" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <Ic n="logout" s={14} />
            {t('sidebar.logout')}
          </button>
        </>
      )}
      <button
        className="nav"
        onClick={() => {
          track('pref.theme', { to: theme === 'dark' ? 'light' : 'dark' })
          toggle()
        }}
      >
        <Ic n={theme === 'dark' ? 'sun' : 'moon'} s={14} />
        {theme === 'dark' ? t('sidebar.lightMode') : t('sidebar.darkMode')}
      </button>
      {/* Language names stay in their own language, so they live outside the catalogs. */}
      <button
        className="nav"
        onClick={() => {
          track('pref.lang', { to: lang === 'en' ? 'ru' : 'en' })
          toggleLang()
        }}
      >
        <Ic n="globe" s={14} />
        {lang === 'en' ? 'Русский' : 'English'}
      </button>
      <button className="nav" onClick={openHelp}>
        <Ic n="help" s={14} />
        {t('hotkeys.title')}
        <span className="ml-auto hidden opacity-60 md:inline-flex">
          <Kbd chord={HOTKEYS.help.chords[0]} />
        </span>
      </button>
      <div className="px-[18px] pt-1 text-[10px] text-ink-3" title="Build version">
        v{__APP_VERSION__}
      </div>
    </div>
  )
}
