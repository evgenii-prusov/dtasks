import { useEffect, useState } from 'react'
import { useCreateTask, useUpdateProject, useUpdateTask } from '../api/hooks'
import type { Project } from '../api/types'
import { Ic } from '../components/Icon'
import { TaskRow } from '../components/TaskRow'
import { AddTaskForm } from '../components/AddTaskForm'

export function ProjectView({ project }: { project: Project }) {
  const updateTask = useUpdateTask()
  const updateProject = useUpdateProject()
  const createTask = useCreateTask()

  const [addingTask, setAddingTask] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [desc, setDesc] = useState(project.description)
  const [notes, setNotes] = useState(project.notes)

  useEffect(() => {
    setDesc(project.description)
    setNotes(project.notes)
    setAddingTask(false)
    setEditDesc(false)
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = project.tasks.filter((t) => !t.completed)
  const done = project.tasks.filter((t) => t.completed)
  const toggle = (id: number) => {
    const task = project.tasks.find((t) => t.id === id)
    if (task) updateTask.mutate({ id, patch: { completed: !task.completed } })
  }

  return (
    <div>
      <div className="ph">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.07em] text-ink-3">
            {project.group}
          </div>
          <div className="ph-title">{project.name}</div>
        </div>
        <button className="btn btn-g btn-s" onClick={() => setAddingTask((t) => !t)}>
          <Ic n="plus" s={12} /> Add task
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>
            <Ic n="note" s={13} />
            Description
          </h3>
          <button
            className="btn btn-g btn-s"
            onClick={() => {
              if (editDesc) updateProject.mutate({ id: project.id, patch: { description: desc } })
              setEditDesc((e) => !e)
            }}
          >
            {editDesc ? 'Save' : 'Edit'}
          </button>
        </div>
        <div className="px-4 py-[11px]">
          {editDesc ? (
            <textarea
              className="input textarea text-[13px]"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          ) : (
            <div className="text-[13px] leading-[1.7] text-ink-2">
              {desc || <span className="text-ink-3">No description. Click Edit to add one.</span>}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Open tasks ({open.length})</h3>
          <button className="btn btn-g btn-s" onClick={() => setAddingTask((t) => !t)}>
            <Ic n="plus" s={11} /> Add
          </button>
        </div>
        {open.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={toggle} />
        ))}
        {addingTask && (
          <AddTaskForm
            onAdd={(task) => {
              createTask.mutate({ projectId: project.id, task })
              setAddingTask(false)
            }}
            onCancel={() => setAddingTask(false)}
          />
        )}
        {open.length === 0 && !addingTask && (
          <div className="px-4 py-[13px] text-xs text-ink-3">All tasks done! 🎉</div>
        )}
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 className="text-ink-3">Completed ({done.length})</h3>
          </div>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={toggle} />
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>
            <Ic n="note" s={13} />
            Notes
          </h3>
        </div>
        <div className="px-4 py-[11px]">
          <textarea
            className="input textarea min-h-[90px] text-[13px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => updateProject.mutate({ id: project.id, patch: { notes } })}
            placeholder="Notes, links, ideas…"
          />
        </div>
      </div>
    </div>
  )
}
