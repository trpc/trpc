import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '../src'

describe('createMemoryHistory', () => {
  test.each([
    ['//example.com/path', '/example.com/path'],
    ['/\\example.com/path', '/example.com/path'],
    ['\\/example.com/path', '/example.com/path'],
    ['\\\\example.com/path', '/example.com/path'],
    [' \t/\r\\example.com/path', '/example.com/path'],
    ['/\t/example.com/path', '/example.com/path'],
    ['/a\tb?q=a\nb#section\r', '/ab?q=ab#section'],
    ['/a\u0000b?q=a\u0001b#section\u007f', '/a%00b?q=a%01b#section%7F'],
    ['/', '/'],
    ['/posts/123?sort=new#comments', '/posts/123?sort=new#comments'],
    ['/caf%C3%A9?q=%2F#//section', '/caf%C3%A9?q=%2F#//section'],
    ['/a//b?q=//value#\\/section', '/a//b?q=//value#\\/section'],
    ['/%2Fexample.com/path', '/%2Fexample.com/path'],
  ])('creates href %j consistent with navigation', (href, expected) => {
    const history = createMemoryHistory()
    const location = history.location
    const createdHref = history.createHref(href)

    expect(createdHref).toBe(expected)
    expect(history.location).toBe(location)
    expect(new URL(createdHref, 'https://app.example').origin).toBe(
      'https://app.example',
    )

    history.push(href)
    expect(history.location.href).toBe(createdHref)
  })

  test('exposes the current blocker registry after registration and removal', () => {
    const history = createMemoryHistory()
    const first = { blockerFn: vi.fn(() => true) }
    const second = { blockerFn: vi.fn(() => false) }

    expect(history._getBlockers()).toEqual([])

    const removeFirst = history.block(first)
    const removeSecond = history.block(second)
    expect(history._getBlockers()).toEqual([first, second])

    removeFirst()
    expect(history._getBlockers()).toEqual([second])

    removeSecond()
    expect(history._getBlockers()).toEqual([])
  })

  test('back', () => {
    const initialEntry = '/initial'
    const history = createMemoryHistory({ initialEntries: [initialEntry] })
    history.push('/a')
    history.push('/b')
    history.push('/c')
    history.back()
    expect(history.location.pathname).toBe('/b')
    history.back()
    expect(history.location.pathname).toBe('/a')
    history.back()
    expect(history.location.pathname).toBe(initialEntry)
    // check that back does nothing when there is no back history
    history.back()
    expect(history.location.pathname).toBe(initialEntry)
  })

  test('forward', () => {
    const history = createMemoryHistory()
    history.push('/a')
    history.push('/b')
    history.push('/c')
    history.back()
    history.back()
    expect(history.location.pathname).toBe('/a')
    history.forward()
    expect(history.location.pathname).toBe('/b')
    history.forward()
    expect(history.location.pathname).toBe('/c')
    // check that forward does nothing when there is no forward history
    history.forward()
    expect(history.location.pathname).toBe('/c')
  })

  test('push and back #1916', () => {
    const history = createMemoryHistory()
    history.push('/a')
    expect(history.location.pathname).toBe('/a')
    history.push('/b')
    expect(history.location.pathname).toBe('/b')
    history.push('/c')
    expect(history.location.pathname).toBe('/c')
    history.back()
    expect(history.location.pathname).toBe('/b')
    history.push('/d')
    expect(history.location.pathname).toBe('/d')
    history.back()
    expect(history.location.pathname).toBe('/b')
  })

  test('discards forward entries and their state when pushing a new branch', () => {
    const initialEntries = ['/']
    const history = createMemoryHistory({ initialEntries })
    history.push('/kept', { marker: 'kept' })
    const keptState = history.location.state
    history.push('/discarded-first', { marker: 'discarded-first' })
    history.push('/discarded-last', { marker: 'discarded-last' })
    history.go(-2)
    history.push('/new', { marker: 'new' })

    expect(initialEntries).toEqual(['/', '/kept', '/new'])
    expect(history.length).toBe(3)
    expect(history.location.pathname).toBe('/new')
    expect(history.location.state).toMatchObject({
      __TSR_index: 2,
      marker: 'new',
    })
    const newState = history.location.state

    history.forward()
    expect(history.location.pathname).toBe('/new')
    expect(history.location.state).toBe(newState)

    history.back()
    expect(history.location.pathname).toBe('/kept')
    expect(history.location.state).toBe(keptState)

    history.forward()
    expect(history.location.pathname).toBe('/new')
    expect(history.location.state).toBe(newState)
  })

  test('length', () => {
    const history = createMemoryHistory()
    expect(history.length).toBe(1)
    history.push('/a')
    expect(history.length).toBe(2)
    history.replace('/b')
    expect(history.length).toBe(2)
    history.back()
    expect(history.length).toBe(2)
    history.push('/c')
    expect(history.length).toBe(2)
  })

  test('state', () => {
    const history = createMemoryHistory()
    history.push('/a', { i: 1 })
    expect((history.location.state as any).i).toBe(1)
    history.replace('/b', { i: 2 })
    expect((history.location.state as any).i).toBe(2)
    history.back()
    expect((history.location.state as any).i).toBeUndefined()
    history.push('/c', { i: 3 })
    expect((history.location.state as any).i).toBe(3)
  })

  test('block prevents navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const blockerFn = vi.fn(() => true) // Always block

    const unblock = history.block({
      blockerFn,
      enableBeforeUnload: false,
    })

    await history.push('/a')

    // Navigation should be blocked
    expect(history.location.pathname).toBe('/')
    expect(blockerFn).toHaveBeenCalled()

    unblock()
  })

  test('block allows navigation when blockerFn returns false', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const blockerFn = vi.fn(() => false) // Never block

    const unblock = history.block({
      blockerFn,
      enableBeforeUnload: false,
    })

    await history.push('/a')

    // Navigation should proceed
    expect(history.location.pathname).toBe('/a')
    expect(blockerFn).toHaveBeenCalled()

    unblock()
  })

  test('unblock removes blocker', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const blockerFn = vi.fn(() => true) // Always block

    const unblock = history.block({
      blockerFn,
      enableBeforeUnload: false,
    })

    // Unblock immediately
    unblock()

    await history.push('/a')

    // Navigation should proceed since blocker was removed
    expect(history.location.pathname).toBe('/a')
    expect(blockerFn).not.toHaveBeenCalled()
  })
})
