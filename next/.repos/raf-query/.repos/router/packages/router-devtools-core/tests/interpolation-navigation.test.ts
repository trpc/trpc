import { beforeAll, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { TanStackRouterDevtoolsPanelCore } from '../src/TanStackRouterDevtoolsPanelCore'

beforeAll(async () => {
  await import('../src/BaseTanStackRouterDevtoolsPanel')
}, 30_000)

test('offers navigation only when required and splat params are available', async () => {
  const root = new BaseRootRoute({})
  const routeTree = root.addChildren(
    ['/users/$id', '/posts/{-$category}', '/files/$'].map(
      (path) => new BaseRoute({ getParentRoute: () => root, path }),
    ),
  )
  const router = new RouterCore({ routeTree, isServer: false }, () => ({
    createMutableStore: createNonReactiveMutableStore,
    createReadonlyStore: createNonReactiveReadonlyStore,
    batch: (fn) => fn(),
  }))
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
  const initialState = router.state
  const panel = new TanStackRouterDevtoolsPanelCore({
    router,
    routerState: initialState,
  })
  const container = document.createElement('div')
  document.body.append(container)
  panel.mount(container)

  try {
    await vi.waitFor(() => {
      expect(
        container.querySelector('[title="Navigate to /posts"]'),
      ).not.toBeNull()
    })
    expect(container.querySelector('[title^="Navigate to /users/"]')).toBeNull()
    expect(container.querySelector('[title^="Navigate to /files"]')).toBeNull()

    panel.setRouterState({
      ...initialState,
      matches: router.matchRoutes('/users/item%20one', {}),
    })
    await vi.waitFor(() => {
      expect(
        container.querySelector('[title="Navigate to /users/item%20one"]'),
      ).not.toBeNull()
    })
    container
      .querySelector<HTMLButtonElement>(
        '[title="Navigate to /users/item%20one"]',
      )!
      .click()
    expect(navigate).toHaveBeenCalledWith({
      to: '/users/item%20one',
      params: undefined,
      search: undefined,
    })

    panel.setRouterState({
      ...initialState,
      matches: router.matchRoutes('/files/docs/guide', {}),
    })
    await vi.waitFor(() => {
      expect(
        container.querySelector('[title="Navigate to /files/docs/guide"]'),
      ).not.toBeNull()
    })
    expect(container.querySelector('[title^="Navigate to /users/"]')).toBeNull()

    panel.setRouterState(initialState)
    await vi.waitFor(() => {
      expect(
        container.querySelector('[title^="Navigate to /files"]'),
      ).toBeNull()
    })
  } finally {
    panel.unmount()
    router.history.destroy()
    navigate.mockRestore()
    container.remove()
    window.localStorage.clear()
  }
}, 30_000)
