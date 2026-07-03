import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import { createQueryClient, handleAuthError } from './queryClient'

function redirect(path = '/') {
  return { currentPath: vi.fn(() => path), redirectToWelcome: vi.fn() }
}

describe('handleAuthError', () => {
  it('redirects to /welcome on a 401 ApiError', () => {
    const r = redirect('/')
    handleAuthError(new ApiError(401, 'Unauthorized'), r)
    expect(r.redirectToWelcome).toHaveBeenCalledTimes(1)
  })

  it('ignores non-401 ApiErrors', () => {
    const r = redirect('/')
    handleAuthError(new ApiError(409, 'Conflict'), r)
    handleAuthError(new ApiError(500, 'Server error'), r)
    expect(r.redirectToWelcome).not.toHaveBeenCalled()
  })

  it('ignores errors that are not ApiErrors', () => {
    const r = redirect('/')
    handleAuthError(new Error('network down'), r)
    expect(r.redirectToWelcome).not.toHaveBeenCalled()
  })

  it('does nothing when already on /welcome', () => {
    const r = redirect('/welcome')
    handleAuthError(new ApiError(401, 'Unauthorized'), r)
    expect(r.redirectToWelcome).not.toHaveBeenCalled()
  })
})

describe('createQueryClient', () => {
  it('redirects to /welcome when any query fails with a 401', async () => {
    const r = redirect('/')
    const qc = createQueryClient(r)

    await qc
      .fetchQuery({
        queryKey: ['projects'],
        queryFn: () => Promise.reject(new ApiError(401, 'Unauthorized')),
        retry: false,
      })
      .catch(() => {})

    expect(r.redirectToWelcome).toHaveBeenCalledTimes(1)
  })

  it('does not redirect when a query fails with another error', async () => {
    const r = redirect('/')
    const qc = createQueryClient(r)

    await qc
      .fetchQuery({
        queryKey: ['projects'],
        queryFn: () => Promise.reject(new ApiError(500, 'boom')),
        retry: false,
      })
      .catch(() => {})

    expect(r.redirectToWelcome).not.toHaveBeenCalled()
  })
})
