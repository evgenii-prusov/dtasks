import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useProjects } from '../api/hooks'
import { isDefaultProject } from '../api/types'
import { Ic } from '../components/Icon'
import type { Task } from '../api/types'

function taskCounts(tasks: Task[]) {
  let backlog = 0
  let today = 0
  let week = 0
  let closed = 0
  for (const t of tasks) {
    if (t.completed) {
      closed++
    } else if (t.assigned_today) {
      today++
    } else if (t.assigned_week) {
      week++
    } else {
      backlog++
    }
  }
  return { backlog, today, week, closed, total: tasks.length }
}

function Num({ n, accent }: { n: number; accent?: boolean }) {
  if (n === 0) return <span className="text-ink-3">—</span>
  return <span className={accent ? 'font-semibold text-accent' : ''}>{n}</span>
}

export function ReportView() {
  const { t } = useTranslation()
  const { data: projects = [] } = useProjects()

  const rows = projects.map((p) => ({ project: p, ...taskCounts(p.tasks) }))
  const totals = rows.reduce(
    (acc, r) => ({
      backlog: acc.backlog + r.backlog,
      today: acc.today + r.today,
      week: acc.week + r.week,
      closed: acc.closed + r.closed,
      total: acc.total + r.total,
    }),
    { backlog: 0, today: 0, week: 0, closed: 0, total: 0 },
  )

  return (
    <div>
      <div className="ph">
        <div>
          <div className="ph-title">
            <Ic n="chart" s={18} /> {t('report.title')}
          </div>
          <div className="ph-sub">{t('report.subtitle')}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[.06em]">
              <th className="px-4 py-3 text-ink-2">{t('report.project')}</th>
              <th className="px-3 py-3 text-right text-ink-2">{t('report.backlog')}</th>
              <th className="px-3 py-3 text-right text-accent">{t('report.today')}</th>
              <th className="px-3 py-3 text-right text-ink-2">{t('report.week')}</th>
              <th className="px-3 py-3 text-right text-ink-3">{t('report.closed')}</th>
              <th className="px-3 py-3 text-right text-ink">{t('report.total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project, backlog, today, week, closed, total }) => (
              <tr
                key={project.id}
                className="border-b border-line last:border-0 hover:bg-surface-2 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: String(project.id) }}
                    className="font-medium hover:text-accent transition-colors"
                  >
                    {isDefaultProject(project) ? (
                      <span className="italic text-ink-3">
                        {project.group === 'Work'
                          ? t('quickAdd.workDefault')
                          : t('quickAdd.personalDefault')}
                      </span>
                    ) : (
                      project.name
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Num n={backlog} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Num n={today} accent />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Num n={week} />
                </td>
                <td className="px-3 py-2.5 text-right text-ink-3">
                  <Num n={closed} />
                </td>
                <td className="px-3 py-2.5 text-right font-semibold">
                  {total || <span className="text-ink-3">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-surface-2 text-[13px]">
              <td className="px-4 py-2.5 font-semibold text-ink-2">{t('report.totals')}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-ink-2">
                {totals.backlog || '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-accent">
                {totals.today || '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-ink-2">
                {totals.week || '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-ink-3">
                {totals.closed || '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold">{totals.total || '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
