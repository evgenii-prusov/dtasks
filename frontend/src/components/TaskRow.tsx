import type { ReactNode } from 'react'
import type { Project, Task } from '../api/types'

export function TaskRow({
  task,
  onToggle,
  showProject,
  project,
  right,
}: {
  task: Task
  onToggle: (id: number) => void
  showProject?: boolean
  project?: Project
  right?: ReactNode
}) {
  return (
    <div className="task-row">
      <div className={`cb ${task.completed ? 'done' : ''}`} onClick={() => onToggle(task.id)} />
      <div className="min-w-0 flex-1">
        <div className={`t-title ${task.completed ? 'done' : ''}`}>{task.title}</div>
        <div className="t-meta">
          {showProject && project && <span className="badge b-proj">{project.name}</span>}
          <span className={`badge ${task.complexity === 'high' ? 'b-high' : 'b-low'}`}>
            {task.complexity}
          </span>
          {task.recurring && <span className="badge b-rec">↺ recurring</span>}
          {task.notes && <span className="text-[10px] text-ink-3">· note</span>}
        </div>
      </div>
      {right}
    </div>
  )
}
