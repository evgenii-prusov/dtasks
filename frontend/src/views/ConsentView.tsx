import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useCurrentUser } from '../api/hooks'

/**
 * The OAuth consent step for the MCP connector (docs/mcp.md §3.3). Claude sends
 * the browser to /authorize, which redirects here; Allow or Deny sends the
 * browser on to the redirect URL the backend hands back.
 */
export function ConsentView({ requestId }: { requestId: string }) {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const [deciding, setDeciding] = useState(false)
  const authorization = useQuery({
    queryKey: ['mcpAuthorization', requestId],
    queryFn: () => api.getMcpAuthorization(requestId),
    retry: false,
  })

  const decide = async (approve: boolean) => {
    setDeciding(true)
    try {
      const { redirect_url } = await api.decideMcpAuthorization(requestId, approve)
      window.location.href = redirect_url
    } catch {
      // Expired between loading and clicking: show the same message as on load.
      await authorization.refetch()
      setDeciding(false)
    }
  }

  const client = authorization.data?.client_name

  return (
    <div className="flex h-screen items-center justify-center bg-bg px-6">
      <div className="card w-full max-w-[400px] p-5">
        {authorization.isError ? (
          <p className="text-[13px] leading-[1.6] text-ink-2">{t('consent.expired')}</p>
        ) : client ? (
          <>
            <h2 className="mb-3 font-serif text-[16px] font-semibold">
              {t('consent.title', { client })}
            </h2>
            <p className="mb-3 text-[13px] leading-[1.6] text-ink-2">{t('consent.body', { client })}</p>
            {user && (
              <p className="mb-4 text-[12px] text-ink-3">
                {t('consent.signedInAs', { email: user.email })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn btn-g" disabled={deciding} onClick={() => decide(false)}>
                {t('consent.deny')}
              </button>
              <button className="btn btn-p" disabled={deciding} onClick={() => decide(true)}>
                {t('consent.allow')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
