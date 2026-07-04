import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import {
  useCreateHabit,
  useCreateProject,
  useDeleteHabit,
  useDeleteProject,
  useLogin,
  useLogout,
  useSignup,
} from './hooks'
import type { Habit, Project } from './types'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

function project(id: number, name: string, group = 'Work'): Project {
  return { id, name, group, description: '', notes: '', position: id, tasks: [] }
}

function habit(id: number, name: string): Habit {
  return { id, name, subtitle: '', position: id, log: {} }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

beforeEach(() => navigate.mockClear())
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

describe('useDeleteHabit', () => {
  it('optimistically removes the habit from the cache and calls DELETE', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const qc = new QueryClient()
    qc.setQueryData(['habits'], [habit(1, 'Keep'), habit(2, 'Remove')])

    const { result } = renderHook(() => useDeleteHabit(), { wrapper: wrapper(qc) })
    result.current.mutate(2)

    await waitFor(() =>
      expect(qc.getQueryData<Habit[]>(['habits'])).toEqual([habit(1, 'Keep')]),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/habits/2',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('rolls the cache back when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    const qc = new QueryClient()
    const initial = [habit(1, 'Keep'), habit(2, 'Remove')]
    qc.setQueryData(['habits'], initial)

    const { result } = renderHook(() => useDeleteHabit(), { wrapper: wrapper(qc) })
    result.current.mutate(2)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(qc.getQueryData<Habit[]>(['habits'])).toEqual(initial)
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

describe('useCreateHabit', () => {
  it('POSTs the new habit and invalidates the habits query on success', async () => {
    const created = habit(9, 'New Habit')
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

    const { result } = renderHook(() => useCreateHabit(), { wrapper: wrapper(qc) })
    result.current.mutate({ name: 'New Habit' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(created)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/habits',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New Habit' }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['habits'] })
  })
})

describe('useSignup', () => {
  it('POSTs the signup payload, invalidates the auth query and navigates home', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ id: 1, email: 'new@example.com' }, 201))
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSignup(), { wrapper: wrapper(qc) })
    result.current.mutate({
      email: 'new@example.com',
      password: 'password123',
      invite_code: 'secret',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'password123',
          invite_code: 'secret',
        }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] })
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('surfaces the ApiError when signup is rejected and stays put', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Invalid invite code' }, 403))
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSignup(), { wrapper: wrapper(qc) })
    result.current.mutate({ email: 'x@y.com', password: 'password123', invite_code: 'wrong' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    const err = result.current.error
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).message).toBe('Invalid invite code')
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('useLogin', () => {
  it('POSTs credentials, invalidates the auth query and navigates home', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ id: 1, email: 'user@example.com' }))
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useLogin(), { wrapper: wrapper(qc) })
    result.current.mutate({ email: 'user@example.com', password: 'password123' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] })
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('surfaces the ApiError on bad credentials and leaves the cache untouched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ detail: 'Invalid email or password' }, 401),
    )
    const qc = new QueryClient()
    qc.setQueryData(['projects'], [project(1, 'Keep')])
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useLogin(), { wrapper: wrapper(qc) })
    result.current.mutate({ email: 'user@example.com', password: 'nope' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    const err = result.current.error
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).message).toBe('Invalid email or password')
    expect(qc.getQueryData<Project[]>(['projects'])).toEqual([project(1, 'Keep')])
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('useLogout', () => {
  it('POSTs /api/auth/logout, clears the query cache and navigates to /welcome', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const qc = new QueryClient()
    qc.setQueryData(['projects'], [project(1, 'Keep')])
    qc.setQueryData(['auth', 'me'], { id: 1, email: 'user@example.com' })

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(qc) })
    result.current.mutate()

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/welcome' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(qc.getQueryData(['projects'])).toBeUndefined()
    expect(qc.getQueryData(['auth', 'me'])).toBeUndefined()
  })
})
