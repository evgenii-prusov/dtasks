import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeleteProject } from './hooks'
import type { Project } from './types'

function project(id: number, name: string): Project {
  return { id, name, group: 'Work', description: '', notes: '', position: id, tasks: [] }
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('useDeleteProject', () => {
  it('optimistically removes the project from the cache and calls DELETE', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const qc = new QueryClient()
    qc.setQueryData(['projects'], [project(1, 'Keep'), project(2, 'Remove')])

    const { result } = renderHook(() => useDeleteProject(), { wrapper: wrapper(qc) })
    result.current.mutate(2)

    await waitFor(() =>
      expect(qc.getQueryData<Project[]>(['projects'])).toEqual([project(1, 'Keep')]),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/2',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('rolls the cache back when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    const qc = new QueryClient()
    const initial = [project(1, 'Keep'), project(2, 'Remove')]
    qc.setQueryData(['projects'], initial)

    const { result } = renderHook(() => useDeleteProject(), { wrapper: wrapper(qc) })
    result.current.mutate(2)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(qc.getQueryData<Project[]>(['projects'])).toEqual(initial)
  })
})
