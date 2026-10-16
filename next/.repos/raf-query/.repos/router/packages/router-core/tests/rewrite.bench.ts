import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute } from '../src'
import {
  composeRewrites,
  executeRewriteInput,
  executeRewriteOutput,
  rewriteBasepath,
} from '../src/rewrite'
import { createTestRouter } from './routerTestUtils'
import type { LocationRewrite } from '../src'

describe.each([
  'basepath only',
  'missing handlers',
  'input only',
  'output only',
  'noop',
  'mutation',
  'URL',
  'string',
  'nested composer',
] as const)('basepath composition (%s)', (returnType) => {
  const unchanged = [
    'basepath only',
    'missing handlers',
    'input only',
    'output only',
    'noop',
  ].includes(returnType)
  const transform = (url: URL, input: boolean) => {
    if (unchanged) {
      return
    }
    const result =
      returnType === 'mutation' || returnType === 'nested composer'
        ? url
        : new URL(url)
    result.pathname = input ? '/internal' : '/public'
    if (returnType === 'URL') {
      return result
    }
    if (returnType === 'string') {
      return result.href
    }
    return
  }
  let custom: LocationRewrite | undefined = {
    input: ({ url }) => transform(url, true),
    output: ({ url }) => transform(url, false),
  }
  if (returnType === 'basepath only') {
    custom = undefined
  } else if (returnType === 'missing handlers') {
    custom = {}
  } else if (returnType === 'input only') {
    delete custom.output
  } else if (returnType === 'output only') {
    delete custom.input
  } else if (returnType === 'nested composer') {
    custom = composeRewrites([
      custom,
      {},
      { input: ({ url }) => url, output: ({ url }) => url },
    ])
  }
  const history = createMemoryHistory({ initialEntries: ['/app/public'] })
  const router = createTestRouter({
    routeTree: new BaseRootRoute({}),
    history,
    basepath: '/app',
    rewrite: custom,
    scrollRestoration: false,
  })
  history.destroy()

  for (const [name, rewrite] of [
    [
      custom ? 'public composer' : 'standalone basepath',
      custom
        ? composeRewrites([rewriteBasepath('/app'), custom])
        : rewriteBasepath('/app'),
    ],
    ['router composition', router.rewrite],
  ] as const) {
    let url = new URL('https://example.com/app/public?sort=name#title')
    url = executeRewriteInput(rewrite, url)
    expect(url.pathname).toBe(unchanged ? '/public' : '/internal')
    url = executeRewriteOutput(rewrite, url)
    expect(url.href).toBe('https://example.com/app/public?sort=name#title')

    bench(
      `${name} round trip`,
      () => {
        // Reuse the round-trip URL so URL construction does not hide the
        // composition cost for callbacks that mutate or leave it unchanged.
        for (let index = 0; index < 64; index++) {
          url = executeRewriteOutput(rewrite, executeRewriteInput(rewrite, url))
        }
      },
      {
        time: 1000,
        warmupTime: 200,
        throws: true,
        teardown: () => {
          expect(url.href).toBe(
            'https://example.com/app/public?sort=name#title',
          )
        },
      },
    )
  }

  let trailingSlash = false
  bench(
    'router update rebuilding the rewrite',
    () => {
      if (custom) {
        router.update({ rewrite: { ...custom } })
      } else {
        trailingSlash = !trailingSlash
        router.update({ basepath: trailingSlash ? '/app/' : '/app' })
      }
    },
    {
      time: 1000,
      warmupTime: 200,
      throws: true,
      teardown: () => {
        expect(router.latestLocation.pathname).toBe(
          unchanged ? '/public' : '/internal',
        )
      },
    },
  )
})

describe.each(['/', '/app'])('unchanged rewrite options (%s)', (basepath) => {
  const history = createMemoryHistory({
    initialEntries: [basepath === '/' ? '/public' : '/app/public'],
  })
  const router = createTestRouter({
    routeTree: new BaseRootRoute({}),
    history,
    basepath,
    rewrite: { input: ({ url }) => url },
    scrollRestoration: false,
  })
  history.destroy()
  const rewrite = router.rewrite
  router.update({})
  expect(router.rewrite).toBe(rewrite)
  expect(router.latestLocation.pathname).toBe('/public')

  bench(
    'router update without rebuilding the rewrite',
    () => router.update({}),
    {
      time: 1000,
      warmupTime: 200,
      throws: true,
      teardown: () => {
        expect(router.rewrite).toBe(rewrite)
        expect(router.latestLocation.pathname).toBe('/public')
      },
    },
  )
})
