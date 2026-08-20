import { useTranslation } from 'react-i18next'
import type { EntryCategory, WorkLogEntry } from '../api/types'
import { CATEGORY_LABEL_KEYS, LINK_KIND_LABEL_KEYS } from '../lib/worklog'
import { Ic } from './Icon'

/** Categories reuse the existing badge palette rather than adding new colours. */
const CATEGORY_BADGE: Record<EntryCategory, string> = {
  shipped: 'b-green',
  operational: 'b-high',
  glue: 'b-today',
  learning: 'b-proj',
}

export function WorkLogEntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: WorkLogEntry
  /** Both omitted in read-only contexts, such as the rollup's evidence list. */
  onEdit?: (entry: WorkLogEntry) => void
  onDelete?: (entry: WorkLogEntry) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="task-row items-start gap-[5px]">
      <div className="min-w-0 flex-1">
        <div className="t-title">{entry.title}</div>
        {entry.context && <div className="mt-0.5 text-[12px] text-ink-2">{entry.context}</div>}
        {entry.impact && (
          <div className="mt-0.5 text-[12px] font-medium text-accent">{entry.impact}</div>
        )}
        <div className="t-meta">
          <span className={`badge ${CATEGORY_BADGE[entry.category]}`}>
            {t(CATEGORY_LABEL_KEYS[entry.category])}
          </span>
          {entry.links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="badge b-rec hover:underline"
              title={link.url}
            >
              {link.label || t(LINK_KIND_LABEL_KEYS[link.kind])}
            </a>
          ))}
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          className="btn btn-g btn-s"
          aria-label={t('worklog.editTooltip')}
          title={t('worklog.editTooltip')}
          onClick={() => onEdit(entry)}
        >
          <Ic n="pencil" s={12} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="btn btn-g btn-s"
          aria-label={t('worklog.deleteTooltip')}
          title={t('worklog.deleteTooltip')}
          onClick={() => onDelete(entry)}
        >
          <Ic n="trash" s={12} />
        </button>
      )}
    </div>
  )
}
