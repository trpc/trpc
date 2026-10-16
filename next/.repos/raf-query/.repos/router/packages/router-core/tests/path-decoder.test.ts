import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import * as pathUtils from '../src/path'
import { createTestRouter } from './routerTestUtils'

afterEach(() => vi.restoreAllMocks())

test.each([
  { allowed: ['.', '@'], input: 'x%40.y', expected: 'x@.y' },
  { allowed: ['*', '@'], input: 'pre%40*post', expected: 'pre@*post' },
  { allowed: ['(', ')', '@'], input: '(%40)', expected: '(@)' },
  { allowed: ['|', '@'], input: '%7C%40%2F', expected: '|@%2F' },
  { allowed: ['12@', '1'], input: '12%40', expected: '12@' },
  { allowed: ['%', '/'], input: '%252F/%2F', expected: '%2F//' },
  { allowed: ['@', '@', '+'], input: '%40%2B', expected: '@+' },
  { allowed: [], input: '%40', expected: '%40' },
])(
  'compiles literal decoder alternatives: $allowed',
  ({ allowed, input, expected }) => {
    expect(pathUtils.compileDecodeCharMap(allowed)(input)).toBe(expected)
  },
)

function setup(allowed?: Array<'@' | '+'>) {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({ getParentRoute: () => root, path: '/items/$id' })
  const router = createTestRouter({
    routeTree: root.addChildren([item]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    pathParamsAllowedCharacters: allowed,
    scrollRestoration: false,
  })
  router.history.destroy()
  const build = () =>
    router.buildLocation({ to: '/items/$id', params: { id: '@+' } }).href
  return { router, build }
}

test('keeps the decoder across provider option updates', () => {
  const allowed: Array<'@' | '+'> = ['@']
  const { router, build } = setup(allowed)
  const decoder = router.pathParamsDecoder
  expect(build()).toBe('/items/@%2B')
  const compile = vi.spyOn(pathUtils, 'compileDecodeCharMap')
  for (let count = 0; count < 3; count++) {
    router.update({
      ...router.options,
      context: { count },
    })
    expect(build()).toBe('/items/@%2B')
    expect(router.pathParamsDecoder).toBe(decoder)
  }
  expect(compile).not.toHaveBeenCalled()
})

test('requires a new router to apply changes to the original character array', () => {
  const allowed: Array<'@' | '+'> = ['@']
  const { router, build } = setup(allowed)
  const decoder = router.pathParamsDecoder
  expect(build()).toBe('/items/@%2B')
  allowed[0] = '+'
  router.update({ context: {} })
  expect(router.pathParamsDecoder).toBe(decoder)
  expect(build()).toBe('/items/@%2B')
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: 'new@+' } }).href,
  ).toBe('/items/new@%2B')
  expect(setup(allowed).build()).toBe('/items/%40+')
})

test('does not change encoding through unsupported option updates', () => {
  const { router, build } = setup(['@'])
  const compile = vi.spyOn(pathUtils, 'compileDecodeCharMap')
  expect(build()).toBe('/items/@%2B')
  // @ts-expect-error Path encoding can only be configured at construction.
  router.update({ pathParamsAllowedCharacters: undefined })
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: 'new@+' } }).href,
  ).toBe('/items/new@%2B')
  expect(compile).not.toHaveBeenCalled()
})

test('does not create a decoder for empty or omitted allowed characters', () => {
  const compile = vi.spyOn(pathUtils, 'compileDecodeCharMap')
  for (const allowed of [undefined, []]) {
    const { router, build } = setup(allowed)
    expect(router.pathParamsDecoder).toBeUndefined()
    expect(build()).toBe('/items/%40%2B')
  }
  expect(compile).not.toHaveBeenCalled()
})
