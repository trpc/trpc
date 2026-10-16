import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ClientOnly, useHydrated } from '../src/ClientOnly'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('keeps both snapshot getters stable across renders', () => {
  const spy = vi.spyOn(React, 'useSyncExternalStore')
  const view = renderHook(() => useHydrated())
  const first = spy.mock.calls.at(-1)!
  expect(view.result.current).toBe(true)
  view.rerender()
  const next = spy.mock.calls.at(-1)!
  expect(next[0]).toBe(first[0])
  expect(next[1]).toBe(first[1])
  expect(next[2]).toBe(first[2])
  expect(view.result.current).toBe(true)
})

test('preserves the server snapshot through hydration before showing client content', async () => {
  const values: Array<boolean> = []
  function Probe() {
    const hydrated = useHydrated()
    values.push(hydrated)
    return (
      <div>
        <span>{String(hydrated)}</span>
        <ClientOnly fallback={<span>Fallback</span>}>
          <span>Client content</span>
        </ClientOnly>
      </div>
    )
  }
  const container = document.createElement('div')
  container.innerHTML = renderToString(<Probe />)
  document.body.append(container)
  expect(values).toEqual([false])
  expect(container).toHaveTextContent('falseFallback')
  values.length = 0
  const onRecoverableError = vi.fn()
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(() => {
      root = hydrateRoot(container, <Probe />, { onRecoverableError })
    })
    expect(values[0]).toBe(false)
    expect(values.at(-1)).toBe(true)
    expect(container).toHaveTextContent('trueClient content')
    expect(onRecoverableError).not.toHaveBeenCalled()
    values.length = 0
    await act(() => root!.render(<Probe />))
    expect(values).toEqual([true])
  } finally {
    await act(() => root?.unmount())
    container.remove()
  }
})
