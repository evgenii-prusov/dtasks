import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ENTRY_CATEGORIES, LINK_KINDS } from '../api/types'
import type { EntryCategory, LinkKind, WorkLogEntry, WorkLogLinkInput } from '../api/types'
import { CATEGORY_LABEL_KEYS, LINK_KIND_LABEL_KEYS, inferLinkKind } from '../lib/worklog'
import { Ic } from './Icon'

/** Every field of an entry the form edits. The same shape serves a create body
 * and a patch body, because PATCH accepts all of them (and, given `links`,
 * replaces them wholesale). */
export interface EntryFormValues {
  day: string
  category: EntryCategory
  title: string
  context: string
  impact: string
  task_id: number | null
  links: WorkLogLinkInput[]
}

export function blankEntry(day: string): EntryFormValues {
  return { day, category: 'shipped', title: '', context: '', impact: '', task_id: null, links: [] }
}

export function entryToValues(entry: WorkLogEntry): EntryFormValues {
  return {
    day: entry.day,
    category: entry.category,
    title: entry.title,
    context: entry.context,
    impact: entry.impact,
    task_id: entry.task_id,
    links: entry.links.map(({ url, kind, label }) => ({ url, kind, label })),
  }
}

interface LinkRow extends WorkLogLinkInput {
  kind: LinkKind
  /** True until the user picks a kind by hand, so re-pasting keeps re-inferring. */
  kindInferred: boolean
}

const EMPTY_LINK: LinkRow = { url: '', kind: 'link', label: '', kindInferred: true }

/** Always leave one blank row to type into, so adding the first link is not a
 * two-step. An existing link's kind was chosen (or accepted) already, so it is
 * never re-inferred out from under an edit. */
function toLinkRows(links: WorkLogLinkInput[]): LinkRow[] {
  if (links.length === 0) return [{ ...EMPTY_LINK }]
  return links.map((link) => ({
    url: link.url,
    kind: link.kind ?? 'link',
    label: link.label ?? '',
    kindInferred: false,
  }))
}

export function WorkLogEntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** Blank for a fresh entry, task-derived when promoting, entry-derived when editing. */
  initial: EntryFormValues
  submitLabel: string
  onSubmit: (values: EntryFormValues) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [day, setDay] = useState(initial.day)
  const [title, setTitle] = useState(initial.title)
  const [category, setCategory] = useState<EntryCategory>(initial.category)
  const [context, setContext] = useState(initial.context)
  const [impact, setImpact] = useState(initial.impact)
  const [links, setLinks] = useState<LinkRow[]>(() => toLinkRows(initial.links))

  const setLink = (i: number, patch: Partial<LinkRow>) =>
    setLinks((rows) => rows.map((row, j) => (i === j ? { ...row, ...patch } : row)))

  const submit = () => {
    if (!title.trim() || !day) return
    onSubmit({
      day,
      category,
      title: title.trim(),
      context,
      impact,
      task_id: initial.task_id,
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
        {/* Sits with the buttons rather than up top: it is prefilled with the
            right answer nearly always, and only wanted when back-filling a day
            or correcting one. */}
        <input
          type="date"
          className="input w-auto"
          aria-label={t('worklog.dayLabel')}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <div className="flex-1" />
        <button className="btn btn-g btn-s" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-p btn-s" onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
