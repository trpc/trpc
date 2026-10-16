import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/6221
//
// head() must never compute from loaderData older than the data the lane
// commits. Two reported shapes:
// 1. Revisiting a route whose previous visit ended in notFound — the head
//    must see the fresh successful loaderData, not run before the loader.
// 2. Revisiting a cached success match that gets a stale reload — the head
//    title must not lag one loaderData run behind.
describe('issue #6221: head does not run before loader data is ready', () => {
  test('existing-behavior control: head sees fresh loaderData after a notFound visit', async () => {
    let authed = false
    const articleResponse = createControlledPromise<{ title: string }>()
    const successfulLoadStarted = createControlledPromise<void>()

    const articleLoader = async () => {
      if (!authed) {
        await Promise.resolve()
        throw notFound()
      }

      successfulLoadStarted.resolve()
      return articleResponse
    }

    const rootRoute = new BaseRootRoute({})
    const dashboardRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
    })
    const articleRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/article',
      loader: articleLoader,
      notFoundComponent: () => 'Not found',
      head: ({ loaderData }) => ({
        meta: [{ title: loaderData?.title ?? 'Generic title' }],
      }),
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([dashboardRoute, articleRoute]),
      history: createMemoryHistory({ initialEntries: ['/article'] }),
    })
    const backLoadFinished = createControlledPromise<void>()
    let backLoadStarted = false
    let unsubscribe: (() => void) | undefined

    try {
      await router.load()
      const notFoundMatch = router.state.matches.find(
        (match) => match.routeId === articleRoute.id,
      )
      expect(notFoundMatch?.status).toBe('notFound')
      expect(notFoundMatch?.meta).toEqual([{ title: 'Generic title' }])

      // Model the reported auth redirect and browser Back without relying on a
      // wall-clock loader delay.
      authed = true
      await router.navigate({ to: '/dashboard' })
      unsubscribe = router.history.subscribe(() => {
        backLoadStarted = true
        void router.load().then(
          () => backLoadFinished.resolve(),
          (error) => backLoadFinished.reject(error),
        )
      })
      router.history.back()
      await successfulLoadStarted
      expect(articleResponse.status).toBe('pending')

      articleResponse.resolve({ title: 'Article 123' })
      await backLoadFinished

      const articleMatch = router.state.matches.find(
        (match) => match.routeId === articleRoute.id,
      )
      expect(articleMatch?.status).toBe('success')
      expect(articleMatch?.loaderData).toEqual({ title: 'Article 123' })
      expect(articleMatch?.meta).toEqual([{ title: 'Article 123' }])
    } finally {
      articleResponse.resolve({ title: 'Article 123' })
      if (backLoadStarted) {
        await backLoadFinished.catch(() => undefined)
      }
      unsubscribe?.()
    }
  })

  test('head title does not lag one loaderData run behind on revisits', async () => {
    const secondLoaderStarted = createControlledPromise<void>()
    const secondLoaderResponse = createControlledPromise<{ author: string }>()
    let version = 0
    const quoteLoader = () => {
      version += 1
      if (version === 2) {
        secondLoaderStarted.resolve()
        return secondLoaderResponse
      }

      return { author: 'author-1' }
    }

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const quoteRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/quote',
      loader: quoteLoader,
      staleTime: 0,
      head: ({ loaderData }) => ({
        meta: [{ title: `Quote by ${loaderData?.author ?? '...'}` }],
      }),
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, quoteRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const getQuoteMatch = () =>
      router.state.matches.find((match) => match.routeId === quoteRoute.id)
    onTestFinished(() => {
      secondLoaderResponse.resolve({ author: 'author-2' })
    })

    await router.load()

    await router.navigate({ to: '/quote' })
    expect(getQuoteMatch()?.loaderData).toEqual({ author: 'author-1' })
    expect(getQuoteMatch()?.meta).toEqual([{ title: 'Quote by author-1' }])

    await router.navigate({ to: '/' })
    const revisit = router.navigate({ to: '/quote' })
    await secondLoaderStarted
    await revisit

    // The cached generation remains internally consistent while its stale
    // loader is pending in the background.
    expect(secondLoaderResponse.status).toBe('pending')
    expect(getQuoteMatch()?.loaderData).toEqual({ author: 'author-1' })
    expect(getQuoteMatch()?.meta).toEqual([{ title: 'Quote by author-1' }])

    secondLoaderResponse.resolve({ author: 'author-2' })
    await vi.waitFor(() => {
      expect(getQuoteMatch()?.loaderData).toEqual({ author: 'author-2' })
      expect(getQuoteMatch()?.meta).toEqual([{ title: 'Quote by author-2' }])
    })
  })
})
