import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useProjects } from '../api/hooks'
import type { Project, Task } from '../api/types'
import { Ic } from '../components/Icon'
import { TaskRow } from '../components/TaskRow'
import { formatDayHeading } from '../lib/dates'

export function TodayView() {
  const { t, i18n } = useTranslation()
  const { data: projects = [] } = useProjects()

  const must: { t: Task; p: Project }[] = []
  const today: { t: Task; p: Project }[] = []
  const week: { t: Task; p: Project }[] = []
  for (const p of projects) {
    for (const t of p.tasks) {
      if (t.completed) continue
      if (t.must_have && t.assigned_today) must.push({ t, p })
      else if (t.assigned_today) today.push({ t, p })
      else if (t.assigned_week) week.push({ t, p })
    }
  }

  const dateStr = formatDayHeading(i18n.language)

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">{t('today.title')}</div>
          <div className="ph-sub">{dateStr}</div>
        </div>
        <Link to="/plan" className="btn btn-g btn-s">
          <Ic n="plan" s={13} /> {t('today.planMyDay')}
        </Link>
      </div>

      {must.length === 0 && today.length === 0 && week.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🌱</div>
          <div className="mb-[5px] font-semibold">{t('today.emptyTitle')}</div>
          <div className="mb-5 text-xs">{t('today.emptyHint')}</div>
          <Link to="/plan" className="btn btn-p">
            {t('today.openPlan')}
          </Link>
        </div>
      )}

      {must.length > 0 && (
        <div className="card must-card">
          <div className="card-head">
            <h3>
              <Ic n="fire" s={14} c="var(--must)" /> {t('today.mustHave')}
              <span className="text-[11px] font-normal opacity-70">({must.length}/2)</span>
            </h3>
            <span className="text-[10px] font-semibold tracking-[.04em] text-must">
              {t('today.startHere')}
            </span>
          </div>
          {must.map(({ t, p }) => (
            <TaskRow
              key={t.id}
              task={t}
              project={p}
              showProject
              checkable
              editable
              deletable
            />
          ))}
        </div>
      )}

      {today.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>
              <Ic n="today" s={13} /> {t('today.sectionToday')} ({today.length})
            </h3>
          </div>
          {today.map(({ t, p }) => (
            <TaskRow
              key={t.id}
              task={t}
              project={p}
              showProject
              checkable
              editable
              deletable
            />
          ))}
        </div>
      )}

      {week.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>
              <Ic n="plan" s={13} /> {t('today.sectionWeek')} ({week.length})
            </h3>
          </div>
          {week.map(({ t, p }) => (
            <TaskRow
              key={t.id}
              task={t}
              project={p}
              showProject
              checkable
              editable
              deletable
            />
          ))}
        </div>
      )}
    </div>
  )
}
