import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateTask, useProjects } from '../api/hooks'
import { groupLabel } from '../i18n'
import { Ic } from './Icon'

export function QuickAddTask() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const createTask = useCreateTask()

  const [title, setTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('none')
  const [showPrompt, setShowPrompt] = useState(false)

  // Find default projects (named '...')
  const defaultWorkProj = projects.find((p) => p.name === '...' && p.group === 'Work')
  const defaultPersonalProj = projects.find((p) => p.name === '...' && p.group === 'Personal')

  const groups = ['Work', 'Personal']

  const handleAdd = (groupOverride?: 'Work' | 'Personal') => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return

    // If a specific project is selected
    if (selectedProjectId !== 'none') {
      const pId = Number(selectedProjectId)
      createTask.mutate({
        projectId: pId,
        task: { title: cleanTitle },
      })
      reset()
      return
    }

    // No project chosen
    const targetGroup = groupOverride
    if (!targetGroup) {
      // It's ambiguous, ask the user!
      setShowPrompt(true)
      return
    }

    // Clear prompt and assign to default project of the chosen group
    const defaultProj = targetGroup === 'Work' ? defaultWorkProj : defaultPersonalProj
    if (defaultProj) {
      createTask.mutate({
        projectId: defaultProj.id,
        task: { title: cleanTitle },
      })
    }
    reset()
  }

  const reset = () => {
    setTitle('')
    setSelectedProjectId('none')
    setShowPrompt(false)
  }

  // Group other projects by Work vs Personal, excluding default '...' projects
  const userProjects = projects.filter((p) => p.name !== '...')

  return (
    <div className="card p-3 mb-6 bg-surface">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <input
            className="input flex-1 animate-[fadeIn_0.2s_ease]"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (showPrompt) setShowPrompt(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') reset()
            }}
            placeholder={t('quickAdd.placeholder')}
          />

          <select
            className="sel max-w-[200px] h-[34px] animate-[fadeIn_0.2s_ease]"
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value)
              setShowPrompt(false)
            }}
          >
            <option value="none">{t('quickAdd.noProject')}</option>
            {groups.map((group) => {
              const catchAll = group === 'Work' ? defaultWorkProj : defaultPersonalProj
              const groupProjs = userProjects.filter((p) => p.group === group)
              if (!catchAll && groupProjs.length === 0) return null
              return (
                <optgroup key={group} label={groupLabel(t, group)}>
                  {catchAll && (
                    <option value={String(catchAll.id)}>
                      {t(`quickAdd.${group.toLowerCase() as 'work' | 'personal'}`)}
                    </option>
                  )}
                  {groupProjs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>

          <button
            className="btn btn-p btn-s h-[34px] px-4 font-semibold shrink-0"
            onClick={() => handleAdd()}
            disabled={!title.trim()}
          >
            <Ic n="plus" s={12} />
            {t('quickAdd.submit')}
          </button>
        </div>

        {showPrompt && (
          <div className="flex items-center gap-3 px-3 py-2 rounded bg-surface-2 border border-line text-[13px] text-ink-2 animate-[fadeIn_0.2s_ease]">
            <span className="font-medium">{t('quickAdd.chooseSection')}</span>
            <div className="flex gap-1.5">
              <button
                className="btn btn-g btn-s bg-surface hover:bg-surface-2"
                onClick={() => handleAdd('Work')}
              >
                {t('quickAdd.work')}
              </button>
              <button
                className="btn btn-g btn-s bg-surface hover:bg-surface-2"
                onClick={() => handleAdd('Personal')}
              >
                {t('quickAdd.personal')}
              </button>
              <button
                className="btn btn-g btn-s border-none text-ink-3 hover:text-ink"
                onClick={() => setShowPrompt(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
