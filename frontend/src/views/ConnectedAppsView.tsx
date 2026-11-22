import { useTranslation } from 'react-i18next'
import { useMcpGrants, useRevokeMcpGrant } from '../api/hooks'
import { formatDayMonth } from '../lib/dates'

/** MCP clients the user has authorized, with a way to cut each one off (docs/mcp.md §3.5). */
export function ConnectedAppsView() {
  const { t, i18n } = useTranslation()
  const { data: grants = [], isLoading } = useMcpGrants()
  const revoke = useRevokeMcpGrant()
  const day = (iso: string) => formatDayMonth(i18n.language, new Date(iso))

  return (
    <div>
      <div className="ph">
        <div className="ph-title">{t('connectedApps.title')}</div>
      </div>
      <p className="mb-2 text-[13px] leading-[1.6] text-ink-2">{t('connectedApps.intro')}</p>
      <p className="mb-6 text-[13px] leading-[1.6] text-ink-2">
        {t('connectedApps.setup')}{' '}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] select-all">
          {window.location.origin}/mcp
        </code>
      </p>

      {!isLoading && grants.length === 0 && (
        <p className="text-[13px] text-ink-3">{t('connectedApps.empty')}</p>
      )}
      {grants.map((grant) => (
        <div key={grant.id} className="card mb-2 flex items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <div className="text-[14px] font-medium">{grant.client_name}</div>
            <div className="text-[12px] text-ink-3">
              {t('connectedApps.connected', { date: day(grant.created_at) })} ·{' '}
              {grant.last_used_at
                ? t('connectedApps.lastUsed', { date: day(grant.last_used_at) })
                : t('connectedApps.neverUsed')}
            </div>
          </div>
          <button
            className="btn btn-g btn-s btn-danger"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(grant.id)}
          >
            {t('connectedApps.revoke')}
          </button>
        </div>
      ))}
      {revoke.isError && <p className="mt-2 text-[12px] text-must">{t('connectedApps.revokeError')}</p>}
    </div>
  )
}
