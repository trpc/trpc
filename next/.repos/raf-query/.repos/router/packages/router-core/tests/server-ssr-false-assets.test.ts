import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * The first `ssr: false` route contributes the assets needed for its server
 * shell. Descendants inherit the client-only restriction and do not execute
 * their route asset callbacks, even if they request `ssr: true` themselves.
 */
describe('server assets for ssr:false routes', () => {
  test('executes assets at the client-only boundary but not below it', async () => {
    const rootHead = vi.fn(() => ({ meta: [{ title: 'server root' }] }))
    const rootScripts = vi.fn(() => [
      {
        children: 'window.rootAssetRan = true',
      },
    ])
    const rootHeaders = vi.fn(() => ({
      'x-server-root': 'projected',
    }))
    const parentHead = vi.fn(() => ({
      meta: [{ title: 'client-only parent' }],
    }))
    const parentScripts = vi.fn(() => [
      {
        children: 'window.parentAssetRan = true',
      },
    ])
    const parentHeaders = vi.fn(() => ({
      'x-client-only-parent': 'projected',
    }))
    const parentBeforeLoad = vi.fn(() => ({}))
    const parentLoader = vi.fn(() => 'unexpected')
    const childHead = vi.fn(() => ({
      meta: [{ title: 'client-only child' }],
    }))
    const childScripts = vi.fn(() => [
      {
        children: 'window.childAssetRan = true',
      },
    ])
    const childHeaders = vi.fn(() => ({
      'x-client-only-child': 'unexpected',
    }))

    const rootRoute = new BaseRootRoute({
      head: rootHead,
      scripts: rootScripts,
      headers: rootHeaders,
    })
    const clientOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      beforeLoad: parentBeforeLoad,
      loader: parentLoader,
      head: parentHead,
      scripts: parentScripts,
      headers: parentHeaders,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => clientOnlyRoute,
      path: '/child',
      // A child cannot relax its parent's client-only restriction.
      ssr: true,
      head: childHead,
      scripts: childScripts,
      headers: childHeaders,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        clientOnlyRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/client-only/child'],
      }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/client-only/child')

    expect(response.status).toBe(200)
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(rootScripts).toHaveBeenCalledTimes(1)
    expect(rootHeaders).toHaveBeenCalledTimes(1)
    expect(response.headers.get('x-server-root')).toBe('projected')
    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(parentScripts).toHaveBeenCalledTimes(1)
    expect(parentHeaders).toHaveBeenCalledTimes(1)
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(parentLoader).not.toHaveBeenCalled()
    expect(response.headers.get('x-client-only-parent')).toBe('projected')
    expect(
      router.state.matches.find(
        (match) => match.routeId === clientOnlyRoute.id,
      ),
    ).toMatchObject({
      meta: [{ title: 'client-only parent' }],
      scripts: [{ children: 'window.parentAssetRan = true' }],
      headers: { 'x-client-only-parent': 'projected' },
    })
    expect(childHead).not.toHaveBeenCalled()
    expect(childScripts).not.toHaveBeenCalled()
    expect(childHeaders).not.toHaveBeenCalled()
    expect(response.headers.get('x-client-only-child')).toBeNull()
  })

  test('executes assets when the root route is client-only', async () => {
    const rootHead = vi.fn(() => ({ meta: [{ title: 'root shell' }] }))
    const rootScripts = vi.fn(() => [
      { children: 'window.rootShellRan = true' },
    ])
    const rootHeaders = vi.fn(() => ({ 'x-root-shell': 'projected' }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'child' }] }))
    const childScripts = vi.fn(() => [{ children: 'window.childRan = true' }])
    const childHeaders = vi.fn(() => ({ 'x-child': 'unexpected' }))
    const rootRoute = new BaseRootRoute({
      ssr: false,
      head: rootHead,
      scripts: rootScripts,
      headers: rootHeaders,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      ssr: true,
      head: childHead,
      scripts: childScripts,
      headers: childHeaders,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/child')

    expect(response.status).toBe(200)
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(rootScripts).toHaveBeenCalledTimes(1)
    expect(rootHeaders).toHaveBeenCalledTimes(1)
    expect(response.headers.get('x-root-shell')).toBe('projected')
    expect(childHead).not.toHaveBeenCalled()
    expect(childScripts).not.toHaveBeenCalled()
    expect(childHeaders).not.toHaveBeenCalled()
    expect(response.headers.get('x-child')).toBeNull()
  })

  test('projects assets for a data-only branch', async () => {
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: `report: ${loaderData}` }],
    }))
    const scripts = vi.fn(({ loaderData }) => [
      { children: `window.report = ${JSON.stringify(loaderData)}` },
    ])
    const headers = vi.fn(({ loaderData }) => ({
      'x-report': String(loaderData),
    }))
    const rootRoute = new BaseRootRoute({})
    const reportRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/report',
      ssr: 'data-only',
      loader: () => 'server data',
      head,
      scripts,
      headers,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([reportRoute]),
      history: createMemoryHistory({ initialEntries: ['/report'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/report')
    const match = router.state.matches.at(-1)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-report')).toBe('server data')
    expect(match).toMatchObject({
      ssr: 'data-only',
      meta: [{ title: 'report: server data' }],
      scripts: [{ children: 'window.report = "server data"' }],
      headers: { 'x-report': 'server data' },
    })
    expect(head).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(headers).toHaveBeenCalledTimes(1)
  })
})
