import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { cleanup, render } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

const cases = [
  { current: '/', to: '/', exact: true, active: true },
  { current: '/posts', to: '/posts/', exact: true, active: true },
  { current: '/posts/', to: '/posts', exact: true, active: true },
  { current: '/posts/item', to: '/posts', exact: true, active: false },
  { current: '/posts/item', to: '/posts', exact: false, active: true },
  { current: '/posts/item', to: '/posts/', exact: false, active: true },
  { current: '/posts-other', to: '/posts', exact: false, active: false },
]

for (const basepath of ['', '/app']) {
  test.each(cases)(
    `pathname matching agrees on server and client with basepath "${basepath}": $current -> $to, exact=$exact`,
    async ({ current, to, exact, active }) => {
      for (const isServer of [true, false]) {
        const router = createRouter({
          routeTree: createRootRoute(),
          history: createMemoryHistory({
            initialEntries: [basepath + current],
          }),
          basepath,
          trailingSlash: 'preserve',
          isServer,
        })
        const tree = Vue.h(RouterContextProvider, { router }, () =>
          Vue.h(
            Link,
            {
              to,
              activeOptions: { exact },
              inactiveProps: { class: 'inactive' },
            },
            {
              default: ({ isActive }: { isActive: boolean }) =>
                String(isActive),
            },
          ),
        )
        let container: Element
        if (isServer) {
          container = document.createElement('div')
          container.innerHTML = await renderToString(tree)
        } else {
          container = render(tree).container
        }
        const anchor = container.querySelector('a')!
        expect(anchor.textContent).toBe(String(active))
        expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
        expect(anchor.className).toBe(active ? 'active' : 'inactive')
      }
    },
  )
}

test('pathname matching reacts when exact mode changes', async () => {
  const exact = Vue.ref(true)
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/item'] }),
    isServer: false,
  })
  const { container } = render(
    Vue.h(RouterContextProvider, { router }, () =>
      Vue.h(
        Link,
        {
          to: '/posts',
          activeOptions: { exact: exact.value },
          inactiveProps: { class: 'inactive' },
        },
        { default: ({ isActive }: { isActive: boolean }) => String(isActive) },
      ),
    ),
  )
  const anchor = container.querySelector('a')!
  for (const mode of [true, false, true]) {
    exact.value = mode
    await Vue.nextTick()
    expect(anchor.textContent).toBe(String(!mode))
    expect(anchor.getAttribute('aria-current')).toBe(mode ? null : 'page')
    expect(anchor.className).toBe(mode ? 'inactive' : 'active')
  }
})
