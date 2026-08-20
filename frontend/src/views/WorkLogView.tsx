import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  unloggedCompletedTasks,
  useCreateWorkLogEntry,
  useDeleteWorkLogEntry,
  useProjects,
  useSetWorkLogDay,
  useUpdateWorkLogEntry,
  useWorkLogDays,
  useWorkLogEntries,
  useWorkLogRollup,
} from '../api/hooks'
import { isDefaultProject } from '../api/types'
import type { RollupPeriod, WorkLogBucket, WorkLogDay, WorkLogEntry } from '../api/types'
import { DaySignal } from '../components/DaySignal'
import { Ic } from '../components/Icon'
import {
  WorkLogEntryForm,
  blankEntry,
  entryToValues,
  type EntryFormValues,
} from '../components/WorkLogEntryForm'
import { WorkLogEntryRow } from '../components/WorkLogEntryRow'
import { useShowUndoToast } from '../components/UndoToast'
import { track } from '../lib/analytics'
import { formatDayHeading, parseISODate, todayISO } from '../lib/dates'
import { CATEGORY_LABEL_KEYS, bucketLabel, groupByDay, trailingRange } from '../lib/worklog'
import { ENTRY_CATEGORIES } from '../api/types'

type Tab = 'today' | 'week' | 'month'

const CAPTURE_WINDOW_DAYS = 14

function Num({ n }: { n: number }) {
  if (n === 0) return <span className="text-ink-3">—</span>
  return <span>{n}</span>
}

function Signal({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-3">—</span>
  return <span>{value.toFixed(1)}</span>
}

// ── Capture tab ────────────────────────────────────────────────────────────

function CaptureTab({ today }: { today: string }) {
  const { t, i18n } = useTranslation()
  const range = useMemo(() => trailingRange(today, CAPTURE_WINDOW_DAYS), [today])

  const { data: entries = [] } = useWorkLogEntries(range)
  const { data: days = [] } = useWorkLogDays(range)
  const { data: projects = [] } = useProjects()
  const createEntry = useCreateWorkLogEntry()
  const updateEntry = useUpdateWorkLogEntry()
  const deleteEntry = useDeleteWorkLogEntry()
  const setDay = useSetWorkLogDay(range)
  const showUndo = useShowUndoToast()

  const [draft, setDraft] = useState<EntryFormValues | null>(null)
  const [editing, setEditing] = useState<WorkLogEntry | null>(null)

  const todayRow: WorkLogDay = days.find((d) => d.day === today) ?? {
    day: today,
    energy: 0,
    friction: 0,
    note: '',
  }
  const promotable = unloggedCompletedTasks(projects, entries, today)
  const grouped = groupByDay(entries)

  const startDraft = (values: EntryFormValues) => {
    setEditing(null)
    setDraft(values)
  }

  const startEditing = (entry: WorkLogEntry) => {
    setDraft(null)
    setEditing(entry)
  }

  const remove = (entry: WorkLogEntry) => {
    if (editing?.id === entry.id) setEditing(null)
    deleteEntry.mutate(entry.id)
    showUndo(t('worklog.entryDeleted'), () =>
      createEntry.mutate({
        day: entry.day,
        category: entry.category,
        title: entry.title,
        context: entry.context,
        impact: entry.impact,
        task_id: entry.task_id,
        links: entry.links.map(({ url, kind, label }) => ({ url, kind, label })),
      }),
    )
  }

  return (
    <>
      <DaySignal day={todayRow} onChange={(next) => setDay.mutate(next)} />

      {draft ? (
        <div className="card mt-6">
          <WorkLogEntryForm
            initial={draft}
            submitLabel={t('worklog.save')}
            onSubmit={(values) => {
              createEntry.mutate(values)
              setDraft(null)
            }}
            onCancel={() => setDraft(null)}
          />
        </div>
      ) : (
        <button className="btn btn-p mt-6" onClick={() => startDraft(blankEntry(today))}>
          <Ic n="plus" s={12} /> {t('worklog.addEntry')}
        </button>
      )}

      {promotable.length > 0 && (
        <div className="card mt-6">
          <div className="card-head">
            <h3>{t('worklog.promoteTitle')}</h3>
            <span className="text-[11px] text-ink-3">{t('worklog.promoteHint')}</span>
          </div>
          {promotable.map(({ task, projectName }) => (
            <div key={task.id} className="task-row">
              <div className="min-w-0 flex-1">
                <div className="t-title">{task.title}</div>
                <div className="t-meta">
                  {!isDefaultProject({ name: projectName }) && (
                    <span className="badge b-proj">{projectName}</span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-g btn-s"
                onClick={() => {
                  track('worklog.promote_task', { entity_id: task.id })
                  startDraft({
                    ...blankEntry(today),
                    title: task.title,
                    context: task.notes,
                    task_id: task.id,
                  })
                }}
              >
                {t('worklog.promote')}
              </button>
            </div>
          ))}
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📓</div>
          <div className="mb-1.5 font-semibold">{t('worklog.emptyTitle')}</div>
          <div className="text-xs">{t('worklog.emptyBody')}</div>
        </div>
      ) : (
        grouped.map(({ day, entries: dayEntries }) => (
          <div key={day} className="card mt-6">
            <div className="card-head">
              <h3>{formatDayHeading(i18n.language, parseISODate(day))}</h3>
              <span className="text-[11px] text-ink-3">
                {t('worklog.entryCount', { count: dayEntries.length })}
              </span>
            </div>
            {dayEntries.map((entry) =>
              editing?.id === entry.id ? (
                <WorkLogEntryForm
                  key={entry.id}
                  initial={entryToValues(entry)}
                  submitLabel={t('worklog.saveChanges')}
                  onSubmit={(values) => {
                    updateEntry.mutate({ id: entry.id, patch: values })
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <WorkLogEntryRow
                  key={entry.id}
                  entry={entry}
                  onEdit={startEditing}
                  onDelete={remove}
                />
              ),
            )}
          </div>
        ))
      )}
    </>
  )
}

// ── Rollup tabs ────────────────────────────────────────────────────────────

function BucketDetail({ bucket, period }: { bucket: WorkLogBucket; period: RollupPeriod }) {
  const { t, i18n } = useTranslation()
  if (bucket.total === 0 && bucket.friction_notes.length === 0) return null

  return (
    <div className="card mt-6">
      <div className="card-head">
        <h3>{bucketLabel(bucket.start, bucket.end, period, i18n.language)}</h3>
        <span className="text-[11px] text-ink-3">
          {t('worklog.entryCount', { count: bucket.total })}
        </span>
      </div>
      {bucket.entries.map((entry) => (
        <WorkLogEntryRow key={entry.id} entry={entry} />
      ))}
      {bucket.friction_notes.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">
            {t('worklog.frictionNotes')}
          </div>
          {bucket.friction_notes.map((note, i) => (
            <div key={i} className="text-[12px] text-ink-2">
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RollupTab({ period }: { period: RollupPeriod }) {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError } = useWorkLogRollup(period)

  if (isLoading) return null
  if (isError || !data) return <div className="empty">{t('worklog.loadError')}</div>

  const buckets = data.buckets
  const totals = buckets.reduce(
    (acc, b) => ({
      total: acc.total + b.total,
      days: acc.days + b.days_logged,
      impact: acc.impact + b.with_impact,
    }),
    { total: 0, days: 0, impact: 0 },
  )

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[.06em]">
              <th className="px-4 py-3 text-ink-2">{t('worklog.colPeriod')}</th>
              <th className="px-3 py-3 text-right text-ink">{t('worklog.colTotal')}</th>
              {ENTRY_CATEGORIES.map((c) => (
                <th key={c} className="px-3 py-3 text-right text-ink-2">
                  {t(CATEGORY_LABEL_KEYS[c])}
                </th>
              ))}
              <th className="px-3 py-3 text-right text-ink-2">{t('worklog.colImpact')}</th>
              <th className="px-3 py-3 text-right text-ink-2">{t('worklog.colDays')}</th>
              <th className="px-3 py-3 text-right text-ink-2">{t('worklog.colEnergy')}</th>
              <th className="px-3 py-3 text-right text-ink-2">{t('worklog.colFriction')}</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key} className="border-b border-line last:border-0 hover:bg-surface-2 transition-colors">
                <td className="px-4 py-2.5 font-medium">
                  {bucketLabel(b.start, b.end, period, i18n.language)}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold">
                  <Num n={b.total} />
                </td>
                {ENTRY_CATEGORIES.map((c) => (
                  <td key={c} className="px-3 py-2.5 text-right">
                    <Num n={b.by_category[c] ?? 0} />
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right text-accent">
                  <Num n={b.with_impact} />
                </td>
                <td className="px-3 py-2.5 text-right text-ink-3">
                  <Num n={b.days_logged} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Signal value={b.avg_energy} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Signal value={b.avg_friction} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-surface-2 text-[13px]">
              <td className="px-4 py-2.5 font-semibold text-ink-2">{t('worklog.totals')}</td>
              <td className="px-3 py-2.5 text-right font-semibold">{totals.total || '—'}</td>
              {ENTRY_CATEGORIES.map((c) => (
                <td key={c} className="px-3 py-2.5 text-right font-semibold text-ink-2">
                  {buckets.reduce((n, b) => n + (b.by_category[c] ?? 0), 0) || '—'}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right font-semibold text-accent">
                {totals.impact || '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-ink-3">{totals.days || '—'}</td>
              <td className="px-3 py-2.5 text-right text-ink-3">—</td>
              <td className="px-3 py-2.5 text-right text-ink-3">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Newest period first: the one you're most likely to be writing up. */}
      {[...buckets].reverse().map((b) => (
        <BucketDetail key={b.key} bucket={b} period={period} />
      ))}
    </>
  )
}

// ── View ───────────────────────────────────────────────────────────────────

export function WorkLogView() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('today')
  const today = todayISO()

  const pick = (next: Tab) => {
    setTab(next)
    if (next !== 'today') track('worklog.rollup.view', { period: next })
  }

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">
            <Ic n="log" s={18} /> {t('worklog.title')}
          </div>
          <div className="ph-sub">{t('worklog.subtitle')}</div>
        </div>
        <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
          {(['today', 'week', 'month'] as const).map((tb) => (
            <button
              key={tb}
              className={`btn btn-s ${tab === tb ? 'btn-p' : 'btn-g'} border-none`}
              aria-pressed={tab === tb}
              onClick={() => pick(tb)}
            >
              {tb === 'today' && t('worklog.tabToday')}
              {tb === 'week' && t('worklog.tabWeek')}
              {tb === 'month' && t('worklog.tabMonth')}
            </button>
          ))}
        </div>
      </div>

      {tab === 'today' ? <CaptureTab today={today} /> : <RollupTab period={tab} />}
    </div>
  )
}
