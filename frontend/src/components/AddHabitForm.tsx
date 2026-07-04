import { useState } from 'react'
import type { HabitCreate } from '../api/types'

export function AddHabitForm({
  onAdd,
  onCancel,
}: {
  onAdd: (habit: HabitCreate) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')

  const submit = () => {
    if (!name.trim()) return
    onAdd({ name: name.trim(), subtitle })
  }

  return (
    <div className="add-form">
      <input
        className="input mb-[7px]"
        placeholder="Habit name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
      />
      <input
        className="input mb-[7px]"
        placeholder="Subtitle (optional)"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="flex flex-wrap items-center gap-[7px]">
        <div className="flex-1" />
        <button className="btn btn-g btn-s" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-p btn-s" onClick={submit}>
          Add habit
        </button>
      </div>
    </div>
  )
}
