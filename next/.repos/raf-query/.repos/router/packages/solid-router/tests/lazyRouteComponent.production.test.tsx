import { resolve } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import * as Solid from 'solid-js'
import * as SolidWeb from 'solid-js/web'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { build } from 'vite'
import solid from 'vite-plugin-solid'
import type { lazyRouteComponent } from '../src/lazyRouteComponent'

let productionLazyRouteComponent: typeof lazyRouteComponent

beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [solid({ dev: false, hot: false })],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: true,
      lib: {
        entry: resolve(import.meta.dirname, '../src/lazyRouteComponent.tsx'),
        formats: ['cjs'],
      },
      rollupOptions: { external: ['solid-js', 'solid-js/web'] },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const code = outputs
    .flatMap((output) => {
      if (!('output' in output)) {
        throw new Error('Expected an in-memory build result')
      }
      return output.output.flatMap((chunk) =>
        chunk.type === 'chunk' ? [chunk.code] : [],
      )
    })
    .join('\n')
  const exports: { lazyRouteComponent?: typeof lazyRouteComponent } = {}

  // Use the test's Solid owner graph with the production-compiled router code.
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'solid-js') {
      return Solid
    }
    if (id === 'solid-js/web') {
      return SolidWeb
    }
    throw new Error(`Unexpected external module: ${id}`)
  }, exports)

  expect(exports.lazyRouteComponent).toBeTypeOf('function')
  productionLazyRouteComponent = exports.lazyRouteComponent!
}, 60_000)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test.each([
  { exportName: undefined, preload: false },
  { exportName: 'Missing', preload: false },
  { exportName: undefined, preload: true },
  { exportName: 'Missing', preload: true },
])(
  'a missing $exportName export renders blank with preload=$preload in production',
  async ({ exportName, preload }) => {
    const importer = vi.fn().mockResolvedValue({ Other: () => null })
    const Page = productionLazyRouteComponent(importer, exportName as never)
    const onError = vi.fn(() => <span>Render failed</span>)
    if (preload) {
      await Page.preload?.()
    }

    const { container } = render(() => (
      <Solid.ErrorBoundary fallback={onError}>
        <Solid.Suspense fallback={<span>Loading component</span>}>
          <Page />
        </Solid.Suspense>
      </Solid.ErrorBoundary>
    ))

    await waitFor(() =>
      expect(screen.queryByText('Loading component')).not.toBeInTheDocument(),
    )
    // Finish queued lazy-import continuations before checking for render errors.
    await setImmediate()
    expect(importer).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  },
)

test('a preloaded production component renders synchronously with its props', async () => {
  const importer = vi.fn(() =>
    Promise.resolve({
      Page: (props: { label: string }) => <span>{props.label}</span>,
    }),
  )
  const Page = productionLazyRouteComponent(importer, 'Page')
  await Page.preload?.()

  render(() => (
    <Solid.Suspense fallback={<span>Loading component</span>}>
      <Page label="Ready component" />
    </Solid.Suspense>
  ))

  expect(screen.getByText('Ready component')).toBeInTheDocument()
  expect(screen.queryByText('Loading component')).not.toBeInTheDocument()
  expect(importer).toHaveBeenCalledOnce()
  expect(Page.preload).toBeUndefined()
})

test('a rejected production import reaches the error boundary', async () => {
  const importer = vi
    .fn()
    .mockRejectedValue(new Error('component download failed'))
  const Page = productionLazyRouteComponent(importer)

  render(() => (
    <Solid.ErrorBoundary fallback={(error) => <span>{error.message}</span>}>
      <Solid.Suspense fallback={<span>Loading component</span>}>
        <Page />
      </Solid.Suspense>
    </Solid.ErrorBoundary>
  ))

  expect(
    await screen.findByText('component download failed'),
  ).toBeInTheDocument()
  expect(importer).toHaveBeenCalledOnce()
})
