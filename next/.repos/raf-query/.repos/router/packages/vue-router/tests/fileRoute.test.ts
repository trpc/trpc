/* eslint-disable */
import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  getRouteApi,
  createFileRoute,
  createLazyRoute,
  createLazyFileRoute,
  LazyRoute,
  FileRoute,
} from '../src'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createFileRoute', () => {
  it('creates a non-root route without a deprecation warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // @ts-expect-error
    const route = createFileRoute('')({})

    expect(route.isRoot).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps the deprecation warning for direct FileRoute usage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // @ts-expect-error
    const route = new FileRoute('').createRoute({})

    expect(route.isRoot).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('createFileRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  // @ts-expect-error
  const route = createFileRoute('')({})

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})

describe('createLazyFileRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))
  // @ts-expect-error
  const route = createLazyFileRoute('')({})

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})

describe('createLazyRoute has the same hooks as getRouteApi', () => {
  const routeApi = getRouteApi('foo')
  const route = createLazyRoute({})({})
  const hookNames = Object.keys(routeApi).filter((key) => key.startsWith('use'))

  it.each(hookNames.map((name) => [name]))(
    'should have the "%s" hook defined',
    (hookName) => {
      expect(route[hookName as keyof LazyRoute<any>]).toBeDefined()
    },
  )
})
