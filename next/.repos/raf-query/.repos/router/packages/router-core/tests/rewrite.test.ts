import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, composeRewrites } from '../src'
import {
  executeRewriteInput,
  executeRewriteOutput,
  rewriteBasepath,
} from '../src/rewrite'
import { createTestRouter } from './routerTestUtils'
import type { LocationRewrite } from '../src'

describe('rewrite helpers', () => {
  test('basepath rewrite strips input and restores output', () => {
    const rewrite = rewriteBasepath('/app/')
    const inputUrl = new URL('https://example.com/app/posts')

    expect(executeRewriteInput(rewrite, inputUrl).pathname).toBe('/posts')

    const outputUrl = new URL('https://example.com/posts')
    expect(executeRewriteOutput(rewrite, outputUrl).pathname).toBe('/app/posts')
  })

  test('basepath rewrite handles root output', () => {
    const rewrite = rewriteBasepath('/app')
    const url = new URL('https://example.com/')

    expect(executeRewriteOutput(rewrite, url).pathname).toBe('/app/')
  })

  test('case-insensitive basepath input preserves original suffix casing', () => {
    const rewrite = rewriteBasepath('/App')
    const url = new URL('https://example.com/app/Users')

    expect(executeRewriteInput(rewrite, url).pathname).toBe('/Users')
  })

  test('case-sensitive basepath input only strips an exact-case basepath', () => {
    const rewrite = rewriteBasepath('/App', true)

    expect(
      executeRewriteInput(rewrite, new URL('https://example.com/app/users'))
        .pathname,
    ).toBe('/app/users')
    expect(
      executeRewriteInput(rewrite, new URL('https://example.com/App/users'))
        .pathname,
    ).toBe('/users')
  })

  test('basepath rewrite output collapses repeated slashes', () => {
    const rewrite = rewriteBasepath('/app')
    const url = new URL('https://example.com/')
    url.pathname = '/posts//1'

    expect(executeRewriteOutput(rewrite, url).pathname).toBe('/app/posts/1')
  })

  test('composeRewrites applies input forward and output backward', () => {
    const calls: Array<string> = []
    const first: LocationRewrite = {
      input: ({ url }) => {
        calls.push('first-in')
        url.pathname += 'a'
        return url
      },
      output: ({ url }) => {
        calls.push('first-out')
        url.pathname += 'd'
        return url
      },
    }
    const second: LocationRewrite = {
      input: ({ url }) => {
        calls.push('second-in')
        url.pathname += 'b'
        return url
      },
      output: ({ url }) => {
        calls.push('second-out')
        url.pathname += 'c'
        return url
      },
    }

    const rewrite = composeRewrites([first, second])

    expect(
      executeRewriteInput(rewrite, new URL('https://example.com/')).pathname,
    ).toBe('/ab')
    expect(
      executeRewriteOutput(rewrite, new URL('https://example.com/')).pathname,
    ).toBe('/cd')
    expect(calls).toEqual(['first-in', 'second-in', 'second-out', 'first-out'])
  })

  test('composeRewrites supports arbitrary chains and mixed return types', () => {
    const rewrite = composeRewrites([
      {
        input: ({ url }): undefined => {
          url.pathname += 'a'
        },
        output: ({ url }): undefined => {
          url.pathname += 'd'
        },
      },
      {},
      {
        input: ({ url }) => `${url.href}b`,
        output: ({ url }) => `${url.href}c`,
      },
      {
        input: ({ url }) => new URL(`${url.href}c`),
        output: ({ url }) => new URL(`${url.href}b`),
      },
      {
        output: ({ url }): undefined => {
          url.pathname += 'a'
        },
      },
    ])

    expect(
      executeRewriteInput(rewrite, new URL('https://example.com/')).pathname,
    ).toBe('/abc')
    expect(
      executeRewriteOutput(rewrite, new URL('https://example.com/')).pathname,
    ).toBe('/abcd')
  })

  test('composeRewrites accepts an empty chain', () => {
    const rewrite = composeRewrites([])
    const url = new URL('https://example.com/posts')

    expect(executeRewriteInput(rewrite, url)).toBe(url)
    expect(executeRewriteOutput(rewrite, url)).toBe(url)
  })
})

describe('router rewrites', () => {
  test.each([undefined, '/', '', '///'])(
    'keeps the direct rewrite path for basepath %s',
    (basepath) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute({}),
        history: createMemoryHistory({ initialEntries: ['/public'] }),
        basepath,
      })

      expect(router.rewrite).toBeUndefined()
      expect(router.latestLocation.pathname).toBe('/public')
      expect(router.buildLocation({ to: '/public' }).publicHref).toBe('/public')

      const rewrite: LocationRewrite = { input: ({ url }) => url }
      router.update({ rewrite })
      expect(router.rewrite).toBe(rewrite)
      expect(router.state.location.pathname).toBe('/public')
    },
  )

  test.each([
    [undefined, '/app/Users', '/Users'],
    [false, '/app/Users', '/Users'],
    [true, '/app/Users', '/app/Users'],
    [true, '/App/Users', '/Users'],
  ] as const)(
    'initializes basepath with caseSensitive %s at %s',
    (caseSensitive, pathname, expected) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute({}),
        history: createMemoryHistory({ initialEntries: [pathname] }),
        basepath: '/App',
        caseSensitive,
      })

      expect(router.latestLocation.pathname).toBe(expected)
      expect(router.state.location.pathname).toBe(expected)
    },
  )

  test.each([false, true])(
    'updates basepath case sensitivity and stored location (custom rewrite: %s)',
    (customRewrite) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute({}),
        history: createMemoryHistory({ initialEntries: ['/app/Users'] }),
        basepath: '/App',
        rewrite: customRewrite ? { input: ({ url }) => url } : undefined,
      })

      expect(router.state.location.pathname).toBe('/Users')

      router.update({ caseSensitive: true })
      expect(router.latestLocation.pathname).toBe('/app/Users')
      expect(router.state.location.pathname).toBe('/app/Users')

      router.update({ caseSensitive: false })
      expect(router.latestLocation.pathname).toBe('/Users')
      expect(router.state.location.pathname).toBe('/Users')
      expect(router.buildLocation({ to: '/Users' }).publicHref).toBe(
        '/App/Users',
      )
    },
  )

  test.each(['mutation', 'URL', 'string'] as const)(
    'composes basepath around custom rewrites returning %s',
    (returnType) => {
      const calls: Array<string> = []
      const rewrite = (url: URL, direction: 'input' | 'output') => {
        calls.push(`${direction}:${url.pathname}`)
        const result = returnType === 'mutation' ? url : new URL(url)
        result.pathname = direction === 'input' ? '/internal' : '/public'
        if (returnType === 'URL') {
          return result
        }
        if (returnType === 'string') {
          return result.href
        }
        return
      }
      const router = createTestRouter({
        routeTree: new BaseRootRoute({}),
        history: createMemoryHistory({ initialEntries: ['/app/public'] }),
        basepath: '/app',
        rewrite: {
          input: ({ url }) => rewrite(url, 'input'),
          output: ({ url }) => rewrite(url, 'output'),
        },
      })

      expect(router.latestLocation.pathname).toBe('/internal')
      expect(calls).toEqual(['input:/public'])
      expect(router.buildLocation({ to: '/internal' }).publicHref).toBe(
        '/app/public',
      )
      expect(calls).toEqual(['input:/public', 'output:/internal'])
    },
  )

  test('rebuilds rewrites and stored locations when basepath or custom rewrite changes', () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute({}),
      history: createMemoryHistory({ initialEntries: ['/app/public'] }),
      basepath: '/app',
      rewrite: {
        input: ({ url }): undefined => {
          url.pathname = url.pathname.replace('/public', '/internal')
        },
        output: ({ url }): undefined => {
          url.pathname = url.pathname.replace('/internal', '/public')
        },
      },
    })
    const checkLocations = (pathname: string, outputHref: string) => {
      expect(router.latestLocation).toMatchObject({
        pathname,
        publicHref: '/app/public',
      })
      expect(router.state.location).toMatchObject({
        pathname,
        publicHref: '/app/public',
      })
      expect(router.buildLocation({ to: '/internal' }).publicHref).toBe(
        outputHref,
      )
    }

    checkLocations('/internal', '/app/public')
    router.update({ basepath: '/other' })
    checkLocations('/app/internal', '/other/public')

    router.update({
      rewrite: {
        input: ({ url }) => new URL('/replacement', url),
        output: ({ url }) => new URL('/updated', url),
      },
    })
    checkLocations('/replacement', '/other/updated')

    router.update({ rewrite: undefined })
    checkLocations('/app/public', '/other/internal')

    router.update({ basepath: '/' })
    checkLocations('/app/public', '/internal')
    expect(router.rewrite).toBeUndefined()
  })

  test.each(['URL', 'string'] as const)(
    'preserves query, hash, and external origin from a custom %s output',
    (returnType) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute({}),
        history: createMemoryHistory({ initialEntries: ['/app/internal'] }),
        origin: 'https://example.com',
        basepath: '/app',
        rewrite: {
          output: ({ url }) => {
            const rewritten = new URL(url)
            rewritten.hostname = 'external.example'
            rewritten.pathname = '/public'
            return returnType === 'URL' ? rewritten : rewritten.href
          },
        },
      })

      expect(
        router.buildLocation({
          to: '/internal',
          search: { sort: 'name' },
          hash: 'section',
        }),
      ).toMatchObject({
        publicHref: 'https://external.example/app/public?sort=name#section',
        external: true,
        search: { sort: 'name' },
        hash: 'section',
      })
    },
  )

  test.each(['input', 'output'] as const)(
    'composes basepath with a custom rewrite providing only %s',
    (direction) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute({}),
        history: createMemoryHistory({ initialEntries: ['/app/original'] }),
        basepath: '/app',
        rewrite: {
          [direction]: ({ url }: { url: URL }): undefined => {
            url.pathname = '/rewritten'
          },
        },
      })

      expect(router.latestLocation.pathname).toBe(
        direction === 'input' ? '/rewritten' : '/original',
      )
      expect(router.buildLocation({ to: '/original' }).publicHref).toBe(
        direction === 'output' ? '/app/rewritten' : '/app/original',
      )
    },
  )

  test('reads custom handlers added, replaced, or removed after composition', () => {
    const rewrite: LocationRewrite = {}
    const router = createTestRouter({
      routeTree: new BaseRootRoute({}),
      history: createMemoryHistory({ initialEntries: ['/app/public'] }),
      basepath: '/app',
      rewrite,
    })
    const parse = () => router.parseLocation(router.history.location).pathname

    expect(parse()).toBe('/public')
    rewrite.input = ({ url }): undefined => {
      url.pathname = '/internal'
    }
    rewrite.output = ({ url }): undefined => {
      url.pathname = '/public'
    }
    expect(parse()).toBe('/internal')
    expect(router.buildLocation({ to: '/internal' }).publicHref).toBe(
      '/app/public',
    )

    rewrite.input = ({ url }) => new URL('/replaced', url)
    expect(parse()).toBe('/replaced')

    delete rewrite.input
    delete rewrite.output
    expect(parse()).toBe('/public')
    expect(router.buildLocation({ to: '/internal' }).publicHref).toBe(
      '/app/internal',
    )
  })

  test('composes a nested public rewrite chain inside the basepath', () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute({}),
      history: createMemoryHistory({ initialEntries: ['/app/public'] }),
      basepath: '/app',
      rewrite: composeRewrites([
        {
          input: ({ url }): undefined => {
            url.pathname = url.pathname.replace('/public', '/intermediate')
          },
          output: ({ url }): undefined => {
            url.pathname = url.pathname.replace('/intermediate', '/public')
          },
        },
        {
          input: ({ url }) => url.href.replace('/intermediate', '/internal'),
          output: ({ url }) =>
            new URL(url.href.replace('/internal', '/intermediate')),
        },
      ]),
    })

    expect(router.latestLocation.pathname).toBe('/internal')
    expect(router.buildLocation({ to: '/internal' }).publicHref).toBe(
      '/app/public',
    )
  })
})
