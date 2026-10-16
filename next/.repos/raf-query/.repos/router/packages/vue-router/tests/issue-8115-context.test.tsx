import * as Vue from 'vue'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  Outlet,
  RouterProvider,
  Scripts,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useLocation,
} from '../src'
import { createRequestHandler, renderRouterToString } from '../src/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

declare module '@tanstack/history' {
  interface HistoryState {
    issue8115Revision?: 'old' | 'new'
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.$_TSR
  delete (window as Window & { $R?: unknown }).$R
  document.body.innerHTML = ''
})

test('invalidate merges fresh parent beforeLoad context with cached child context', async () => {
  let generation = 0
  let childContextCalls = 0

  const rootRoute = createRootRoute({
    beforeLoad: () => {
      generation++
      return {
        parentGeneration: generation,
        collision: `parent-${generation}`,
      }
    },
    component: Outlet,
  })
  const ChildComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()
      return () => (
        <div>
          <div data-testid="parent-generation">
            {context.value.parentGeneration}
          </div>
          <div data-testid="child-snapshot">
            {context.value.childSnapshotOfParent}
          </div>
          <div data-testid="collision">{context.value.collision}</div>
        </div>
      )
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ context }) => {
      childContextCalls++
      return {
        childSnapshotOfParent: context.parentGeneration,
        collision: `child-snapshot-${context.parentGeneration}`,
      }
    },
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('parent-generation')).toHaveTextContent('1')
  expect(screen.getByTestId('child-snapshot')).toHaveTextContent('1')
  expect(screen.getByTestId('collision')).toHaveTextContent('child-snapshot-1')
  expect(generation).toBe(1)
  expect(childContextCalls).toBe(1)
  const childMatchId = router.state.matches[1]!.id

  await router.invalidate()
  await Vue.nextTick()

  // The fresh parent contribution is merged under the cached child contribution.
  expect(router.state.matches[1]!.id).toBe(childMatchId)
  expect(generation).toBe(2)
  expect(childContextCalls).toBe(1)
  expect(screen.getByTestId('parent-generation')).toHaveTextContent('2')
  expect(screen.getByTestId('child-snapshot')).toHaveTextContent('1')
  expect(screen.getByTestId('collision')).toHaveTextContent('child-snapshot-1')
})

test('a same-id child beforeLoad error observes fresh inherited context', async () => {
  const childError = new Error('child beforeLoad failed')
  let parentGeneration = 0
  let renderedError: unknown

  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loaderDeps: () => ({ stable: true }),
    beforeLoad: () => ({ generation: ++parentGeneration }),
    component: Outlet,
  })
  const ChildComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()
      return () => (
        <div data-testid="child-generation">{context.value.generation}</div>
      )
    },
  })

  const ChildErrorComponent = Vue.defineComponent({
    props: ['error'],
    setup(props) {
      const context = childRoute.useRouteContext()

      return () => {
        renderedError = props.error
        return (
          <div data-testid="child-error-generation">
            {context.value.generation}
          </div>
        )
      }
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: () => ({ stable: true }),
    beforeLoad: ({ context }) => {
      if (context.generation === 2) {
        throw childError
      }
    },
    component: ChildComponent,
    errorComponent: ChildErrorComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('child-generation')).toHaveTextContent('1')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  const initialChildMatchId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id
  expect(initialChildMatchId).toBeDefined()

  await router.invalidate()

  expect(
    await screen.findByTestId('child-error-generation'),
  ).toBeInTheDocument()
  expect(renderedError).toBe(childError)
  expect(
    router.state.matches.find((match) => match.routeId === childRoute.id)?.id,
  ).toBe(initialChildMatchId)
  expect(screen.getByTestId('child-error-generation')).toHaveTextContent('2')
})

test('a same-match reload merges new provider context with cached route context', async () => {
  type ProviderContext = {
    providerValue: string
    collision: string
  }

  const providerA: ProviderContext = {
    providerValue: 'A',
    collision: 'provider:A',
  }
  const providerB: ProviderContext = {
    providerValue: 'B',
    collision: 'provider:B',
  }
  const rootRoute = createRootRouteWithContext<ProviderContext>()()
  const IndexComponent = Vue.defineComponent({
    setup() {
      const context = indexRoute.useRouteContext()
      return () => (
        <pre data-testid="full-context">{JSON.stringify(context.value)}</pre>
      )
    },
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ context }) => ({
      derivedFromProvider: `derived:${context.providerValue}`,
      collision: `route-cached:${context.providerValue}`,
    }),
    component: IndexComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: providerA,
  })
  const providerContext = Vue.ref(providerA)
  const App = Vue.defineComponent({
    setup: () => () => (
      <RouterProvider router={router} context={providerContext.value} />
    ),
  })

  render(App)
  expect(await screen.findByTestId('full-context')).toHaveTextContent(
    JSON.stringify({
      providerValue: 'A',
      collision: 'route-cached:A',
      derivedFromProvider: 'derived:A',
    }),
  )

  providerContext.value = providerB
  await Vue.nextTick()
  await router.invalidate()
  await Vue.nextTick()

  expect(screen.getByTestId('full-context')).toHaveTextContent(
    JSON.stringify({
      providerValue: 'B',
      collision: 'route-cached:A',
      derivedFromProvider: 'derived:A',
    }),
  )
})

test('navigation merges fresh parent context with cached child preload context', async () => {
  let parentBeforeLoadRuns = 0
  let childContextRuns = 0
  let childLoaderRuns = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: ({ preload }) => {
      parentBeforeLoadRuns++
      return {
        parentValue: preload ? 'parent-preload' : 'parent-navigation',
      }
    },
    component: Outlet,
  })
  const ChildComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()
      return () => (
        <div data-testid="context">
          {JSON.stringify({
            parentValue: context.value.parentValue,
            childValue: context.value.childValue,
          })}
        </div>
      )
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: ({ context, preload }) => {
      childContextRuns++
      return {
        childValue: `${preload ? 'child-preload' : 'child-navigation'}:${context.parentValue}`,
      }
    },
    loader: () => {
      childLoaderRuns++
      return 'child data'
    },
    preloadStaleTime: Infinity,
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()

  await router.preloadRoute({ to: '/parent/child' })
  expect(parentBeforeLoadRuns).toBe(1)
  expect(childContextRuns).toBe(1)
  expect(childLoaderRuns).toBe(1)

  await router.navigate({ to: '/parent/child' })

  expect(await screen.findByTestId('context')).toHaveTextContent(
    JSON.stringify({
      parentValue: 'parent-navigation',
      childValue: 'child-preload:parent-preload',
    }),
  )
  expect(parentBeforeLoadRuns).toBe(2)
  expect(childContextRuns).toBe(1)
  expect(childLoaderRuns).toBe(1)
})

test('a cached child context contribution is merged with fresh parent context', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      version: Number(search.version),
    }),
    loaderDeps: ({ search }) => ({ version: search.version }),
    context: ({ deps }) => ({ parentVersion: `version-${deps.version}` }),
    component: Outlet,
  })
  const ChildComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()
      return () => (
        <div>
          Parent: {context.value.parentVersion}; cached child:{' '}
          {context.value.childSnapshot}
        </div>
      )
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: () => ({ stable: true }),
    context: ({ context }) => ({
      childSnapshot: `derived-from-${context.parentVersion}`,
    }),
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child?version=1'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByText(
      'Parent: version-1; cached child: derived-from-version-1',
    ),
  ).toBeInTheDocument()

  const initialParentMatchId = router.state.matches.find(
    (match) => match.routeId === parentRoute.id,
  )?.id
  const initialChildMatchId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id

  expect(initialParentMatchId).toBeDefined()
  expect(initialChildMatchId).toBeDefined()

  await router.navigate({
    to: '/parent/child',
    search: { version: 2 },
  })
  await Vue.nextTick()

  expect(
    screen.getByText('Parent: version-2; cached child: derived-from-version-1'),
  ).toBeInTheDocument()

  const nextParentMatchId = router.state.matches.find(
    (match) => match.routeId === parentRoute.id,
  )?.id
  const nextChildMatchId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id

  expect(nextParentMatchId).not.toBe(initialParentMatchId)
  expect(nextChildMatchId).toBe(initialChildMatchId)
})

test('#8115: hydration does not render a successful route with missing context when context reconstruction fails', async () => {
  const contextError = new Error('client context reconstruction failed')
  const clientSuccessRenderValues: Array<string | undefined> = []
  let clientContextAttempts = 0
  let serverPhase = true

  const createRouteTree = () => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Outlet />
          <Scripts />
        </>
      ),
    })
    const IndexComponent = Vue.defineComponent({
      setup() {
        const context = indexRoute.useRouteContext({
          select: (routeContext): { locale?: string } => routeContext,
        })
        return () => {
          if (!serverPhase) {
            clientSuccessRenderValues.push(context.value.locale)
          }

          return (
            <div data-testid="route-success">
              Locale: {context.value.locale ?? 'missing'}
            </div>
          )
        }
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      context: (): { locale: string } => {
        if (serverPhase) {
          return { locale: 'en' }
        }
        clientContextAttempts++
        throw contextError
      },
      component: IndexComponent,
      errorComponent: ({ error }) => (
        <div data-testid="route-error">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ),
    })

    return rootRoute.addChildren([indexRoute])
  }

  const ServerApp = Vue.defineComponent({
    props: {
      router: {
        type: Object as Vue.PropType<AnyRouter>,
        required: true,
      },
    },
    setup: (props) => () => (
      <html>
        <head />
        <body>
          <div id="__app">
            <RouterProvider router={props.router} />
          </div>
        </body>
      </html>
    ),
  })

  const response = await createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () =>
      createRouter({ routeTree: createRouteTree(), isServer: true }),
  })(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      App: ServerApp,
    }),
  )
  const html = await response.text()
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')

  expect(serverDocument.body.textContent).toContain('Locale: en')
  const currentScriptSpy = vi.spyOn(document, 'currentScript', 'get')
  try {
    // These scripts come exclusively from this test's renderRouterToString output.
    for (const script of serverDocument.querySelectorAll('script')) {
      currentScriptSpy.mockReturnValue(script)
      new Function(script.textContent ?? '')()
      script.remove()
    }
  } finally {
    currentScriptSpy.mockRestore()
  }
  expect(window.$_TSR?.router?.matches.at(-1)?.s).toBe('success')

  serverPhase = false
  const clientRouter = createRouter({
    routeTree: createRouteTree(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const serverContainer = serverDocument.querySelector('#__app')
  expect(serverContainer).not.toBeNull()
  const container = document.createElement('div')
  container.id = '__app'
  container.innerHTML = serverContainer!.innerHTML
  document.body.appendChild(container)
  const hydrationMessages: Array<string> = []
  const originalError = console.error.bind(console)
  const originalWarn = console.warn.bind(console)
  const recordHydrationMessage = (...args: Array<unknown>) => {
    const message = args.map(String).join(' ')
    if (/hydration|mismatch/i.test(message)) {
      hydrationMessages.push(message)
      return true
    }
    return false
  }
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (!recordHydrationMessage(...args)) {
      originalError(...args)
    }
  })
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    if (!recordHydrationMessage(...args)) {
      originalWarn(...args)
    }
  })
  let app: Vue.App<Element> | undefined

  try {
    await hydrate(clientRouter)
    const ClientApp = Vue.defineComponent({
      setup: () => () => <RouterProvider router={clientRouter} />,
    })
    app = Vue.createSSRApp(ClientApp)
    app.mount(container)
    await Vue.nextTick()

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="route-error"]'),
      ).toHaveTextContent(contextError.message)
    })
    expect(clientContextAttempts).toBeGreaterThan(0)
    expect(container.querySelector('[data-testid="route-success"]')).toBeNull()
    expect(clientSuccessRenderValues).not.toContain(undefined)
    expect(hydrationMessages.length).toBeGreaterThan(0)
  } finally {
    app?.unmount()
    container.remove()
  }
})

test('a same-id child retry presents one coherent beforeLoad context generation', async () => {
  const childReloadStarted = createControlledPromise<void>()
  const childReload = createControlledPromise<void>()
  let parentGeneration = 0
  let childLoads = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const ParentComponent = Vue.defineComponent({
    setup() {
      const context = parentRoute.useRouteContext()
      return () => (
        <div>
          <div data-testid="parent-generation">
            Parent generation {context.value.generation}
          </div>
          <Outlet />
        </div>
      )
    },
  })

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: () => ({ generation: ++parentGeneration }),
    component: ParentComponent,
  })
  const ChildPendingComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()
      return () => (
        <div data-testid="child-pending-generation">
          Child generation {context.value.inheritedGeneration}
        </div>
      )
    },
  })

  const ChildComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()
      return () => (
        <div data-testid="child-generation">
          Child generation {context.value.inheritedGeneration}
        </div>
      )
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: ({ context }) => ({
      inheritedGeneration: context.generation,
    }),
    loader: async () => {
      if (++childLoads > 1) {
        childReloadStarted.resolve()
        await childReload
      }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: ChildPendingComponent,
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('parent-generation')).toHaveTextContent(
    'Parent generation 1',
  )
  expect(await screen.findByTestId('child-generation')).toHaveTextContent(
    'Child generation 1',
  )
  await waitFor(() => expect(router.state.status).toBe('idle'))
  const initialChildId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id
  expect(initialChildId).toBeDefined()

  let invalidation: Promise<void> | undefined
  try {
    invalidation = router.invalidate({
      filter: (match) =>
        match.routeId === parentRoute.id || match.routeId === childRoute.id,
      forcePending: true,
    })
    await childReloadStarted

    await waitFor(() => {
      expect(screen.getByTestId('parent-generation')).toHaveTextContent(
        'Parent generation 2',
      )
      expect(screen.getByTestId('child-pending-generation')).toHaveTextContent(
        'Child generation 2',
      )
    })
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'success',
      context: { generation: 2 },
    })
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id),
    ).toMatchObject({
      id: initialChildId,
      status: 'pending',
      context: { generation: 2, inheritedGeneration: 2 },
    })
  } finally {
    childReload.resolve()
    await Promise.allSettled(invalidation ? [invalidation] : [])
  }
})

test('a same-id navigation merges new inherited context with cached route context', async () => {
  const history = createMemoryHistory({ initialEntries: ['/'] })
  history.replace('/', { issue8115Revision: 'old' })

  const rootRoute = createRootRoute({
    beforeLoad: ({ location }) => ({
      inheritedRevision: location.state.issue8115Revision,
    }),
  })
  const IndexComponent = Vue.defineComponent({
    setup() {
      const location = useLocation()

      const context = indexRoute.useRouteContext()

      const matchId = indexRoute.useMatch({ select: (match) => match.id })

      const navigate = indexRoute.useNavigate()
      return () => (
        <>
          <output data-testid="match-id">{matchId.value}</output>
          <output data-testid="snapshot">
            location: {location.value.state.issue8115Revision}; inherited:{' '}
            {context.value.inheritedRevision}; self:{' '}
            {context.value.selfRevision}
          </output>
          <button
            onClick={() => {
              void navigate({
                to: '/',
                state: { issue8115Revision: 'new' },
              })
            }}
          >
            Update state
          </button>
        </>
      )
    },
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ location }) => ({
      selfRevision: location.state.issue8115Revision,
    }),
    component: IndexComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history,
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('snapshot')).toHaveTextContent(
    'location: old; inherited: old; self: old',
  )
  const initialMatchId = screen.getByTestId('match-id').textContent

  await fireEvent.click(screen.getByRole('button', { name: 'Update state' }))

  await waitFor(() => {
    expect(screen.getByTestId('match-id').textContent).toBe(initialMatchId)
    expect(screen.getByTestId('snapshot')).toHaveTextContent(
      'location: new; inherited: new; self: old',
    )
  })
})

test('#8115: a successful root never renders without its context while a child is pending on cold load', async () => {
  let resolveChildLoader!: () => void
  const childLoader = new Promise<void>((resolve) => {
    resolveChildLoader = resolve
  })
  const rootRenderValues: Array<string | undefined> = []

  const RootComponent = Vue.defineComponent({
    setup() {
      const context = rootRoute.useRouteContext()
      return () => {
        const locale = context.value.locale

        rootRenderValues.push(locale)

        return (
          <main>
            <p data-testid="root-locale">Locale: {locale ?? 'missing'}</p>
            <Outlet />
          </main>
        )
      }
    },
  })

  const rootRoute = createRootRoute({
    context: () => ({ locale: 'en' }),
    component: RootComponent,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => childLoader,
    pendingMs: 0,
    pendingComponent: () => <p role="status">Loading child</p>,
    component: () => <p>Child content</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  try {
    expect(await screen.findByRole('status')).toHaveTextContent('Loading child')
    expect(screen.getByTestId('root-locale')).toHaveTextContent('Locale: en')
    expect(rootRenderValues.length).toBeGreaterThan(0)
    expect(rootRenderValues.every((locale) => locale === 'en')).toBe(true)
  } finally {
    resolveChildLoader()
    await childLoader
    await Vue.nextTick()
  }
})

test('a same-id search navigation merges fresh inherited context with cached route context', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      revision: typeof search.revision === 'string' ? search.revision : 'one',
    }),
    loaderDeps: ({ search }) => ({ revision: search.revision }),
    context: ({ deps }) => ({ inheritedRevision: deps.revision }),
    component: Outlet,
  })
  const ChildComponent = Vue.defineComponent({
    setup() {
      const context = childRoute.useRouteContext()

      const search = childRoute.useSearch()

      const matchId = childRoute.useMatch({ select: (match) => match.id })
      return () => (
        <>
          <div data-testid="match-id">{matchId.value}</div>
          <div data-testid="current-search">{search.value.revision}</div>
          <div data-testid="inherited-context">
            {context.value.inheritedRevision}
          </div>
          <div data-testid="cached-self-context">
            {context.value.cachedSelfRevision}
          </div>
        </>
      )
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: () => ({}),
    context: ({ context, location }) => ({
      cachedSelfRevision: `${context.inheritedRevision}:${String((location.search as Record<string, unknown>).revision)}`,
    }),
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child?revision=one'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('current-search')).toHaveTextContent('one')
  expect(screen.getByTestId('inherited-context')).toHaveTextContent('one')
  expect(screen.getByTestId('cached-self-context')).toHaveTextContent('one:one')
  const initialMatchId = screen.getByTestId('match-id').textContent

  await router.navigate({
    to: '/parent/child',
    search: { revision: 'two' },
  })
  await Vue.nextTick()

  expect(await screen.findByTestId('current-search')).toHaveTextContent('two')
  expect(screen.getByTestId('match-id').textContent).toBe(initialMatchId)
  expect(screen.getByTestId('inherited-context')).toHaveTextContent('two')
  expect(screen.getByTestId('cached-self-context')).toHaveTextContent('one:one')
})
