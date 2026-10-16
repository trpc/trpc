import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/vue'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

function createTestRouter(
  scrollRestoration: boolean | (() => boolean),
  isServer = false,
) {
  const revision = Vue.ref(0)
  const mounted = vi.fn()
  const Child = Vue.defineComponent({
    setup() {
      const count = Vue.ref(0)
      Vue.onMounted(mounted)
      return () => <button onClick={() => count.value++}>{count.value}</button>
    },
  })
  const Shell = Vue.defineComponent({
    setup(_, { slots }) {
      return () => (
        <div data-testid="shell" data-revision={revision.value}>
          {slots.default?.()}
        </div>
      )
    },
  })
  const root = createRootRoute({
    shellComponent: Shell,
    component: () => (
      <main>
        <Outlet />
      </main>
    ),
  })
  const child = createRoute({
    getParentRoute: () => root,
    path: '/child',
    component: Child,
  })
  const router = createRouter({
    routeTree: root.addChildren([child]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer,
    scrollRestoration,
    ssr: { nonce: 'test-nonce' },
  })
  return { router, revision, mounted }
}

test.each([false, true])(
  'preserves root child state through shell updates (scroll restoration: %s)',
  async (scrollRestoration) => {
    const { router, revision, mounted } = createTestRouter(scrollRestoration)
    const app = render(<RouterProvider router={router} />)
    const button = await app.findByRole('button')

    await fireEvent.click(button)
    revision.value++
    router.update({ scrollRestoration: !scrollRestoration })
    await router.invalidate()
    await Vue.nextTick()

    expect(app.getByRole('button')).toBe(button)
    expect(button).toHaveTextContent('1')
    expect(mounted).toHaveBeenCalledOnce()
    expect(app.getByTestId('shell')).toHaveAttribute('data-revision', '1')
  },
)

test.each([
  ['disabled', false, false],
  ['enabled', true, true],
  ['skipped by selector', (): boolean => false, false],
  ['enabled by selector', (): boolean => true, true],
] as const)(
  'renders root child content and the restoration script on the server (%s)',
  async (_, scrollRestoration, hasScript) => {
    const { router } = createTestRouter(scrollRestoration, true)
    await router.load()
    const html = await renderToString(
      Vue.createSSRApp(() => <RouterProvider router={router} />),
    )
    const container = document.createElement('div')
    container.innerHTML = html

    expect(container.querySelector('main > button')).toHaveTextContent('0')
    const scripts = container.querySelectorAll('main > script')
    expect(scripts).toHaveLength(hasScript ? 1 : 0)
    if (hasScript) {
      expect(scripts[0]).toHaveAttribute('nonce', 'test-nonce')
      expect(scripts[0]?.textContent).toContain(
        'document.currentScript.remove()',
      )
    }
  },
)
