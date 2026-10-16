import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  useLinkProps,
} from '../src'

afterEach(cleanup)

test.each([false, true])(
  'preserves caller click handlers across destination changes (cancel=%s)',
  (cancel) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
      isServer: false,
      rewrite: {
        output: ({ url }) =>
          url.pathname === '/external'
            ? new URL('https://other.example/rewritten')
            : url,
      },
    })
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onClick = vi.fn((event: React.MouseEvent) => {
      if (cancel) {
        event.preventDefault()
      }
    })
    const content = (to: string) => (
      <RouterContextProvider router={router}>
        <Link to={to} onClick={onClick}>
          Target
        </Link>
      </RouterContextProvider>
    )
    try {
      const view = render(content('/safe'))
      const anchor = view.getByText('Target')
      for (const [to, internal] of [
        ['/safe', true],
        ['https://other.example/', false],
        ['/external', false],
        ['javascript:blocked()', false],
        ['/next', true],
      ] as const) {
        onClick.mockClear()
        navigate.mockClear()
        view.rerender(content(to))
        expect(view.getByText('Target')).toBe(anchor)
        let intercepted: boolean | undefined
        const preventNativeNavigation = (event: Event) => {
          intercepted = event.defaultPrevented
          event.preventDefault()
        }
        document.addEventListener('click', preventNativeNavigation)
        try {
          fireEvent.click(anchor)
        } finally {
          document.removeEventListener('click', preventNativeNavigation)
        }
        expect(onClick).toHaveBeenCalledOnce()
        expect(intercepted).toBe(cancel || internal)
        expect(navigate).toHaveBeenCalledTimes(internal && !cancel ? 1 : 0)
      }
    } finally {
      cleanup()
      navigate.mockRestore()
      warn.mockRestore()
    }
  },
)

test.each(['https://other.example/', 'javascript:blocked()'])(
  'cancels delayed internal preloads when the destination changes to %s',
  (destination) => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })
    const preload = vi
      .spyOn(router, 'preloadRoute')
      .mockResolvedValue(undefined)
    const content = (to: string) => (
      <RouterContextProvider router={router}>
        <Link to={to} preload="intent" preloadDelay={50}>
          Target
        </Link>
      </RouterContextProvider>
    )
    try {
      const view = render(content('/old'))
      fireEvent.mouseEnter(view.getByText('Target'))
      view.rerender(content(destination))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(preload).not.toHaveBeenCalled()
      view.rerender(content('/next'))
      fireEvent.mouseEnter(view.getByText('Target'))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(preload).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ to: '/next' }),
      )
    } finally {
      cleanup()
      warn.mockRestore()
      vi.useRealTimers()
    }
  },
)

test.each(['onClick', 'onFocus', 'onMouseEnter', 'onTouchStart'] as const)(
  '%s respects cancellation before and after the user handler',
  (eventName) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
      isServer: false,
    })
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const preload = vi
      .spyOn(router, 'preloadRoute')
      .mockResolvedValue(undefined)
    const userHandler = vi.fn((event: React.SyntheticEvent) => {
      if (cancelInUserHandler) {
        event.preventDefault()
      }
    })
    let cancelInUserHandler = false
    const { result } = renderHook(
      () =>
        useLinkProps({
          to: '/target',
          preload: 'intent',
          preloadDelay: 0,
          [eventName]: userHandler,
        }),
      {
        wrapper: ({ children }) => (
          <RouterContextProvider router={router}>
            {children}
          </RouterContextProvider>
        ),
      },
    )
    const internalHandler = eventName === 'onClick' ? navigate : preload
    const anchor = document.createElement('a')
    for (const initiallyPrevented of [true, false]) {
      for (const cancel of [true, false]) {
        cancelInUserHandler = cancel
        userHandler.mockClear()
        internalHandler.mockClear()
        const event = {
          defaultPrevented: initiallyPrevented,
          preventDefault() {
            this.defaultPrevented = true
          },
          currentTarget: anchor,
          button: 0,
        }
        result.current[eventName]!(
          event as unknown as React.MouseEvent<HTMLAnchorElement> &
            React.TouchEvent<HTMLAnchorElement> &
            React.FocusEvent<HTMLAnchorElement>,
        )
        expect(userHandler).toHaveBeenCalledTimes(initiallyPrevented ? 0 : 1)
        expect(internalHandler).toHaveBeenCalledTimes(
          initiallyPrevented || cancel ? 0 : 1,
        )
      }
    }
  },
)
