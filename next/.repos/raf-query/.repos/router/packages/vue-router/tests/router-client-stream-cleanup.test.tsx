import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { createMemoryHistory } from '@tanstack/history'
import * as Vue from 'vue'
import { RouterClient } from '../src/ssr/RouterClient'
import { createRootRoute, createRouter } from '../src'

const hydrate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/router-core/ssr/client', () => ({ hydrate }))

afterEach(() => {
  cleanup()
  delete window.$_TSR
  hydrate.mockReset()
})

test('RouterClient signals streaming cleanup without hiding a hydration failure', async () => {
  const error = new Error('hydration failed')
  hydrate.mockRejectedValue(error)
  const rootRoute = createRootRoute({ component: () => <div>Ready</div> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const hydrated = vi.fn()
  window.$_TSR = { h: hydrated } as any

  const Boundary = Vue.defineComponent({
    setup(_, { slots }) {
      const caught = Vue.ref<Error>()
      Vue.onErrorCaptured((value) => {
        caught.value = value
        return false
      })
      return () => caught.value?.message ?? slots.default?.()
    },
  })

  render(Boundary, {
    slots: { default: () => Vue.h(RouterClient, { router }) },
  })

  await waitFor(() => expect(hydrated).toHaveBeenCalledTimes(1))
  expect(await screen.findByText(error.message)).toBeInTheDocument()
})
