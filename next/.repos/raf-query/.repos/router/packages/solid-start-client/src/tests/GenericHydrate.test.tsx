import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'
import { GenericHydrate } from '../GenericHydrate'
import { never } from '../hydration/never'

vi.mock('@tanstack/router-core/isServer', () => ({ isServer: false }))

const disposers: Array<() => void> = []

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

test('passes each boundary marker to its prefetch callback', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const prefetch = vi.fn(async () => {})
  const querySelector = vi.spyOn(document, 'querySelector')
  const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
  disposers.push(
    render(
      () => (
        <>
          <GenericHydrate when={never()} prefetch={prefetch}>
            first
          </GenericHydrate>
          <GenericHydrate when={never()} prefetch={prefetch}>
            second
          </GenericHydrate>
        </>
      ),
      container,
    ),
  )
  await Promise.resolve()

  const markers = container.querySelectorAll('[data-ts-hydrate-id]')
  expect(markers).toHaveLength(2)
  expect(prefetch).toHaveBeenCalledTimes(2)
  expect(prefetch).toHaveBeenCalledWith(
    expect.objectContaining({ element: markers[0] }),
  )
  expect(prefetch).toHaveBeenCalledWith(
    expect.objectContaining({ element: markers[1] }),
  )
  for (const lookup of [querySelector, querySelectorAll]) {
    expect(
      lookup.mock.calls.some(([selector]) =>
        selector.includes('data-ts-hydrate-id'),
      ),
    ).toBe(false)
  }
})
