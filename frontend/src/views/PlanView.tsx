import { useState } from 'react'
import { mustHaveCount, useCreateTask, useProjects, useUpdateTask } from '../api/hooks'
import { Ic } from '../components/Icon'
import { AddTaskForm } from '../components/AddTaskForm'

const MUST_LIMIT = 2

export function PlanView() {
  const { data: projects = [] } = useProjects()
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [addingTo, setAddingTo] = useState<number | null>(null)

  const mustCount = mustHaveCount(projects)

  const setMust = (id: number, v: boolean) => {
    if (v && mustCount >= MUST_LIMIT) {
      alert(`Max ${MUST_LIMIT} Must Have tasks per day.`)
      return
    }
    updateTask.mutate({ id, patch: { must_have: v } })
  }

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">Plan</div>
          <div className="ph-sub">Assign tasks to today or this week</div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-ink-3">
            Must-haves:{' '}
            <strong className="text-must">
              {mustCount}/{MUST_LIMIT}
            </strong>
          </span>
          <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(['today', 'week'] as const).map((t) => (
              <button
                key={t}
                className={`btn btn-s ${tab === t ? 'btn-p' : 'btn-g'} border-none`}
                onClick={() => setTab(t)}
              >
                {t === 'today' ? 'Today' : 'This week'}
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
                <span className="text-[10px] font-normal text-ink-3">{p.group} /</span> {p.name}
              </h3>
              <button
                className="btn btn-g btn-s"
                onClick={() => setAddingTo(addingTo === p.id ? null : p.id)}
              >
                <Ic n="plus" s={11} /> Task
              </button>
            </div>

            {open.length === 0 && addingTo !== p.id && (
              <div className="px-4 py-3 text-xs text-ink-3">No open tasks.</div>
            )}

            {open.map((t) => (
              <div key={t.id} className="task-row items-center">
                <div className="min-w-0 flex-1">
                  <div className="t-title">{t.title}</div>
                  <div className="t-meta">
                    <span className={`badge ${t.complexity === 'high' ? 'b-high' : 'b-low'}`}>
                      {t.complexity}
                    </span>
                    {t.recurring && <span className="badge b-rec">↺</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-[5px]">
                  {tab === 'today' ? (
                    <>
                      <button
                        className={`asgn ${t.must_have && t.assigned_today ? 'must-on' : ''}`}
                        style={{
                          opacity:
                            (!t.must_have || !t.assigned_today) && mustCount >= MUST_LIMIT
                              ? 0.35
                              : 1,
                        }}
                        onClick={() => setMust(t.id, !(t.must_have && t.assigned_today))}
                        title="Mark as Must Have (max 2/day)"
                      >
                        🔥 Must
                      </button>
                      <button
                        className={`asgn ${t.assigned_today ? 'on' : ''}`}
                        onClick={() =>
                          updateTask.mutate({ id: t.id, patch: { assigned_today: !t.assigned_today } })
                        }
                      >
                        {t.assigned_today ? '✓ Today' : '+ Today'}
                      </button>
                    </>
                  ) : (
                    <button
                      className={`asgn ${t.assigned_week ? 'on' : ''}`}
                      onClick={() =>
                        updateTask.mutate({ id: t.id, patch: { assigned_week: !t.assigned_week } })
                      }
                    >
                      {t.assigned_week ? '✓ Week' : '+ Week'}
                    </button>
                  )}
                </div>
              </div>
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
