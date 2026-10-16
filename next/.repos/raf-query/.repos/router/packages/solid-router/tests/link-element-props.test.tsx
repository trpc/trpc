import * as Solid from 'solid-js'
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
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RegisteredRouter } from '../src'

const disposers: Array<() => void> = []
afterEach(() => {
  cleanup()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

function renderLinks(
  Links: Solid.Component,
  options: { preload?: 'intent'; preloadDelay?: number } = {},
) {
  const history = createMemoryHistory({ initialEntries: ['/'] })
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
      createRoute({ getParentRoute: () => root, path: '/other' }),
    ]),
    history,
    scrollRestoration: false,
    defaultPreload: options.preload ?? false,
    defaultPreloadDelay: options.preloadDelay ?? 0,
  })
  render(() => <RouterProvider router={router} />)
  return router as unknown as RegisteredRouter
}

test('static and reactive element props reach the anchor', async () => {
  const [title, setTitle] = Solid.createSignal<string | undefined>('first')
  const [label, setLabel] = Solid.createSignal('Go to target')
  const onKeyDown = vi.fn()
  renderLinks(() => (
    <>
      <Link
        to="/target"
        data-testid="static"
        data-flag
        aria-label="Static target"
        id="static-link"
        rel="noopener"
        target="_blank"
        tabIndex={3}
        onKeyDown={onKeyDown}
      >
        Static
      </Link>
      <Link
        to="/target"
        data-testid="reactive"
        title={title()}
        aria-label={label()}
      >
        Reactive
      </Link>
    </>
  ))

  const staticLink = await screen.findByTestId('static')
  expect(staticLink.tagName).toBe('A')
  expect(staticLink).toHaveAttribute('href', '/target')
  expect(staticLink).toHaveAttribute('data-flag')
  expect(staticLink).toHaveAttribute('aria-label', 'Static target')
  expect(staticLink).toHaveAttribute('id', 'static-link')
  expect(staticLink).toHaveAttribute('rel', 'noopener')
  expect(staticLink).toHaveAttribute('target', '_blank')
  expect(staticLink).toHaveAttribute('tabindex', '3')
  fireEvent.keyDown(staticLink, { key: 'Enter' })
  expect(onKeyDown).toHaveBeenCalledOnce()

  const reactiveLink = screen.getByTestId('reactive')
  expect(reactiveLink).toHaveAttribute('title', 'first')
  expect(reactiveLink).toHaveAttribute('aria-label', 'Go to target')
  setTitle('second')
  setLabel('Target')
  await waitFor(() => {
    expect(reactiveLink).toHaveAttribute('title', 'second')
    expect(reactiveLink).toHaveAttribute('aria-label', 'Target')
  })
  setTitle(undefined)
  await waitFor(() => expect(reactiveLink).not.toHaveAttribute('title'))
  expect(reactiveLink).toHaveAttribute('href', '/target')
})

test('element props spread into a Link apply, also when their keys change', async () => {
  const [extra, setExtra] = Solid.createSignal<Record<string, string>>({
    'data-a': 'a',
  })
  renderLinks(() => (
    <Link to="/target" {...extra()} data-testid="spread">
      Spread
    </Link>
  ))
  const link = await screen.findByTestId('spread')
  expect(link).toHaveAttribute('data-a', 'a')
  setExtra({ 'data-b': 'b' })
  await waitFor(() => {
    expect(link).not.toHaveAttribute('data-a')
    expect(link).toHaveAttribute('data-b', 'b')
  })
  expect(link).toHaveAttribute('href', '/target')
})

test('element state attributes apply where the Link leaves them unset', async () => {
  const router = renderLinks(() => (
    <Link
      to="/target"
      aria-current="step"
      data-status="custom"
      role="button"
      data-testid="attributes"
    >
      {(state) => (state.isActive ? 'Active' : 'Inactive')}
    </Link>
  ))
  const link = await screen.findByTestId('attributes')
  expect(link).toHaveAttribute('aria-current', 'step')
  expect(link).toHaveAttribute('data-status', 'custom')
  expect(link).toHaveAttribute('role', 'button')
  expect(link).toHaveTextContent('Inactive')

  await router.navigate({ to: '/target' })
  await waitFor(() => {
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).toHaveAttribute('data-status', 'active')
    expect(link).toHaveTextContent('Active')
  })
  expect(link).toHaveAttribute('role', 'button')

  await router.navigate({ to: '/' })
  await waitFor(() => {
    expect(link).toHaveAttribute('aria-current', 'step')
    expect(link).toHaveAttribute('data-status', 'custom')
    expect(link).toHaveTextContent('Inactive')
  })
})

test('state props add and remove arbitrary props, over element props of the same name', async () => {
  const router = renderLinks(() => (
    <Link
      to="/target"
      data-testid="state"
      title="base"
      activeProps={{
        class: 'on',
        style: { color: 'red' },
        title: 'active title',
        'data-active': 'yes',
        'aria-label': 'Current target',
      }}
      inactiveProps={{ class: 'off', 'data-inactive': '' }}
    >
      State
    </Link>
  ))
  const link = await screen.findByTestId('state')
  expect(link).toHaveClass('off')
  expect(link).toHaveAttribute('data-inactive', '')
  expect(link).toHaveAttribute('title', 'base')
  expect(link).not.toHaveAttribute('data-active')
  expect(link).not.toHaveAttribute('aria-current')

  await router.navigate({ to: '/target' })
  await waitFor(() => {
    expect(link).toHaveClass('on')
    expect(link).not.toHaveClass('off')
    expect(link.style.color).toBe('red')
    expect(link).toHaveAttribute('title', 'active title')
    expect(link).toHaveAttribute('data-active', 'yes')
    expect(link).toHaveAttribute('aria-label', 'Current target')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).not.toHaveAttribute('data-inactive')
  })

  await router.navigate({ to: '/' })
  await waitFor(() => {
    expect(link).toHaveClass('off')
    expect(link).not.toHaveClass('on')
    expect(link.style.color).toBe('')
    expect(link).toHaveAttribute('title', 'base')
    expect(link).not.toHaveAttribute('data-active')
    expect(link).not.toHaveAttribute('aria-label')
    expect(link).not.toHaveAttribute('aria-current')
    expect(link).toHaveAttribute('data-inactive', '')
  })
})

test('user handlers run before the Link and can prevent its navigation', async () => {
  const calls: Array<string> = []
  const [prevent, setPrevent] = Solid.createSignal(true)
  const router = renderLinks(() => (
    <Link
      to="/target"
      onClick={(event) => {
        calls.push(`click:${router.state.location.pathname}`)
        if (prevent()) {
          event.preventDefault()
        }
      }}
    >
      Target
    </Link>
  ))
  const link = await screen.findByRole('link', { name: 'Target' })
  fireEvent.click(link)
  expect(calls).toEqual(['click:/'])
  await Promise.resolve()
  expect(router.state.location.pathname).toBe('/')

  setPrevent(false)
  fireEvent.click(link)
  expect(calls).toEqual(['click:/', 'click:/'])
  await waitFor(() => expect(router.state.location.pathname).toBe('/target'))
})

test('intent preloading follows the user handlers of each event', async () => {
  const onMouseEnter = vi.fn()
  const onFocus = vi.fn()
  const onTouchStart = vi.fn()
  // `mouseover` is cancelable: preventing it skips the Link's preload.
  const onMouseOver = vi.fn((event: MouseEvent) => event.preventDefault())
  const router = renderLinks(
    () => (
      <Link
        to="/target"
        onMouseEnter={onMouseEnter}
        onFocus={onFocus}
        onTouchStart={onTouchStart}
        onMouseOver={onMouseOver}
      >
        Target
      </Link>
    ),
    { preload: 'intent' },
  )
  const preloadRoute = vi.spyOn(router, 'preloadRoute')
  const link = await screen.findByRole('link', { name: 'Target' })

  fireEvent.mouseOver(link)
  expect(onMouseOver).toHaveBeenCalledOnce()
  expect(preloadRoute).not.toHaveBeenCalled()

  fireEvent.mouseEnter(link)
  expect(onMouseEnter).toHaveBeenCalledOnce()
  expect(preloadRoute).toHaveBeenCalledOnce()
  expect(preloadRoute.mock.calls[0]?.[0]).toMatchObject({ to: '/target' })

  fireEvent.focus(link)
  expect(onFocus).toHaveBeenCalledOnce()
  expect(preloadRoute).toHaveBeenCalledTimes(2)

  fireEvent.touchStart(link)
  expect(onTouchStart).toHaveBeenCalledOnce()
  expect(preloadRoute).toHaveBeenCalledTimes(3)
})

test('leaving a Link cancels a delayed intent preload after the user handlers', async () => {
  vi.useFakeTimers()
  try {
    const onMouseLeave = vi.fn()
    const onBlur = vi.fn()
    const router = renderLinks(
      () => (
        <Link to="/target" onMouseLeave={onMouseLeave} onBlur={onBlur}>
          Target
        </Link>
      ),
      { preload: 'intent', preloadDelay: 50 },
    )
    const preloadRoute = vi.spyOn(router, 'preloadRoute')
    await vi.runAllTimersAsync()
    const link = screen.getByRole('link', { name: 'Target' })

    fireEvent.mouseEnter(link)
    fireEvent.mouseLeave(link)
    expect(onMouseLeave).toHaveBeenCalledOnce()
    fireEvent.focus(link)
    fireEvent.blur(link)
    expect(onBlur).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(100)
    expect(preloadRoute).not.toHaveBeenCalled()

    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(100)
    expect(preloadRoute).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})

test('a user ref receives the anchor once', async () => {
  const ref = vi.fn()
  const router = renderLinks(() => (
    <Link to="/target" ref={ref} data-testid="ref">
      Ref
    </Link>
  ))
  const link = await screen.findByTestId('ref')
  expect(ref).toHaveBeenCalledOnce()
  expect(ref).toHaveBeenCalledWith(link)
  await router.navigate({ to: '/target' })
  await waitFor(() => expect(link).toHaveAttribute('data-status', 'active'))
  await router.navigate({ to: '/other' })
  await waitFor(() => expect(link).not.toHaveAttribute('data-status'))
  expect(ref).toHaveBeenCalledOnce()
})

test('a disabled Link renders no href and does not navigate', async () => {
  const onClick = vi.fn()
  const [disabled, setDisabled] = Solid.createSignal(true)
  const router = renderLinks(() => (
    <Link
      to="/target"
      disabled={disabled()}
      onClick={onClick}
      data-testid="disabled"
    >
      Disabled
    </Link>
  ))
  const link = await screen.findByTestId('disabled')
  expect(link).not.toHaveAttribute('href')
  expect(link).toHaveAttribute('role', 'link')
  expect(link).toHaveAttribute('aria-disabled', 'true')
  expect((link as any).disabled).toBe(true)
  // Solid skips delegated handlers of a disabled element, the user's too.
  fireEvent.click(link)
  expect(onClick).not.toHaveBeenCalled()
  await Promise.resolve()
  expect(router.state.location.pathname).toBe('/')

  setDisabled(false)
  await waitFor(() => expect(link).toHaveAttribute('href', '/target'))
  expect(link).not.toHaveAttribute('role')
  expect(link).not.toHaveAttribute('aria-disabled')
  expect((link as any).disabled).toBe(false)
  fireEvent.click(link)
  expect(onClick).toHaveBeenCalledOnce()
  await waitFor(() => expect(router.state.location.pathname).toBe('/target'))
})

test('a custom component receives the element props, state and handlers', async () => {
  const ref = vi.fn()
  const onClick = vi.fn()
  const CustomLink = createLink((props: Solid.ComponentProps<'a'>) => (
    <a {...props} data-custom />
  ))
  const router = renderLinks(() => (
    <CustomLink
      to="/target"
      ref={ref}
      onClick={onClick}
      title="custom"
      activeProps={{ 'data-on': '' }}
    >
      Custom
    </CustomLink>
  ))
  const link = await screen.findByRole('link', { name: 'Custom' })
  expect(link).toHaveAttribute('data-custom')
  expect(link).toHaveAttribute('href', '/target')
  expect(link).toHaveAttribute('title', 'custom')
  expect(link).not.toHaveAttribute('data-on')
  expect(ref).toHaveBeenCalledOnce()
  expect(ref).toHaveBeenCalledWith(link)
  fireEvent.click(link)
  expect(onClick).toHaveBeenCalledOnce()
  await waitFor(() => expect(router.state.location.pathname).toBe('/target'))
  await waitFor(() => {
    expect(link).toHaveAttribute('data-status', 'active')
    expect(link).toHaveAttribute('data-on', '')
  })
})

test('state props added later through a spread apply their extra props', async () => {
  const [extra, setExtra] = Solid.createSignal<Record<string, unknown>>({})
  const router = renderLinks(() => (
    <Link to="/target" data-testid="late" {...extra()}>
      Late
    </Link>
  ))
  const link = await screen.findByTestId('late')
  await router.navigate({ to: '/target' })
  await waitFor(() => expect(link).toHaveAttribute('data-status', 'active'))
  setExtra({ activeProps: { title: 'active title', 'data-active': 'yes' } })
  await waitFor(() => {
    expect(link).toHaveAttribute('title', 'active title')
    expect(link).toHaveAttribute('data-active', 'yes')
  })
})

test("the Link's handlers follow the element's own listeners", async () => {
  const log: Array<string> = []
  const onclick = vi.fn()
  const router = renderLinks(() => (
    <Link
      to="/target"
      onFocus={() => log.push('link')}
      on:focus={() => log.push('element')}
      onclick={onclick}
    >
      Target
    </Link>
  ))
  const link = await screen.findByRole('link', { name: 'Target' })
  fireEvent.focus(link)
  expect(log).toEqual(['element', 'link'])
  // A lowercase delegated handler is replaced by the Link's own.
  fireEvent.click(link)
  await waitFor(() => expect(router.state.location.pathname).toBe('/target'))
  expect(onclick).not.toHaveBeenCalled()
})
