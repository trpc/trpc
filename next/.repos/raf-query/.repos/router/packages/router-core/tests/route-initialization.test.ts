import { afterEach, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { processRouteTree } from '../src/new-process-route-tree'
import type { AnyRoute } from '../src'

afterEach(() => vi.restoreAllMocks())

test('initializes routes parent-first before reading their IDs and paths', () => {
  const root = new BaseRootRoute({})
  const layout = new BaseRoute({
    getParentRoute: () => root,
    path: '/layout',
  })
  const child = new BaseRoute({
    getParentRoute: () => layout,
    path: '/$id',
  })
  const sibling = new BaseRoute({
    getParentRoute: () => root,
    path: '/sibling',
  })
  const routes = [root, layout, child, sibling]
  const calls = routes.map((route) => vi.spyOn(route, 'init'))
  const { routesById } = processRouteTree<AnyRoute>(
    root.addChildren([layout.addChildren([child]), sibling]),
  )
  for (const [originalIndex, init] of calls.entries()) {
    expect(init).toHaveBeenCalledExactlyOnceWith(originalIndex)
    expect(routes[originalIndex]!.originalIndex).toBe(originalIndex)
  }
  const order = calls.map((init) => init.mock.invocationCallOrder[0]!)
  expect(order).toEqual([...order].sort((a, b) => a - b))
  expect(root.id).toBe('__root__')
  expect(child.fullPath).toBe('/layout/$id')
  for (const route of routes) {
    expect(routesById[route.id]).toBe(route)
  }
})

test('normalizes nested route IDs without changing pathless layout paths', () => {
  const root = new BaseRootRoute({})
  const layout = new BaseRoute({
    getParentRoute: () => root,
    id: '//_layout//',
  })
  const item = new BaseRoute({
    getParentRoute: () => layout,
    path: '//items//$id//',
  })
  const { routesById } = processRouteTree<AnyRoute>(
    root.addChildren([layout.addChildren([item])]),
  )
  expect(root.id).toBe('__root__')
  expect(layout.id).toBe('/_layout/')
  expect(layout.fullPath).toBe('/')
  expect(item.id).toBe('/_layout/items/$id/')
  expect(item.fullPath).toBe('/items/$id/')
  expect(item.to).toBe('/items/$id')
  expect(routesById[item.id]).toBe(item)
})
