import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mustHaveCount, useCreateTask, useProjects, useUpdateTask } from '../api/hooks'
import { groupLabel } from '../i18n'
import { Ic } from '../components/Icon'
import { AddTaskForm } from '../components/AddTaskForm'
import { TaskRow } from '../components/TaskRow'

const MUST_LIMIT = 2

export function PlanView() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [addingTo, setAddingTo] = useState<number | null>(null)

  const mustCount = mustHaveCount(projects)

  const setMust = (id: number, v: boolean) => {
    if (v && mustCount >= MUST_LIMIT) {
      alert(t('plan.mustLimit', { max: MUST_LIMIT }))
      return
    }
    updateTask.mutate({ id, patch: { must_have: v } })
  }

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">{t('plan.title')}</div>
          <div className="ph-sub">{t('plan.subtitle')}</div>
        </div>
        <div className="flex items-center gap-2.5">
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

      {projects.map((p) => {
        const open = p.tasks.filter((t) => !t.completed)
        return (
          <div key={p.id} className="card">
            <div className="card-head">
              <h3>
                <Ic n="folder" s={13} c="var(--accent)" />
                <span className="text-[10px] font-normal text-ink-3">
                  {groupLabel(t, p.group)} /
                </span>{' '}
                {p.name}
              </h3>
              <button
                className="btn btn-g btn-s"
                onClick={() => setAddingTo(addingTo === p.id ? null : p.id)}
              >
                <Ic n="plus" s={11} /> {t('plan.taskButton')}
              </button>
            </div>

            {open.length === 0 && addingTo !== p.id && (
              <div className="px-4 py-3 text-xs text-ink-3">{t('plan.noOpenTasks')}</div>
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
                onCancel={() => setAddingTo(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
