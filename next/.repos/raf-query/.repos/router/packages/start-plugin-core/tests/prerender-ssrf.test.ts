import { promises as fsp } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<any>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  }
})

function makeStartConfig(pagePath: string) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
    },
    pages: [{ path: pagePath }],
    router: { basepath: '' },
    spa: {
      enabled: false,
      prerender: {
        outputPath: '/_shell',
        crawlLinks: false,
        retryCount: 0,
        enabled: true,
      },
    },
  } as any
}

function htmlResponse() {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

describe('prerender public sinks', () => {
  it('allows relative paths', async () => {
    const request = vi.fn(async () => htmlResponse())
    await expect(
      prerender({
        startConfig: makeStartConfig('/about'),
        handler: { getClientOutputDirectory: () => '/client', request },
      }),
    ).resolves.not.toThrow()
  })

  it.each([
    'https://attacker.test/leak',
    '//attacker.test/leak',
    '/%2fattacker.test/leak',
    '/%5cattacker.test/leak',
  ])('rejects page target %j before requesting it', async (pagePath) => {
    const request = vi.fn(async () => htmlResponse())

    await expect(
      prerender({
        startConfig: makeStartConfig(pagePath),
        handler: { getClientOutputDirectory: () => '/client', request },
      }),
    ).rejects.toThrow(/prerender page path must be relative/i)
    expect(request).not.toHaveBeenCalled()
  })

  it('requests relative pages without automatic redirect following', async () => {
    const request = vi.fn(async () => htmlResponse())

    await prerender({
      startConfig: makeStartConfig('/about'),
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(request).toHaveBeenCalledWith(
      '/about/',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it.each([
    { outputPath: '../escape', expected: undefined },
    { outputPath: '../client-leak', expected: undefined },
    { outputPath: 'nested', expected: '/client/nested/index.html' },
  ])(
    'keeps output $outputPath inside the client directory',
    async ({ outputPath, expected }) => {
      vi.mocked(fsp.writeFile).mockClear()
      vi.mocked(fsp.mkdir).mockClear()
      const startConfig = makeStartConfig('/about')
      startConfig.prerender.failOnError = false
      startConfig.pages[0].prerender = { outputPath }
      const request = vi.fn(async () => htmlResponse())

      await prerender({
        startConfig,
        handler: {
          getClientOutputDirectory: () => '/client',
          request,
        },
      })

      expect(request).toHaveBeenCalledOnce()
      if (expected) {
        expect(fsp.writeFile).toHaveBeenCalledExactlyOnceWith(
          expected,
          '<html></html>',
        )
      } else {
        expect(fsp.writeFile).not.toHaveBeenCalled()
        expect(fsp.mkdir).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    'https://attacker.test/leak',
    '//attacker.test/leak',
    '/\\attacker.test/leak',
  ])('does not request raw redirect target %j', async (location) => {
    const request = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location },
        }),
    )
    const startConfig = makeStartConfig('/about')
    startConfig.prerender.failOnError = false

    await prerender({
      startConfig,
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps a canonical double-slash redirect on the preview origin', async () => {
    const requestedUrls: Array<string> = []
    const request = vi.fn(async (requestPath: string) => {
      requestedUrls.push(new URL(requestPath, 'http://localhost').href)
      if (requestedUrls.length === 1) {
        return new Response(null, {
          status: 307,
          headers: {
            location: 'http://localhost/a/..//attacker.test/leak',
          },
        })
      }
      return htmlResponse()
    })

    await prerender({
      startConfig: makeStartConfig('/about'),
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(requestedUrls).toEqual([
      'http://localhost/about/',
      'http://localhost//attacker.test/leak',
    ])
  })

  it.each(['/outside', '/application', '/app-private', '/app/../outside'])(
    'does not request a redirect outside the router basepath: %s',
    async (location) => {
      const request = vi.fn(
        async () =>
          new Response(null, {
            status: 307,
            headers: { location },
          }),
      )
      const startConfig = makeStartConfig('/page')
      startConfig.router.basepath = '/app'
      startConfig.prerender.failOnError = false

      await prerender({
        startConfig,
        handler: { getClientOutputDirectory: () => '/client', request },
      })

      expect(request).toHaveBeenCalledOnce()
      expect(request).toHaveBeenCalledWith(
        '/app/page/',
        expect.objectContaining({ redirect: 'manual' }),
      )
    },
  )

  it('follows a raw redirect on the preview origin and basepath', async () => {
    const request = vi.fn(async (requestPath: string) => {
      if (requestPath === '/app/page/') {
        return new Response(null, {
          status: 307,
          headers: { location: 'http://127.0.0.1:4173/app/next/' },
        })
      }
      return htmlResponse()
    })
    const startConfig = makeStartConfig('/page')
    startConfig.router.basepath = '/app'

    await prerender({
      startConfig,
      handler: {
        getClientOutputDirectory: () => '/client',
        getOrigin: () => 'http://127.0.0.1:4173',
        request,
      },
    })

    expect(request.mock.calls.map(([requestPath]) => requestPath)).toEqual([
      '/app/page/',
      '/app/next/',
    ])
  })

  it('skips requests when the public prerender filter excludes every page', async () => {
    const request = vi.fn(async () => htmlResponse())
    const startConfig = makeStartConfig('/about')
    startConfig.prerender.filter = () => false

    await prerender({
      startConfig,
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(request).not.toHaveBeenCalled()
  })
})
