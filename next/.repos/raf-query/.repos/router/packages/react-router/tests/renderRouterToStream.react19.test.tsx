import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import {
  RouterContextProvider,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import type * as ReactDOMServer from 'react-dom/server'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Load the adapter against the real React 19 renderer. Node's `react-dom`
 * exports both entry points; hiding `renderToReadableStream` exercises the
 * pipeable path that every Node user on React < 19.2 runs.
 */
async function loadRenderRouterToStream(path: 'readable' | 'pipeable') {
  vi.resetModules()
  if (path === 'pipeable') {
    vi.doMock('react-dom/server', async (importOriginal) => {
      // The runtime module is CommonJS, so its interop `default` is the namespace.
      const actual = await importOriginal<{ default: typeof ReactDOMServer }>()
      return {
        ...actual,
        default: { ...actual.default, renderToReadableStream: undefined },
      }
    })
  } else {
    vi.doUnmock('react-dom/server')
  }
  const reactDomServer = (await import('react-dom/server')).default
  const renderToPipeableStream = vi.spyOn(
    reactDomServer,
    'renderToPipeableStream',
  )
  const { renderRouterToStream } =
    await import('../src/ssr/renderRouterToStream')
  return { renderRouterToStream, renderToPipeableStream }
}

const activeRouters: Array<AnyRouter> = []

afterEach(() => {
  for (const router of activeRouters.splice(0)) {
    router.serverSsr?.cleanup()
  }
})

async function buildRouter(dehydratedData: { routerData: Promise<string> }) {
  const rootRoute = createRootRoute({ component: () => null })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
    dehydrate: () => dehydratedData,
  })
  activeRouters.push(router)
  router.isServer = true
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  return router
}

function createSuspendingComponent(id: string, text: string) {
  let ready = false
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = () => {
      ready = true
      done()
    }
  })

  return {
    Component() {
      if (!ready) {
        throw pending
      }
      return <div id={id}>{text}</div>
    },
    resolve,
  }
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
          () => reject(new Error('Timed out waiting for React SSR output')),
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
  condition: (html: string) => boolean,
) {
  while (!condition(state.html)) {
    const { done, value } = await readWithTimeout(reader)
    if (done) {
      throw new Error('React SSR response ended before the expected output')
    }
    state.html += decoder.decode(value, { stream: true })
  }
}

describe.each(['readable', 'pipeable'] as const)(
  'renderRouterToStream - real React 19 renderer (%s)',
  (path) => {
    test('emits router data after a real Suspense patch while React is still rendering', async () => {
      const { renderRouterToStream, renderToPipeableStream } =
        await loadRenderRouterToStream(path)
      let resolveRouterData!: (value: string) => void
      const routerData = new Promise<string>((resolve) => {
        resolveRouterData = resolve
      })
      const router = await buildRouter({ routerData })
      const first = createSuspendingComponent('first-result', 'first-resolved')
      const second = createSuspendingComponent(
        'second-result',
        'second-resolved',
      )
      const requestController = new AbortController()

      const { response } = await renderRouterToStream({
        request: new Request('http://localhost/', {
          signal: requestController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: (
          <html>
            <body>
              <RouterContextProvider router={router}>
                <Suspense fallback={<p>first-fallback</p>}>
                  <first.Component />
                </Suspense>
                <Suspense fallback={<p>second-fallback</p>}>
                  <second.Component />
                </Suspense>
                <Scripts />
              </RouterContextProvider>
            </body>
          </html>
        ),
      })
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      const state = { html: '' }

      try {
        // The shell ends with <Scripts />, whose last child is the boundary.
        await readUntil(reader, decoder, state, (html) => {
          const shell = html.indexOf('second-fallback')
          return shell >= 0 && html.indexOf('</script>', shell) >= 0
        })
        expect(state.html).toContain('first-fallback')

        first.resolve()
        await readUntil(reader, decoder, state, (html) => {
          const result = html.indexOf('first-resolved')
          return result >= 0 && html.indexOf('</script>', result) >= 0
        })

        const firstResult = state.html.indexOf('first-resolved')
        const reactPatchEnd =
          state.html.indexOf('</script>', firstResult) + '</script>'.length
        const reactPatch = state.html.slice(firstResult, reactPatchEnd)
        expect(reactPatch).toContain('<script')
        expect(reactPatch.endsWith('</script>')).toBe(true)
        expect(state.html).not.toContain('second-resolved')
        expect(state.html).not.toContain('</body></html>')

        resolveRouterData('late-react19-router-value')
        await readUntil(reader, decoder, state, (html) =>
          html.includes('late-react19-router-value'),
        )

        // The second Suspense boundary still keeps React's renderer open. The
        // router batch can therefore only have used React's completed patch
        // script as its insertion point.
        const routerValue = state.html.indexOf('late-react19-router-value')
        expect(routerValue).toBeGreaterThan(reactPatchEnd)
        expect(state.html).not.toContain('second-resolved')
        expect(state.html).not.toContain('</body></html>')

        second.resolve()
        for (;;) {
          const { done, value } = await readWithTimeout(reader)
          if (done) {
            break
          }
          state.html += decoder.decode(value, { stream: true })
        }
        state.html += decoder.decode()

        expect(state.html).toContain('second-resolved')
        expect(state.html.endsWith('</body></html>')).toBe(true)
        expect(router.serverSsr).toBeUndefined()
        expect(renderToPipeableStream).toHaveBeenCalledTimes(
          path === 'pipeable' ? 1 : 0,
        )
      } finally {
        first.resolve()
        second.resolve()
        requestController.abort(new Error('test-complete'))
        await reader.cancel().catch(() => {})
      }
    })
  },
)
