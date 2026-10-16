import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  useLinkProps,
} from '../src'
import type { JSX } from 'solid-js'

afterEach(cleanup)

/**
 * Renders `links` in the root route next to `/source/$id`, `/target/$id` and
 * `/visible/$id`. `builds()` counts the destination builds that stringify a
 * search carrying a `build` key, so a reused location does not count.
 */
function setup(links: () => JSX.Element, initial = '/source/one') {
  const counted = vi.fn(defaultStringifySearch)
  const root = createRootRoute({
    component: () => (
      <>
        {links()}
        <Outlet />
      </>
    ),
  })
  const routes = ['/source/$id', '/target/$id', '/visible/$id'].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
    stringifySearch: (search) =>
      'build' in search ? counted(search) : defaultStringifySearch(search),
  })
  render(() => <RouterProvider router={router} />)
  const go = (id: string, extra?: object) =>
    router.navigate({ to: '/source/$id', params: { id }, ...extra } as any)
  return { router, go, builds: () => counted.mock.calls.length }
}

test('reuses a fixed destination across navigations', async () => {
  const { go, builds } = setup(() => (
    <Link
      to="/target/$id"
      params={{ id: 'fixed' }}
      search={{ build: 1 }}
      hash="details"
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/fixed?build=1#details')
  const initial = builds()

  await go('two')
  await go('three', { hash: 'x' })
  expect(link).toHaveAttribute('href', '/target/fixed?build=1#details')
  expect(builds()).toBe(initial)

  fireEvent.click(link)
  await screen.findByTestId('link')
  await vi.waitFor(() => expect(link).toHaveAttribute('data-status', 'active'))
  expect(link).toHaveAttribute('href', '/target/fixed?build=1#details')
})

test('rebuilds on a destination prop change, not a presentation prop change', async () => {
  const [id, setId] = createSignal('one')
  const [search, setSearch] = createSignal<Record<string, unknown>>({
    build: 1,
  })
  const [hash, setHash] = createSignal('first')
  const [to, setTo] = createSignal('/target/$id')
  const [cls, setCls] = createSignal('a')
  const { go, builds } = setup(() => (
    <Link
      to={to() as any}
      params={{ id: id() } as any}
      search={search() as any}
      hash={hash()}
      class={cls()}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/one?build=1#first')

  setId('two')
  expect(link).toHaveAttribute('href', '/target/two?build=1#first')
  setSearch({ build: 2 })
  expect(link).toHaveAttribute('href', '/target/two?build=2#first')
  setHash('second')
  expect(link).toHaveAttribute('href', '/target/two?build=2#second')
  setTo('/visible/$id')
  expect(link).toHaveAttribute('href', '/visible/two?build=2#second')

  const settled = builds()
  setCls('b')
  expect(link).toHaveClass('b')
  await go('three')
  expect(builds()).toBe(settled)
  expect(link).toHaveAttribute('href', '/visible/two?build=2#second')
})

test('store-backed params and search follow in-place mutations at the next navigation', async () => {
  const [params, setParams] = createStore({ id: 'one' })
  const [search, setSearch] = createStore({ build: 1 })
  const { go } = setup(() => (
    <Link to="/target/$id" params={params} search={search} data-testid="link" />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/one?build=1')

  setParams('id', 'two')
  setSearch('build', 2)
  // As before: a store read during a build is not tracked.
  expect(link).toHaveAttribute('href', '/target/one?build=1')
  await go('two')
  expect(link).toHaveAttribute('href', '/target/two?build=2')

  setParams('id', 'three')
  await go('three')
  expect(link).toHaveAttribute('href', '/target/three?build=2')

  // Clicks and preloads read the store as it is now.
  setParams('id', 'four')
  fireEvent.click(link)
  await vi.waitFor(() =>
    expect(screen.getByTestId('link')).toHaveAttribute('data-status', 'active'),
  )
  expect(link).toHaveAttribute('href', '/target/four?build=2')
})

test('does not re-read a store nested inside a plain object', async () => {
  // Only the prop value itself is checked for a store (one level). A store
  // nested inside a plain object is like any other object mutated in place:
  // pass a new object, or the store itself, to change the destination.
  const [filters, setFilters] = createStore({ page: 1 })
  const { go } = setup(() => (
    <Link
      to="/target/$id"
      params={{ id: 'fixed' }}
      search={{ build: 1, filters }}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  const href = link.getAttribute('href')
  setFilters('page', 2)
  await go('two')
  expect(link).toHaveAttribute('href', href!)
})

test('state store values are not reused either', async () => {
  const [state, setState] = createStore({ label: 'one' })
  const seen: Array<unknown> = []
  const { router } = setup(() => (
    <Link
      to="/target/$id"
      params={{ id: 'fixed' }}
      state={state as any}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  router.subscribe('onResolved', ({ toLocation }) => {
    seen.push((toLocation.state as any).label)
  })
  setState('label', 'two')
  fireEvent.click(link)
  await vi.waitFor(() => expect(seen).toEqual(['two']))
})

test('inherited params and search rebuild on every navigation', async () => {
  const { go } = setup(() => (
    <Link
      to="/target/$id"
      params={true as any}
      search={true as any}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/one')
  await go('two', { search: { page: 2 } })
  expect(link).toHaveAttribute('href', '/target/two?page=2')
  await go('three', { search: { page: 3 } })
  expect(link).toHaveAttribute('href', '/target/three?page=3')
})

test('masked destinations follow their inputs', async () => {
  const [params, setParams] = createStore({ id: 'one' })
  const [hash, setHash] = createSignal('a')
  const { go } = setup(() => (
    <>
      <Link
        to="/target/$id"
        params={{ id: 'fixed' }}
        mask={{ to: '/visible/$id', params }}
        data-testid="store-mask"
      />
      <Link
        to="/target/$id"
        params={{ id: 'fixed' }}
        mask={{ to: '/visible/$id', params: true, hash: hash() } as any}
        data-testid="inherited-mask"
      />
    </>
  ))
  const storeMask = await screen.findByTestId('store-mask')
  const inheritedMask = screen.getByTestId('inherited-mask')
  expect(storeMask).toHaveAttribute('href', '/visible/one')
  expect(inheritedMask).toHaveAttribute('href', '/visible/one#a')
  setParams('id', 'two')
  await go('two')
  expect(storeMask).toHaveAttribute('href', '/visible/two')
  expect(inheritedMask).toHaveAttribute('href', '/visible/two#a')
  setHash('b')
  expect(inheritedMask).toHaveAttribute('href', '/visible/two#b')
})

test('switches a mounted Link between plain and store-backed inputs', async () => {
  const [live, setLive] = createSignal(false)
  const [params, setParams] = createStore({ id: 'one' })
  const [search, setSearch] = createStore({ build: 1 })
  const plainParams = { id: 'fixed' }
  const plainSearch = { build: 0 }
  const { go, builds } = setup(() => (
    <Link
      to="/target/$id"
      params={live() ? params : plainParams}
      search={live() ? search : plainSearch}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/fixed?build=0')

  setLive(true)
  expect(link).toHaveAttribute('href', '/target/one?build=1')
  setParams('id', 'two')
  setSearch('build', 2)
  await go('two')
  expect(link).toHaveAttribute('href', '/target/two?build=2')

  setLive(false)
  expect(link).toHaveAttribute('href', '/target/fixed?build=0')
  const plain = builds()
  await go('three')
  expect(builds()).toBe(plain)

  setLive(true)
  setParams('id', 'three')
  await go('four')
  expect(link).toHaveAttribute('href', '/target/three?build=2')
})

test('never mutates frozen caller options', async () => {
  const params = Object.freeze({ id: 'fixed' })
  const options = Object.freeze({
    to: '/target/$id',
    params,
    search: Object.freeze({ build: 1 }),
    'data-testid': 'frozen',
  })
  const Links = () => {
    const frozen = useLinkProps(options as any)
    return <a {...frozen} />
  }
  const result = setup(() => <Links />)
  const frozen = await screen.findByTestId('frozen')
  expect(frozen).toHaveAttribute('href', '/target/fixed?build=1')
  await result.go('two')
  expect(frozen).toHaveAttribute('href', '/target/fixed?build=1')
  expect(Object.keys(options)).toEqual([
    'to',
    'params',
    'search',
    'data-testid',
  ])
  expect(Object.keys(params)).toEqual(['id'])

  fireEvent.click(frozen)
  await vi.waitFor(() =>
    expect(result.router.state.location.pathname).toBe('/target/fixed'),
  )
})

test.each([
  ['inherited state', true],
  ['a state updater', (prev: any) => ({ label: `${prev.label}!` })],
])(
  'a click after a same-href, state-only navigation uses the new state (%s)',
  async (_, state) => {
    const { router, go } = setup(() => (
      <Link
        to="/target/$id"
        params={{ id: 'fixed' }}
        state={state as any}
        data-testid="link"
      />
    ))
    const link = await screen.findByTestId('link')
    await go('one', { state: { label: 'next' } })
    expect(router.state.location.state).toMatchObject({ label: 'next' })
    fireEvent.click(link)
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/target/fixed'),
    )
    expect(router.state.location.state).toMatchObject({
      label: state === true ? 'next' : 'next!',
    })
  },
)

test('function children render once per active state change', async () => {
  const calls: Array<boolean> = []
  const { go } = setup(() => (
    <Link to="/target/$id" params={{ id: 'fixed' }} data-testid="link">
      {({ isActive }) => {
        calls.push(isActive)
        return isActive ? 'active' : 'inactive'
      }}
    </Link>
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveTextContent('inactive')
  await go('two')
  await go('three')
  expect(calls).toEqual([false])
  fireEvent.click(link)
  await vi.waitFor(() => expect(link).toHaveTextContent(/^active$/))
  expect(calls).toEqual([false, true])
})

test('calls a user ref once per element across state changes', async () => {
  const refs: Array<Element> = []
  const [id, setId] = createSignal('one')
  const { go } = setup(() => (
    <Link
      to="/target/$id"
      params={{ id: id() } as any}
      ref={(el: HTMLAnchorElement) => refs.push(el)}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  setId('two')
  expect(link).toHaveAttribute('href', '/target/two')
  await go('two')
  fireEvent.click(link)
  await vi.waitFor(() => expect(link).toHaveAttribute('data-status', 'active'))
  expect(refs).toEqual([link])
})

test('refreshes history formatting even when the destination is reused', async () => {
  let suffix = 'old'
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="formatted" />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory({ initialEntries: ['/source/one'] })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: {
      ...history,
      get location() {
        return history.location
      },
      createHref: (href) => `${href}#${suffix}`,
    },
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByTestId('formatted')
  expect(link).toHaveAttribute('href', '/target#old')
  suffix = 'new'
  await router.navigate({ to: '/source/$id', params: { id: 'two' } })
  expect(link).toHaveAttribute('href', '/target#new')
})
