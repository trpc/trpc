import React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

test('only hash-sensitive links need a second hydration render', async () => {
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/target' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/target#section'] }),
  })
  await router.load()
  const serverRouter = createRouter({
    routeTree: router.routeTree,
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    isServer: true,
  })
  await serverRouter.load()
  const ordinary = vi.fn(({ isActive }: { isActive: boolean }) =>
    String(isActive),
  )
  const hashSensitive = vi.fn(({ isActive }: { isActive: boolean }) =>
    String(isActive),
  )
  const tree = (includeHash = false, contextRouter = router) => (
    <RouterContextProvider router={contextRouter}>
      <Link
        to="/target"
        hash="other"
        activeOptions={{ includeHash }}
        activeProps={{ title: 'active' }}
        inactiveProps={{ title: 'inactive' }}
        data-testid="ordinary"
      >
        {ordinary}
      </Link>
      <Link
        to="/target"
        hash="section"
        activeOptions={{ includeHash: true }}
        activeProps={{ title: 'active' }}
        inactiveProps={{ title: 'inactive' }}
        data-testid="hash"
      >
        {hashSensitive}
      </Link>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  document.body.append(container)
  container.innerHTML = renderToString(tree(false, serverRouter))
  expect(container.querySelector('[data-testid="ordinary"]')?.textContent).toBe(
    'true',
  )
  expect(container.querySelector('[data-testid="hash"]')?.textContent).toBe(
    'false',
  )
  ordinary.mockClear()
  hashSensitive.mockClear()
  const onRecoverableError = vi.fn()
  const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {})
  const serverAnchor = container.querySelector('[data-testid="ordinary"]')
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(() => {
      root = hydrateRoot(container, tree(), { onRecoverableError })
    })
    expect(ordinary).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="ordinary"]')).toBe(
      serverAnchor,
    )
    expect(hashSensitive.mock.calls.map(([state]) => state.isActive)).toEqual([
      false,
      true,
    ])
    expect(container.querySelector('[data-testid="hash"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(container.querySelector('[data-testid="hash"]')).toHaveAttribute(
      'title',
      'active',
    )
    await act(() => root!.render(tree(true)))
    expect(
      container.querySelector('[data-testid="ordinary"]'),
    ).not.toHaveAttribute('aria-current')
    expect(container.querySelector('[data-testid="ordinary"]')).toHaveAttribute(
      'title',
      'inactive',
    )
    await act(() => root!.render(tree(false)))
    expect(container.querySelector('[data-testid="ordinary"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(diagnostics).not.toHaveBeenCalled()
  } finally {
    await act(() => root?.unmount())
    router.history.destroy()
    serverRouter.history.destroy()
    diagnostics.mockRestore()
    container.remove()
  }
})

test('hash-sensitive links retain the server snapshot in a delayed hydration boundary', async () => {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/target' }),
  ])
  const serverRouter = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    isServer: true,
  })
  const clientRouter = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/target#section'] }),
  })
  await Promise.all([serverRouter.load(), clientRouter.load()])
  let ready = true
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  const ordinary = vi.fn(() => 'ordinary')
  const hashSensitive = vi.fn(({ isActive }: { isActive: boolean }) =>
    String(isActive),
  )
  function DeferredLinks() {
    if (!ready) {
      throw pending
    }
    return (
      <>
        <Link to="/target">{ordinary}</Link>
        <Link to="/target" hash="section" activeOptions={{ includeHash: true }}>
          {hashSensitive}
        </Link>
      </>
    )
  }
  const tree = (router: typeof clientRouter) => (
    <RouterContextProvider router={router}>
      <React.Suspense fallback={<p>Loading</p>}>
        <DeferredLinks />
      </React.Suspense>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  document.body.append(container)
  container.innerHTML = renderToString(tree(serverRouter))
  const serverAnchor = container.querySelector('a')
  ordinary.mockClear()
  hashSensitive.mockClear()
  ready = false
  const onRecoverableError = vi.fn()
  const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(() => {
      root = hydrateRoot(container, tree(clientRouter), { onRecoverableError })
    })
    expect(ordinary).not.toHaveBeenCalled()
    expect(hashSensitive).not.toHaveBeenCalled()
    await act(async () => {
      ready = true
      resolve()
      await pending
    })
    expect(ordinary).toHaveBeenCalledTimes(1)
    expect(hashSensitive.mock.calls.map(([state]) => state.isActive)).toEqual([
      false,
      true,
    ])
    expect(container.querySelector('a')).toBe(serverAnchor)
    expect(container.querySelectorAll('a')[1]).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(diagnostics).not.toHaveBeenCalled()
  } finally {
    await act(() => root?.unmount())
    serverRouter.history.destroy()
    clientRouter.history.destroy()
    diagnostics.mockRestore()
    container.remove()
  }
})
