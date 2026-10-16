import { describe, expect, test, vi } from 'vitest'
import {
  createBrowserHistory,
  createMemoryHistory,
  createServerHistory,
} from '../src'

describe('server history', () => {
  test.each([
    '/',
    '/posts/123?sort=new#comments',
    '/caf%C3%A9?q=%2F#//section',
    '//example.com/path',
    '/\\example.com/path',
    '/path\nname?value=\u0000',
  ])('parses and sanitizes %j like memory history', (href) => {
    const history = createServerHistory(href)
    const memory = createMemoryHistory({ initialEntries: [href] })
    expect(history.location).toEqual({
      ...memory.location,
      state: {
        key: expect.any(String),
        __TSR_key: expect.any(String),
        __TSR_index: 0,
      },
    })
    expect(history.location.state.key).toBe(history.location.state.__TSR_key)
  })

  test.each([
    '//evil.example/path',
    '/\\evil.example/path',
    '\\/evil.example/path',
    '\\\\evil.example/path',
    ' \t/\r\\evil.example/path',
    '/\t/evil.example/path',
    '/a\tb?q=a\nb#section\r',
    '/a\u0000b?q=a\u0001b#section\u007f',
    '/',
    '/posts/123?sort=new#comments',
    '/caf%C3%A9?q=%2F#//section',
    '/a//b?q=//value#\\/section',
    '/%2Fevil.example/path',
  ])('normalizes href %j like browser history', (href) => {
    const history = createServerHistory('/request')
    const browser = createBrowserHistory()
    try {
      expect(history.createHref(href)).toBe(browser.createHref(href))
      expect(history.location.href).toBe('/request')
    } finally {
      browser.destroy()
    }
  })

  test('ignores navigation, subscriptions, and blockers', () => {
    const history = createServerHistory('/request?q=1')
    const location = history.location
    const subscriber = vi.fn()
    const blockerFn = vi.fn(() => true)
    const unsubscribe = history.subscribe(subscriber)
    const unblock = history.block({ blockerFn })

    history.push('/pushed', { value: 1 })
    history.replace('/replaced', { value: 2 })
    history.go(-1)
    history.back()
    history.forward()
    history.notify({ type: 'PUSH' })
    history.flush()
    history.destroy()
    unsubscribe()
    unblock()

    expect(history.location).toBe(location)
    expect(history.length).toBe(1)
    expect(history.canGoBack()).toBe(false)
    expect(history.subscribers.size).toBe(0)
    expect(history._getBlockers()).toEqual([])
    expect(subscriber).not.toHaveBeenCalled()
    expect(blockerFn).not.toHaveBeenCalled()
  })

  test('isolates state and exposed collections between requests', () => {
    const first = createServerHistory('/first')
    const second = createServerHistory('/second')
    first.location.state.__TSR_index = 10
    first.subscribers.add(vi.fn())
    first._getBlockers().push({ blockerFn: () => true })

    expect(second.location.pathname).toBe('/second')
    expect(second.location.state.__TSR_index).toBe(0)
    expect(second.subscribers.size).toBe(0)
    expect(second._getBlockers()).toEqual([])
  })
})
