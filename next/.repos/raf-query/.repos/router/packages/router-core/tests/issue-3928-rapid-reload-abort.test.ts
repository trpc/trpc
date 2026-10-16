import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

type LoaderInvocation = {
  resolve: (value: string) => void
  signal: AbortSignal
}

const createAbortableInvocation = (
  abortController: AbortController,
  onAbort?: () => void,
) => {
  let resolve!: (value: string) => void
  const promise = new Promise<string>((promiseResolve, reject) => {
    const handleAbort = () => {
      onAbort?.()
      reject(new DOMException('signal is aborted without reason', 'AbortError'))
    }
    resolve = (value) => {
      abortController.signal.removeEventListener('abort', handleAbort)
      promiseResolve(value)
    }
    if (abortController.signal.aborted) {
      handleAbort()
    } else {
      abortController.signal.addEventListener('abort', handleAbort, {
        once: true,
      })
    }
  })
  return {
    invocation: { resolve, signal: abortController.signal },
    promise,
  }
}

// https://github.com/TanStack/router/issues/3928
describe('issue #3928: rapid reloads of a reused parent', () => {
  test('one parent flight can serve rapid successors without clearing the latest child load', async () => {
    const indexAbort = vi.fn()
    const rootInvocations = new Map<string, LoaderInvocation>()
    const indexInvocations = new Map<string, LoaderInvocation>()

    const rootRoute = new BaseRootRoute({
      shouldReload: true,
      // Search is deliberately not part of this loader's key. Its active
      // same-ID flight may serve successors while the child keys each filter.
      loader: ({ abortController, location }) => {
        const { invocation, promise } =
          createAbortableInvocation(abortController)
        const search = location.search as Record<string, unknown>
        const filter = typeof search.filter === 'string' ? search.filter : ''
        rootInvocations.set(filter, invocation)
        return promise
      },
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: (search: Record<string, unknown>) => ({
        filter: typeof search.filter === 'string' ? search.filter : '',
      }),
      loaderDeps: ({ search }: { search: { filter: string } }) => ({
        filter: search.filter,
      }),
      loader: ({
        deps,
        abortController,
      }: {
        deps: { filter: string }
        abortController: AbortController
      }) => {
        const { invocation, promise } = createAbortableInvocation(
          abortController,
          indexAbort,
        )
        indexInvocations.set(deps.filter, invocation)
        return promise
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const initialLoad = router.load()
    await vi.waitFor(() => {
      expect(rootInvocations.has('')).toBe(true)
      expect(indexInvocations.has('')).toBe(true)
    })
    rootInvocations.get('')!.resolve('root:initial')
    indexInvocations.get('')!.resolve('')
    await initialLoad

    const navA = router.navigate({ to: '/', search: { filter: 'a' } })
    await vi.waitFor(() => {
      expect(rootInvocations.has('a')).toBe(true)
      expect(indexInvocations.has('a')).toBe(true)
    })

    const navAB = router.navigate({ to: '/', search: { filter: 'ab' } })
    await vi.waitFor(() => {
      expect(indexInvocations.has('ab')).toBe(true)
      expect(indexInvocations.get('a')!.signal.aborted).toBe(true)
      expect(rootInvocations.get('a')!.signal.aborted).toBe(false)
    })

    const navABC = router.navigate({ to: '/', search: { filter: 'abc' } })
    await vi.waitFor(() => {
      expect(indexInvocations.has('abc')).toBe(true)
      expect(indexInvocations.get('ab')!.signal.aborted).toBe(true)
      expect(rootInvocations.get('a')!.signal.aborted).toBe(false)
    })

    rootInvocations.get('a')!.resolve('root:a')
    indexInvocations.get('abc')!.resolve('abc')
    await Promise.all([navA, navAB, navABC])

    expect(indexAbort).toHaveBeenCalledTimes(2)
    expect(rootInvocations.size).toBe(2)
    expect(rootInvocations.get('a')!.signal.aborted).toBe(false)
    expect(indexInvocations.get('abc')!.signal.aborted).toBe(false)
    expect(router.state.location.search).toEqual({ filter: 'abc' })
    expect(router.state.matches[0]).toMatchObject({
      status: 'success',
      loaderData: 'root:a',
    })
    expect(router.state.matches[1]).toMatchObject({
      status: 'success',
      loaderData: 'abc',
    })
    expect(router.state.matches.some((match) => match.status === 'error')).toBe(
      false,
    )
  })
})
