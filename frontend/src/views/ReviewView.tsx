import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateTask, useProjects, useUpdateProject } from '../api/hooks'
import { groupLabel } from '../i18n'
import { Ic } from '../components/Icon'
import { AddTaskForm } from '../components/AddTaskForm'
import { TaskRow } from '../components/TaskRow'

const MINUTES_PER_PROJECT = 5

export function ReviewView() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const updateProject = useUpdateProject()
  const createTask = useCreateTask()

  const total = MINUTES_PER_PROJECT * 60 * (projects.length || 1)
  const [idx, setIdx] = useState(0)
  const [left, setLeft] = useState<number | null>(null)
  const [running, setRunning] = useState(true)
  const [done, setDone] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [noteVal, setNoteVal] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const p = projects[idx]

  // Initialize the session budget once projects arrive
  useEffect(() => {
    if (projects.length > 0 && left === null) setLeft(total)
  }, [projects.length, left, total])

  useEffect(() => {
    setNoteVal(p?.notes ?? '')
    setAddingTask(false)
  }, [idx, p?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (!running || done) return
    intervalRef.current = setInterval(() => {
      setLeft((t) => {
        if (t === null) return t
        if (t <= 1) {
          setRunning(false)
          setDone(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, done])

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

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">{t('review.title')}</div>
          <div className="ph-sub">
            {t('review.subtitle', {
              current: idx + 1,
              total: projects.length,
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
        {projects.map((proj, i) => (
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
                <Ic n="folder" s={13} c="var(--accent)" />
                <span className="text-[10px] font-normal text-ink-3">
                  {groupLabel(t, p.group)} /
                </span>{' '}
                {p.name}
              </h3>
            </div>

            {p.description && (
              <div className="border-b border-line px-4 py-[11px] text-[13px] leading-[1.7] text-ink-2">
                {p.description}
              </div>
            )}

            {/* Open tasks */}
            <div className="border-b border-line">
              <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[.07em] text-ink-3">
                  {t('common.openTasks')} ({openTasks.length})
                </span>
                <button className="btn btn-g btn-s" onClick={() => setAddingTask((a) => !a)}>
                  <Ic n="plus" s={11} /> {t('common.add')}
                </button>
              </div>
              {openTasks.length === 0 && !addingTask && (
                <div className="px-4 pt-1 pb-3 text-xs text-ink-3">{t('review.allClear')}</div>
              )}
              {openTasks.map((t, ti) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  checkable
                  editable
                  reorderable
                  deletable
                  isFirst={ti === 0}
                  isLast={ti === openTasks.length - 1}
                />
              ))}
              {addingTask && (
                <AddTaskForm
                  onAdd={(task) => {
                    createTask.mutate({ projectId: p.id, task })
                    setAddingTask(false)
                  }}
                  onCancel={() => setAddingTask(false)}
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
                    <span className="text-[13px] text-ink-3 line-through">{t.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
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
            <button
              className="btn btn-p btn-s w-full"
              disabled={idx === projects.length - 1}
              onClick={() => setIdx((i) => i + 1)}
            >
              {t('review.next')}
            </button>
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
