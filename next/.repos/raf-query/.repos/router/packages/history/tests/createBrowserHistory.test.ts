import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src'

function createBrowserHistoryHarness(createHref?: (path: string) => string) {
  const listeners = new Map<string, (event: any) => any>()
  const location = {
    pathname: '/',
    search: '',
    hash: '',
  }
  const pushState = vi.fn()
  const replaceState = vi.fn()
  const nativeHistory = {
    state: { __TSR_index: 0, __TSR_key: 'initial' },
    length: 1,
    pushState,
    replaceState,
    back: vi.fn(),
    forward: vi.fn(),
    go: vi.fn(),
  }
  const window = {
    location,
    history: nativeHistory,
    addEventListener: vi.fn((type: string, listener: (event: any) => any) => {
      listeners.set(type, listener)
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type)
    }),
    dispatchEvent: (event: { type: string }) =>
      listeners.get(event.type)?.(event),
  }
  const history = createBrowserHistory({ window, createHref })

  return {
    history,
    pushState,
    replaceState,
    window,
  }
}

describe('createBrowserHistory', () => {
  test('passes the original destination to a custom formatter', () => {
    const { history, pushState } = createBrowserHistoryHarness(
      (href) => '/mapped?value=' + encodeURIComponent(href),
    )
    history.push('/a\tb')
    history.flush()
    expect(pushState).toHaveBeenCalledWith(
      expect.anything(),
      '',
      '/mapped?value=%2Fa%09b',
    )
    expect(history.location.href).toBe('/ab')
    history.destroy()
  })

  test.each(['/a\x00b?q=a\x01b#/\\section\x7f', '/a\tb?q=a\nb#/\\section\r'])(
    'preserves the browser interpretation of %j',
    (href) => {
      const originalHref = window.location.href
      const expected = new URL(href, originalHref)
      const history = createBrowserHistory()
      try {
        expect(new URL(history.createHref(href), originalHref).href).toBe(
          expected.href,
        )
        history.push(href)
        history.flush()
        expect(window.location.href).toBe(expected.href)
        expect(new URL(history.location.href, originalHref).href).toBe(
          expected.href,
        )
      } finally {
        history.destroy()
        window.history.replaceState(null, '', originalHref)
      }
    },
  )

  test('coalesces consecutive replaces into the latest replace', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.replace('/first', { value: 1 })
    history.replace('/second', { value: 2 })
    await Promise.resolve()

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test('promotes a queued replace to a push', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.replace('/first', { value: 1 })
    history.push('/second', { value: 2 })
    await Promise.resolve()

    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test('keeps a queued push when followed by a replace', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.push('/first', { value: 1 })
    history.replace('/second', { value: 2 })
    await Promise.resolve()

    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test('flushes a later action after an explicit flush', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.replace('/first', { value: 1 })
    history.flush()
    await Promise.resolve()
    history.replace('/second', { value: 2 })
    await Promise.resolve()

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(2)
    expect(replaceState).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test.each([
    '//evil.com/path',
    '///evil.com/path',
    '/\\evil.com/path',
    '/\\\\evil.com/path',
    '/\\/evil.com/path',
    '\\/evil.com/path',
    '\\\\evil.com/path',
    ' /\\evil.com/path',
    '\x01//evil.com/path',
    '/\t/evil.com/path',
  ])('sanitizes %j before calling the native History API', async (href) => {
    const { history, pushState } = createBrowserHistoryHarness()

    history.push(href)
    await Promise.resolve()

    expect(pushState).toHaveBeenCalledOnce()
    const pushedHref = pushState.mock.calls[0]![2]
    const serializedUrl = new URL(pushedHref, 'https://victim.example')
    expect(serializedUrl.origin).toBe('https://victim.example')
    expect(serializedUrl.pathname).toBe(
      href === '\x01//evil.com/path' ? '/%01//evil.com/path' : '/evil.com/path',
    )
    expect(
      new URL(history.location.href, 'https://victim.example').origin,
    ).toBe('https://victim.example')
    history.destroy()
  })

  test('does not exempt a normal traversal from beforeunload blockers', () => {
    const { history, window } = createBrowserHistoryHarness()
    history.block({ blockerFn: vi.fn(), enableBeforeUnload: true })

    history.back()
    const event = {
      type: 'beforeunload',
      preventDefault: vi.fn(),
      returnValue: undefined,
    }
    window.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    history.destroy()
  })

  test('exempts an ignored document traversal from beforeunload blockers', () => {
    const { history, window } = createBrowserHistoryHarness()
    history.block({ blockerFn: vi.fn(), enableBeforeUnload: true })

    history.back({ ignoreBlocker: true })
    const event = {
      type: 'beforeunload',
      preventDefault: vi.fn(),
      returnValue: undefined,
    }
    window.dispatchEvent(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.returnValue).toBeUndefined()
    history.destroy()
  })

  test('passes the logical requested destination to blockers', async () => {
    const { history } = createBrowserHistoryHarness(
      () => '/mapped/../browser-destination',
    )
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn, enableBeforeUnload: false })

    history.push('/logical/../destination?query=value#hash')
    await Promise.resolve()

    expect(blockerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PUSH',
        nextLocation: expect.objectContaining({
          href: '/logical/../destination?query=value#hash',
          pathname: '/logical/../destination',
          search: '?query=value',
          hash: '#hash',
        }),
      }),
    )
    history.destroy()
  })

  test('normalizes the final result of a custom createHref', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness(
      () => ' \t/\\evil.example/path',
    )

    expect(history.createHref('/safe')).toBe('/evil.example/path')

    history.push('/safe')
    await Promise.resolve()
    history.replace('/safe')
    await Promise.resolve()

    expect(pushState).toHaveBeenCalledWith(
      expect.anything(),
      '',
      '/evil.example/path',
    )
    expect(replaceState).toHaveBeenCalledWith(
      expect.anything(),
      '',
      '/evil.example/path',
    )
    expect(history.location.href).toBe('/safe')
    history.destroy()
  })

  test('keeps the optimistic location in the logical URL space', async () => {
    const { history, pushState } = createBrowserHistoryHarness(
      () => '/mapped/../browser-destination',
    )

    history.push('/logical/../destination?query=value#hash')
    await Promise.resolve()

    expect(history.location).toMatchObject({
      href: '/logical/../destination?query=value#hash',
      pathname: '/logical/../destination',
      search: '?query=value',
      hash: '#hash',
    })
    expect(pushState).toHaveBeenCalledWith(
      expect.anything(),
      '',
      '/mapped/../browser-destination',
    )
    history.destroy()
  })

  test('does not retain a beforeunload exemption after a same-document traversal', async () => {
    const { history, window } = createBrowserHistoryHarness()
    history.block({ blockerFn: vi.fn(), enableBeforeUnload: true })

    history.back({ ignoreBlocker: true })
    await window.dispatchEvent({ type: 'popstate' })

    const event = {
      type: 'beforeunload',
      preventDefault: vi.fn(),
      returnValue: undefined,
    }
    window.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    history.destroy()
  })
})
