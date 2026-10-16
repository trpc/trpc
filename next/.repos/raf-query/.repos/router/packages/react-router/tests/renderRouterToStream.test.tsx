import { afterEach, describe, expect, test, vi } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { createMemoryHistory, createRootRoute, createRouter } from '../src'
import type { RouterManagedTag } from '@tanstack/router-core'
import type * as RouterSsrServer from '@tanstack/router-core/ssr/server'
import type * as ReactDomServer from 'react-dom/server'

type ReadableRenderOptions = NonNullable<
  Parameters<typeof ReactDomServer.renderToReadableStream>[1]
>

const reactDomServerMocks = vi.hoisted(() => ({
  renderToReadableStream: undefined as
    | undefined
    | ((children: unknown, options: ReadableRenderOptions) => unknown),
  renderToPipeableStream: vi.fn(),
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

vi.mock('react-dom/server', () => ({
  default: reactDomServerMocks,
  ...reactDomServerMocks,
}))

const actualReactDomServer = await vi.importActual<typeof ReactDomServer>(
  'react-dom/server.node',
)

const { renderRouterToStream } = await import('../src/ssr/renderRouterToStream')

afterEach(() => {
  reactDomServerMocks.renderToReadableStream = undefined
  reactDomServerMocks.renderToPipeableStream.mockReset()
  routerTransformMocks.readableOptions.mockReset()
  vi.restoreAllMocks()
})

async function buildRouter(dehydratedData?: { lateData: Promise<string> }) {
  const rootRoute = createRootRoute({ component: () => null })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
    ...(dehydratedData === undefined
      ? {}
      : { dehydrate: () => dehydratedData }),
  })
  router.isServer = true
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  return router
}

async function expectBodyRejects(response: Response, message: string) {
  await expect(response.text()).rejects.toThrow(message)
}

function unwrapResponse(
  result: Awaited<ReturnType<typeof renderRouterToStream>>,
) {
  return result.response
}

function renderScript(tag: RouterManagedTag) {
  const attrs = tag.attrs ?? {}
  const id = attrs.id ? ` id="${attrs.id}"` : ''
  const nonce = attrs.nonce ? ` nonce="${attrs.nonce}"` : ''
  const streamPart =
    'data-tsr-stream-part' in attrs ? ' data-tsr-stream-part=""' : ''
  return `<script${id}${nonce}${streamPart}>${tag.children ?? ''}</script>`
}

function takeInitialScriptHtml(
  router: Awaited<ReturnType<typeof buildRouter>>,
) {
  const scripts = router.serverSsr!.takeInitialHydrationScriptTags()!
  return [...scripts.before, scripts.boundary].map(renderScript).join('')
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Timed out waiting for streamed HTML')),
          2000,
        )
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  state: { html: string },
  needle: string,
) {
  while (!state.html.includes(needle)) {
    const { done, value } = await readWithTimeout(reader)
    if (done) {
      throw new Error(`Response ended before it contained ${needle}`)
    }
    state.html += decoder.decode(value, { stream: true })
  }
}

describe('renderRouterToStream - renderer selection and pipeable errors', () => {
  test('already-aborted requests do not start the readable renderer', async () => {
    const readable = vi.fn()
    reactDomServerMocks.renderToReadableStream = readable
    const controller = new AbortController()
    controller.abort(new Error('already-gone-readable'))
    const router = await buildRouter()

    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/', {
            signal: controller.signal,
          }),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      ).rejects.toThrow('already-gone-readable')

      expect(readable).not.toHaveBeenCalled()
      expect(reactDomServerMocks.renderToPipeableStream).not.toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('already-aborted requests do not start the pipeable renderer', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already-gone-pipeable'))
    const router = await buildRouter()

    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/', {
            signal: controller.signal,
          }),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      ).rejects.toThrow('already-gone-pipeable')

      expect(reactDomServerMocks.renderToPipeableStream).not.toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('disables React progressive chunking for the readable renderer', async () => {
    const router = await buildRouter()
    const renderedScripts = takeInitialScriptHtml(router)
    const rendererStream = Object.assign(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(renderedScripts))
          controller.close()
        },
      }),
      { allReady: Promise.resolve() },
    )
    const renderToReadableStream = vi.fn(() => Promise.resolve(rendererStream))
    reactDomServerMocks.renderToReadableStream = renderToReadableStream

    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )
      await response.text()

      expect(renderToReadableStream).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          progressiveChunkSize: Number.POSITIVE_INFINITY,
        }),
      )
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('disables React progressive chunking for the pipeable renderer', async () => {
    const router = await buildRouter()
    const renderedScripts = takeInitialScriptHtml(router)
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, options) => {
        queueMicrotask(options.onShellReady)
        return {
          abort: vi.fn(),
          pipe(destination: NodeJS.WritableStream) {
            destination.write(renderedScripts)
            destination.end()
          },
        }
      },
    )

    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )
      await response.text()

      expect(
        reactDomServerMocks.renderToPipeableStream.mock.calls[0]![1],
      ).toEqual(
        expect.objectContaining({
          progressiveChunkSize: Number.POSITIVE_INFINITY,
        }),
      )
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('emits late router data after a complete React patch while rendering is still open', async () => {
    let resolveLateData!: (value: string) => void
    const lateData = new Promise<string>((resolve) => {
      resolveLateData = resolve
    })
    const router = await buildRouter({ lateData })
    const renderedScripts = takeInitialScriptHtml(router)

    let rendererController!: ReadableStreamDefaultController<Uint8Array>
    let rendererClosed = false
    const rendererStream = Object.assign(
      new ReadableStream<Uint8Array>({
        start(controller) {
          rendererController = controller
        },
      }),
      { allReady: new Promise<void>(() => {}) },
    )
    reactDomServerMocks.renderToReadableStream = vi.fn(() =>
      Promise.resolve(rendererStream),
    )

    const patch =
      '<div hidden id="S:0">resolved</div>' +
      '<script>applyPatch("B:0","S:0")</script>'
    const response = unwrapResponse(
      await renderRouterToStream({
        request: new Request('http://localhost/'),
        router,
        responseHeaders: new Headers(),
        children: null,
      }),
    )
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const state = { html: '' }

    try {
      rendererController.enqueue(
        new TextEncoder().encode(
          `<html><body>${renderedScripts}</body></html>${patch}`,
        ),
      )
      await readUntil(reader, decoder, state, patch)

      resolveLateData('late-react-router-value')
      await readUntil(reader, decoder, state, 'late-react-router-value')

      // Close React only after its patch allowed the late router value through.
      rendererClosed = true
      rendererController.close()
      for (;;) {
        const { done, value } = await readWithTimeout(reader)
        if (done) {
          break
        }
        state.html += decoder.decode(value, { stream: true })
      }
      state.html += decoder.decode()

      expect(state.html.indexOf(patch)).toBeLessThan(
        state.html.indexOf('late-react-router-value'),
      )
      expect(state.html.indexOf('late-react-router-value')).toBeLessThan(
        state.html.indexOf('</body></html>'),
      )
      expect(routerTransformMocks.readableOptions).toHaveBeenCalledWith(
        expect.objectContaining({ rendererSafePoint: 'script-close' }),
      )
    } finally {
      if (!rendererClosed) {
        try {
          rendererController.close()
        } catch {
          // The response may already have cancelled the renderer.
        }
      }
      router.serverSsr?.cleanup()
    }
  })

  test('prefers the readable renderer when both APIs exist', async () => {
    const cancelReadable = vi.fn()
    const readableStream = Object.assign(
      new ReadableStream<Uint8Array>({
        cancel: cancelReadable,
      }),
      { allReady: Promise.resolve() },
    )
    const readable = vi.fn(() => Promise.resolve(readableStream))
    reactDomServerMocks.renderToReadableStream = readable

    const router = await buildRouter()
    const requestController = new AbortController()
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/', {
            signal: requestController.signal,
          }),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      expect(readable).toHaveBeenCalledOnce()
      expect(reactDomServerMocks.renderToPipeableStream).not.toHaveBeenCalled()
      expect(routerTransformMocks.readableOptions).toHaveBeenCalledWith(
        expect.objectContaining({ rendererSafePoint: 'script-close' }),
      )

      requestController.abort(new Error('test-complete'))
      await expectBodyRejects(response, 'test-complete')
      expect(cancelReadable).toHaveBeenCalledOnce()
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('readable renderer cancellation does not log a render error', async () => {
    const cancelReadable = vi.fn()
    reactDomServerMocks.renderToReadableStream = vi.fn((_children, options) => {
      const readableStream = Object.assign(
        new ReadableStream<Uint8Array>({
          cancel(reason) {
            cancelReadable(reason)
            options.onError?.(reason, { componentStack: '' })
          },
        }),
        { allReady: Promise.resolve() },
      )
      return Promise.resolve(readableStream)
    })

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reason = new Error('readable-consumer-gone')
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      await response.body!.cancel(reason)
      expect(cancelReadable).toHaveBeenCalledWith(reason)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('request abort does not log a renderer cancellation error', async () => {
    const controller = new AbortController()
    const renderError = new Error('renderer cancellation')
    reactDomServerMocks.renderToReadableStream = vi.fn((_children, options) => {
      controller.signal.addEventListener(
        'abort',
        () => options.onError?.(renderError, { componentStack: '' }),
        { once: true },
      )
      return Promise.resolve(
        Object.assign(new ReadableStream<Uint8Array>(), {
          allReady: Promise.resolve(),
        }),
      )
    })

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/', {
            signal: controller.signal,
          }),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      controller.abort(new Error('request-gone'))
      await expectBodyRejects(response, 'request-gone')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('request abort unblocks the readable renderer bot wait', async () => {
    let resolveCancel!: () => void
    let markCancelStarted!: () => void
    const cancelStarted = new Promise<void>((resolve) => {
      markCancelStarted = resolve
    })
    const cancelReadable = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve
          markCancelStarted()
        }),
    )
    const readableStream = Object.assign(
      new ReadableStream<Uint8Array>({
        cancel: cancelReadable,
      }),
      { allReady: new Promise<void>(() => {}) },
    )
    reactDomServerMocks.renderToReadableStream = vi.fn(() =>
      Promise.resolve(readableStream),
    )

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!
    const controller = new AbortController()
    const reason = new Error('readable-bot-gone')
    try {
      const responsePromise = renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
          signal: controller.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: null,
      })

      await Promise.resolve()
      controller.abort(reason)

      await cancelStarted
      expect(cleanup).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
      resolveCancel()
      await expect(responsePromise).rejects.toBe(reason)
      expect(cancelReadable).toHaveBeenCalledOnce()
    } finally {
      resolveCancel?.()
      originalServerSsr.cleanup()
    }
  })

  test('stream lifetime rejects the readable bot wait while readiness and cancellation stay pending', async () => {
    let resolveReady!: () => void
    const allReady = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    const cancelReadable = vi.fn(() => new Promise<void>(() => {}))
    const readableStream = Object.assign(
      new ReadableStream<Uint8Array>({ cancel: cancelReadable }),
      { allReady },
    )
    reactDomServerMocks.renderToReadableStream = vi.fn(() =>
      Promise.resolve(readableStream),
    )

    const router = await buildRouter()
    const owner = router.serverSsr!
    const cleanup = vi.fn()
    owner.onCleanup(cleanup)
    const request = new Request('http://localhost/', {
      headers: { 'User-Agent': 'Googlebot' },
    })
    const resolved = vi.fn()
    const rejected = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    const pending = renderRouterToStream({
      request,
      router,
      responseHeaders: new Headers(),
      children: null,
    }).then(resolved, rejected)

    try {
      await Promise.resolve()
      expect(routerTransformMocks.readableOptions).toHaveBeenCalledOnce()
      expect(rejected).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(120_000)

      const expectedError = expect.objectContaining({
        message: 'Stream lifetime exceeded',
      })
      expect(rejected).toHaveBeenCalledExactlyOnceWith(expectedError)
      expect(cancelReadable).toHaveBeenCalledExactlyOnceWith(expectedError)
      expect(readableStream.locked).toBe(false)
      expect(request.signal.aborted).toBe(false)
      expect(cleanup).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()

      resolveReady()
      await vi.advanceTimersByTimeAsync(0)
      expect(resolved).not.toHaveBeenCalled()
    } finally {
      resolveReady()
      await pending
      owner.cleanup()
      vi.useRealTimers()
      warn.mockRestore()
    }
  })

  test('fatal shell errors reject before a response is created', async () => {
    const shellError = new Error('fatal-react-shell-error')
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      actualReactDomServer.renderToPipeableStream,
    )
    const Fatal = () => {
      throw shellError
    }

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: <Fatal />,
        }),
      ).rejects.toBe(shellError)

      expect(routerTransformMocks.readableOptions).toHaveBeenCalledOnce()
      expect(cleanup).toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      errorSpy.mockRestore()
      originalServerSsr.cleanup()
    }
  })

  test('transform abort wins after shell readiness resolves before continuation', async () => {
    const reason = new Error('transform-aborted-after-ready')
    const abort = vi.fn()
    const pipe = vi.fn()
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, options) => {
        options.onShellReady()
        return { abort, pipe }
      },
    )
    routerTransformMocks.readableOptions.mockImplementationOnce((options) => {
      options?.onAbort?.(reason)
    })

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!
    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      ).rejects.toBe(reason)

      expect(abort).toHaveBeenCalledWith(reason)
      expect(pipe).not.toHaveBeenCalled()
      expect(cleanup).toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      originalServerSsr.cleanup()
    }
  })

  test('synchronous renderer and transform setup failures do not orphan shell errors', async () => {
    const rendererShellError = new Error('renderer-sync-shell-error')
    const rendererSetupError = new Error('renderer-sync-setup-error')
    const transformShellError = new Error('transform-sync-shell-error')
    const transformSetupError = new Error('transform-sync-setup-error')
    const unhandled: Array<unknown> = []
    const onUnhandled = (error: unknown) => {
      unhandled.push(error)
    }
    reactDomServerMocks.renderToPipeableStream
      .mockImplementationOnce((_children, options) => {
        options.onShellError(rendererShellError)
        throw rendererSetupError
      })
      .mockImplementationOnce((_children, options) => {
        options.onShellError(transformShellError)
        return { abort: vi.fn(), pipe: vi.fn() }
      })
    routerTransformMocks.readableOptions.mockImplementationOnce(() => {
      throw transformSetupError
    })

    const rendererRouter = await buildRouter()
    const transformRouter = await buildRouter()
    const rendererServerSsr = rendererRouter.serverSsr!
    const transformServerSsr = transformRouter.serverSsr!
    process.on('unhandledRejection', onUnhandled)
    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/'),
          router: rendererRouter,
          responseHeaders: new Headers(),
          children: null,
        }),
      ).rejects.toBe(rendererSetupError)
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/'),
          router: transformRouter,
          responseHeaders: new Headers(),
          children: null,
        }),
      ).rejects.toBe(transformSetupError)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      expect(unhandled).toEqual([])
      expect(rendererRouter.serverSsr).toBeUndefined()
      expect(transformRouter.serverSsr).toBeUndefined()
    } finally {
      process.off('unhandledRejection', onUnhandled)
      rendererServerSsr.cleanup()
      transformServerSsr.cleanup()
    }
  })

  test('a live AbortError is logged without aborting the stream', async () => {
    const abort = vi.fn()
    const renderError = new DOMException('component failed', 'AbortError')
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        queueMicrotask(() => opts.onShellReady())
        return {
          abort,
          pipe(destination: NodeJS.WritableStream) {
            destination.write('<html><body>shell')
            opts.onError(renderError, {
              componentStack: '',
            })
            destination.end('</body></html>')
          },
        }
      },
    )

    const router = await buildRouter()
    expect(router.serverSsr!.takeInitialHydrationScriptTags()).toBeDefined()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      await expect(response.text()).resolves.toContain('shell')
      expect(routerTransformMocks.readableOptions).toHaveBeenCalledWith(
        expect.objectContaining({ rendererSafePoint: 'script-close' }),
      )
      expect(abort).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in renderToPipeableStream:',
        renderError,
        { componentStack: '' },
      )
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('pipeable renderer cancellation does not log a render error', async () => {
    let options:
      | Parameters<typeof actualReactDomServer.renderToPipeableStream>[1]
      | undefined
    const abort = vi.fn((reason: unknown) => {
      options?.onError?.(reason, { componentStack: '' })
    })
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, nextOptions) => {
        options = nextOptions
        queueMicrotask(() => nextOptions.onShellReady())
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reason = new Error('pipeable-consumer-gone')
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      await response.body!.cancel(reason)
      expect(abort).toHaveBeenCalledWith(reason)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('request abort cancels pipeable rendering before the response body is consumed', async () => {
    const abort = vi.fn()
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        queueMicrotask(() => opts.onShellReady())
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const controller = new AbortController()
    const request = new Request('http://localhost/', {
      signal: controller.signal,
    })
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request,
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      expect(response.body).not.toBeNull()
      controller.abort(new Error('request-gone'))
      await vi.waitFor(() => expect(abort).toHaveBeenCalledOnce())
      await expectBodyRejects(response, 'request-gone')
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('stream lifetime abort rejects before bot readiness even when React resolves onAllReady', async () => {
    let options:
      | Parameters<typeof actualReactDomServer.renderToPipeableStream>[1]
      | undefined
    const pipe = vi.fn()
    const abort = vi.fn((_reason?: unknown) => {
      options?.onAllReady?.()
    })
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, nextOptions) => {
        options = nextOptions
        return { abort, pipe }
      },
    )

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    try {
      const responsePromise = renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
        }),
        router,
        responseHeaders: new Headers(),
        children: null,
      })
      const rejection = expect(responsePromise).rejects.toThrow(
        'Stream lifetime exceeded',
      )

      expect(routerTransformMocks.readableOptions).toHaveBeenCalledOnce()
      expect(options?.onAllReady).toBeTypeOf('function')
      await vi.runAllTimersAsync()

      await rejection
      expect(abort).toHaveBeenCalledOnce()
      expect(abort.mock.calls[0]![0]).toMatchObject({
        message: 'Stream lifetime exceeded',
      })
      expect(pipe).not.toHaveBeenCalled()
      expect(cleanup).toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      vi.useRealTimers()
      warnSpy.mockRestore()
      originalServerSsr.cleanup()
    }
  })

  test('request abort before shell readiness rejects and cleans up', async () => {
    const abort = vi.fn()
    const controller = new AbortController()
    reactDomServerMocks.renderToPipeableStream.mockReturnValueOnce({
      abort,
      pipe: vi.fn(),
    })

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!
    const reason = new Error('request-gone-before-shell')
    try {
      const responsePromise = renderRouterToStream({
        request: new Request('http://localhost/', {
          signal: controller.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: null,
      })
      await Promise.resolve()
      controller.abort(reason)

      await expect(responsePromise).rejects.toBe(reason)
      expect(abort).toHaveBeenCalledOnce()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      originalServerSsr.cleanup()
    }
  })
})
