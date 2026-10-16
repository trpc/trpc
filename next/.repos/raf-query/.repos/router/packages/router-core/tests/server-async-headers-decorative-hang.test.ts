import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

test('a rejected projection hook is logged without failing the response', async () => {
  const projectionError = new Error('scripts failed')
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const headGate = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  const headersGate = createControlledPromise<Record<string, string>>()
  const head = vi.fn(() => headGate)
  const scripts = vi.fn(async () => {
    throw projectionError
  })
  const headers = vi.fn(() => headersGate)

  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    head,
    scripts,
    headers,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    isServer: true,
  })

  const response = await loadServerResponse(router, '/target')

  expect(headGate.status).toBe('pending')
  expect(headersGate.status).toBe('pending')
  expect(response.status).toBe(200)
  expect(response.headers.get('x-response-header')).toBeNull()
  expect(head).toHaveBeenCalledTimes(1)
  expect(scripts).toHaveBeenCalledTimes(1)
  expect(headers).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith(projectionError)

  headGate.resolve({ meta: [{ title: 'discarded' }] })
  headersGate.resolve({ 'x-response-header': 'discarded' })
  await Promise.all([headGate, headersGate])
})
