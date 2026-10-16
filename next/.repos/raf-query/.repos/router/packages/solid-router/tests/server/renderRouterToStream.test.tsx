import { Suspense, createResource } from 'solid-js'
import { expect, test, vi } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { createMemoryHistory, createRootRoute, createRouter } from '../../src'
import { renderRouterToStream } from '../../src/ssr/renderRouterToStream'

test('the lifetime limit rejects a native Solid bot wait before its resource settles', async () => {
  let resolveResource!: (value: string) => void
  const resource = new Promise<string>((resolve) => {
    resolveResource = resolve
  })
  function Deferred() {
    const [value] = createResource(() => resource)
    return <span>{value()}</span>
  }

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: createRootRoute({ component: () => null }),
    isServer: true,
  })
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()

  const owner = router.serverSsr!
  const cleanup = vi.spyOn(owner, 'cleanup')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const request = new Request('http://localhost/', {
    headers: { 'User-Agent': 'Googlebot' },
  })
  const resolved = vi.fn()
  const rejected = vi.fn()
  vi.useFakeTimers()
  const pending = renderRouterToStream({
    request,
    router,
    responseHeaders: new Headers(),
    children: () => (
      <html>
        <body>
          <Suspense fallback={<p>waiting</p>}>
            <Deferred />
          </Suspense>
        </body>
      </html>
    ),
  }).then(resolved, rejected)

  try {
    await Promise.resolve()
    expect(resolved).not.toHaveBeenCalled()
    expect(rejected).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(rejected).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Stream lifetime exceeded' }),
    )
    expect(resolved).not.toHaveBeenCalled()
    expect(request.signal.aborted).toBe(false)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  } finally {
    // Solid exposes no cancellation handle for this resource. Let its native
    // renderer finish so the test does not retain unresolved component work.
    resolveResource('finished')
    await pending
    router.serverSsr?.cleanup()
    vi.useRealTimers()
    warn.mockRestore()
    cleanup.mockRestore()
  }
})
