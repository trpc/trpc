import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
} from '../src'

afterEach(cleanup)

function NearestMatch({ name }: { name: string }) {
  const match = useMatch({ strict: false })
  return <span data-testid={name}>{match.routeId}</span>
}

function createTestRouter(
  disableGlobalCatchBoundary = false,
  isServer = false,
) {
  const root = createRootRoute({
    shellComponent: function Shell({ children }) {
      const [count, setCount] = React.useState(0)
      return (
        <section data-testid="shell">
          <NearestMatch name="shell-match" />
          <button onClick={() => setCount(count + 1)}>Count {count}</button>
          {children}
        </section>
      )
    },
    component: () => (
      <>
        <NearestMatch name="root-match" />
        <Outlet />
      </>
    ),
  })
  const first = createRoute({
    getParentRoute: () => root,
    path: '/first',
    component: () => <NearestMatch name="leaf-match" />,
  })
  const second = createRoute({
    getParentRoute: () => root,
    path: '/second',
    component: () => <NearestMatch name="leaf-match" />,
  })
  return createRouter({
    routeTree: root.addChildren([first, second]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
    disableGlobalCatchBoundary,
    isServer,
  })
}

test.each([false, true])(
  'shell keeps nearest match context and state across navigation (global catch disabled: %s)',
  async (disableGlobalCatchBoundary) => {
    const router = createTestRouter(disableGlobalCatchBoundary)
    await router.load()
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('leaf-match')).toHaveTextContent('/first')
    expect(screen.getByTestId('shell-match')).toHaveTextContent('__root__')
    expect(screen.getByTestId('root-match')).toHaveTextContent('__root__')
    const shell = screen.getByTestId('shell')
    act(() => screen.getByRole('button').click())
    await act(async () => {
      await router.navigate({ to: '/second' })
    })
    expect(screen.getByTestId('leaf-match')).toHaveTextContent('/second')
    expect(screen.getByTestId('shell-match')).toHaveTextContent('__root__')
    expect(screen.getByTestId('shell')).toBe(shell)
    expect(screen.getByRole('button')).toHaveTextContent('Count 1')
  },
)

test('server shell and nested component read their nearest match context', async () => {
  const router = createTestRouter(false, true)
  await router.load()
  const html = renderToString(<RouterProvider router={router} />)
  expect(html).toContain('data-testid="shell-match">__root__')
  expect(html).toContain('data-testid="root-match">__root__')
  expect(html).toContain('data-testid="leaf-match">/first')
})
