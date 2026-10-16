import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prerenderWithVite } from '../src/vite/prerender'

const preview = vi.hoisted(() => vi.fn())

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})
vi.mock('vite', () => ({ preview }))

const originalPrerendering = process.env.TSS_PRERENDERING
const originalClientOutputDir = process.env.TSS_CLIENT_OUTPUT_DIR

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function makeStartConfig() {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      failOnError: false,
    },
    pages: [{ path: '/about' }],
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

describe('Vite prerender network sink', () => {
  beforeEach(() => {
    preview.mockReset().mockResolvedValue({
      resolvedUrls: { local: ['http://127.0.0.1:4173/'] },
      close: vi.fn(),
    })
  })

  afterEach(() => {
    restoreEnv('TSS_PRERENDERING', originalPrerendering)
    restoreEnv('TSS_CLIENT_OUTPUT_DIR', originalClientOutputDir)
    vi.unstubAllGlobals()
  })

  it('does not fetch a raw redirect outside the preview origin', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, {
          status: 307,
          headers: { location: 'https://attacker.test/leak' },
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const builder = {
      environments: {
        ssr: { config: { configFile: '/vite.config.ts' } },
        client: { config: { build: { outDir: '/client' } } },
      },
    } as any

    await prerenderWithVite({ startConfig: makeStartConfig(), builder })

    expect(fetch).toHaveBeenCalledOnce()
    const request = fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) {
      throw new Error('Expected the Vite prerender sink to fetch a Request')
    }
    expect(request.url).toBe('http://127.0.0.1:4173/about/')
    expect(request.redirect).toBe('manual')
  })

  it('follows an absolute redirect on the actual Vite preview origin', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request) =>
        new Response(null, { status: 404 }),
    )
    fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 307,
        headers: { location: 'http://127.0.0.1:4173/next/?from=about' },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const builder = {
      environments: {
        ssr: { config: { configFile: '/vite.config.ts' } },
        client: { config: { build: { outDir: '/client' } } },
      },
    } as any

    await prerenderWithVite({ startConfig: makeStartConfig(), builder })

    expect(fetch).toHaveBeenCalledTimes(2)
    const requests = fetch.mock.calls.map(([request]) => {
      expect(request).toBeInstanceOf(Request)
      if (!(request instanceof Request)) {
        throw new Error('Expected the Vite prerender sink to fetch a Request')
      }
      expect(request.redirect).toBe('manual')
      return request.url
    })
    expect(requests).toEqual([
      'http://127.0.0.1:4173/about/',
      'http://127.0.0.1:4173/next/?from=about',
    ])
  })
})
