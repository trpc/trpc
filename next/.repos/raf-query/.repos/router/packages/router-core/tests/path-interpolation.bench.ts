import { bench, describe, expect } from 'vitest'
import {
  createMemoryHistory,
  normalizeProtocolRelative,
} from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { compileDecodeCharMap, interpolatePath } from '../src/path'
import { parseSegments } from '../src/new-process-route-tree'
import { decodePath } from '../src/utils'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'
import type { PathInterpolationTestOptions } from './routerTestUtils'

const scenarios: Array<{
  name: string
  inputs: Array<PathInterpolationTestOptions>
  register?: boolean
}> = [
  {
    name: 'single-param shared hits',
    inputs: Array.from({ length: 200 }, (_, index) => ({
      path: '/items/$id',
      params: { id: `item ${Math.floor(index / 5)}`, unrelated: index },
    })),
  },
  {
    name: 'multi-param shared hits',
    inputs: Array.from({ length: 200 }, (_, index) => ({
      path: '/orgs/$orgId/items/$id',
      params: {
        orgId: `org:${Math.floor(index / 5) % 4}`,
        id: `item/${Math.floor(index / 5)}`,
      },
    })),
  },
  {
    name: 'result eviction',
    inputs: Array.from({ length: 256 }, (_, index) => ({
      path: '/items/$id',
      params: { id: `item ${index}` },
    })),
  },
  {
    name: '64-template working set',
    inputs: Array.from({ length: 64 }, (_, index) => ({
      path: `/section-${index}/$id`,
      params: { id: 'item one' },
    })),
  },
  {
    name: '256-template working set',
    inputs: Array.from({ length: 256 }, (_, index) => ({
      path: `/section-${index}/$id`,
      params: { id: 'item one' },
    })),
  },
  {
    name: 'unregistered template eviction',
    register: false,
    inputs: Array.from({ length: 64 }, (_, index) => ({
      path: `/section-${index}/$id`,
      params: { id: 'item one' },
    })),
  },
  {
    name: 'mixed optional and splat params',
    inputs: Array.from({ length: 200 }, (_, index) => {
      switch (index % 5) {
        case 0:
          return { path: '/posts/{-$category}', params: {} }
        case 1:
          return {
            path: '/posts/{-$category}',
            params: { category: `news-${index % 10}` },
          }
        case 2:
          return { path: '/users/$id', params: { id: index } }
        case 3:
          return { path: '/files/$', params: { _splat: `docs/${index % 20}` } }
        default:
          return { path: '/about', params: {} }
      }
    }),
  },
  {
    name: 'missing required and splat params',
    inputs: Array.from({ length: 200 }, (_, index) => {
      switch (index % 5) {
        case 0:
          return { path: '/$first/$second', params: { second: 'two' } }
        case 1:
          return {
            path: '/$first/$second',
            params: { first: undefined, second: 'two' },
          }
        case 2:
          return { path: '/$first/{-$second}', params: {} }
        case 3:
          return { path: '/files/$', params: {} }
        default:
          return { path: '/files/prefix{$}suffix', params: { _splat: '' } }
      }
    }),
  },
  {
    name: 'affixed mixed segments',
    inputs: Array.from({ length: 200 }, (_, index) => ({
      path: '/root/prefix{$id}suffix/{-$language}/files/{$}.txt',
      params: {
        id: `item ${index % 40}`,
        language: index % 2 ? 'en' : undefined,
        _splat: index % 3 ? `docs/file ${index % 20}` : '',
      },
    })),
  },
]

const decoder = compileDecodeCharMap(['@', '+'])
for (const { inputs } of scenarios) {
  for (const input of inputs) {
    input.decoder = decoder
    input.server = false
  }
}
scenarios.push(
  ...scenarios.map(({ name, inputs, register }) => ({
    name: `server ${name}`,
    inputs: inputs.map((input) => ({ ...input, server: true })),
    register,
  })),
)

describe.each(scenarios)('$name', ({ inputs, register = true }) => {
  const root = new BaseRootRoute({})
  const routes = new Map(
    [...new Set(inputs.map((input) => input.path))].map((path) => [
      path,
      new BaseRoute({ getParentRoute: () => root, path }),
    ]),
  )
  const router = createTestRouter({
    routeTree: register ? root.addChildren([...routes.values()]) : root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: inputs[0]?.server,
    pathParamsAllowedCharacters: ['@', '+'],
    scrollRestoration: false,
  })
  router.history.destroy()
  // Reference values come from a fresh standalone parse, independent of any
  // route-owned segments under test.
  const referencePathname = (input: PathInterpolationTestOptions) =>
    interpolatePath(
      input.path,
      parseSegments(false, { fullPath: input.path }, 0),
      input.params,
      input.decoder,
    )
  // Mirrors how buildLocation turns a template into a canonical pathname.
  const canonicalPathname = (
    path: string,
    params: Record<string, unknown>,
    route: AnyRoute | undefined,
  ) =>
    normalizeProtocolRelative(
      decodePath(
        interpolatePath(
          path,
          route?._interpolation ?? parseSegments(false, { fullPath: path }, 0),
          params,
          router.pathParamsDecoder,
        ),
      ),
    )
  const calls = inputs
    .filter((input) => input.path.includes('$'))
    .map((input) => ({
      path: input.path,
      params: input.params,
      route: register ? routes.get(input.path) : undefined,
      expected: decodePath(referencePathname(input)),
    }))
  let checksum = 0
  const expected = inputs.reduce(
    (sum, input) => sum + referencePathname(input).length,
    0,
  )
  const cachedExpected = calls.reduce((sum, call) => {
    expect(canonicalPathname(call.path, call.params, call.route)).toBe(
      call.expected,
    )
    return sum + call.expected.length
  }, 0)
  for (const call of calls) {
    expect(canonicalPathname(call.path, call.params, call.route)).toBe(
      call.expected,
    )
  }

  const preparedInputs = inputs.map((input) => ({
    ...input,
    segments: register
      ? routes.get(input.path)?._interpolation
      : parseSegments(false, { fullPath: input.path }, 0),
  }))

  bench(
    'interpolation and normalization batch',
    () => {
      let length = 0
      for (const call of calls) {
        length += canonicalPathname(call.path, call.params, call.route).length
      }
      checksum = length
    },
    {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(cachedExpected)
      },
    },
  )

  bench(
    'prepared pathname interpolation batch',
    () => {
      let length = 0
      for (const input of preparedInputs) {
        length += (
          input.segments
            ? interpolatePath(
                input.path,
                input.segments,
                input.params,
                input.decoder,
              )
            : input.path
        ).length
      }
      checksum = length
    },
    {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(expected)
      },
    },
  )

  bench(
    'prepared metadata interpolation batch',
    () => {
      let length = 0
      for (const input of preparedInputs) {
        length += (
          input.segments
            ? interpolatePath(
                input.path,
                input.segments,
                input.params,
                input.decoder,
                Object.create(null),
              )
            : input.path
        ).length
      }
      checksum = length
    },
    {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(expected)
      },
    },
  )
})
