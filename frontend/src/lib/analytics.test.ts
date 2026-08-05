import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  disableAnalytics,
  flush,
  pendingCount,
  resetAnalytics,
  setSurfaceResolver,
  takeNavCause,
  setNavCause,
  track,
} from './analytics'
import { resetInputModality } from './inputModality'

function sentBatches(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))
}

describe('analytics queue', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetAnalytics()
    resetInputModality()
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    resetAnalytics()
  })

  it('queues without sending immediately', () => {
    track('nav.view', { to: 'plan' })
    expect(pendingCount()).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flushes automatically once the batch fills', async () => {
    for (let i = 0; i < 20; i++) track('hotkey.use', { chord: 'j' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentBatches(fetchMock)[0].events).toHaveLength(20)
    expect(pendingCount()).toBe(0)
  })

  it('sends queued events on demand', async () => {
    track('undo.used', {})
    await flush()
    expect(sentBatches(fetchMock)[0].events).toHaveLength(1)
  })

  it('sends nothing when the queue is empty', async () => {
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stamps every event with a modality', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    track('hotkey.use', { chord: 'j' }, 'keyboard')
    await flush()
    expect(sentBatches(fetchMock)[0].events[0].input).toBe('keyboard')
  })

  it('defaults the modality to unknown with no recent gesture', async () => {
    track('nav.view', { to: 'plan' })
    await flush()
    expect(sentBatches(fetchMock)[0].events[0].input).toBe('unknown')
  })

  it('gives every event a distinct id so retries can be de-duplicated', async () => {
    track('nav.view', { to: 'plan' })
    track('nav.view', { to: 'today' })
    await flush()
    const [a, b] = sentBatches(fetchMock)[0].events
    expect(a.event_id).not.toBe(b.event_id)
  })

  it('tags events with the current surface', async () => {
    setSurfaceResolver(() => 'plan')
    track('search.query', { query_length: 3 })
    await flush()
    expect(sentBatches(fetchMock)[0].events[0].surface).toBe('plan')
  })

  it('uses sendBeacon when the page is going away', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    track('nav.view', { to: 'plan' })
    await flush({ beacon: true })
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up after repeated failures rather than retrying forever', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    for (let i = 0; i < 3; i++) {
      track('nav.view', { to: 'plan' })
      await flush()
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Circuit is open: further events are dropped, not queued.
    track('nav.view', { to: 'plan' })
    expect(pendingCount()).toBe(0)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('drops the queue on 401 without counting it as a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    track('nav.view', { to: 'plan' })
    await flush()
    // A lost session is not a broken pipe; the router handles the redirect.
    track('nav.view', { to: 'plan' })
    expect(pendingCount()).toBe(1)
  })

  it('records nothing once disabled', async () => {
    disableAnalytics()
    track('nav.view', { to: 'plan' })
    expect(pendingCount()).toBe(0)
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('navigation cause', () => {
  beforeEach(() => resetAnalytics())

  it('defaults to url when nothing claimed the navigation', () => {
    expect(takeNavCause()).toBe('url')
  })

  it('reports the affordance that set it', () => {
    setNavCause('palette')
    expect(takeNavCause()).toBe('palette')
  })

  it('is consumed once, so a later navigation is not misattributed', () => {
    setNavCause('hotkey')
    expect(takeNavCause()).toBe('hotkey')
    expect(takeNavCause()).toBe('url')
  })
})
