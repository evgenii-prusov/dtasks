import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mustHaveCount } from '../api/hooks'
import { useCreateRecurrence } from '../api/hooks'
import { useCreateTask } from '../api/hooks'
import { useProjects } from '../api/hooks'
import { useUpdateTask } from '../api/hooks'
import { isInboxProject } from '../api/types'
import { groupLabel } from '../i18n'
import { Ic } from '../components/Icon'
import { AddTaskForm } from '../components/AddTaskForm'
import { TaskRow } from '../components/TaskRow'
import { QuickAddTask } from '../components/QuickAddTask'
import { track } from '../lib/analytics'
import { HOTKEYS } from '../lib/hotkeys/bindings'
import { useHotkey } from '../lib/hotkeys/useHotkey'
import { useTaskNav } from '../lib/taskNav'

const MUST_LIMIT = 2

export function PlanView() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  const createRecurrence = useCreateRecurrence()
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [focusQuickAdd, setFocusQuickAdd] = useState(false)
  const nav = useTaskNav()

  const mustCount = mustHaveCount(projects)
  const greenTodayCount = projects.reduce(
    (n, p) =>
      n + p.tasks.filter((t) => t.is_green && !t.completed && t.assigned_today).length,
    0,
  )

  const setMust = (id: number, v: boolean) => {
    if (v && mustCount >= MUST_LIMIT) {
      alert(t('plan.mustLimit', { count: MUST_LIMIT }))
      return
    }
    updateTask.mutate({ id, patch: { must_have: v } })
  }

  const query = search.trim().toLowerCase()

  // Quick add is hidden while searching, so it cannot claim the hotkey itself:
  // drop the search first and hand focus to the field once it is back.
  useHotkey(
    HOTKEYS.newTask.chords,
    () => {
      setSearch('')
      setFocusQuickAdd(true)
    },
    { enabled: query.length > 0, name: 'newTask' },
  )

  useHotkey(
    HOTKEYS.togglePlanTab.chords,
    () => {
      setTab((tb) => (tb === 'today' ? 'week' : 'today'))
    },
    { name: 'togglePlanTab' },
  )

  const searchResults = query
    ? projects.flatMap((p) =>
        p.tasks
          .filter((t) => !t.completed && t.title.toLowerCase().includes(query))
          .map((t) => ({ task: t, project: p })),
      )
    : []

  // Debounced so this measures searches, not keystrokes. Length and result
  // count only -- the query itself is the user's task titles.
  const resultCount = searchResults.length
  useEffect(() => {
    if (!query) return
    const id = setTimeout(() => {
      track('search.query', { query_length: query.length, result_count: resultCount })
    }, 400)
    return () => clearTimeout(id)
  }, [query, resultCount])

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">{t('plan.title')}</div>
          <div className="ph-sub">{t('plan.subtitle')}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-ink-3">
            {t('plan.greenToday')} <strong className="text-green">{greenTodayCount}</strong>
          </span>
          <span className="text-[11px] text-ink-3">
            {t('plan.mustHaves')}{' '}
            <strong className="text-must">
              {mustCount}/{MUST_LIMIT}
            </strong>
          </span>
          <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(['today', 'week'] as const).map((tb) => (
              <button
                key={tb}
                className={`btn btn-s ${tab === tb ? 'btn-p' : 'btn-g'} border-none`}
                onClick={() => setTab(tb)}
              >
                {tb === 'today' ? t('plan.tabToday') : t('plan.tabWeek')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-ink-3">
          <Ic n="search" s={13} />
        </span>
        <input
          className="input w-full pl-[30px] pr-7"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setFocusQuickAdd(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
              if (searchResults.length > 0) {
                e.preventDefault()
                // Searching then acting on a result is the whole point; a search
                // that never gets here is a search that did not work.
                track('search.enter_results', {
                  via: e.key.toLowerCase(),
                  result_count: searchResults.length,
                })
                nav.focus(searchResults[0].task.id)
              }
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              if (searchResults.length > 0 && document.activeElement === e.currentTarget) {
                track('search.enter_results', {
                  via: 'escape',
                  result_count: searchResults.length,
                })
                nav.focus(searchResults[0].task.id)
              } else {
                track('search.clear', { via: 'escape' })
                setSearch('')
                e.currentTarget.blur()
              }
            }
          }}
          placeholder={t('plan.searchPlaceholder')}
        />
        {search && (
          <button
            className="absolute right-[8px] top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
            onClick={() => {
              track('search.clear', { via: 'button' })
              setSearch('')
            }}
            tabIndex={-1}
            aria-label="Clear search"
          >
            <Ic n="x" s={12} />
          </button>
        )}
      </div>

      {!query && <QuickAddTask autoFocus={focusQuickAdd} />}

      {query ? (
        <div className="card">
          {searchResults.length === 0 ? (
            <div className="px-4 py-3 text-xs text-ink-3">
              {t('plan.searchNoResults', { query: search.trim() })}
            </div>
          ) : (
            searchResults.map(({ task, project }, i) => (
              <TaskRow
                key={task.id}
                task={task}
                project={project}
                showProject
                editable
                isFirst={i === 0}
                isLast={i === searchResults.length - 1}
                right={
                  <div className="flex shrink-0 gap-[5px]">
                    <button
                      className={`asgn ${task.is_green ? 'green-on' : ''}`}
                      onClick={() =>
                        updateTask.mutate({ id: task.id, patch: { is_green: !task.is_green } })
                      }
                      title={t('task.greenTooltip')}
                    >
                      <Ic n="leaf" s={11} />
                    </button>
                    {tab === 'today' ? (
                      <>
                        <button
                          className={`asgn ${task.must_have && task.assigned_today ? 'must-on' : ''}`}
                          style={{
                            opacity:
                              (!task.must_have || !task.assigned_today) && mustCount >= MUST_LIMIT
                                ? 0.35
                                : 1,
                          }}
                          onClick={() => setMust(task.id, !(task.must_have && task.assigned_today))}
                          title={t('plan.mustTooltip')}
                        >
                          {t('plan.mustButton')}
                        </button>
                        <button
                          className={`asgn ${task.assigned_today ? 'on' : ''}`}
                          onClick={() =>
                            updateTask.mutate({
                              id: task.id,
                              patch: { assigned_today: !task.assigned_today },
                            })
                          }
                        >
                          {task.assigned_today ? t('plan.todayOn') : t('plan.todayOff')}
                        </button>
                      </>
                    ) : (
                      <button
                        className={`asgn ${task.assigned_week ? 'on' : ''}`}
                        onClick={() =>
                          updateTask.mutate({
                            id: task.id,
                            patch: { assigned_week: !task.assigned_week },
                          })
                        }
                      >
                        {task.assigned_week ? t('plan.weekOn') : t('plan.weekOff')}
                      </button>
                    )}
                  </div>
                }
              />
            ))
          )}
        </div>
      ) : (
        projects.map((p) => {
        const open = p.tasks.filter(
          (t) => !t.completed && (tab === 'week' ? !t.assigned_today : true),
        )
        return (
          <div key={p.id} className="card">
            <div className="card-head">
              <h3>
                <Ic n={isInboxProject(p) ? 'inbox' : 'folder'} s={13} c="var(--accent)" />
                {isInboxProject(p) ? (
                  t('inbox.title')
                ) : (
                  <>
                    <span className="text-[10px] font-normal text-ink-3">
                      {groupLabel(t, p.group)} /
                    </span>{' '}
                    {p.name}
                  </>
                )}
              </h3>
              <button
                className="btn btn-g btn-s"
                onClick={() => setAddingTo(addingTo === p.id ? null : p.id)}
              >
                <Ic n="plus" s={11} /> {t('plan.taskButton')}
              </button>
            </div>

            {open.length === 0 && addingTo !== p.id && (
              <div className="px-4 py-3 text-xs text-ink-3">
                {isInboxProject(p) ? t('inbox.empty') : t('plan.noOpenTasks')}
              </div>
            )}

            {open.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                editable
                reorderable
                deletable
                isFirst={i === 0}
                isLast={i === open.length - 1}
                right={
                  <div className="flex shrink-0 gap-[5px]">
                    <button
                      className={`asgn ${task.is_green ? 'green-on' : ''}`}
                      onClick={() =>
                        updateTask.mutate({ id: task.id, patch: { is_green: !task.is_green } })
                      }
                      title={t('task.greenTooltip')}
                    >
                      <Ic n="leaf" s={11} />
                    </button>
                    {tab === 'today' ? (
                      <>
                        <button
                          className={`asgn ${task.must_have && task.assigned_today ? 'must-on' : ''}`}
                          style={{
                            opacity:
                              (!task.must_have || !task.assigned_today) && mustCount >= MUST_LIMIT
                                ? 0.35
                                : 1,
                          }}
                          onClick={() => setMust(task.id, !(task.must_have && task.assigned_today))}
                          title={t('plan.mustTooltip')}
                        >
                          {t('plan.mustButton')}
                        </button>
                        <button
                          className={`asgn ${task.assigned_today ? 'on' : ''}`}
                          onClick={() =>
                            updateTask.mutate({
                              id: task.id,
                              patch: { assigned_today: !task.assigned_today },
                            })
                          }
                        >
                          {task.assigned_today ? t('plan.todayOn') : t('plan.todayOff')}
                        </button>
                      </>
                    ) : (
                      <button
                        className={`asgn ${task.assigned_week ? 'on' : ''}`}
                        onClick={() =>
                          updateTask.mutate({
                            id: task.id,
                            patch: { assigned_week: !task.assigned_week },
                          })
                        }
                      >
                        {task.assigned_week ? t('plan.weekOn') : t('plan.weekOff')}
                      </button>
                    )}
                  </div>
                }
              />
            ))}

            {addingTo === p.id && (
              <AddTaskForm
                onAdd={(task) => {
                  createTask.mutate({ projectId: p.id, task })
                  setAddingTo(null)
                }}
                onAddRecurring={(rule) => {
                  createRecurrence.mutate({ projectId: p.id, rule })
                  setAddingTo(null)
                }}
                onCancel={() => setAddingTo(null)}
              />
            )}
          </div>
        )
      })
      )}
    </div>
  )
}
