import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'

type AssetContext = {
  matches: Array<AnyRouteMatch>
  match: AnyRouteMatch
}

function setup(isServer = false) {
  const parentHead = vi.fn((_context: AssetContext) => ({
    meta: [{ title: 'Parent' }],
  }))
  const parentScripts = vi.fn((_context: AssetContext) => [
    { children: 'window.parent = true' },
  ])
  const childHead = vi.fn(({ matches, match }: AssetContext) => {
    const parentMatch = matches[match.index - 1]
    const parentTitle = (parentMatch?.meta as Array<{ title?: string }>)[0]
      ?.title
    return { meta: [{ title: `${parentTitle} | Child` }] }
  })
  const childScripts = vi.fn(({ matches, match }: AssetContext) => {
    const parentMatch = matches[match.index - 1]
    const parentScript = (
      parentMatch?.scripts as Array<{ children?: string }> | undefined
    )?.[0]?.children
    return [{ children: `${parentScript}; window.child = true` }]
  })
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    head: parentHead,
    scripts: parentScripts,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    head: childHead,
    scripts: childScripts,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    isServer,
  })

  return {
    parentHead,
    parentScripts,
    childHead,
    childScripts,
    parentRoute,
    childRoute,
    router,
  }
}

function expectSequentialProjection(result: ReturnType<typeof setup>): void {
  expect(result.parentHead).toHaveBeenCalledTimes(1)
  expect(result.parentScripts).toHaveBeenCalledTimes(1)
  expect(result.childHead).toHaveBeenCalledTimes(1)
  expect(result.childScripts).toHaveBeenCalledTimes(1)

  const childHeadContext = result.childHead.mock.calls[0]![0]
  expect(childHeadContext.match.routeId).toBe(result.childRoute.id)
  expect(
    childHeadContext.matches[childHeadContext.match.index - 1],
  ).toMatchObject({
    routeId: result.parentRoute.id,
    meta: [{ title: 'Parent' }],
  })

  const childScriptsContext = result.childScripts.mock.calls[0]![0]
  expect(childScriptsContext.match.routeId).toBe(result.childRoute.id)
  expect(
    childScriptsContext.matches[childScriptsContext.match.index - 1],
  ).toMatchObject({
    routeId: result.parentRoute.id,
    scripts: [{ children: 'window.parent = true' }],
  })

  expect(
    result.router.state.matches.find(
      (match) => match.routeId === result.parentRoute.id,
    ),
  ).toMatchObject({
    meta: [{ title: 'Parent' }],
    scripts: [{ children: 'window.parent = true' }],
  })
  expect(
    result.router.state.matches.find(
      (match) => match.routeId === result.childRoute.id,
    ),
  ).toMatchObject({
    meta: [{ title: 'Parent | Child' }],
    scripts: [{ children: 'window.parent = true; window.child = true' }],
  })
}

describe('asset projection order', () => {
  test('client calls head and scripts sequentially from parent to child', async () => {
    const result = setup()

    await result.router.load()

    expectSequentialProjection(result)
  })

  test('server calls head and scripts sequentially from parent to child', async () => {
    const result = setup(true)

    const response = await loadServerResponse(result.router, '/parent/child')

    expect(response.status).toBe(200)
    expectSequentialProjection(result)
  })
})
