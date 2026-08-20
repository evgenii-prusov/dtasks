import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ENTRY_CATEGORIES, LINK_KINDS } from '../api/types'
import type { EntryCategory, LinkKind, WorkLogEntryCreate, WorkLogLinkInput } from '../api/types'
import { CATEGORY_LABEL_KEYS, LINK_KIND_LABEL_KEYS, inferLinkKind } from '../lib/worklog'
import { Ic } from './Icon'

export interface EntryDraft {
  title: string
  context: string
  category: EntryCategory
  taskId: number | null
}

interface LinkRow extends WorkLogLinkInput {
  kind: LinkKind
  /** True until the user picks a kind by hand, so re-pasting keeps re-inferring. */
  kindInferred: boolean
}

const EMPTY_LINK: LinkRow = { url: '', kind: 'link', label: '', kindInferred: true }

export function WorkLogEntryForm({
  day,
  draft,
  onAdd,
  onCancel,
}: {
  day: string
  /** Prefilled when promoting a finished task; blank for a fresh entry. */
  draft?: EntryDraft
  onAdd: (entry: WorkLogEntryCreate) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(draft?.title ?? '')
  const [category, setCategory] = useState<EntryCategory>(draft?.category ?? 'shipped')
  const [context, setContext] = useState(draft?.context ?? '')
  const [impact, setImpact] = useState('')
  const [links, setLinks] = useState<LinkRow[]>([{ ...EMPTY_LINK }])

  const setLink = (i: number, patch: Partial<LinkRow>) =>
    setLinks((rows) => rows.map((row, j) => (i === j ? { ...row, ...patch } : row)))

  const submit = () => {
    if (!title.trim()) return
    onAdd({
      day,
      category,
      title: title.trim(),
      context,
      impact,
      task_id: draft?.taskId ?? null,
      links: links
        .filter((link) => link.url.trim())
        .map(({ url, kind, label }) => ({ url: url.trim(), kind, label })),
    })
  }

  return (
    // Escape and the app's single-letter hotkeys must not fire while typing here.
    <div className="add-form" data-hotkeys-off onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <input
        className="input mb-[7px]"
        placeholder={t('worklog.titlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
      />

      <div className="mb-[7px] flex flex-wrap gap-[5px]">
        {ENTRY_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`asgn ${category === c ? 'on' : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {t(CATEGORY_LABEL_KEYS[c])}
          </button>
        ))}
      </div>

      <textarea
        className="input textarea mb-[7px] min-h-16 text-[13px]"
        placeholder={t('worklog.contextPlaceholder')}
        value={context}
        onChange={(e) => setContext(e.target.value)}
      />
      <input
        className="input mb-[7px]"
        placeholder={t('worklog.impactPlaceholder')}
        value={impact}
        onChange={(e) => setImpact(e.target.value)}
      />

      <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">
        {t('worklog.linksLabel')}
      </div>
      {links.map((link, i) => (
        <div key={i} className="mb-[5px] flex items-center gap-[5px]">
          <input
            className="input flex-1"
            placeholder={t('worklog.linkUrlPlaceholder')}
            value={link.url}
            onChange={(e) => {
              const url = e.target.value
              // Re-infer while the kind is still a guess; stop once it's been set.
              setLink(i, link.kindInferred ? { url, kind: inferLinkKind(url) } : { url })
            }}
          />
          <select
            className="sel"
            aria-label={t('worklog.linksLabel')}
            value={link.kind}
            onChange={(e) => setLink(i, { kind: e.target.value as LinkKind, kindInferred: false })}
          >
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(LINK_KIND_LABEL_KEYS[k])}
              </option>
            ))}
          </select>
          {links.length > 1 && (
            <button
              type="button"
              className="btn btn-g btn-s"
              aria-label={t('worklog.removeLink')}
              onClick={() => setLinks((rows) => rows.filter((_, j) => j !== i))}
            >
              <Ic n="x" s={11} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-g btn-s mb-[7px]"
        onClick={() => setLinks((rows) => [...rows, { ...EMPTY_LINK }])}
      >
        <Ic n="plus" s={11} /> {t('worklog.addLink')}
      </button>

      <div className="flex flex-wrap items-center gap-[7px]">
        <div className="flex-1" />
        <button className="btn btn-g btn-s" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-p btn-s" onClick={submit}>
          {t('worklog.save')}
        </button>
      </div>
    </div>
  )
}
