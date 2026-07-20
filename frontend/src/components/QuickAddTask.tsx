import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateProject, useCreateTask, useProjects } from '../api/hooks'
import type { Project } from '../api/types'
import { Ic } from './Icon'

interface AutocompleteOption {
  isNew: boolean
  name: string
  project?: Project
}

export function QuickAddTask() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()
  const createTask = useCreateTask()
  const createProject = useCreateProject()

  const [title, setTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [recurring, setRecurring] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find default projects (named '...')
  const defaultWorkProj = projects.find((p) => p.name === '...' && p.group === 'Work')
  const defaultPersonalProj = projects.find((p) => p.name === '...' && p.group === 'Personal')

  const userProjects = projects.filter((p) => p.name !== '...')

  // Detect #tag query in title (at current end or before whitespace)
  const hashMatch = title.match(/(?:^|\s)#([^\s#]*)$/)
  const tagQuery = hashMatch ? hashMatch[1] : null

  // Generate autocomplete options
  const autocompleteOptions: AutocompleteOption[] = []
  if (tagQuery !== null) {
    const qLower = tagQuery.toLowerCase()
    const matching = userProjects.filter((p) => p.name.toLowerCase().includes(qLower))
    matching.forEach((p) => {
      autocompleteOptions.push({ isNew: false, name: p.name, project: p })
    })

    const hasExactMatch = userProjects.some((p) => p.name.toLowerCase() === qLower)
    if (tagQuery.trim().length > 0 && !hasExactMatch) {
      autocompleteOptions.push({ isNew: true, name: tagQuery.trim() })
    }
  }

  useEffect(() => {
    if (tagQuery !== null && autocompleteOptions.length > 0) {
      setShowAutocomplete(true)
      setSelectedIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [tagQuery, autocompleteOptions.length])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectOption = (opt: AutocompleteOption) => {
    if (opt.isNew) {
      setTitle((prev) => prev.replace(/(?:^|\s)#([^\s#]*)$/, ` #${opt.name}`).trimStart())
    } else if (opt.project) {
      setSelectedProjectId(opt.project.id)
      setTitle((prev) => prev.replace(/(?:^|\s)#([^\s#]*)$/, '').trim())
    }
    setShowAutocomplete(false)
  }

  const handleAdd = async (groupOverride?: 'Work' | 'Personal') => {
    const rawTitle = title.trim()
    if (!rawTitle) return

    let cleanTitle = rawTitle
    let targetProjectId: number | null = selectedProjectId

    // Check if title has explicit #Tag
    const tagMatch = rawTitle.match(/#([^\s#]+(?:\s+[^\s#]+)*)$/) || rawTitle.match(/#([^\s#]+)/)
    if (tagMatch) {
      const fullHash = tagMatch[0]
      const tagText = tagMatch[1].trim()

      const existingProj = userProjects.find(
        (p) =>
          p.name.toLowerCase() === tagText.toLowerCase() ||
          p.name.toLowerCase() === fullHash.substring(1).toLowerCase(),
      )

      if (existingProj) {
        targetProjectId = existingProj.id
        cleanTitle = rawTitle.replace(fullHash, '').trim()
        if (!cleanTitle) cleanTitle = existingProj.name
      } else {
        cleanTitle = rawTitle.replace(fullHash, '').trim()
        if (!cleanTitle) cleanTitle = tagText

        try {
          const newProj = await createProject.mutateAsync({
            name: tagText,
            group: groupOverride || 'Work',
          })
          targetProjectId = newProj.id
        } catch {
          // Fallback if creation fails
        }
      }
    }

    if (targetProjectId !== null) {
      createTask.mutate({
        projectId: targetProjectId,
        task: { title: cleanTitle, recurring },
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
        task: { title: cleanTitle, recurring },
      })
    }
    reset()
  }

  const reset = () => {
    setTitle('')
    setSelectedProjectId(null)
    setRecurring(false)
    setShowPrompt(false)
    setShowAutocomplete(false)
  }

  return (
    <div className="card p-3 mb-6 bg-surface !overflow-visible relative">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1" ref={dropdownRef}>
            <input
              className="input w-full animate-[fadeIn_0.2s_ease]"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (showPrompt) setShowPrompt(false)
              }}
              onKeyDown={(e) => {
                if (showAutocomplete && autocompleteOptions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIndex((prev) => (prev + 1) % autocompleteOptions.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIndex((prev) => (prev - 1 + autocompleteOptions.length) % autocompleteOptions.length)
                    return
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    selectOption(autocompleteOptions[selectedIndex])
                    return
                  }
                }
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') {
                  if (showAutocomplete) setShowAutocomplete(false)
                  else reset()
                }
              }}
              placeholder={t('quickAdd.placeholder')}
            />

            {showAutocomplete && autocompleteOptions.length > 0 && (
              <div className="absolute top-full left-0 z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-md animate-[fadeIn_0.15s_ease]">
                {autocompleteOptions.map((opt, idx) => (
                  <button
                    key={opt.isNew ? `new-${opt.name}` : `proj-${opt.project!.id}`}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                      idx === selectedIndex
                        ? 'bg-accent-2 text-accent font-medium'
                        : 'hover:bg-surface-2 text-ink'
                    }`}
                    onClick={() => selectOption(opt)}
                  >
                    {opt.isNew ? (
                      <>
                        <Ic n="plus" s={12} />
                        <span>{t('quickAdd.createProject', { name: opt.name })}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-ink-3">#</span>
                        <span className="flex-1">{opt.project!.name}</span>
                        <span className="text-[10px] text-ink-3 uppercase">{opt.project!.group}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            {t('task.recurringCheckbox')}
          </label>

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

