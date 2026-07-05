import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useCreateTask, useDeleteProject, useUpdateProject } from '../api/hooks'
import { groupLabel } from '../i18n'
import type { Project } from '../api/types'
import { Ic } from '../components/Icon'
import { TaskRow } from '../components/TaskRow'
import { AddTaskForm } from '../components/AddTaskForm'

export function ProjectView({ project }: { project: Project }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const createTask = useCreateTask()

  const removeProject = () => {
    if (confirm(t('project.confirmDelete', { name: project.name }))) {
      deleteProject.mutate(project.id)
      navigate({ to: '/' })
    }
  }

  const [addingTask, setAddingTask] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [desc, setDesc] = useState(project.description)
  const [notes, setNotes] = useState(project.notes)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(project.name)

  useEffect(() => {
    setDesc(project.description)
    setNotes(project.notes)
    setAddingTask(false)
    setEditDesc(false)
    setEditingName(false)
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const startRename = () => {
    setName(project.name)
    setEditingName(true)
  }
  const saveName = () => {
    const next = name.trim()
    if (next && next !== project.name) {
      updateProject.mutate({ id: project.id, patch: { name: next } })
    }
    setEditingName(false)
  }

  const open = project.tasks.filter((t) => !t.completed)
  const done = project.tasks.filter((t) => t.completed)

  return (
    <div>
      <div className="ph">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.07em] text-ink-3">
            {groupLabel(t, project.group)}
          </div>
          {editingName ? (
            <input
              className="input px-2 py-1 font-[Lora,serif] text-[22px] font-semibold tracking-[-0.4px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setEditingName(false)
              }}
              onBlur={saveName}
              autoFocus
            />
          ) : (
            <div
              className="ph-title cursor-text"
              onClick={startRename}
              title={t('project.clickToRename')}
            >
              {project.name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-g btn-s" onClick={() => setAddingTask((t) => !t)}>
            <Ic n="plus" s={12} /> {t('common.addTask')}
          </button>
          <button
            className="btn btn-g btn-s btn-danger"
            onClick={removeProject}
            title={t('project.deleteTooltip')}
          >
            <Ic n="trash" s={12} />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>
            <Ic n="note" s={13} />
            {t('project.description')}
          </h3>
          <button
            className="btn btn-g btn-s"
            onClick={() => {
              if (editDesc) updateProject.mutate({ id: project.id, patch: { description: desc } })
              setEditDesc((e) => !e)
            }}
          >
            {editDesc ? t('common.save') : t('common.edit')}
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
              {desc || <span className="text-ink-3">{t('project.noDescription')}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>
            {t('common.openTasks')} ({open.length})
          </h3>
          <button className="btn btn-g btn-s" onClick={() => setAddingTask((a) => !a)}>
            <Ic n="plus" s={11} /> {t('common.add')}
          </button>
        </div>
        {open.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            checkable
            editable
            reorderable
            deletable
            isFirst={i === 0}
            isLast={i === open.length - 1}
          />
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
          <div className="px-4 py-[13px] text-xs text-ink-3">{t('project.allDone')}</div>
        )}
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 className="text-ink-3">
              {t('common.completed')} ({done.length})
            </h3>
          </div>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} checkable />
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>
            <Ic n="note" s={13} />
            {t('common.notes')}
          </h3>
        </div>
        <div className="px-4 py-[11px]">
          <textarea
            className="input textarea min-h-[90px] text-[13px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => updateProject.mutate({ id: project.id, patch: { notes } })}
            placeholder={t('project.notesPlaceholder')}
          />
        </div>
      </div>
    </div>
  )
}
