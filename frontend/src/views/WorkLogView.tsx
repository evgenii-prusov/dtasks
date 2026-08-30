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
import type {
  EntryCategory,
  RollupPeriod,
  WorkLogBucket,
  WorkLogDay,
  WorkLogEntry,
} from '../api/types'
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
import {
  formatDayHeading,
  formatDayMonth,
  formatMonthShort,
  parseISODate,
  todayISO,
} from '../lib/dates'
import {
  CATEGORY_LABEL_KEYS,
  bucketLabel,
  currentBucketKey,
  groupByDay,
  trailingRange,
} from '../lib/worklog'
import { ENTRY_CATEGORIES } from '../api/types'

type Tab = 'today' | 'week' | 'month'

const CAPTURE_WINDOW_DAYS = 14

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

/** Volume ramp for a period tile: 0, 1-2, 3-5, 6+. Four steps rather than a
 * continuous scale, so a quiet week and a busy one are distinguishable at a
 * glance instead of a gradient nobody can read. */
function volumeLevel(total: number): 0 | 1 | 2 | 3 {
  if (total === 0) return 0
  if (total <= 2) return 1
  if (total <= 5) return 2
  return 3
}

function topCategory(bucket: WorkLogBucket): EntryCategory | null {
  let best: EntryCategory | null = null
  for (const c of ENTRY_CATEGORIES) {
    if ((bucket.by_category[c] ?? 0) > (best ? (bucket.by_category[best] ?? 0) : 0)) best = c
  }
  return best
}

function bucketDomId(key: string): string {
  return `worklog-bucket-${key}`
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <span className="text-[11px] text-ink-3">
      {label}{' '}
      <strong className={value == null ? 'text-ink-3' : 'text-ink'}>{value ?? '—'}</strong>
    </span>
  )
}

/** The timeline. Reads left to right, oldest to newest, because that is what a
 * time axis means -- the current period is marked instead of moved. */
function PeriodStrip({
  buckets,
  period,
  onJump,
}: {
  buckets: WorkLogBucket[]
  period: RollupPeriod
  onJump: (bucket: WorkLogBucket) => void
}) {
  const { t, i18n } = useTranslation()
  const currentKey = currentBucketKey(buckets, todayISO())

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-[5px]">
        {buckets.map((b) => {
          const label = bucketLabel(b.start, b.end, period, i18n.language)
          const cat = topCategory(b)
          const hint =
            b.total === 0
              ? `${label} — ${t('worklog.emptyBucket')}`
              : `${label} — ${t('worklog.entryCount', { count: b.total })}` +
                (cat ? ` · ${t(CATEGORY_LABEL_KEYS[cat])}` : '')
          return (
            <div key={b.key} className="flex flex-col items-center gap-1">
              <button
                type="button"
                className={`wcell v${volumeLevel(b.total)} ${b.key === currentKey ? 'current' : ''}`}
                title={hint}
                aria-label={hint}
                disabled={b.total === 0}
                onClick={() => onJump(b)}
              >
                {b.total || ''}
              </button>
              <span className="text-[9px] text-ink-3">
                {period === 'week'
                  ? formatDayMonth(i18n.language, parseISODate(b.start))
                  : formatMonthShort(i18n.language, parseISODate(b.start))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BucketDetail({ bucket, period }: { bucket: WorkLogBucket; period: RollupPeriod }) {
  const { t, i18n } = useTranslation()

  return (
    <div className="card mt-6" id={bucketDomId(bucket.key)}>
      <div className="card-head">
        <h3>{bucketLabel(bucket.start, bucket.end, period, i18n.language)}</h3>
        <span className="text-[11px] text-ink-3">
          {t('worklog.entryCount', { count: bucket.total })}
        </span>
      </div>

      {/* The per-period numbers the table used to carry, next to the evidence
          they describe rather than a scroll away from it. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
        {ENTRY_CATEGORIES.filter((c) => (bucket.by_category[c] ?? 0) > 0).map((c) => (
          <Stat key={c} label={t(CATEGORY_LABEL_KEYS[c])} value={bucket.by_category[c] ?? 0} />
        ))}
        <Stat label={t('worklog.colImpact')} value={bucket.with_impact} />
        <Stat label={t('worklog.colDays')} value={bucket.days_logged} />
        <Stat label={t('worklog.colEnergy')} value={bucket.avg_energy} />
        <Stat label={t('worklog.colFriction')} value={bucket.avg_friction} />
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
  const { t } = useTranslation()
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

  // Newest first: the period being written up is the current one. Empty periods
  // are left to the strip -- repeating them here would be the wall of dashes
  // this replaced.
  const populated = [...buckets].reverse().filter((b) => b.total > 0)

  const jump = (bucket: WorkLogBucket) => {
    document.getElementById(bucketDomId(bucket.key))?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <PeriodStrip buckets={buckets} period={period} onJump={jump} />

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Stat label={t('worklog.colTotal')} value={totals.total} />
        <Stat label={t('worklog.colImpact')} value={totals.impact} />
        <Stat label={t('worklog.colDays')} value={totals.days} />
      </div>

      {populated.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📓</div>
          <div className="mb-1.5 font-semibold">{t('worklog.emptyTitle')}</div>
          <div className="text-xs">{t('worklog.emptyBody')}</div>
        </div>
      ) : (
        populated.map((b) => <BucketDetail key={b.key} bucket={b} period={period} />)
      )}
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
