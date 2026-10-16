import { resolve } from 'node:path'
import { Suspense, lazy } from 'solid-js'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createControlledPromise } from '@tanstack/router-core'
import { build } from 'vite'
import solid from 'vite-plugin-solid'
import {
  CatchBoundary,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('keeps the Outlet diagnostic context after a route render throws', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      throw new Error('Render failed')
    },
    errorComponent: () => (
      <>
        <span>Render fallback</span>
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)

  expect(await screen.findByText('Render fallback')).toBeInTheDocument()
  expect(warn).toHaveBeenCalledWith(
    'Warning: An <Outlet /> was rendered inside a errorComponent. <Outlet /> should only be rendered inside a route component.',
  )
})

test('keeps a lazy error fallback inside its own Suspense boundary', async () => {
  const renderError = new Error('Render failed')
  const onCatch = vi.fn()
  const ErrorFallback = (props: ErrorComponentProps) => (
    <span>Lazy fallback: {props.error.message}</span>
  )
  const pending = createControlledPromise<{ default: typeof ErrorFallback }>()
  const importer = vi.fn(() => pending)
  const LazyError = lazy(importer)
  onTestFinished(() => pending.resolve({ default: ErrorFallback }))

  function Broken(): never {
    throw renderError
  }

  render(() => (
    <Suspense fallback={<span>Outer pending</span>}>
      <span>Ready shell</span>
      <CatchBoundary
        getResetKey={() => 0}
        errorComponent={(props) => <LazyError {...props} />}
        onCatch={onCatch}
      >
        <Broken />
      </CatchBoundary>
    </Suspense>
  ))

  expect(importer).toHaveBeenCalledOnce()
  expect(screen.getByText('Ready shell')).toBeInTheDocument()
  expect(screen.queryByText('Outer pending')).not.toBeInTheDocument()
  expect(
    screen.queryByText('Lazy fallback: Render failed'),
  ).not.toBeInTheDocument()
  expect(onCatch).toHaveBeenCalledOnce()
  expect(onCatch).toHaveBeenCalledWith(renderError)

  pending.resolve({ default: ErrorFallback })

  expect(
    await screen.findByText('Lazy fallback: Render failed'),
  ).toBeInTheDocument()
  expect(screen.getByText('Ready shell')).toBeInTheDocument()
  expect(screen.queryByText('Outer pending')).not.toBeInTheDocument()
})

test('removes the diagnostic context from the production bundle', async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [solid({ dev: false, hot: false })],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: true,
      lib: {
        entry: resolve(import.meta.dirname, '../src/CatchBoundary.tsx'),
        formats: ['es'],
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

  expect(code).toContain('CatchBoundary')
  expect(code).toContain('Suspense')
  expect(code).not.toContain('.Provider')
})
