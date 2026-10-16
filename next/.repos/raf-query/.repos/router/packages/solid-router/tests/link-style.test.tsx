import * as Solid from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const disposers: Array<() => void> = []
afterEach(() => {
  cleanup()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

function renderLinks(Links: Solid.Component) {
  const history = createMemoryHistory({ initialEntries: ['/target'] })
  disposers.push(history.destroy)
  const root = createRootRoute({
    component: () => (
      <>
        <Links />
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
    scrollRestoration: false,
    defaultPreload: false,
  })
  render(() => <RouterProvider router={router} />)
  return router
}

test.each([true, false])(
  'selected state props override element props but not routing options (active: %s)',
  async (active) => {
    const baseClick = vi.fn()
    const selectedClick = vi.fn((event: MouseEvent) => event.preventDefault())
    const unusedClick = vi.fn()
    const selectedRef = vi.fn()
    const stateProps = {
      ref: selectedRef,
      title: 'state title',
      onClick: selectedClick,
      class: 'state-class',
      style: { color: 'blue' },
      href: '/state-href',
      target: '_self',
      disabled: true,
    }
    renderLinks(() => (
      <Link
        to={active ? '/target' : '/'}
        target="_blank"
        title="base title"
        onClick={baseClick}
        class="base"
        style={{ color: 'red', 'margin-top': '2px' }}
        activeProps={active ? stateProps : { onClick: unusedClick }}
        inactiveProps={active ? { onClick: unusedClick } : stateProps}
      >
        Override
      </Link>
    ))
    const link = await screen.findByRole('link', { name: 'Override' })
    expect(selectedRef).toHaveBeenCalledOnce()
    expect(selectedRef.mock.calls[0]?.[0]).toBe(link)
    expect(link).toHaveAttribute('title', 'state title')
    expect(link).toHaveAttribute('href', active ? '/target' : '/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).not.toHaveAttribute('disabled')
    expect(link).toHaveClass('base', 'state-class')
    expect(link.style).toMatchObject({ color: 'blue', marginTop: '2px' })
    fireEvent.click(link)
    expect(selectedClick).toHaveBeenCalledOnce()
    expect(baseClick).not.toHaveBeenCalled()
    expect(unusedClick).not.toHaveBeenCalled()
  },
)

test('tracks additions to an initially empty state-only style store', async () => {
  const [style, setStyle] = createStore<Solid.JSX.CSSProperties>({})
  renderLinks(() => (
    <Link to="/target" activeProps={() => ({ style })}>
      Reactive
    </Link>
  ))
  const link = await screen.findByRole('link', { name: 'Reactive' })
  expect(link.style.color).toBe('')
  setStyle('color', 'red')
  await waitFor(() => expect(link.style.color).toBe('red'))
  setStyle('color', undefined)
  await waitFor(() => expect(link.style.color).toBe(''))
})

test('merges only the selected state and tracks reactive style properties', async () => {
  const [base, setBase] = createStore<Solid.JSX.CSSProperties>({
    color: 'red',
    'margin-top': '2px',
  })
  const [stateStyle, setStateStyle] = createStore<Solid.JSX.CSSProperties>({
    'background-color': 'white',
  })
  const [stateClass, setStateClass] = Solid.createSignal('selected')
  const active = vi.fn(() => ({
    class: stateClass(),
    style: stateStyle,
    title: 'selected',
  }))
  const inactive = vi.fn(() => ({
    class: 'idle',
    style: { color: 'gray' },
    title: 'idle',
  }))
  const router = renderLinks(() => (
    <Link
      to="/target"
      class="base"
      style={base}
      activeProps={active}
      inactiveProps={inactive}
    >
      Styled
    </Link>
  ))
  const link = await screen.findByRole('link', { name: 'Styled' })
  expect(link).toHaveClass('base', 'selected')
  expect(link.style).toMatchObject({
    color: 'red',
    marginTop: '2px',
    backgroundColor: 'white',
  })
  expect(link).toHaveAttribute('href', '/target')
  expect(inactive).not.toHaveBeenCalled()

  setBase('color', 'blue')
  setStateStyle('background-color', 'black')
  setStateClass('updated')
  await waitFor(() => {
    expect(link).toHaveClass('base', 'updated')
    expect(link.style).toMatchObject({
      color: 'blue',
      backgroundColor: 'black',
    })
  })

  await router.navigate({ to: '/' })
  await waitFor(() => {
    expect(link).toHaveClass('base', 'idle')
    expect(link).toHaveAttribute('title', 'idle')
    expect(link.style).toMatchObject({ color: 'gray', marginTop: '2px' })
    expect(link.style.backgroundColor).toBe('')
  })
  active.mockClear()
  inactive.mockClear()
  setBase('margin-top', '3px')
  await waitFor(() => expect(link.style).toMatchObject({ marginTop: '3px' }))
  expect(active).not.toHaveBeenCalled()
  expect(inactive).toHaveBeenCalled()

  await router.navigate({ to: '/target' })
  await waitFor(() => {
    expect(link).toHaveClass('base', 'updated')
    expect(link.style).toMatchObject({
      color: 'blue',
      backgroundColor: 'black',
    })
  })
})

test('switches between default and custom state props without stale attributes', async () => {
  const [custom, setCustom] = Solid.createSignal(false)
  const router = renderLinks(() => (
    <Link
      to="/target"
      activeProps={
        custom() ? { title: 'custom', style: { color: 'red' } } : undefined
      }
    >
      Defaults
    </Link>
  ))
  const link = await screen.findByRole('link', { name: 'Defaults' })
  expect(link).toHaveClass('active')
  setCustom(true)
  await waitFor(() => {
    expect(link).not.toHaveClass('active')
    expect(link).toHaveAttribute('title', 'custom')
    expect(link.style).toMatchObject({ color: 'red' })
  })
  setCustom(false)
  await waitFor(() => {
    expect(link).toHaveClass('active')
    expect(link).not.toHaveAttribute('title')
    expect(link.style.color).toBe('')
  })
  await router.navigate({ to: '/' })
  await waitFor(() => expect(link).not.toHaveClass('active'))
})
