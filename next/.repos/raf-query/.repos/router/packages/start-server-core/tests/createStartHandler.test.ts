// @vitest-environment node

import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  createMiddleware,
  getRouterInstance,
} from '@tanstack/start-client-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  redirect,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  createSsrStreamResponse,
  transformReadableStreamWithRouter,
} from '@tanstack/router-core/ssr/server'
import {
  createStartHandler,
  transferResponseBodyOwnership,
} from '../src/createStartHandler'
import {
  getStaticHandlerInlineCssDefault,
  resolveInlineCssForRequest,
} from '../src/inlineCss'
import type { AnyRouter } from '@tanstack/router-core'

const startMocks = vi.hoisted(() => {
  const hadServerFnBase = Object.prototype.hasOwnProperty.call(
    process.env,
    'TSS_SERVER_FN_BASE',
  )
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    hadServerFnBase,
    previousServerFnBase,
    requestMiddleware: [] as Array<any>,
    serverFnResult: undefined as undefined | Response | object,
    serverFnHandler: undefined as undefined | (() => unknown),
    router: undefined as undefined | AnyRouter,
    routerFactory: undefined as undefined | (() => AnyRouter),
  }
})

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: startMocks.requestMiddleware,
      serializationAdapters: [],
    }),
  },
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => startMocks.routerFactory?.() ?? startMocks.router,
}))

vi.mock('../src/server-functions-handler', () => ({
  handleServerAction: () =>
    startMocks.serverFnHandler
      ? startMocks.serverFnHandler()
      : startMocks.serverFnResult,
}))

const getStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn: () => void) => fn(),
})

function makeRouter(routeOptions: Record<string, unknown> = {}) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
    ...routeOptions,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: rootRoute.addChildren([indexRoute]),
    },
    getStoreConfig,
  )
  router.isServer = true
  return router
}

function makeRouterWithRouteWork(routeWork: {
  beforeLoad?: (ctx: { abortController: AbortController }) => unknown
  loader?: (ctx: { abortController: AbortController }) => unknown
}) {
  const rootRoute = new BaseRootRoute({})
  const workRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/work',
    component: () => null,
    ...routeWork,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      routeTree: rootRoute.addChildren([workRoute]),
    },
    getStoreConfig,
  )
  router.isServer = true
  return router
}

function waitForAbortOrRelease(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const release = () => {
      signal.removeEventListener('abort', release)
      resolve()
    }
    signal.addEventListener('abort', release, { once: true })
  })
}

function makeStreamResponse(
  router: ReturnType<typeof makeRouter>,
  onCancel?: (reason?: unknown) => void,
) {
  attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('stream'))
    },
    cancel(reason) {
      onCancel?.(reason)
      router.serverSsr?.cleanup()
    },
  })
  return createSsrStreamResponse(router as any, new Response(stream))
}

function makeCompletingStreamResponse(router: ReturnType<typeof makeRouter>) {
  attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
  router.serverSsr!.disableHydration()
  const source = new NodeReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('stream'))
      controller.close()
    },
  })
  const stream = transformReadableStreamWithRouter(router as any, source)
  return createSsrStreamResponse(
    router as any,
    new Response(stream as unknown as BodyInit),
  )
}

afterEach(() => {
  startMocks.requestMiddleware = []
  startMocks.serverFnResult = undefined
  startMocks.serverFnHandler = undefined
  startMocks.router = undefined
  startMocks.routerFactory = undefined
  vi.unstubAllEnvs()
})

afterAll(() => {
  if (!startMocks.hadServerFnBase) {
    delete (process.env as Partial<NodeJS.ProcessEnv>).TSS_SERVER_FN_BASE
  } else {
    process.env.TSS_SERVER_FN_BASE = startMocks.previousServerFnBase
  }
})

describe('createStartHandler redirect safety', () => {
  it.each(
    [false, true].flatMap((rpc) =>
      ['relative-to', 'functional-options'].flatMap((options) =>
        ['/login', 'http://localhost/login', '//evil.example'].map((href) => ({
          rpc,
          options,
          href,
        })),
      ),
    ),
  )(
    'uses an explicit Location before ignored $options (RPC=$rpc, href=$href)',
    async ({ rpc, options, href }) => {
      const factory = vi.fn(makeRouter)
      const updater = vi.fn(() => ({}))
      const hash = vi.fn(() => 'ignored')
      startMocks.routerFactory = factory
      const headers = { Location: href }
      const result =
        options === 'relative-to'
          ? redirect({ headers, to: 'ignored' })
          : redirect({ headers, search: updater, params: updater, hash })
      if (rpc) {
        startMocks.serverFnResult = result
      } else {
        startMocks.requestMiddleware = [createMiddleware().server(() => result)]
      }
      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request(`http://localhost/${rpc ? '_serverFn/test' : ''}`, {
          headers: rpc ? { 'x-tsr-serverFn': 'true' } : undefined,
        }),
        {},
      )
      const blocked = href.startsWith('//')
      expect(response.status).toBe(blocked ? 500 : rpc ? 200 : 307)
      expect(response.headers.get('Location')).toBe(blocked ? null : '/login')
      expect(factory).toHaveBeenCalledTimes(href === '/login' ? 0 : 1)
      expect(updater).not.toHaveBeenCalled()
      expect(hash).not.toHaveBeenCalled()
      if (rpc && !blocked) {
        expect(await response.json()).toMatchObject({
          href: '/login',
          isSerializedRedirect: true,
        })
      }
    },
  )

  it.each(
    [undefined, ''].flatMap((location) =>
      ['to', 'params', 'search', 'hash'].map((option) => ({
        location,
        option,
      })),
    ),
  )(
    'still validates unresolved $option with Location=$location',
    async ({ location, option }) => {
      const factory = vi.fn(makeRouter)
      const updater = vi.fn(() => ({}))
      const hash = vi.fn(() => 'ignored')
      startMocks.routerFactory = factory
      const headers =
        location === undefined ? undefined : { Location: location }
      const result =
        option === 'to'
          ? redirect({ headers, to: 'relative' })
          : redirect({
              headers,
              to: '/login',
              params: option === 'params' ? updater : undefined,
              search: option === 'search' ? updater : undefined,
              hash: option === 'hash' ? hash : undefined,
            })
      startMocks.requestMiddleware = [createMiddleware().server(() => result)]
      const response = await createStartHandler(() => new Response('unused'))(
        new Request('http://localhost/'),
        {},
      )
      expect(response.status).toBe(500)
      expect(response.headers.get('Location')).toBeNull()
      expect(factory).not.toHaveBeenCalled()
      expect(updater).not.toHaveBeenCalled()
      expect(hash).not.toHaveBeenCalled()
    },
  )

  it('applies custom protocol policy to a header-only redirect with ignored options', async () => {
    startMocks.routerFactory = () => {
      const router = makeRouter()
      router.update({ protocolAllowlist: [] })
      return router
    }
    startMocks.requestMiddleware = [
      createMiddleware().server(() =>
        redirect({
          to: 'ignored',
          headers: { Location: 'https://other.example/login' },
        }),
      ),
    ]
    const response = await createStartHandler(() => new Response('unused'))(
      new Request('http://localhost/'),
      {},
    )
    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
  })

  it.each([
    '/login',
    '../login',
    '?next=https://example.com',
    '#details',
    '/items/a:b',
  ])(
    'returns an early relative redirect to %j without initializing the router',
    async (href) => {
      const factory = vi.fn(makeRouter)
      startMocks.routerFactory = factory
      startMocks.requestMiddleware = [
        createMiddleware().server(() => redirect({ href })),
      ]
      const handler = createStartHandler(() => new Response('unused'))

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe(href)
      expect(factory).not.toHaveBeenCalled()
    },
  )

  it('serializes an early relative server-function redirect without initializing the router', async () => {
    const factory = vi.fn(makeRouter)
    startMocks.routerFactory = factory
    startMocks.serverFnResult = redirect({
      href: '/ignored',
      headers: { Location: '/login', 'set-cookie': 'session=secret; HttpOnly' },
    })
    const handler = createStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBe('/login')
    expect(response.headers.get('set-cookie')).toBe('session=secret; HttpOnly')
    const body = await response.json()
    expect(body).toMatchObject({ href: '/login', isSerializedRedirect: true })
    expect(body).not.toHaveProperty('headers')
    expect(factory).not.toHaveBeenCalled()
  })

  it.each([
    { href: 'https://example.com/login', protocols: [], status: 500 },
    { href: 'myapp:login', protocols: ['myapp:'], status: 307 },
    { href: 'myapp:login', protocols: [], status: 500 },
  ])(
    'uses router policy for an early redirect to $href with $protocols',
    async ({ href, protocols, status }) => {
      const factory = vi.fn(() => {
        const router = makeRouter()
        router.update({ protocolAllowlist: protocols })
        return router
      })
      startMocks.routerFactory = factory
      startMocks.requestMiddleware = [
        createMiddleware().server(() =>
          redirect({
            href: '/ignored',
            headers: { Location: href },
          }),
        ),
      ]
      const handler = createStartHandler(() => new Response('unused'))

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.status).toBe(status)
      expect(response.headers.get('Location')).toBe(
        status === 307 ? href : null,
      )
      expect(factory).toHaveBeenCalledTimes(1)
    },
  )

  it('resolves route-based early redirects through the router', async () => {
    const factory = vi.fn(() => makeRouterWithRouteWork({}))
    startMocks.routerFactory = factory
    startMocks.requestMiddleware = [
      createMiddleware().server(() =>
        redirect({
          to: '/work',
          search: { next: 'home' },
        }),
      ),
    ]
    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(new Request('http://localhost/'), {})
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/work?next=home')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it.each([
    { href: '/login', status: 307, factories: 0, location: '/login' },
    { href: '/\\evil.example', status: 500, factories: 1, location: null },
    {
      href: 'http://localhost/login',
      status: 307,
      factories: 1,
      location: '/login',
    },
  ])(
    'validates a header-only early redirect to $href',
    async ({ href, status, factories, location }) => {
      const factory = vi.fn(makeRouter)
      startMocks.routerFactory = factory
      startMocks.requestMiddleware = [
        createMiddleware().server(() =>
          redirect({
            headers: { Location: href },
            throw: true,
          }),
        ),
      ]
      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(new Request('http://localhost/'), {})
      expect(response.status).toBe(status)
      expect(response.headers.get('Location')).toBe(location)
      expect(factory).toHaveBeenCalledTimes(factories)
    },
  )

  it.each(
    [
      '//evil.example',
      '/\\evil.example',
      '/\\\\evil.example',
      '/\\/evil.example',
      '\\/evil.example',
      '\\\\evil.example',
    ].flatMap((href) => [false, true].map((rpc) => ({ href, rpc }))),
  )(
    'validates a resolved server function redirect to $href (RPC=$rpc)',
    async ({ href, rpc }) => {
      startMocks.router = makeRouter()
      startMocks.serverFnResult = redirect({ href })
      const handler = createStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: rpc ? { 'x-tsr-serverFn': 'true' } : undefined,
        }),
        {},
      )

      expect(response.status).toBe(500)
      expect(response.headers.get('Location')).toBeNull()
    },
  )

  it('validates a structured redirect before returning it directly', async () => {
    startMocks.router = makeRouter()
    startMocks.requestMiddleware = [
      createMiddleware().server(() => redirect({ href: '/\\evil.example' })),
    ]
    const handler = createStartHandler(() => new Response('unused'))

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('does not serialize structured redirect headers into the response body', async () => {
    startMocks.router = makeRouter()
    startMocks.serverFnResult = redirect({
      href: '/safe',
      headers: { 'set-cookie': 'session=secret; HttpOnly' },
    })
    const handler = createStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBe('session=secret; HttpOnly')
    const responseText = await response.text()
    expect(responseText).not.toContain('session=secret')
    expect(JSON.parse(responseText)).toEqual(
      expect.objectContaining({
        href: '/safe',
        statusCode: 307,
        isSerializedRedirect: true,
      }),
    )
  })

  it('preserves redirect headers and caller options across RPC then native form reuse', async () => {
    const headers = {
      Location: '/work',
      'set-cookie': 'session=secret; HttpOnly',
      'content-type': 'text/plain',
    }
    const options = { href: '/work', statusCode: 303, headers }
    const result = redirect(options)
    startMocks.serverFnResult = result
    const handler = createStartHandler(() => new Response('unused'))

    const rpcResponse = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )
    expect(rpcResponse.status).toBe(200)
    expect(rpcResponse.headers.get('content-type')).toBe('application/json')
    expect(await rpcResponse.json()).not.toHaveProperty('headers')
    expect(options.headers).toBe(headers)
    expect(result.headers.get('content-type')).toBe('text/plain')

    const formResponse = await handler(
      new Request('http://localhost/_serverFn/test', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'name=test',
      }),
      {},
    )
    expect(formResponse.status).toBe(303)
    expect(formResponse.headers.get('Location')).toBe('/work')
    expect(formResponse.headers.get('set-cookie')).toBe(
      'session=secret; HttpOnly',
    )
    expect(formResponse.headers.get('content-type')).toBe('text/plain')
    expect(await formResponse.text()).toBe('')
  })

  it('does not serialize an ordinary redirect with a spoofed server function header', async () => {
    startMocks.router = makeRouter()
    startMocks.requestMiddleware = [
      createMiddleware().server(() => redirect({ href: '/safe' })),
    ]
    const handler = createStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/safe')
    expect(response.headers.get('content-type')).toBeNull()
    expect(await response.text()).toBe('')
  })

  it.each([{ href: '/work' }, { to: '/work' }, { hash: () => 'ignored' }])(
    'preserves native form redirects for %j without the RPC header',
    async (target) => {
      startMocks.routerFactory = () => makeRouterWithRouteWork({})
      startMocks.serverFnResult = redirect({
        ...target,
        statusCode: 303,
        headers: {
          'set-cookie': 'session=secret; HttpOnly',
          ...('hash' in target ? { Location: '/work' } : undefined),
        },
      })
      const handler = createStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'text/html',
          },
          body: 'name=test',
        }),
        {},
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/work')
      expect(response.headers.get('set-cookie')).toBe(
        'session=secret; HttpOnly',
      )
      expect(response.headers.get('content-type')).not.toBe('application/json')
      expect(await response.text()).toBe('')
    },
  )
})

it('keeps the request URL when server code attempts navigation', async () => {
  const loader = vi.fn(async () => {
    const router = startMocks.router!
    router.history.push('/pushed')
    router.history.replace('/replaced')
    await router.navigate({ to: '/navigated' })
    return 'request data'
  })
  const router = makeRouterWithRouteWork({ loader })
  startMocks.router = router
  const load = vi.spyOn(router, 'load')
  const handler = createStartHandler(({ router: loadedRouter }) => {
    expect(loadedRouter.state.location.pathname).toBe('/work')
    expect(loadedRouter.history.location.pathname).toBe('/work')
    expect(loadedRouter.history.length).toBe(1)
    return new Response(loadedRouter.state.matches.at(-1)?.loaderData as string)
  })
  const response = await handler(new Request('http://localhost/work'), {})

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('request data')
  expect(loader).toHaveBeenCalledTimes(1)
  expect(load).toHaveBeenCalledTimes(1)
})

describe('createStartHandler router request Accept handling', () => {
  it('returns 406 JSON for router requests that do not accept HTML', async () => {
    startMocks.routerFactory = vi.fn(makeRouter)
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        headers: { accept: 'application/json' },
      }),
      {},
    )

    expect(response.status).toBe(406)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      error: 'Only HTML requests are supported here',
    })
    expect(render).not.toHaveBeenCalled()
  })

  it.each(['text/html', '*/*', undefined])(
    'does not return 406 for Accept: %s',
    async (accept) => {
      startMocks.routerFactory = vi.fn(makeRouter)
      const render = vi.fn(() => new Response('ok'))
      const handler = createStartHandler(render)

      const response = await handler(
        new Request('http://localhost/', {
          headers: accept === undefined ? undefined : { accept },
        }),
        {},
      )

      expect(response.status).not.toBe(406)
      expect(await response.text()).toBe('ok')
      expect(render).toHaveBeenCalledTimes(1)
    },
  )
})

describe('createStartHandler SSR cleanup ownership', () => {
  it('preserves serverFn stream cleanup ownership through early return', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('does not cancel the returned response when an inner result settles late', async () => {
    let resolveInner!: (response: Response) => void
    startMocks.serverFnHandler = () =>
      new Promise<Response>((resolve) => {
        resolveInner = resolve
      })
    const timeoutCancel = vi.fn()
    const timeoutResponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('timeout'))
          controller.close()
        },
        cancel: timeoutCancel,
      }),
      { status: 504 },
    )
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) =>
        Promise.race([
          next(),
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(timeoutResponse), 5),
          ),
        ]),
      ),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )
    expect(response.status).toBe(504)

    const innerCancel = vi.fn()
    resolveInner(new Response(new ReadableStream({ cancel: innerCancel })))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(timeoutCancel).not.toHaveBeenCalled()
    expect(innerCancel).toHaveBeenCalledExactlyOnceWith(
      'late middleware response',
    )
    expect(await response.text()).toBe('timeout')
  })

  it('disposes stream response replaced by middleware result', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('exposes Response to middleware while preserving stream ownership', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const seenHeaders = [] as Array<Headers | undefined>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        seenHeaders.push(result.response.headers)
        result.response.headers.set('x-test', 'true')
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(seenHeaders).toEqual([ssrResponse.response.headers])
    expect(response.headers.get('x-test')).toBe('true')
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves stream ownership through return next', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => {
        return next()
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it.each(['return', 'mutate', 'throw'] as const)(
    'cancels a plain stream that outer middleware replaces via %s',
    async (mode) => {
      const router = makeRouter()
      startMocks.router = router
      const cancel = vi.fn(() => new Promise<void>(() => {}))
      startMocks.serverFnResult = new Response(new ReadableStream({ cancel }))
      const replacement = new Response('replacement')
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          if (mode === 'return') {
            return replacement
          }
          if (mode === 'throw') {
            throw replacement
          }
          result.response = replacement
          return result
        }),
      ]

      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response).toBe(replacement)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith('middleware response replaced')
    },
  )

  it('preserves a plain stream when middleware pipes the body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    startMocks.serverFnResult = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'))
          controller.close()
        },
        cancel,
      }),
    )
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        return new Response(
          result.response.body!.pipeThrough(new TransformStream()),
          result.response,
        )
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    await expect(response.text()).resolves.toBe('stream')
    expect(cancel).not.toHaveBeenCalled()
  })

  it('preserves stream ownership when middleware wraps same body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let wrappedResponse: Response | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        wrappedResponse = new Response(result.response.body, result.response)
        wrappedResponse.headers.set('x-wrapped', 'true')
        return wrappedResponse
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(wrappedResponse)
    expect(response).not.toBe(ssrResponse.response)
    expect(response.headers.get('x-wrapped')).toBe('true')
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves stream ownership when middleware pipes the body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let wrappedResponse: Response | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        wrappedResponse = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
        return wrappedResponse
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(wrappedResponse)
    expect(dispose).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('stream')
    expect(router.serverSsr).toBeUndefined()
  })

  it.each([false, true])(
    'cancels a derived body after handoff with a router transform: %s',
    async (useRouterTransform) => {
      const router = makeRouter()
      startMocks.router = router
      const sourceCancel = vi.fn()
      const source = new ReadableStream<Uint8Array>({ cancel: sourceCancel })
      let dispose: ReturnType<typeof vi.spyOn>
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          return transferResponseBodyOwnership(
            result.response,
            new Response(
              result.response.body!.pipeThrough(new TransformStream()),
              result.response,
            ),
          )
        }),
      ]
      const requestController = new AbortController()
      const handler = createStartHandler(
        ({ router: requestRouter, request }) => {
          const responseBody = useRouterTransform
            ? transformReadableStreamWithRouter(requestRouter, source, {
                signal: request.signal,
              })
            : source
          const ssrResponse = createSsrStreamResponse(
            requestRouter,
            new Response(responseBody),
          )
          dispose = vi.spyOn(ssrResponse, 'dispose')
          return ssrResponse
        },
      )
      const response = await handler(
        new Request('http://localhost/', {
          signal: requestController.signal,
        }),
        {},
      )
      const derivedCancel = vi.spyOn(response.body!, 'cancel')
      const reason = new Error('request disconnected')

      expect(source.locked).toBe(true)
      requestController.abort(reason)

      await vi.waitFor(() => {
        expect(dispose).toHaveBeenCalledExactlyOnceWith(reason)
        expect(derivedCancel).toHaveBeenCalledExactlyOnceWith(reason)
        expect(sourceCancel).toHaveBeenCalledExactlyOnceWith(reason)
        expect(source.locked).toBe(false)
        expect(router.serverSsr).toBeUndefined()
      })
    },
  )

  it('preserves both Response.clone() branches when the clone is assigned', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let siblingResponse!: Response
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        siblingResponse = result.response
        result.response = transferResponseBodyOwnership(
          siblingResponse,
          siblingResponse.clone(),
        )
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(dispose).not.toHaveBeenCalled()
    await expect(
      Promise.all([response.text(), siblingResponse.text()]),
    ).resolves.toEqual(['stream', 'stream'])
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes a piped stream that outer middleware replaces', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    let derivedCancel!: ReturnType<typeof vi.spyOn>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        expect(dispose).not.toHaveBeenCalled()
        return replacement
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const response = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
        derivedCancel = vi.spyOn(response.body!, 'cancel')
        return response
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(derivedCancel).toHaveBeenCalledWith('middleware response replaced')
    expect(router.serverSsr).toBeUndefined()
  })

  it('refreshes a cloned response before an outer replacement', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const replacement = new Response('replacement')
    let ownerBody!: ReadableStream<Uint8Array>
    let cloneCancellation!: Promise<void>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return replacement
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        cloneCancellation = result.response.clone().body!.cancel('not used')
        ownerBody = result.response.body!
        vi.spyOn(ownerBody, 'cancel')
        return result
      }),
    ]

    try {
      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response).toBe(replacement)
      await expect(response.text()).resolves.toBe('replacement')
      expect(dispose).toHaveBeenCalledOnce()
      expect(ownerBody.cancel).toHaveBeenCalledOnce()
      await cloneCancellation
      expect(router.serverSsr).toBeUndefined()
      await Promise.resolve()
      await Promise.resolve()
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('disposes a locked stream that middleware replaces with no body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        reader = result.response.body!.getReader()
        return new Response(null, { status: 204 })
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
    reader?.releaseLock()
  })

  it('disposes a locked stream replaced by an unrelated body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        reader = result.response.body!.getReader()
        return replacement
      }),
    ]

    try {
      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response).toBe(replacement)
      await expect(response.text()).resolves.toBe('replacement')
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith('middleware response replaced')
      expect(router.serverSsr).toBeUndefined()
    } finally {
      await reader?.cancel('test cleanup')
      reader?.releaseLock()
    }
  })

  it('disposes an in-place replacement on middleware error', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const cancel = vi.fn()
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response = new Response(new ReadableStream({ cancel }))
        throw new Error('middleware failed')
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(dispose).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes stream response replaced by thrown response', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('handled', { status: 418 })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response = result.response.clone()
        throw replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes a side-cloned stream before an unrelated thrown response', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('handled', { status: 418 })
    let cloneCancellation!: Promise<void>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        cloneCancellation = result.response.clone().body!.cancel('not used')
        throw replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    await cloneCancellation
    expect(router.serverSsr).toBeUndefined()
  })

  it('honors in-place response assignment on returned context', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response = replacement
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })
})

describe('createStartHandler router initialization', () => {
  it('shares one router between concurrent request-context reads', async () => {
    let factoryCalls = 0
    let instances: Array<AnyRouter> = []
    startMocks.routerFactory = () => {
      factoryCalls++
      return makeRouter()
    }
    startMocks.serverFnHandler = async () => {
      instances = await Promise.all([getRouterInstance(), getRouterInstance()])
      return new Response('ok')
    }

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    await expect(response.text()).resolves.toBe('ok')
    expect(factoryCalls).toBe(1)
    expect(instances[0]).toBe(instances[1])
  })

  it('shares one router failure between sequential request-context reads', async () => {
    const factoryError = new Error('router factory failed')
    const errors: Array<unknown> = []
    let factoryCalls = 0
    startMocks.routerFactory = () => {
      factoryCalls++
      throw factoryError
    }
    startMocks.serverFnHandler = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await getRouterInstance()
        } catch (error) {
          errors.push(error)
        }
      }
      return new Response('ok')
    }

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    await expect(response.text()).resolves.toBe('ok')
    expect(factoryCalls).toBe(1)
    expect(errors).toEqual([factoryError, factoryError])
  })

  it('does not start the router factory from a continuation after request abort', async () => {
    const requestController = new AbortController()
    const reason = new Error('request aborted')
    let factoryCalls = 0
    let lateError: unknown
    let continueServerFn!: () => void
    const serverFnCanContinue = new Promise<void>((resolve) => {
      continueServerFn = resolve
    })
    let notifyServerFnStarted!: () => void
    const serverFnStarted = new Promise<void>((resolve) => {
      notifyServerFnStarted = resolve
    })
    let notifyLateReadFinished!: () => void
    const lateReadFinished = new Promise<void>((resolve) => {
      notifyLateReadFinished = resolve
    })

    startMocks.routerFactory = () => {
      factoryCalls++
      return makeRouter()
    }
    startMocks.serverFnHandler = async () => {
      notifyServerFnStarted()
      await serverFnCanContinue
      try {
        await getRouterInstance()
      } catch (error) {
        lateError = error
      }
      notifyLateReadFinished()
      return new Response('late')
    }

    const handler = createStartHandler(() => new Response('unused'))
    const response = handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
        signal: requestController.signal,
      }),
      {},
    )

    await serverFnStarted
    requestController.abort(reason)
    expect((await response).status).toBe(500)

    continueServerFn()
    await lateReadFinished
    expect(factoryCalls).toBe(0)
    expect(lateError).toBe(reason)
  })
})

describe('createStartHandler direct server routes', () => {
  it('disposes a thrown sole-terminal response when the request aborts after the fast-path check', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const cancel = vi.fn()
    const thrownResponse = new Response(
      new ReadableStream<Uint8Array>({ cancel }),
    )
    // Abort during the `instanceof Response` check, immediately after the
    // fast path's first abort check has passed.
    const responsePrototype = new Proxy(Response.prototype, {
      getPrototypeOf() {
        requestController.abort(cancellation)
        return Response.prototype
      },
    })
    Object.setPrototypeOf(thrownResponse, responsePrototype)
    startMocks.serverFnHandler = () => {
      throw thrownResponse
    }
    const handler = createStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it.each([
    ['Response', 'sole-terminal'],
    ['SsrResponse', 'sole-terminal'],
    ['Response', 'middleware-chain'],
    ['SsrResponse', 'middleware-chain'],
  ] as const)(
    'does not read context from a direct %s result in the %s path',
    async (resultType, executionPath) => {
      if (executionPath === 'middleware-chain') {
        startMocks.requestMiddleware = [
          createMiddleware().server(({ next }) => next()),
        ]
      }
      const directResponse = new Response(resultType, { status: 202 })
      const directResult =
        resultType === 'Response'
          ? directResponse
          : { response: directResponse, serverSsrCleanup: 'none' as const }
      const contextGetter = vi.fn(() => {
        throw new Error('direct response context must not be read')
      })
      Object.defineProperty(directResult, 'context', {
        get: contextGetter,
      })
      startMocks.serverFnHandler = () => directResult
      const handler = createStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response.status).toBe(202)
      await expect(response.text()).resolves.toBe(resultType)
      expect(contextGetter).not.toHaveBeenCalled()
    },
  )

  it('does not invoke the sole terminal after abort while copying request context', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const serverFnHandler = vi.fn(() => new Response('must not run'))
    const requestContext = {} as { abort: boolean }
    Object.defineProperty(requestContext, 'abort', {
      enumerable: true,
      get() {
        requestController.abort(cancellation)
        return true
      },
    })
    startMocks.serverFnHandler = serverFnHandler
    const handler = createStartHandler<{
      server: { requestContext: { abort: boolean } }
    }>(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
        signal: requestController.signal,
      }),
      { context: requestContext },
    )

    expect(response.status).toBe(500)
    expect(serverFnHandler).not.toHaveBeenCalled()
  })

  it('does not invoke a direct handler when its handler factory aborts', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const routeHandler = vi.fn(() => new Response('must not run'))
    const handlers = vi.fn(() => {
      requestController.abort(cancellation)
      return { GET: routeHandler }
    })
    const router = makeRouter({
      component: undefined,
      server: { handlers },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(handlers).toHaveBeenCalledOnce()
    expect(routeHandler).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('returns an exact non-component handler response without rendering a document', async () => {
    const routeHandler = vi.fn(() => new Response('direct', { status: 201 }))
    const router = makeRouter({
      component: undefined,
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(201)
    await expect(response.text()).resolves.toBe('direct')
    expect(routeHandler).toHaveBeenCalledOnce()
    expect(render).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves request context, params, and pathname for a direct handler', async () => {
    const routeHandler = vi.fn(
      ({ context, params, pathname, handlerType, request }: any) =>
        Response.json({
          context,
          params,
          pathname,
          handlerType,
          requestUrl: request.url,
        }),
    )
    const router = makeRouter({
      path: '/items/$itemId',
      component: undefined,
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler<{
      server: { requestContext: { requestValue: string } }
    }>(render)

    const response = await handler(
      new Request('http://localhost/items/42?source=test'),
      { context: { requestValue: 'preserved' } },
    )

    await expect(response.json()).resolves.toMatchObject({
      context: { requestValue: 'preserved' },
      params: { itemId: '42' },
      pathname: '/items/42',
      handlerType: 'router',
      requestUrl: 'http://localhost/items/42?source=test',
    })
    expect(render).not.toHaveBeenCalled()
  })

  it.each(
    [false, true].flatMap((component) =>
      ['function', 'object'].flatMap((handlerKind) =>
        ['params.parse', 'parseParams'].map((parserKind) => ({
          component,
          handlerKind,
          parserKind,
        })),
      ),
    ),
  )(
    'parses server handler params (component=$component, handler=$handlerKind, parser=$parserKind)',
    async ({ component, handlerKind, parserKind }) => {
      const parse = (params: { itemId: string }) => ({
        itemId: Number(params.itemId),
      })
      const routeHandler = vi.fn(({ params }: any) => Response.json(params))
      startMocks.router = makeRouter({
        path: '/items/$itemId',
        component: component ? () => null : undefined,
        ...(parserKind === 'params.parse'
          ? { params: { parse } }
          : { parseParams: parse }),
        server: {
          handlers: {
            GET:
              handlerKind === 'function'
                ? routeHandler
                : { handler: routeHandler },
          },
        },
      })
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)

      const response = await handler(
        new Request('http://localhost/items/42'),
        {},
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ itemId: 42 })
      expect(routeHandler).toHaveBeenCalledOnce()
      expect(render).not.toHaveBeenCalled()
    },
  )

  it.each(['route', 'handler'] as const)(
    'lets %s middleware catch terminal handler parameter parsing errors',
    async (placement) => {
      const error = new Error('Invalid item id')
      const middleware = createMiddleware().server(async ({ next }) => {
        try {
          return await next()
        } catch (caught) {
          expect(caught).toBe(error)
          return new Response(error.message, { status: 400 })
        }
      })
      const routeHandler = vi.fn(() => new Response('must not run'))
      startMocks.router = makeRouter({
        path: '/items/$itemId',
        component: undefined,
        params: {
          parse: () => {
            throw error
          },
        },
        server: {
          ...(placement === 'route' ? { middleware: [middleware] } : {}),
          handlers: {
            GET:
              placement === 'handler'
                ? { middleware: [middleware], handler: routeHandler }
                : routeHandler,
          },
        },
      })
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)

      const response = await handler(
        new Request('http://localhost/items/nope'),
        {},
      )

      expect(response.status).toBe(400)
      await expect(response.text()).resolves.toBe('Invalid item id')
      expect(routeHandler).not.toHaveBeenCalled()
      expect(render).not.toHaveBeenCalled()
    },
  )

  it.each(['route', 'handler'] as const)(
    'runs %s middleware instead of incorrectly taking the direct path',
    async (placement) => {
      const events: Array<string> = []
      const middleware = createMiddleware().server(async ({ next }) => {
        events.push('middleware before')
        const result = await next({
          context: { middlewarePlacement: placement },
        })
        events.push('middleware after')
        result.response.headers.set('x-middleware', placement)
        return result
      })
      const routeHandler = vi.fn(({ context }: any) => {
        events.push('handler')
        return Response.json(context)
      })
      const handlers = {
        GET:
          placement === 'handler'
            ? { middleware: [middleware], handler: routeHandler }
            : routeHandler,
      }
      const router = makeRouter({
        component: undefined,
        server: {
          ...(placement === 'route' ? { middleware: [middleware] } : {}),
          handlers,
        },
      })
      startMocks.router = router
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.headers.get('x-middleware')).toBe(placement)
      await expect(response.json()).resolves.toMatchObject({
        middlewarePlacement: placement,
      })
      expect(events).toEqual([
        'middleware before',
        'handler',
        'middleware after',
      ])
      expect(render).not.toHaveBeenCalled()
    },
  )

  it('rejects a missing direct response before middleware resumes', async () => {
    const afterNext = vi.fn()
    const middleware = createMiddleware().server(async ({ next }) => {
      await next()
      afterNext()
      return new Response('must not return')
    })
    const router = makeRouter({
      component: undefined,
      server: {
        middleware: [middleware],
        handlers: { GET: () => undefined },
      },
    })
    startMocks.router = router
    const handler = createStartHandler(() => new Response('must not render'))

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(500)
    expect(afterNext).not.toHaveBeenCalled()
  })

  it('lets a component route handler defer to document rendering with next', async () => {
    const routeHandler = vi.fn(({ next }: any) => next())
    const router = makeRouter({
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('rendered document'))
    const handler = createStartHandler(render)

    const response = await handler(new Request('http://localhost/'), {})

    await expect(response.text()).resolves.toBe('rendered document')
    expect(routeHandler).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a direct handler body that resolves after request abort', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    let notifyHandlerStarted!: () => void
    const handlerStarted = new Promise<void>((resolve) => {
      notifyHandlerStarted = resolve
    })
    let resolveHandler!: (response: Response) => void
    const handlerResult = new Promise<Response>((resolve) => {
      resolveHandler = resolve
    })
    const routeHandler = vi.fn(() => {
      notifyHandlerStarted()
      return handlerResult
    })
    const router = makeRouter({
      component: undefined,
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await handlerStarted
    requestController.abort(cancellation)
    expect((await response).status).toBe(500)

    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    resolveHandler(new Response(new ReadableStream({ cancel })))

    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
    expect(render).not.toHaveBeenCalled()
  })
})

describe('createStartHandler HEAD fallback', () => {
  it('strips and disposes the rendered document body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    let cleanupEffects = 0

    const handler = createStartHandler(({ router: requestRouter }) => {
      requestRouter.serverSsr!.onCleanup(() => {
        cleanupEffects++
      })
      return createSsrStreamResponse(
        requestRouter,
        new Response(new ReadableStream({ cancel }), {
          headers: { 'x-rendered': 'true' },
          status: 201,
        }),
      )
    })
    const response = await handler(
      new Request('http://localhost/', { method: 'HEAD' }),
      {},
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('x-rendered')).toBe('true')
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith('HEAD body stripped')
    expect(cleanupEffects).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a plain streaming GET body before stripping it', async () => {
    const cancel = vi.fn()
    const router = makeRouter({
      server: {
        handlers: {
          GET: () =>
            new Response(
              new ReadableStream({
                cancel,
              }),
            ),
        },
      },
    })
    startMocks.router = router

    const handler = createStartHandler(() => new Response('must not render'))
    const response = await handler(
      new Request('http://localhost/', { method: 'HEAD' }),
      {},
    )

    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith('HEAD body stripped')
  })
})

describe('createStartHandler request cancellation', () => {
  it.each(['beforeLoad', 'loader'] as const)(
    'aborts route %s work and does not render HTML',
    async (hook) => {
      let routeSignal: AbortSignal | undefined
      let notifyStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        notifyStarted = resolve
      })
      const routeWork = ({
        abortController,
      }: {
        abortController: AbortController
      }) => {
        routeSignal = abortController.signal
        notifyStarted?.()
        return waitForAbortOrRelease(abortController.signal)
      }
      const router = makeRouterWithRouteWork({ [hook]: routeWork })
      startMocks.router = router
      const requestController = new AbortController()
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)
      const response = handler(
        new Request('http://localhost/work', {
          signal: requestController.signal,
        }),
        {},
      )

      await started
      const cancellation = new Error('request disconnected')
      requestController.abort(cancellation)

      expect((await response).status).toBe(500)
      expect(routeSignal?.aborted).toBe(true)
      expect(routeSignal?.reason).toBe(cancellation)
      expect(render).not.toHaveBeenCalled()
    },
  )

  it('settles and cleans up while the render callback is still pending', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (
      value: ReturnType<typeof createSsrStreamResponse>,
    ) => void
    const renderResult = new Promise<
      ReturnType<typeof createSsrStreamResponse>
    >((resolve) => {
      resolveRender = resolve
    })
    let cleanupEffects = 0
    let cancelCalls = 0
    let lateStreamResponse!: ReturnType<typeof createSsrStreamResponse>
    const handler = createStartHandler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      serverSsr.onCleanup(() => {
        cleanupEffects++
      })
      lateStreamResponse = createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      )
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(cleanupEffects).toBe(1)
    expect(router.serverSsr).toBeUndefined()

    resolveRender(lateStreamResponse)
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanupEffects).toBe(1)
    expect(cancelCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a plain response resolved by the render callback later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (value: Response) => void
    const renderResult = new Promise<Response>((resolve) => {
      resolveRender = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    const handler = createStartHandler(() => {
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    expect((await response).status).toBe(500)
    resolveRender(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it.each(['resolves', 'rejects'] as const)(
    'cancels a plain response when request middleware %s later',
    async (settlement) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      let notifyMiddlewareStarted!: () => void
      const middlewareStarted = new Promise<void>((resolve) => {
        notifyMiddlewareStarted = resolve
      })
      let settleMiddleware!: (value: Response) => void
      const middlewareResult = new Promise<Response>((resolve, reject) => {
        settleMiddleware = settlement === 'resolves' ? resolve : reject
      })
      const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          notifyMiddlewareStarted()
          return middlewareResult
        }),
      ]
      const handler = createStartHandler(() => new Response('must not render'))
      const response = handler(
        new Request('http://localhost/', {
          signal: requestController.signal,
        }),
        {},
      )

      await middlewareStarted
      const cancellation = new Error('request disconnected')
      requestController.abort(cancellation)

      expect((await response).status).toBe(500)
      settleMiddleware(new Response(new ReadableStream({ cancel })))
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(cancel).toHaveBeenCalledWith(cancellation)
      })
    },
  )

  it('cancels a stream resolved by the render callback later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (
      value: ReturnType<typeof createSsrStreamResponse>,
    ) => void
    const renderResult = new Promise<
      ReturnType<typeof createSsrStreamResponse>
    >((resolve) => {
      resolveRender = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    let streamResponse!: ReturnType<typeof createSsrStreamResponse>

    const handler = createStartHandler(({ router: requestRouter }) => {
      streamResponse = createSsrStreamResponse(
        requestRouter,
        new Response(new ReadableStream({ cancel })),
      )
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)
    expect((await response).status).toBe(500)

    resolveRender(streamResponse)
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it('disposes a side-cloned stream when the request aborts after handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let cancelCalls = 0
    let siblingResponse!: Response
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        siblingResponse = result.response.clone()
        return result
      }),
    ]
    const handler = createStartHandler(({ router: requestRouter }) =>
      createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      ),
    )

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )
    expect(response.body).not.toBeNull()
    expect(router.serverSsr).toBeDefined()
    const cancel = vi.spyOn(response.body!, 'cancel')
    const reason = new Error('request disconnected')

    requestController.abort(reason)
    void siblingResponse.body!.cancel(reason)

    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledWith(reason)
      expect(cancelCalls).toBe(1)
      expect(router.serverSsr).toBeUndefined()
    })
  })

  it('unwinds nested middleware when an inner operation ignores cancellation', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const outerFinally = vi.fn()
    let notifyInnerStarted!: () => void
    const innerStarted = new Promise<void>((resolve) => {
      notifyInnerStarted = resolve
    })
    const pending = new Promise<Response>(() => {})
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(async ({ next }) => {
        try {
          return await next()
        } finally {
          outerFinally()
        }
      }),
      createMiddleware().server(() => {
        notifyInnerStarted()
        return pending
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await innerStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(outerFinally).toHaveBeenCalledOnce()
    expect(render).not.toHaveBeenCalled()
  })

  it('cancels an all-synchronous direct next chain', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyInnerStarted!: () => void
    const innerStarted = new Promise<void>((resolve) => {
      notifyInnerStarted = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(() => {
        notifyInnerStarted()
        return new Promise<Response>(() => {})
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await innerStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves the abort reason when direct next rejects during abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        requestController.abort(reason)
        throw result.response
      }),
      createMiddleware().server(() => ssrResponse as any),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves aborts that race with a fulfilled direct next promise', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const observedErrors: Array<unknown> = []
    const afterNext = vi.fn()
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        try {
          const result = await next()
          afterNext()
          return result
        } catch (error) {
          observedErrors.push(error)
          throw error
        }
      }),
      createMiddleware().server(({ next }) => {
        const pending = next()
        void Promise.resolve(pending).then(() =>
          requestController.abort(reason),
        )
        return pending
      }),
      createMiddleware().server(() => ssrResponse as any),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => expect(observedErrors).toEqual([reason]))
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(afterNext).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('disposes a tagged final response when abort wins handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        queueMicrotask(() => {
          queueMicrotask(() => requestController.abort(reason))
        })
        return ssrResponse as any
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
    expect(render).not.toHaveBeenCalled()
  })

  it('keeps late same-body disposal idempotent after abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    let notifyResponseCaptured!: () => void
    const responseCaptured = new Promise<void>((resolve) => {
      notifyResponseCaptured = resolve
    })
    let releaseMiddleware!: () => void
    const middlewareRelease = new Promise<void>((resolve) => {
      releaseMiddleware = resolve
    })
    let notifyLateResultDelivered!: () => void
    const lateResultDelivered = new Promise<void>((resolve) => {
      notifyLateResultDelivered = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const wrapped = new Response(result.response.body, result.response)
        notifyResponseCaptured()
        await middlewareRelease
        queueMicrotask(() => {
          queueMicrotask(notifyLateResultDelivered)
        })
        return wrapped
      }),
    ]
    const sourceCancel = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'))
        },
        cancel: sourceCancel,
      }),
    )
    let ssrResponse!: ReturnType<typeof createSsrStreamResponse>
    const render = vi.fn(({ router: requestRouter }) => {
      ssrResponse = createSsrStreamResponse(requestRouter, response)
      return ssrResponse
    })
    const handler = createStartHandler(render)
    const result = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await responseCaptured
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    requestController.abort(reason)

    expect((await result).status).toBe(500)
    releaseMiddleware()
    await lateResultDelivered
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(sourceCancel).toHaveBeenCalledOnce()
      expect(sourceCancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a transferred body that middleware returns after abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    let notifyResponseCaptured!: () => void
    const responseCaptured = new Promise<void>((resolve) => {
      notifyResponseCaptured = resolve
    })
    let releaseMiddleware!: () => void
    const middlewareRelease = new Promise<void>((resolve) => {
      releaseMiddleware = resolve
    })
    let derivedBody!: ReadableStream<Uint8Array>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const derived = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
        derivedBody = derived.body!
        notifyResponseCaptured()
        await middlewareRelease
        return derived
      }),
    ]
    const sourceCancel = vi.fn()
    const response = new Response(
      new ReadableStream<Uint8Array>({ cancel: sourceCancel }),
    )
    const handler = createStartHandler(({ router: requestRouter }) =>
      createSsrStreamResponse(requestRouter, response),
    )
    const result = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await responseCaptured
    const derivedCancel = vi.spyOn(derivedBody, 'cancel')
    requestController.abort(reason)

    expect((await result).status).toBe(500)
    expect(sourceCancel).not.toHaveBeenCalled()
    releaseMiddleware()
    await vi.waitFor(() => {
      expect(derivedCancel).toHaveBeenCalledWith(reason)
      expect(sourceCancel).toHaveBeenCalledOnce()
      expect(sourceCancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
  })
})

describe('createStartHandler inlineCss option', () => {
  const request = new Request('https://example.com/')

  it('defaults to true', async () => {
    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss: undefined,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(true)
  })

  it('uses the handler-level boolean default', async () => {
    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss: false,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(false)
  })

  it('uses the handler-level callback default', async () => {
    const handlerInlineCss = vi.fn(({ request: req }) => {
      return req.headers.get('x-inline-css') !== 'false'
    })
    const callbackRequest = new Request('https://example.com/', {
      headers: { 'x-inline-css': 'false' },
    })

    await expect(
      resolveInlineCssForRequest({
        request: callbackRequest,
        handlerInlineCss,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(false)
    expect(handlerInlineCss).toHaveBeenCalledWith({ request: callbackRequest })
  })

  it('lets request options override handler-level options', async () => {
    const handlerInlineCss = vi.fn(() => false)

    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss,
        requestInlineCss: true,
      }),
    ).resolves.toBe(true)

    expect(handlerInlineCss).not.toHaveBeenCalled()
  })

  it('returns a static inline CSS default only for non-callback options', () => {
    expect(getStaticHandlerInlineCssDefault(undefined)).toBe(true)
    expect(getStaticHandlerInlineCssDefault(true)).toBe(true)
    expect(getStaticHandlerInlineCssDefault(false)).toBe(false)
    expect(getStaticHandlerInlineCssDefault(() => true)).toBe(undefined)
  })
})
