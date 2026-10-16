import { afterEach, describe, expect, test, vi } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { createMemoryHistory, createRootRoute, createRouter } from '../src'
import type * as RouterSsrServer from '@tanstack/router-core/ssr/server'
import type * as SolidWeb from 'solid-js/web'

const solidMocks = vi.hoisted(() => ({
  renderToStream: vi.fn(),
  pipeTo: vi.fn(),
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

vi.mock('solid-js/web', async () => {
  const actual = await vi.importActual<typeof SolidWeb>('solid-js/web')
  return {
    ...actual,
    renderToStream: solidMocks.renderToStream,
  }
})

// Imported after mock so the wrapper picks up the mocked binding.
const { renderRouterToStream } = await import('../src/ssr/renderRouterToStream')

function unwrapResponse(
  result: Awaited<ReturnType<typeof renderRouterToStream>>,
) {
  return result.response
}

afterEach(() => {
  solidMocks.renderToStream.mockReset()
  solidMocks.pipeTo.mockReset()
  routerTransformMocks.readableOptions.mockReset()
  vi.restoreAllMocks()
})

async function buildRouter() {
  const rootRoute = createRootRoute({
    component: () => null,
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
      if (done) {
        return true
      }
    }
  })().catch(() => true)
}

describe('renderRouterToStream', () => {
  test('already-aborted requests do not start the Solid producer', async () => {
    const abortController = new AbortController()
    abortController.abort(new Error('already-gone'))
    const router = await buildRouter()

    await expect(
      renderRouterToStream({
        request: new Request('http://localhost/', {
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      }),
    ).rejects.toThrow('already-gone')

    expect(solidMocks.renderToStream).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort during bot wait terminates before piping starts', async () => {
    const neverReady = new Promise<void>(() => {})
    solidMocks.renderToStream.mockImplementationOnce(
      () =>
        ({
          then: neverReady.then.bind(neverReady),
          pipeTo: solidMocks.pipeTo,
        }) as any,
    )

    const router = await buildRouter()
    const abortController = new AbortController()
    const reason = new Error('client-gone')
    try {
      const responsePromise = renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      })

      await Promise.resolve()
      abortController.abort(reason)

      await expect(responsePromise).rejects.toBe(reason)
      expect(solidMocks.pipeTo).not.toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test.each(['lifetime expiry', 'external cleanup'] as const)(
    '%s rejects the bot wait and prevents late piping',
    async (termination) => {
      let resolveReady!: () => void
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve
      })
      solidMocks.renderToStream.mockImplementationOnce(
        () =>
          ({
            then: ready.then.bind(ready),
            pipeTo: solidMocks.pipeTo,
          }) as any,
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
        children: () => null,
      }).then(resolved, rejected)

      try {
        await Promise.resolve()
        expect(rejected).not.toHaveBeenCalled()
        if (termination === 'lifetime expiry') {
          await vi.advanceTimersByTimeAsync(120_000)
        } else {
          owner.cleanup()
          await vi.advanceTimersByTimeAsync(0)
        }

        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            message:
              termination === 'lifetime expiry'
                ? 'Stream lifetime exceeded'
                : 'SSR stream transform aborted by router SSR cleanup',
          }),
        )
        expect(request.signal.aborted).toBe(false)
        expect(cleanup).toHaveBeenCalledOnce()
        expect(router.serverSsr).toBeUndefined()
        expect(solidMocks.pipeTo).not.toHaveBeenCalled()

        resolveReady()
        await vi.advanceTimersByTimeAsync(0)
        expect(resolved).not.toHaveBeenCalled()
        expect(solidMocks.pipeTo).not.toHaveBeenCalled()
      } finally {
        resolveReady()
        await pending
        owner.cleanup()
        vi.useRealTimers()
        warn.mockRestore()
      }
    },
  )

  test('bots wait for renderer readiness before piping', async () => {
    let resolveReady!: () => void
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    solidMocks.renderToStream.mockImplementationOnce(
      () =>
        ({
          then: ready.then.bind(ready),
          pipeTo: solidMocks.pipeTo.mockImplementation(
            () => new Promise<void>(() => {}),
          ),
        }) as any,
    )
    const router = await buildRouter()
    try {
      let settled = false
      const responsePromise = renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
        }),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      }).then((result) => {
        settled = true
        return result
      })

      await Promise.resolve()
      expect(settled).toBe(false)
      expect(solidMocks.pipeTo).not.toHaveBeenCalled()

      resolveReady()
      const result = await responsePromise
      expect(unwrapResponse(result)).toBeInstanceOf(Response)
      expect(solidMocks.pipeTo).toHaveBeenCalledOnce()
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('bot response does not wait for a backpressured pipe', async () => {
    const html = new TextEncoder().encode(
      '<!DOCTYPE html><html><body>solid</body></html>',
    )
    let pipeCompletion: Promise<void> | undefined
    solidMocks.renderToStream.mockImplementationOnce(
      () =>
        ({
          then(resolve: () => void) {
            resolve()
          },
          pipeTo(writable: WritableStream<Uint8Array>) {
            const writer = writable.getWriter()
            pipeCompletion = writer.write(html).then(() => writer.close())
            return pipeCompletion
          },
        }) as any,
    )

    const router = await buildRouter()
    router.serverSsr!.disableHydration()
    try {
      const result = await renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
        }),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      })

      expect(pipeCompletion).toBeDefined()
      const response = unwrapResponse(result)
      await expect(response.text()).resolves.toBe(
        new TextDecoder().decode(html),
      )
      await expect(pipeCompletion).resolves.toBeUndefined()
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test.each([
    ['ordinary', new Error('solid-pipe-failed')],
    [
      'named AbortError',
      Object.assign(new Error('solid-pipe-aborted'), { name: 'AbortError' }),
    ],
  ] as const)(
    '%s pipeTo rejection logs, aborts the writer, and terminates the response',
    async (_kind, pipeError) => {
      solidMocks.renderToStream.mockImplementationOnce(
        () =>
          ({
            pipeTo: () => Promise.reject(pipeError),
          }) as any,
      )

      const router = await buildRouter()
      const request = new Request('http://localhost/')
      const addEventListener = vi.spyOn(request.signal, 'addEventListener')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const response = unwrapResponse(
          await renderRouterToStream({
            request,
            router,
            responseHeaders: new Headers(),
            children: () => null,
          }),
        )
        expect(routerTransformMocks.readableOptions).toHaveBeenCalledWith(
          expect.objectContaining({ rendererSafePoint: 'record-end' }),
        )
        expect(
          addEventListener.mock.calls.filter(([type]) => type === 'abort'),
        ).toHaveLength(1)

        expect(await drainBody(response)).toBe(true)
        expect(errorSpy).toHaveBeenCalledWith(
          'Error in Solid render stream:',
          pipeError,
        )
      } finally {
        errorSpy.mockRestore()
        router.serverSsr?.cleanup()
      }
    },
  )

  test('async pipe failure cleans an unread response immediately', async () => {
    let rejectPipe!: (reason: unknown) => void
    const pipeCompletion = new Promise<void>((_resolve, reject) => {
      rejectPipe = reject
    })
    solidMocks.renderToStream.mockImplementationOnce(
      () => ({ pipeTo: () => pipeCompletion }) as any,
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = await buildRouter()
    try {
      const result = await renderRouterToStream({
        request: new Request('http://localhost/'),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      })
      expect(unwrapResponse(result).body).not.toBeNull()

      rejectPipe(new Error('solid-pipe-failed-unread'))
      await vi.waitFor(() => expect(router.serverSsr).toBeUndefined())
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('request abort after attachment stops outgoing Solid writes', async () => {
    let outboundWriter!: WritableStreamDefaultWriter<Uint8Array>
    solidMocks.pipeTo.mockImplementationOnce(
      (writable: WritableStream<Uint8Array>) => {
        outboundWriter = writable.getWriter()
        return new Promise<void>(() => {})
      },
    )
    solidMocks.renderToStream.mockImplementationOnce(
      () => ({ pipeTo: solidMocks.pipeTo }) as any,
    )

    const router = await buildRouter()
    const abortController = new AbortController()
    const request = new Request('http://localhost/', {
      signal: abortController.signal,
    })
    const addEventListener = vi.spyOn(request.signal, 'addEventListener')
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request,
          router,
          responseHeaders: new Headers(),
          children: () => null,
        }),
      )

      expect(solidMocks.pipeTo).toHaveBeenCalledOnce()
      expect(
        addEventListener.mock.calls.filter(([type]) => type === 'abort'),
      ).toHaveLength(1)
      abortController.abort(new Error('solid-request-gone'))

      await expect(
        outboundWriter.write(new TextEncoder().encode('late Solid chunk')),
      ).rejects.toBeDefined()

      expect(await drainBody(response)).toBe(true)
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('request abort during renderer setup is caught before transform attachment', async () => {
    const abortController = new AbortController()
    solidMocks.renderToStream.mockImplementationOnce(() => {
      abortController.abort(new Error('solid-setup-request-gone'))
      return { pipeTo: solidMocks.pipeTo } as any
    })

    const router = await buildRouter()
    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/', {
            signal: abortController.signal,
          }),
          router,
          responseHeaders: new Headers(),
          children: () => null,
        }),
      ).rejects.toThrow('solid-setup-request-gone')

      expect(solidMocks.pipeTo).not.toHaveBeenCalled()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      router.serverSsr?.cleanup()
    }
  })
})
