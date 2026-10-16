import { ErrorBoundary, Suspense, createContext, useContext } from 'solid-js'
import { renderToString, renderToStringAsync } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lazyRouteComponent } from '../../src/lazyRouteComponent'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lazyRouteComponent (server)', () => {
  it.each([
    { exportName: undefined, preload: false },
    { exportName: 'Missing', preload: false },
    { exportName: undefined, preload: true },
    { exportName: 'Missing', preload: true },
  ])(
    'renders a missing $exportName export as blank in production (preload: $preload)',
    async ({ exportName, preload }) => {
      vi.stubEnv('NODE_ENV', 'production')
      const importer = vi.fn(
        (): Promise<Record<string, () => null>> =>
          Promise.resolve({
            Other: () => null,
          }),
      )
      const Page = lazyRouteComponent(importer, exportName)
      const onError = vi.fn()
      const onUnhandledRejection = vi.fn()
      process.on('unhandledRejection', onUnhandledRejection)

      try {
        if (preload) {
          await Page.preload?.()
        }

        const html = await renderToStringAsync(
          () => (
            <ErrorBoundary
              fallback={(error) => {
                onError(error)
                return <span>Render failed</span>
              }}
            >
              <Suspense fallback={<span>Pending</span>}>
                <Page />
              </Suspense>
            </ErrorBoundary>
          ),
          { timeoutMs: 1_000 },
        )
        // Promise rejection events are dispatched after the current microtasks.
        await new Promise<void>((resolve) => setImmediate(resolve))

        // Solid can retain hydration scripts and boundary comments without
        // rendering content for the missing component.
        const content = html
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
          .replace(/<!--[\s\S]*?-->/g, '')
        expect(content).toBe('')
        expect(importer).toHaveBeenCalledOnce()
        expect(onError).not.toHaveBeenCalled()
        expect(onUnhandledRejection).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', onUnhandledRejection)
      }
    },
  )

  it('renders a preloaded component synchronously and reuses its import', async () => {
    const importer = vi.fn(() =>
      Promise.resolve({
        default: (props: { label: string }) => <span>{props.label}</span>,
      }),
    )
    const Page = lazyRouteComponent(importer)
    const preload = Page.preload?.()
    await preload

    const html = renderToString(() => (
      <Suspense fallback={<span>Pending</span>}>
        <Page label="Preloaded page" />
      </Suspense>
    ))

    expect(html).toContain('Preloaded page')
    expect(html).not.toContain('Pending')
    expect(Page.preload?.()).toBe(preload)
    expect(importer).toHaveBeenCalledOnce()
  })

  it('renders synchronously after an awaited retry of a failed import', async () => {
    const failure = new Error('component download failed')
    const Content = (props: { label: string }) => <span>{props.label}</span>
    const importer = vi
      .fn<() => Promise<{ default: typeof Content }>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ default: Content })
    const Page = lazyRouteComponent(importer)

    await Page.preload?.()
    expect(() => renderToString(() => <Page label="First attempt" />)).toThrow(
      failure,
    )

    const retry = Page.preload?.()
    await retry
    const html = renderToString(() => <Page label="Recovered page" />)

    expect(html).toContain('Recovered page')
    expect(Page.preload?.()).toBe(retry)
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it.each([false, true])(
    'preserves provider context and component props (preload: %s)',
    async (preload) => {
      const Context = createContext('missing context')
      const importer = vi.fn(() =>
        Promise.resolve({
          Page: (props: { label: string; children: string }) => (
            <span>
              {useContext(Context)}:{props.label}:{props.children}
            </span>
          ),
        }),
      )
      const Page = lazyRouteComponent(importer, 'Page')
      if (preload) {
        await Page.preload?.()
      }

      const html = await renderToStringAsync(() => (
        <Context.Provider value="provided context">
          <Suspense fallback={<span>Pending</span>}>
            <Page label="page prop">child prop</Page>
          </Suspense>
        </Context.Provider>
      ))

      expect(html).toContain('provided context')
      expect(html).toContain('page prop')
      expect(html).toContain('child prop')
      expect(html).not.toContain('missing context')
      expect(html).not.toContain('Pending')
      expect(importer).toHaveBeenCalledOnce()
    },
  )
})
