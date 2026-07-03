import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCreateProject, useDeleteProject } from './hooks'
import type { Project } from './types'

function project(id: number, name: string, group = 'Work'): Project {
  return { id, name, group, description: '', notes: '', position: id, tasks: [] }
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

describe('useCreateProject', () => {
  it('POSTs the new project and invalidates the projects query on success', async () => {
    const created = project(9, 'New Project', 'Personal')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateProject(), { wrapper: wrapper(qc) })
    result.current.mutate({ name: 'New Project', group: 'Personal' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(created)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New Project', group: 'Personal' }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
  })
})
