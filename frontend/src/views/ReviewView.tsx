import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateRecurrence } from '../api/hooks'
import { useCreateTask } from '../api/hooks'
import { useProjects } from '../api/hooks'
import { useUpdateProject } from '../api/hooks'
import { useUpdateTask } from '../api/hooks'
import {
  inboxFirst,
  isDefaultProject,
  isInboxProject,
  type Project,
  type Task,
} from '../api/types'
import { groupLabel } from '../i18n'
import { Ic } from '../components/Icon'
import { AddTaskForm } from '../components/AddTaskForm'
import { TaskRow } from '../components/TaskRow'
import { track } from '../lib/analytics'
import { HOTKEYS } from '../lib/hotkeys/bindings'
import { useHotkey } from '../lib/hotkeys/useHotkey'
import { useTaskNav } from '../lib/taskNav'

const MINUTES_PER_PROJECT = 5

/**
 * The triage control an Inbox task carries: pick where it actually belongs.
 * Filing is the whole job of the Inbox phase, so it sits on the row itself
 * rather than behind the row editor.
 */
function FileToProject({ task, targets }: { task: Task; targets: Project[] }) {
  const { t } = useTranslation()
  const updateTask = useUpdateTask()

  const byGroup = targets.reduce<Record<string, Project[]>>((acc, p) => {
    ;(acc[p.group] ??= []).push(p)
    return acc
  }, {})

  return (
    <select
      className="sel max-w-[150px]"
      value=""
      aria-label={t('inbox.fileTo')}
      onChange={(e) => {
        const projectId = Number(e.target.value)
        if (projectId) updateTask.mutate({ id: task.id, patch: { project_id: projectId } })
      }}
    >
      <option value="">{t('inbox.fileTo')}</option>
      {Object.entries(byGroup).map(([group, projects]) => (
        <optgroup key={group} label={groupLabel(t, group)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {isDefaultProject(p) ? t('quickAdd.noProject') : p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function ReviewView() {
  const { t } = useTranslation()
  const { data: projects = [], isLoading } = useProjects()
  const updateProject = useUpdateProject()
  const createTask = useCreateTask()
  const createRecurrence = useCreateRecurrence()
  const updateTask = useUpdateTask()

  // The Inbox leads the walk: sorting what you parked comes before reviewing
  // the projects it would have been filed into.
  const phases = useMemo(() => inboxFirst(projects), [projects])
  const total = MINUTES_PER_PROJECT * 60 * (phases.length || 1)
  const [idx, setIdx] = useState(0)
  const [left, setLeft] = useState<number | null>(null)
  const [running, setRunning] = useState(true)
  const [done, setDone] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [noteVal, setNoteVal] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const newTaskRef = useRef<HTMLInputElement>(null)
  const nav = useTaskNav()

  const p = phases[idx]
  const isInboxPhase = p !== undefined && isInboxProject(p)
  // Where an Inbox task can be filed: every real project, the Inbox excluded.
  const fileTargets = phases.filter((proj) => !isInboxProject(proj))
  // The timer effect must not restart when these change -- it would drop the
  // interval and lose the countdown -- so it reads them through refs.
  const idxRef = useRef(idx)
  idxRef.current = idx
  const projectCountRef = useRef(phases.length)
  projectCountRef.current = phases.length

  useHotkey(
    HOTKEYS.newTask.chords,
    () => {
      // Mounting the form autofocuses it; refocus when it is already open.
      setAddingTask(true)
      newTaskRef.current?.focus()
    },
    { enabled: !!p && !done, name: 'newTask' },
  )

  const finishReview = () => {
    track('review.finish', {
      reached_index: idxRef.current,
      project_count: projectCountRef.current,
    })
    setRunning(false)
    setDone(true)
  }

  useHotkey(
    HOTKEYS.reviewNextProject.chords,
    () => {
      if (idx < phases.length - 1) {
        setIdx((i) => i + 1)
      } else {
        finishReview()
      }
    },
    { enabled: !done, name: 'reviewNextProject' },
  )

  // Initialize the session budget once projects with tasks arrive
  useEffect(() => {
    if (projects.some((proj) => proj.tasks.length > 0) && left === null) {
      track('review.start', { project_count: phases.length })
      setLeft(total)
    }
  }, [projects, phases.length, left, total])

  useEffect(() => {
    setNoteVal(p?.notes ?? '')
    setAddingTask(false)
    // The previous project's rows are gone; don't leave a stale highlight.
    nav.setActive(null)
  }, [idx, p?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (!running || done) return
    intervalRef.current = setInterval(() => {
      setLeft((t) => {
        if (t === null) return t
        if (t <= 1) {
          // How far through the projects the timer ran out tells you whether
          // the 5-min-per-project budget is realistic.
          track('review.finish', {
            reached_index: idxRef.current,
            project_count: projectCountRef.current,
          })
          setRunning(false)
          setDone(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, done])

  const hasAnyTasks = projects.some((proj) => proj.tasks.length > 0)

  if (isLoading) return null

  if (!hasAnyTasks)
    return (
      <div>
        <div className="ph">
          <div className="ph-title">{t('review.title')}</div>
        </div>
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="mb-1.5 font-semibold">{t('review.emptyTitle')}</div>
          <div className="text-xs">{t('review.emptyBody')}</div>
        </div>
      </div>
    )

  if (!p || left === null) return null

  const totalMins = Math.floor(total / 60)
  const mins = Math.floor(left / 60)
  const secs = left % 60
  const pct = left / total
  const R = 30
  const C = 2 * Math.PI * R
  const dash = pct * C
  const timerColor = left < 120 ? 'var(--must)' : 'var(--accent)'

  if (done)
    return (
      <div>
        <div className="ph">
          <div className="ph-title">{t('review.title')}</div>
        </div>
        <div className="empty">
          <div className="empty-icon">✅</div>
          <div className="mb-1.5 font-semibold">{t('review.doneTitle')}</div>
          <div className="mb-5 text-xs">{t('review.doneBody', { minutes: totalMins })}</div>
          <button
            className="btn btn-p"
            onClick={() => {
              setDone(false)
              setLeft(total)
              setIdx(0)
              setRunning(true)
            }}
          >
            {t('review.startNew')}
          </button>
        </div>
      </div>
    )

  const openTasks = p.tasks.filter((t) => !t.completed)
  const doneTasks = p.tasks.filter((t) => t.completed)
  const greenOpen = openTasks.filter((t) => t.is_green).length

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">{t('review.title')}</div>
          <div className="ph-sub">
            {isInboxPhase
              ? t('review.inboxPhase', { count: openTasks.length })
              : t('review.subtitle', {
                  current: idx + 1,
                  total: phases.length,
                  minutes: totalMins,
                })}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-g btn-s" onClick={() => setRunning((r) => !r)}>
            {running ? t('review.pause') : t('review.resume')}
          </button>
        </div>
      </div>

      {/* Progress track */}
      <div className="mb-[26px] flex gap-[5px]">
        {phases.map((proj, i) => (
          <div
            key={proj.id}
            onClick={() => setIdx(i)}
            className="h-1 flex-1 cursor-pointer rounded-sm transition-colors duration-300"
            style={{
              background: i < idx ? 'var(--accent)' : i === idx ? timerColor : 'var(--border)',
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-[1fr_110px] items-start gap-6">
        <div>
          <div className="card">
            <div className="card-head">
              <h3>
                <Ic n={isInboxPhase ? 'inbox' : 'folder'} s={13} c="var(--accent)" />
                {isInboxPhase ? (
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
              {greenOpen > 0 && (
                <span className="badge b-green inline-flex items-center gap-1">
                  <Ic n="leaf" s={10} />
                  {t('review.greenRatio', { green: greenOpen, total: openTasks.length })}
                </span>
              )}
            </div>

            {isInboxPhase ? (
              <div className="border-b border-line px-4 py-[11px] text-[13px] leading-[1.7] text-ink-2">
                {t('review.inboxHint')}
              </div>
            ) : (
              p.description && (
                <div className="border-b border-line px-4 py-[11px] text-[13px] leading-[1.7] text-ink-2">
                  {p.description}
                </div>
              )
            )}

            {/* Open tasks */}
            <div className="border-b border-line">
              <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[.07em] text-ink-3">
                  {t('common.openTasks')} ({openTasks.length})
                </span>
                <button
                  className="btn btn-g btn-s"
                  onClick={() => setAddingTask((a) => !a)}
                  title={t('common.newTaskHotkey')}
                >
                  <Ic n="plus" s={11} /> {t('common.add')}
                </button>
              </div>
              {openTasks.length === 0 && !addingTask && (
                <div className="px-4 pt-1 pb-3 text-xs text-ink-3">
                  {isInboxPhase ? t('review.inboxEmpty') : t('review.allClear')}
                </div>
              )}
              {openTasks.map((task, ti) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  checkable
                  editable
                  reorderable
                  deletable
                  isFirst={ti === 0}
                  isLast={ti === openTasks.length - 1}
                  right={
                    <div className="flex shrink-0 items-center gap-[5px]">
                      {isInboxPhase && <FileToProject task={task} targets={fileTargets} />}
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
                    </div>
                  }
                />
              ))}
              {addingTask && (
                <AddTaskForm
                  onAdd={(task, tagged) => {
                    createTask.mutate({ projectId: tagged ?? p.id, task })
                    setAddingTask(false)
                  }}
                  onAddRecurring={(rule, tagged) => {
                    createRecurrence.mutate({ projectId: tagged ?? p.id, rule })
                    setAddingTask(false)
                  }}
                  onCancel={() => setAddingTask(false)}
                  titleRef={newTaskRef}
                />
              )}
            </div>

            {/* Done tasks */}
            {doneTasks.length > 0 && (
              <div className="border-b border-line">
                <div className="px-4 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-ink-3">
                  {t('common.completed')} ({doneTasks.length})
                </div>
                {doneTasks.map((t) => (
                  <div key={t.id} className="flex gap-2 border-t border-line px-4 py-1">
                    <span className="mt-0.5 text-[11px] text-accent">✓</span>
                    <span className="text-[13px] text-ink-3 line-through">
                      {t.is_green && (
                        <span className="mr-1 inline-flex align-[-1px] opacity-60">
                          <Ic n="leaf" s={11} c="var(--green)" />
                        </span>
                      )}
                      {t.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Notes -- project-level thinking; the Inbox is a queue, not a project. */}
            {!isInboxPhase && (
              <div className="px-4 py-3">
                <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[.07em] text-ink-3">
                  {t('common.notes')}
                </div>
                <textarea
                  className="input textarea min-h-20 text-[13px]"
                  value={noteVal}
                  onChange={(e) => setNoteVal(e.target.value)}
                  onBlur={() => updateProject.mutate({ id: p.id, patch: { notes: noteVal } })}
                  placeholder={t('review.notesPlaceholder')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Timer */}
        <div className="pt-1 text-center">
          <svg width="80" height="80" className="mx-auto block">
            <circle cx="40" cy="40" r={R} fill="none" stroke="var(--border)" strokeWidth="5" />
            <circle
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke={timerColor}
              strokeWidth="5"
              strokeDasharray={`${dash} ${C}`}
              strokeLinecap="round"
              style={{
                transformOrigin: 'center',
                transform: 'rotate(-90deg)',
                transition: 'stroke-dasharray 1s linear, stroke .3s',
              }}
            />
            <text
              x="40"
              y="36"
              textAnchor="middle"
              style={{ fontSize: 15, fontWeight: 700, fill: 'var(--text)', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </text>
            <text
              x="40"
              y="50"
              textAnchor="middle"
              style={{ fontSize: 9, fill: 'var(--text-3)', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
            >
              {t('review.remaining')}
            </text>
          </svg>
          <div className="mt-3 flex flex-col gap-1.5">
            <button
              className="btn btn-g btn-s w-full"
              disabled={idx === 0}
              onClick={() => setIdx((i) => i - 1)}
            >
              {t('review.prev')}
            </button>
            {idx < phases.length - 1 ? (
              <button
                className="btn btn-p btn-s w-full"
                onClick={() => setIdx((i) => i + 1)}
                title={t('review.nextHotkey')}
              >
                {t('review.next')}
              </button>
            ) : (
              <button
                className="btn btn-p btn-s w-full"
                onClick={finishReview}
                title={t('review.finishHotkey')}
              >
                {t('review.finish')}
              </button>
            )}
          </div>
          <div className="mt-3.5 text-center text-[10px] leading-normal text-ink-3">
            {t('review.budgetLine1')}
            <br />
            {t('review.budgetLine2')}
          </div>
        </div>
      </div>
    </div>
  )
}
