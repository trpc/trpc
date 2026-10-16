import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  attachRouterServerSsrUtils,
  normalizeSsrResponse,
} from '@tanstack/router-core/ssr/server'
import { createMemoryHistory, createRootRoute, createRouter } from '../src'
import type { RouterManagedTag } from '@tanstack/router-core'
import type * as RouterSsrServer from '@tanstack/router-core/ssr/server'
import type * as VueServerRenderer from 'vue/server-renderer'

const rendererMocks = vi.hoisted(() => ({
  renderToWebStream: vi.fn(),
  renderToString: vi.fn(),
}))
const routerTransformMocks = vi.hoisted(() => ({
  readableOptions: vi.fn(),
}))

vi.mock('@tanstack/router-core/ssr/server', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterSsrServer>()
  return {
    ...actual,
    transformReadableStreamWithRouter: (
      ...args: Parameters<typeof actual.transformReadableStreamWithRouter>
    ) => {
      routerTransformMocks.readableOptions(args[2])
      return actual.transformReadableStreamWithRouter(...args)
    },
  }
})

vi.mock('vue/server-renderer', async () => {
  const actual = await vi.importActual<typeof VueServerRenderer>(
    'vue/server-renderer',
  )
  return {
    ...actual,
    renderToWebStream: rendererMocks.renderToWebStream,
    renderToString: rendererMocks.renderToString,
  }
})

const actualVueServerRenderer = await vi.importActual<typeof VueServerRenderer>(
  'vue/server-renderer',
)

// Imported after mock so the wrapper picks up the mocked binding.
const { renderRouterToStream } = await import('../src/ssr/renderRouterToStream')

function unwrapResponse(
  result: Awaited<ReturnType<typeof renderRouterToStream>>,
) {
  return normalizeSsrResponse(result).response
}

afterEach(() => {
  rendererMocks.renderToWebStream.mockReset()
  rendererMocks.renderToString.mockReset()
  routerTransformMocks.readableOptions.mockReset()
  vi.restoreAllMocks()
})

async function buildRouter() {
  const rootRoute = createRootRoute({
    component: { template: '<div/>' } as any,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
  })
  router.isServer = true
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  return router
}

function drainBody(response: Response) {
  const reader = response.body!.getReader()
  return (async () => {
    for (;;) {
      const { done } = await reader.read()
      if (done) return true
    }
  })().catch(() => true)
}

function createManualVueStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController
    },
    cancel,
  })
  return { stream, controller, cancel }
}

function renderScript(tag: RouterManagedTag) {
  const attrs = tag.attrs ?? {}
  const id = attrs.id ? ` id="${attrs.id}"` : ''
  const nonce = attrs.nonce ? ` nonce="${attrs.nonce}"` : ''
  const streamPart =
    'data-tsr-stream-part' in attrs ? ' data-tsr-stream-part=""' : ''
  return `<script${id}${nonce}${streamPart}>${tag.children ?? ''}</script>`
}

describe('renderRouterToStream - sync setup failures', () => {
  test('bot string response preserves hydration scripts and cleans up', async () => {
    const router = await buildRouter()
    await router.serverSsr!.dehydrate()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()!
    expect(initialScripts.boundary.attrs).not.toHaveProperty('id')
    const renderedScripts = [...initialScripts.before, initialScripts.boundary]
      .map(renderScript)
      .join('')
    rendererMocks.renderToString.mockResolvedValueOnce(
      `<html><body><main>bot</main>${renderedScripts}</body></html>`,
    )

    const response = unwrapResponse(
      await renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
        }),
        router,
        responseHeaders: new Headers(),
        App: { template: '<div/>' } as any,
      }),
    )

    const html = await response.text()
    expect(html).toContain('$_TSR.e()')
    expect(html).toContain(initialScripts.boundary.children)
    expect(html.indexOf('$_TSR.e()')).toBeLessThan(html.indexOf('</body>'))
    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort stops a bot wait and removes its temporary listener', async () => {
    rendererMocks.renderToString.mockImplementationOnce(
      () => new Promise<string>(() => {}),
    )
    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const abortController = new AbortController()
    const request = new Request('http://localhost/', {
      headers: { 'User-Agent': 'Googlebot' },
      signal: abortController.signal,
    })
    const addEventListener = vi.spyOn(request.signal, 'addEventListener')
    const reason = new Error('bot-request-gone')

    const responsePromise = renderRouterToStream({
      request,
      router,
      responseHeaders: new Headers(),
      App: { template: '<div/>' } as any,
    })
    await Promise.resolve()
    abortController.abort(reason)

    await expect(responsePromise).rejects.toBe(reason)
    // The shared abort waiter registers once; `{ once: true }` retires it.
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'abort'),
    ).toHaveLength(1)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  test('an already-aborted bot request does not start string rendering', async () => {
    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const abortController = new AbortController()
    const reason = new Error('bot-already-gone')
    abortController.abort(reason)

    await expect(
      renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        App: { template: '<div/>' } as any,
      }),
    ).rejects.toBe(reason)

    expect(rendererMocks.renderToString).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  test('prepends one doctype without wrapping the renderer stream', async () => {
    const router = await buildRouter()
    await router.serverSsr!.dehydrate()
    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()!
    const renderedScripts = [...initialScripts.before, initialScripts.boundary]
      .map(renderScript)
      .join('')
    const appHtml = `<html><body><main>app</main>${renderedScripts}</body></html>`
    rendererMocks.renderToWebStream.mockReturnValueOnce(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(appHtml))
          controller.close()
        },
      }),
    )

    const response = unwrapResponse(
      await renderRouterToStream({
        request: new Request('http://localhost/'),
        router,
        responseHeaders: new Headers(),
        App: { template: '<div/>' } as any,
      }),
    )
    const html = await response.text()

    expect(html).toBe(`<!DOCTYPE html>${appHtml}`)
    expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('already-aborted requests do not start the Vue producer', async () => {
    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const abortController = new AbortController()
    const reason = new Error('already-gone')
    abortController.abort(reason)

    await expect(
      renderRouterToStream({
        request: new Request('http://localhost/', {
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        App: { template: '<div/>' } as any,
      }),
    ).rejects.toBe(reason)

    expect(rendererMocks.renderToWebStream).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  test('an abort during producer setup rejects before a response', async () => {
    const abortController = new AbortController()
    const reason = new Error('reentrant-abort')
    rendererMocks.renderToWebStream.mockImplementationOnce(
      actualVueServerRenderer.renderToWebStream,
    )
    const router = await buildRouter()

    await expect(
      renderRouterToStream({
        request: new Request('http://localhost/', {
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        App: {
          setup() {
            abortController.abort(reason)
            return () => null
          },
        },
      }),
    ).rejects.toBe(reason)

    expect(router.serverSsr).toBeUndefined()
  })

  test('real synchronous renderer failure rejects before creating a response', async () => {
    const setupError = new Error('real-vue-setup-failure')
    rendererMocks.renderToWebStream.mockImplementationOnce(
      actualVueServerRenderer.renderToWebStream,
    )
    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          App: {
            setup() {
              throw setupError
            },
          },
        }),
      ).rejects.toBe(setupError)

      expect(routerTransformMocks.readableOptions).not.toHaveBeenCalled()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
      originalServerSsr.cleanup()
    }
  })

  test('request abort drops later Vue writes and terminates the response', async () => {
    const vue = createManualVueStream()
    rendererMocks.renderToWebStream.mockReturnValueOnce(vue.stream)

    const router = await buildRouter()
    const abortController = new AbortController()
    const request = new Request('http://localhost/', {
      signal: abortController.signal,
    })
    const addEventListener = vi.spyOn(request.signal, 'addEventListener')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request,
          router,
          responseHeaders: new Headers(),
          App: { template: '<div/>' } as any,
        }),
      )

      expect(
        addEventListener.mock.calls.filter(([type]) => type === 'abort'),
      ).toHaveLength(1)
      const reason = new Error('client-gone')
      abortController.abort(reason)
      expect(response.body).not.toBeNull()

      expect(await drainBody(response)).toBe(true)
      expect(vue.cancel).toHaveBeenCalledWith(reason)
      expect(() =>
        vue.controller.enqueue(new TextEncoder().encode('<div/>')),
      ).toThrow()
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('downstream cancellation stops Vue writes and cleans up once', async () => {
    const vue = createManualVueStream()
    rendererMocks.renderToWebStream.mockReturnValueOnce(vue.stream)

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const response = unwrapResponse(
      await renderRouterToStream({
        request: new Request('http://localhost/'),
        router,
        responseHeaders: new Headers(),
        App: { template: '<div/>' } as any,
      }),
    )

    await response.body!.cancel('consumer-gone')
    expect(vue.cancel).toHaveBeenCalledWith('consumer-gone')
    expect(() =>
      vue.controller.enqueue(new TextEncoder().encode('<div/>')),
    ).toThrow()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  test('a renderer buffer failure errors the response body', async () => {
    const renderError = new Error('vue-buffer-failed')
    rendererMocks.renderToWebStream.mockImplementationOnce(
      actualVueServerRenderer.renderToWebStream,
    )
    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    router.serverSsr!.disableHydration()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          App: {
            ssrRender(_context: unknown, push: (value: unknown) => void) {
              push('<html><body>partial')
              push(Promise.reject(renderError))
            },
          } as any,
        }),
      )

      await expect(response.text()).rejects.toBe(renderError)
      expect(cleanup).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })
})
