import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

async function createPostsRouter() {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/posts/$postId' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
  })
  await router.load()
  return router
}

test('a parent re-render with equal props does not re-render the Link', async () => {
  let hostRenders = 0
  const Host = React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
    (props, ref) => {
      hostRenders++
      return <a {...props} ref={ref} />
    },
  )
  const CustomLink = createLink(Host)
  const router = await createPostsRouter()

  let rerender = () => {}
  let setPostId: React.Dispatch<React.SetStateAction<number>> = () => {}
  function Parent() {
    const [, setTick] = React.useState(0)
    const [postId, set] = React.useState(1)
    rerender = () => setTick((tick) => tick + 1)
    setPostId = set
    return (
      <RouterContextProvider router={router}>
        <CustomLink
          to="/posts/$postId"
          params={{ postId: String(postId) }}
          activeProps={{ className: 'current' }}
          preload={false}
        >
          Post
        </CustomLink>
      </RouterContextProvider>
    )
  }
  const view = render(<Parent />)
  const anchor = view.getByText('Post')
  expect(anchor).toHaveAttribute('href', '/posts/1')
  expect(anchor).toHaveClass('current')
  const rendersAfterMount = hostRenders

  // Same props, new inline objects: the memoized Link is skipped.
  act(() => rerender())
  expect(hostRenders).toBe(rendersAfterMount)

  // A changed destination renders again.
  act(() => setPostId(2))
  expect(hostRenders).toBe(rendersAfterMount + 1)
  expect(anchor).toHaveAttribute('href', '/posts/2')
  expect(anchor).not.toHaveClass('current')
})

test('element props are compared by reference: new children re-render, a cyclic prop does not throw', async () => {
  let hostRenders = 0
  const Host = React.forwardRef<
    HTMLAnchorElement,
    React.ComponentProps<'a'> & { payload?: object }
  >(({ payload: _payload, ...props }, ref) => {
    hostRenders++
    return <a {...props} ref={ref} />
  })
  const CustomLink = createLink(Host)
  const router = await createPostsRouter()

  let rerender = () => {}
  function Parent() {
    const [, setTick] = React.useState(0)
    rerender = () => setTick((tick) => tick + 1)
    // A new cyclic object per render: deep-comparing it would never return.
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    return (
      <RouterContextProvider router={router}>
        <CustomLink
          to="/posts/$postId"
          params={{ postId: '1' }}
          payload={cyclic}
        >
          <span>Post</span>
        </CustomLink>
      </RouterContextProvider>
    )
  }
  render(<Parent />)
  expect(hostRenders).toBe(1)

  // Equal router options, but `children` is a new element and `payload` a
  // new object, so the Link renders again instead of comparing them deeply.
  act(() => rerender())
  expect(hostRenders).toBe(2)
})

test('a forwarded callback ref is notified once per element, not per Link render', async () => {
  const router = await createPostsRouter()
  const ref = vi.fn<(element: HTMLAnchorElement | null) => void>()

  const view = render(
    <RouterContextProvider router={router}>
      <Link ref={ref} to="/posts/$postId" params={{ postId: '1' }}>
        Post
      </Link>
    </RouterContextProvider>,
  )
  const anchor = view.getByText('Post')
  expect(ref.mock.calls).toEqual([[anchor]])
  expect(anchor).toHaveAttribute('data-status', 'active')

  // A location change re-renders the Link (it is no longer active) without
  // detaching and re-attaching the consumer's ref.
  await act(() =>
    router.navigate({ to: '/posts/$postId', params: { postId: '2' } }),
  )
  expect(anchor).not.toHaveAttribute('data-status')
  expect(ref).toHaveBeenCalledTimes(1)

  // A different ref is attached to the same element; the old one is released.
  const next = vi.fn<(element: HTMLAnchorElement | null) => void>()
  view.rerender(
    <RouterContextProvider router={router}>
      <Link ref={next} to="/posts/$postId" params={{ postId: '1' }}>
        Post
      </Link>
    </RouterContextProvider>,
  )
  expect(ref.mock.calls).toEqual([[anchor], [null]])
  expect(next.mock.calls).toEqual([[anchor]])

  view.unmount()
  expect(next.mock.calls).toEqual([[anchor], [null]])
})

test('a cleanup returned by a forwarded callback ref runs on unmount', async () => {
  const router = await createPostsRouter()
  const cleanup = vi.fn()
  const ref = vi.fn((_element: HTMLAnchorElement | null) => cleanup)

  const view = render(
    <RouterContextProvider router={router}>
      <Link ref={ref} to="/posts/$postId" params={{ postId: '1' }}>
        Post
      </Link>
    </RouterContextProvider>,
  )
  const anchor = view.getByText('Post')
  expect(ref.mock.calls).toEqual([[anchor]])
  expect(cleanup).not.toHaveBeenCalled()

  view.unmount()
  // React runs the cleanup instead of calling the ref with `null`.
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(ref).toHaveBeenCalledTimes(1)
})
