import { createMemoryHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test('retains the not-found owner while its hidden child loads again', async () => {
  const ownerBeforeLoadStarted = createControlledPromise<void>()
  const ownerBeforeLoadGate = createControlledPromise<void>()
  const childBeforeLoadStarted = createControlledPromise<void>()
  const childBeforeLoadGate = createControlledPromise<void>()
  const layoutOnEnter = vi.fn()
  const layoutOnStay = vi.fn()
  const childOnEnter = vi.fn()
  const childOnLeave = vi.fn()
  const childOnStay = vi.fn()
  let gateNextOwnerLoad = false
  let gateNextChildLoad = false
  const ownerBeforeLoad = vi.fn(() => {
    if (gateNextOwnerLoad) {
      ownerBeforeLoadStarted.resolve()
      return ownerBeforeLoadGate
    }
    return undefined
  })
  const childBeforeLoad = vi.fn(() => {
    if (gateNextChildLoad) {
      childBeforeLoadStarted.resolve()
      return childBeforeLoadGate
    }
    return undefined
  })

  const rootRoute = new BaseRootRoute({ component: () => null })
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '_agents',
    component: () => null,
    notFoundComponent: () => null,
    beforeLoad: ownerBeforeLoad,
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => null,
    onEnter: layoutOnEnter,
    onStay: layoutOnStay,
  })
  const agentsRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/agents',
    beforeLoad: childBeforeLoad,
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => null,
    component: () => null,
    onEnter: childOnEnter,
    onLeave: childOnLeave,
    onStay: childOnStay,
  })
  const history = createMemoryHistory({
    initialEntries: ['/agents'],
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([agentsRoute])]),
    history,
  })
  let navigation: Promise<void> | undefined

  try {
    await router.load()
    await router.navigate({ to: '/agents/missing' } as any)

    expect(router.state.status).toBe('idle')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      layoutRoute.id,
      agentsRoute.id,
    ])
    const sourceOwner = router.state.matches[1]
    expect(sourceOwner).toMatchObject({
      routeId: layoutRoute.id,
      status: 'success',
      _notFound: true,
    })
    expect(router.state.matches[2]).toMatchObject({
      routeId: agentsRoute.id,
      status: 'success',
    })
    expect(childBeforeLoad).toHaveBeenCalledTimes(1)
    expect(layoutOnEnter).toHaveBeenCalledTimes(1)
    expect(layoutOnStay).toHaveBeenCalledTimes(1)
    expect(childOnEnter).toHaveBeenCalledTimes(1)
    expect(childOnLeave).toHaveBeenCalledTimes(1)
    expect(childOnStay).not.toHaveBeenCalled()

    ownerBeforeLoad.mockClear()
    childBeforeLoad.mockClear()
    layoutOnStay.mockClear()
    childOnEnter.mockClear()
    childOnLeave.mockClear()
    gateNextOwnerLoad = true
    gateNextChildLoad = true
    navigation = router.navigate({ to: '/agents' })
    await ownerBeforeLoadStarted

    expect(router.state.status).toBe('pending')
    expect(router.state.matches[1]).toMatchObject({
      id: sourceOwner?.id,
      routeId: layoutRoute.id,
      status: 'success',
      _notFound: true,
    })
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(layoutOnStay).not.toHaveBeenCalled()
    expect(childOnEnter).not.toHaveBeenCalled()
    expect(childOnLeave).not.toHaveBeenCalled()
    expect(childOnStay).not.toHaveBeenCalled()

    ownerBeforeLoadGate.resolve()
    await childBeforeLoadStarted

    await vi.waitFor(() => {
      expect(router.state.matches[2]).toMatchObject({
        routeId: agentsRoute.id,
        status: 'pending',
      })
    })
    expect(router.state.status).toBe('pending')
    expect(router.state.matches[1]).toMatchObject({
      id: sourceOwner?.id,
      routeId: layoutRoute.id,
      status: 'success',
    })
    expect(router.state.matches[1]?._notFound).toBeFalsy()
    expect(layoutOnStay).not.toHaveBeenCalled()
    expect(childOnEnter).not.toHaveBeenCalled()
    expect(childOnLeave).not.toHaveBeenCalled()
    expect(childOnStay).not.toHaveBeenCalled()

    childBeforeLoadGate.resolve()
    await navigation

    expect(router.state).toMatchObject({
      status: 'idle',
      location: { pathname: '/agents' },
      resolvedLocation: { pathname: '/agents' },
    })
    expect(router.state.matches).toEqual([
      expect.objectContaining({
        routeId: rootRoute.id,
        status: 'success',
      }),
      expect.objectContaining({
        id: sourceOwner?.id,
        routeId: layoutRoute.id,
        status: 'success',
      }),
      expect.objectContaining({
        routeId: agentsRoute.id,
        status: 'success',
      }),
    ])
    expect(router.state.matches.some((match) => match._notFound)).toBe(false)
    expect(ownerBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childBeforeLoad).toHaveBeenCalledTimes(1)
    expect(layoutOnStay).toHaveBeenCalledTimes(1)
    expect(childOnEnter).toHaveBeenCalledTimes(1)
    expect(childOnLeave).not.toHaveBeenCalled()
    expect(childOnStay).not.toHaveBeenCalled()
  } finally {
    ownerBeforeLoadGate.resolve()
    childBeforeLoadGate.resolve()
    await Promise.allSettled(navigation ? [navigation] : [])
    history.destroy()
  }
})
