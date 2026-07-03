import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError } from '../api/client'
import { useCreateProject, useProjects, mustHaveCount } from '../api/hooks'
import { useTheme } from '../theme'
import { Ic, type IconName } from './Icon'

const DEFAULT_GROUPS = ['Work', 'Personal']

function NavLink({
  to,
  icon,
  label,
  badge,
  badgeMust,
}: {
  to: string
  icon: IconName
  label: string
  badge?: number | null
  badgeMust?: boolean
}) {
  return (
    <Link to={to} className="nav" activeProps={{ className: 'nav on' }}>
      <Ic n={icon} s={14} /> {label}
      {badge != null && <span className={`nav-badge ${badgeMust ? 'must' : ''}`}>{badge}</span>}
    </Link>
  )
}

export function Sidebar() {
  const { data: projects = [] } = useProjects()
  const { theme, toggle } = useTheme()
  const createProject = useCreateProject()
  const navigate = useNavigate()

  const [addingGroup, setAddingGroup] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const submittingRef = useRef(false)

  const allTasks = projects.flatMap((p) => p.tasks)
  const mustCount = mustHaveCount(projects)
  const todayCount = allTasks.filter((t) => t.assigned_today && !t.completed).length

  const groups = new Map<string, typeof projects>()
  for (const g of DEFAULT_GROUPS) groups.set(g, [])
  for (const p of projects) {
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
          alert(err instanceof ApiError ? err.message : 'Could not create the project.')
        },
      },
    )
  }

  return (
    <div className="flex w-[230px] min-w-[230px] flex-col overflow-y-auto border-r border-line bg-surface py-3.5">
      <div className="flex items-center gap-[7px] px-[18px] pt-1 pb-[18px] font-serif text-[17px] font-semibold tracking-[-0.3px] text-accent">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect width="20" height="20" rx="5" fill="var(--accent)" />
          <path d="M5 7h10M5 10h7M5 13h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        FlowTask
      </div>

      <NavLink
        to="/"
        icon="today"
        label="Today"
        badge={todayCount > 0 ? todayCount : null}
        badgeMust={mustCount > 0}
      />
      <NavLink to="/plan" icon="plan" label="Plan" />
      <NavLink to="/review" icon="review" label="Review" />
      <NavLink to="/habits" icon="habits" label="Habits" />

      <hr className="s-divider" />

      {[...groups.entries()].map(([group, ps]) => (
        <div key={group}>
          <div className="s-lbl flex items-center justify-between pr-2">
            <span>{group}</span>
            <button
              className="text-ink-3 hover:text-accent"
              onClick={() => startAdding(group)}
              title={`Add project to ${group}`}
            >
              <Ic n="plus" s={11} />
            </button>
          </div>
          {ps.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: String(p.id) }}
              className="nav"
              activeProps={{ className: 'nav on' }}
            >
              <Ic n="folder" s={13} />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</span>
            </Link>
          ))}
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
                onBlur={() => submitAdding(group)}
                placeholder="Project name…"
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex-1" />
      <hr className="s-divider" />
      <button className="nav" onClick={toggle}>
        <Ic n={theme === 'dark' ? 'sun' : 'moon'} s={14} />
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
    </div>
  )
}
