import { runInNewContext } from 'node:vm'
import { createMemoryHistory } from '@tanstack/history'
import { createStream } from 'seroval'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, RawStream } from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import {
  bindSsrResponseToRequest,
  createSsrStreamResponse,
} from '../src/ssr/handlerCallback'
import {
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
  HydrationScriptOutputState,
  createHydrationScripts,
} from '../src/ssr/hydrationScripts'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import {
  transformHtmlStringWithRouter,
  transformReadableStreamWithRouter,
} from '../src/ssr/transformStreamWithRouter'
import { createTestRouter } from './routerTestUtils'
import type {
  HydrationScriptOutput,
  InitialHydrationScriptTags,
} from '../src/ssr/hydrationScripts'

type HydrationScripts = ReturnType<typeof createHydrationScripts>
const HYDRATION_SCRIPT_BOUNDARY_SUFFIX = new TextDecoder().decode(
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
)
const HYDRATION_SCRIPT_BOUNDARY_SOURCE =
  `document.currentScript.remove()` +
  HYDRATION_SCRIPT_BOUNDARY_SUFFIX.slice(0, -'</script>'.length)

/**
 * CI-stable tests for the SSR cleanup contract. These do not rely on GC
 * timing; they exercise the observable behavior:
 *   - onCleanup listeners run exactly once
 *   - cleanup is reentrancy-safe (listener calling cleanup again is a no-op)
 *   - cleanup is idempotent (second cleanup() call is a no-op)
 */

function buildRouter(dehydratedData?: Record<string, any>) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    dehydrate: dehydratedData ? () => dehydratedData : undefined,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

function renderInitialScripts(scripts: InitialHydrationScriptTags) {
  return [...scripts.before, scripts.boundary]
    .map((script) => {
      const id = script.attrs?.id ? ` id="${script.attrs.id}"` : ''
      return `<script${id}>${script.children ?? ''}</script>`
    })
    .join('')
}

async function waitFor(check: () => boolean) {
  for (let index = 0; index < 20; index++) {
    if (check()) {
      return
    }
    await Promise.resolve()
  }
  throw new Error('condition was not reached')
}

function drainHydrationOutput(output: HydrationScriptOutput) {
  const decoder = new TextDecoder()
  let text = ''
  while (
    output.state === HydrationScriptOutputState.Ready ||
    output.state === HydrationScriptOutputState.Active
  ) {
    text += decoder.decode(output.pullChunk(), { stream: true })
  }
  return text + decoder.decode()
}

describe('serverSsr.cleanup', () => {
  test('onCleanup listeners run exactly once', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!

    let calls = 0
    serverSsr.onCleanup(() => {
      calls++
    })

    serverSsr.cleanup()
    serverSsr.cleanup()
    expect(calls).toBe(1)
    expect(router.ssr).toBeUndefined()
    expect(router.serverSsr).toBeUndefined()
  })

  test('listener that re-enters cleanup() does not re-fire siblings', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    const order: Array<string> = []
    router.serverSsr!.onCleanup(() => {
      order.push('a')
      // Reentry: must be a no-op.
      router.serverSsr?.cleanup()
    })
    router.serverSsr!.onCleanup(() => {
      order.push('b')
    })

    router.serverSsr!.cleanup()
    expect(order).toEqual(['a', 'b'])
  })

  test('listener errors are swallowed and do not stop subsequent listeners', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    const order: Array<string> = []
    router.serverSsr!.onCleanup(() => {
      order.push('a')
      throw new Error('boom')
    })
    router.serverSsr!.onCleanup(() => {
      order.push('b')
    })

    // Should not throw.
    router.serverSsr!.cleanup()
    expect(order).toEqual(['a', 'b'])
  })

  test('cleanup before pending serialization resolves drops late scripts safely', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    router.serverSsr!.cleanup()

    value.resolve('done')
    await Promise.resolve()
    await Promise.resolve()

    expect(router.serverSsr).toBeUndefined()
  })

  test('cleanup cancels and unlocks a pending RawStream reader', async () => {
    const pullStarted = deferred<void>()
    let cancelCalls = 0
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          pullStarted.resolve()
          return new Promise<void>(() => {})
        },
        cancel() {
          cancelCalls++
          return new Promise<void>(() => {})
        },
      },
      { highWaterMark: 0 },
    )
    const router = buildRouter({ value: new RawStream(stream) })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    const serverSsr = router.serverSsr!
    await serverSsr.dehydrate()
    await pullStarted.promise
    expect(stream.locked).toBe(true)

    serverSsr.cleanup()
    expect(cancelCalls).toBe(1)
    expect(stream.locked).toBe(false)

    serverSsr.cleanup()
    expect(cancelCalls).toBe(1)
    expect(router.ssr).toBeUndefined()
    expect(router.serverSsr).toBeUndefined()
  })

  test('hydration output notifies once before cleanup', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    const serverSsr = router.serverSsr!
    await serverSsr.dehydrate()
    serverSsr.takeInitialHydrationScriptTags()
    const output = serverSsr.hydrationScripts.claimOutput()
    let calls = 0
    output.subscribe(() => {
      calls++
    })

    serverSsr.hydrationScripts.liftBarrier()
    value.resolve('done')
    await waitFor(() => output.state === HydrationScriptOutputState.Ready)
    expect(calls).toBe(1)
    serverSsr.cleanup()
    await Promise.resolve()

    expect(calls).toBe(1)
    expect(output.state).toBe(HydrationScriptOutputState.Done)
    expect(router.serverSsr).toBeUndefined()
  })

  test('cleanup stops work from late serialization values', async () => {
    const value = deferred<unknown>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = buildRouter({ value: value.promise })

    try {
      attachRouterServerSsrUtils({ router, manifest: undefined })
      await router.load()
      await router.serverSsr!.dehydrate()
      router.serverSsr!.cleanup()

      value.resolve(() => {})
      await Promise.resolve()
      await Promise.resolve()

      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      router.serverSsr?.cleanup()
      errorSpy.mockRestore()
    }
  })

  test('cleanup while custom dehydration waits does not start serialization', async () => {
    const dehydratedData = deferred<Record<string, unknown>>()
    const router = buildRouter()
    router.options.dehydrate = () => dehydratedData.promise
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    const serverSsr = router.serverSsr!
    const dehydration = serverSsr.dehydrate()

    serverSsr.cleanup()
    dehydratedData.resolve({ late: 'ignored' })
    await dehydration

    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort unwinds an argument-free custom dehydration hook', async () => {
    const abortController = new AbortController()
    const reason = new Error('request-aborted')
    const dehydratedData = deferred<Record<string, unknown>>()
    const router = buildRouter()
    const dehydrate = vi.fn(() => dehydratedData.promise)
    router.options.dehydrate = dehydrate
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    const dehydration = router.serverSsr!.dehydrate({
      signal: abortController.signal,
    })
    expect(dehydrate).toHaveBeenCalledWith()
    abortController.abort(reason)

    await expect(dehydration).rejects.toBe(reason)
    router.serverSsr?.cleanup()
    dehydratedData.resolve({ late: 'ignored' })
  })

  test('request abort stops dehydration after an already-settled custom hook', async () => {
    const abortController = new AbortController()
    const reason = new Error('request-aborted')
    const router = buildRouter()
    router.options.dehydrate = () => Promise.resolve({ ready: true })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    const serverSsr = router.serverSsr!
    const scripts = serverSsr.hydrationScripts as HydrationScripts
    const pushSerializedSource = vi.spyOn(scripts, 'pushSerializedSource')
    const dehydration = serverSsr.dehydrate({
      signal: abortController.signal,
    })
    queueMicrotask(() => abortController.abort(reason))

    await expect(dehydration).rejects.toBe(reason)
    expect(pushSerializedSource).not.toHaveBeenCalled()
    serverSsr.cleanup()
  })

  test('serialization completion does not clear render-finished listeners', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    let renderFinishedCalls = 0
    router.serverSsr!.onRenderFinished(() => {
      renderFinishedCalls++
    })

    router.serverSsr!.takeInitialHydrationScriptTags()
    const output = router.serverSsr!.hydrationScripts.claimOutput()
    router.serverSsr!.hydrationScripts.liftBarrier()

    value.resolve('done')
    await waitFor(() => output.state === HydrationScriptOutputState.Ready)
    drainHydrationOutput(output)
    expect(output.state).toBe(HydrationScriptOutputState.Done)

    expect(renderFinishedCalls).toBe(0)
    router.serverSsr!.setRenderFinished()
    expect(renderFinishedCalls).toBe(1)

    router.serverSsr?.cleanup()
  })

  test('waits for the initial record after a completed Seroval stream', async () => {
    const completedStream = createStream<string>()
    completedStream.next('stream value')
    completedStream.return('stream done')
    const lateValue = deferred<string>()
    const router = buildRouter({
      completedStream,
      lateValue: lateValue.promise,
    })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    const serverSsr = router.serverSsr!
    await serverSsr.dehydrate()
    const initialHydration = renderInitialScripts(
      serverSsr.takeInitialHydrationScriptTags()!,
    )
    expect(initialHydration).toContain('stream value')

    const output = serverSsr.hydrationScripts.claimOutput()
    serverSsr.setRenderFinished()
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)

    lateValue.resolve('late value')
    await waitFor(() => output.state === HydrationScriptOutputState.Ready)
    const hydration = drainHydrationOutput(output)
    expect(hydration).toContain('late value')
    expect(hydration).toContain('$_TSR.e()')
    expect(output.state).toBe(HydrationScriptOutputState.Done)

    serverSsr.cleanup()
  })

  test('render-finished listeners can synchronously finish serialization', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    router.serverSsr!.takeInitialHydrationScriptTags()
    const output = router.serverSsr!.hydrationScripts.claimOutput()

    router.serverSsr!.onRenderFinished(() => {
      value.resolve('done')
    })

    router.serverSsr!.setRenderFinished()
    await waitFor(() => output.state === HydrationScriptOutputState.Ready)

    expect(drainHydrationOutput(output)).toContain('$_TSR.e()')
    expect(output.state).toBe(HydrationScriptOutputState.Done)

    router.serverSsr?.cleanup()
  })

  test('render-finished is one-shot and invokes late listeners immediately', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!
    const earlyListener = vi.fn()
    const lateListener = vi.fn()

    serverSsr.onRenderFinished(earlyListener)
    serverSsr.setRenderFinished()
    serverSsr.setRenderFinished()
    serverSsr.onRenderFinished(lateListener)
    serverSsr.setRenderFinished()

    expect(earlyListener).toHaveBeenCalledOnce()
    expect(lateListener).toHaveBeenCalledOnce()
    serverSsr.cleanup()
  })

  test('a late output claim exposes completed serialization', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    router.serverSsr!.takeInitialHydrationScriptTags()
    const output = router.serverSsr!.hydrationScripts.claimOutput()
    let calls = 0
    const unsubscribe = output.subscribe(() => {
      calls++
    })

    expect(output.state).toBe(HydrationScriptOutputState.Done)
    expect(calls).toBe(0)
    expect(() => unsubscribe()).not.toThrow()
    router.serverSsr?.cleanup()
  })

  test('stream pass-through only reserves when no SSR work is pending', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(initialScripts?.boundary.children).toBe(
      HYDRATION_SCRIPT_BOUNDARY_SOURCE,
    )
    expect(initialScripts?.boundary.attrs).not.toHaveProperty('id')

    expect(router.serverSsr!.hydrationScripts.reserveFastPath()).toBe(true)
    let renderFinishedCalls = 0
    router.serverSsr!.onRenderFinished(() => {
      renderFinishedCalls++
    })
    router.serverSsr!.setRenderFinished()
    expect(renderFinishedCalls).toBe(1)
    expect(router.serverSsr!.hydrationScripts.reserveFastPath()).toBe(false)

    router.serverSsr?.cleanup()
  })

  test('initial boundary ends with the exact scanner suffix', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()!
    const boundaryHtml = renderInitialScripts({
      before: [],
      boundary: scripts.boundary,
    })

    expect(boundaryHtml).toBe(
      `<script>${HYDRATION_SCRIPT_BOUNDARY_SOURCE}</script>`,
    )
    expect(boundaryHtml.endsWith(HYDRATION_SCRIPT_BOUNDARY_SUFFIX)).toBe(true)

    router.serverSsr?.cleanup()
  })

  test('the final hydration tag cleans adjacent parts before adapter scripts', () => {
    const hydrationScripts = createHydrationScripts(undefined, ['void 0'])
    const scripts = hydrationScripts.takeInitialHydrationScriptTags()!
    const cleanupTag = scripts.before.at(-1)!
    const nodes: Array<any> = []
    const createNode = (marked: boolean) => {
      const node = {
        hasAttribute(name: string) {
          return marked && name === 'data-tsr-stream-part'
        },
        remove() {
          nodes.splice(nodes.indexOf(this), 1)
        },
      }
      Object.defineProperty(node, 'previousElementSibling', {
        get() {
          return nodes[nodes.indexOf(node) - 1] ?? null
        },
      })
      return node
    }
    const olderPart = createNode(true)
    const unrelated = createNode(false)
    const firstPart = createNode(true)
    const cleanup = createNode(true)
    nodes.push(olderPart, unrelated, firstPart, cleanup)

    runInNewContext(cleanupTag.children!, {
      document: { currentScript: cleanup },
    })

    const routeScript = createNode(false)
    const assetScript = createNode(false)
    nodes.push(routeScript, assetScript)

    expect(nodes).toEqual([olderPart, unrelated, routeScript, assetScript])
    hydrationScripts.cleanup()
  })

  test('a failed hydration tag leaves its transport node', () => {
    for (const brokenSource of [
      'throw new Error("runtime failure")',
      'const = "syntax failure"',
    ]) {
      const hydrationScripts = createHydrationScripts(undefined, [brokenSource])
      const scripts = hydrationScripts.takeInitialHydrationScriptTags()!
      const nodes: Array<{ remove: () => void }> = []
      const part = {
        previousElementSibling: null,
        hasAttribute: () => true,
        remove() {
          nodes.splice(nodes.indexOf(this), 1)
        },
      }
      nodes.push(part)

      expect(() =>
        runInNewContext(scripts.before[0]!.children!, {
          document: { currentScript: part },
        }),
      ).toThrow()
      expect(nodes).toEqual([part])
      hydrationScripts.cleanup()
    }
  })

  test('the boundary removes only itself when there are no initial parts', () => {
    const hydrationScripts = createHydrationScripts(undefined, [])
    const scripts = hydrationScripts.takeInitialHydrationScriptTags()!
    const nodes: Array<{ remove: () => void }> = []
    const boundary = {
      remove() {
        nodes.splice(nodes.indexOf(this), 1)
      },
    }
    nodes.push(boundary)

    runInNewContext(scripts.boundary.children!, {
      document: { currentScript: boundary },
    })

    expect(nodes).toEqual([])
    hydrationScripts.cleanup()
  })

  test('stream pass-through rejects while SSR work is pending', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    expect(router.serverSsr!.hydrationScripts.reserveFastPath()).toBe(false)
    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(initialScripts?.boundary.children).toBe(
      HYDRATION_SCRIPT_BOUNDARY_SOURCE,
    )
    expect(initialScripts?.boundary.attrs).not.toHaveProperty('id')
    expect(router.serverSsr!.hydrationScripts.reserveFastPath()).toBe(false)

    value.resolve('done')
    await Promise.resolve()
    await Promise.resolve()

    expect(router.serverSsr!.hydrationScripts.reserveFastPath()).toBe(false)
    const output = router.serverSsr!.hydrationScripts.claimOutput()
    router.serverSsr!.setRenderFinished()
    await waitFor(() => output.state === HydrationScriptOutputState.Ready)
    const hydration = drainHydrationOutput(output)
    expect(hydration).toContain('done')
    expect(output.state).toBe(HydrationScriptOutputState.Done)
    expect(router.serverSsr!.hydrationScripts.reserveFastPath(output)).toBe(
      true,
    )
    expect(router.serverSsr!.hydrationScripts.reserveFastPath(output)).toBe(
      false,
    )

    router.serverSsr?.cleanup()
  })

  test('an initial serialization error fails hydration output', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = buildRouter({ unsupported: () => {} })

    try {
      attachRouterServerSsrUtils({ router, manifest: undefined })
      await router.load()
      await expect(router.serverSsr!.dehydrate()).rejects.toBeInstanceOf(Error)

      expect(errorSpy).toHaveBeenCalledWith(
        'Serialization error:',
        expect.any(Error),
      )
    } finally {
      router.serverSsr?.cleanup()
      errorSpy.mockRestore()
    }
  })

  test('an invalid deferred value fails instead of leaving hydration pending', async () => {
    const invalidValue = deferred<unknown>()
    const validValue = deferred<string>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = buildRouter({
      invalidValue: invalidValue.promise,
      validValue: validValue.promise,
    })

    try {
      attachRouterServerSsrUtils({ router, manifest: undefined })
      await router.load()
      await router.serverSsr!.dehydrate()
      router.serverSsr!.takeInitialHydrationScriptTags()
      const output = router.serverSsr!.hydrationScripts.claimOutput()
      router.serverSsr!.hydrationScripts.liftBarrier()
      invalidValue.resolve(() => {})
      await waitFor(() => output.state === HydrationScriptOutputState.Failed)

      expect(output.error).toBeInstanceOf(Error)
      expect(errorSpy).toHaveBeenCalledWith(
        'Serialization error:',
        output.error,
      )

      validValue.resolve('ignored')
      await Promise.resolve()
      await Promise.resolve()
      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect(router.serverSsr!.hydrationScripts.reserveFastPath(output)).toBe(
        false,
      )
    } finally {
      router.serverSsr?.cleanup()
      errorSpy.mockRestore()
    }
  })

  test('a rejected hydration source stops serialization before stream creation', async () => {
    const lateValue = deferred<string>()
    const router = buildRouter({ lateValue: lateValue.promise })
    const onCleanup = vi.fn()

    try {
      attachRouterServerSsrUtils({ router, manifest: undefined })
      router.serverSsr!.onCleanup(onCleanup)
      await router.load()
      const scripts = router.serverSsr!.hydrationScripts as HydrationScripts
      const backlogError = new Error('hydration backlog full')
      const pushSerializedSource = vi
        .spyOn(scripts, 'pushSerializedSource')
        .mockImplementation(() => {
          scripts.fail(backlogError)
          return false
        })

      await router.serverSsr!.dehydrate()

      const output = scripts.claimOutput()
      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect(output.error).toBe(backlogError)
      expect(pushSerializedSource).toHaveBeenCalledOnce()

      lateValue.resolve('ignored')
      await Promise.resolve()
      await Promise.resolve()
      expect(pushSerializedSource).toHaveBeenCalledOnce()
      router.serverSsr!.cleanup()
      expect(onCleanup).toHaveBeenCalledExactlyOnceWith(false)
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('a hydration backlog failure aborts pending loader work during cleanup', async () => {
    const pending = deferred<string>()
    const onCleanup = vi.fn()
    const cancelSource = vi.fn()
    let loaderSignal: AbortSignal | undefined
    let chunks = 0
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          // Bound the producer even if backlog protection regresses.
          if (chunks++ < 5_000) {
            controller.enqueue(Uint8Array.of(1))
          }
        },
        cancel: cancelSource,
      },
      { highWaterMark: 0 },
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: ({ abortController }) => {
        loaderSignal = abortController.signal
        return { pending: pending.promise, stream: new RawStream(source) }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!
    serverSsr.onCleanup(onCleanup)

    try {
      await router.load()
      await serverSsr.dehydrate()
      // The renderer has not returned its stream, so nothing drains the backlog.
      const output = serverSsr.hydrationScripts.claimOutput()
      await vi.waitFor(() => {
        expect(output.state).toBe(HydrationScriptOutputState.Failed)
        expect(cancelSource).toHaveBeenCalledOnce()
      })
      expect(String(output.error)).toContain(
        'backlog exceeded maximum source-part count',
      )
      expect(loaderSignal?.aborted).toBe(false)

      serverSsr.cleanup()

      expect(onCleanup).toHaveBeenCalledExactlyOnceWith(false)
      expect(loaderSignal?.aborted).toBe(true)
      expect(source.locked).toBe(false)
      expect(router.serverSsr).toBeUndefined()
      expect(router.ssr).toBeUndefined()
    } finally {
      serverSsr.cleanup()
      pending.resolve('done')
      if (!source.locked) {
        await source.cancel()
      }
    }
  })

  test('the hydration channel permits only one subscriber', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const output = router.serverSsr!.hydrationScripts.claimOutput()
    const unsubscribe = output.subscribe(() => {})

    expect(() => output.subscribe(() => {})).toThrow('already has a subscriber')
    unsubscribe()
    expect(() => output.subscribe(() => {})).not.toThrow()
    router.serverSsr!.cleanup()
  })

  test('the claimed output receives scripts buffered before the claim', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    await router.serverSsr!.dehydrate()
    router.serverSsr!.takeInitialHydrationScriptTags()

    router.serverSsr!.hydrationScripts.liftBarrier()
    value.resolve('buffered')
    await Promise.resolve()
    await Promise.resolve()

    const output = router.serverSsr!.hydrationScripts.claimOutput()

    expect(output.state).toBe(HydrationScriptOutputState.Ready)
    const hydration = drainHydrationOutput(output)
    expect(hydration).toContain('buffered')
    expect(hydration).toContain('$_TSR.e()')
    router.serverSsr!.cleanup()
  })

  test('server SSR attach lifecycle runs listeners at attach time', () => {
    const router = buildRouter()
    const calls: Array<string> = []
    router.serverSsrLifecycle = {
      onServerSsrAttach: [
        (serverSsr) => {
          calls.push('attach')
          serverSsr.onCleanup(() => calls.push('cleanup'))
        },
      ],
    }

    attachRouterServerSsrUtils({ router, manifest: undefined })
    expect(calls).toEqual(['attach'])

    router.serverSsr!.cleanup()
    expect(calls).toEqual(['attach', 'cleanup'])
  })

  test('request handler cleans SSR state before returning a plain body', async () => {
    const router = buildRouter()
    let cleanupEffects = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      serverSsr.onCleanup(() => {
        cleanupEffects++
      })
      return Promise.resolve(new Response('plain'))
    })

    expect(cleanupEffects).toBe(1)
    await response.text()
    expect(cleanupEffects).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request handler cleans SSR state before returning a plain stream', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('plain'))
            },
          }),
        ),
      )
    })

    expect(cleanupCalls).toBe(1)
    await response.body!.cancel('done')
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request handler cleans bodyless response immediately', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return Promise.resolve(new Response(null, { status: 204 }))
    })

    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort settles while the render callback is still pending', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    const renderStarted = deferred<void>()
    const renderResult = deferred<ReturnType<typeof createSsrStreamResponse>>()
    let cleanupEffects = 0
    let cancelCalls = 0
    let lateStreamResponse!: ReturnType<typeof createSsrStreamResponse>
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      serverSsr.onCleanup(() => {
        cleanupEffects++
      })
      lateStreamResponse = createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      )
      renderStarted.resolve()
      return renderResult.promise
    })

    await renderStarted.promise
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    expect(cleanupEffects).toBe(1)
    expect(router.serverSsr).toBeUndefined()

    renderResult.resolve(lateStreamResponse)
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanupEffects).toBe(1)
    expect(cancelCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort cancels a plain response resolved by the callback later', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    const callbackStarted = deferred<void>()
    const callbackResult = deferred<Response>()
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = handler(() => {
      callbackStarted.resolve()
      return callbackResult.promise
    })

    await callbackStarted.promise
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    callbackResult.resolve(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  test('request abort disposes a stream after response handoff', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    let cleanupCalls = 0
    let cancelCalls = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      )
    })

    expect(response.body).not.toBeNull()
    expect(cleanupCalls).toBe(0)
    requestController.abort(new Error('request disconnected'))
    await Promise.resolve()

    expect(cleanupCalls).toBe(1)
    expect(cancelCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request handler defers cleanup for stream response metadata', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    let controller!: ReadableStreamDefaultController<Uint8Array>
    let initialScriptHtml = ''
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      const initialScripts = serverSsr.takeInitialHydrationScriptTags()
      expect(initialScripts?.boundary.children).toBe(
        HYDRATION_SCRIPT_BOUNDARY_SOURCE,
      )
      expect(initialScripts?.boundary.attrs).not.toHaveProperty('id')
      initialScriptHtml = renderInitialScripts(initialScripts!)
      const appStream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const responseStream = transformReadableStreamWithRouter(
        requestRouter,
        appStream as any,
      )

      return createSsrStreamResponse(
        requestRouter,
        new Response(responseStream as any),
      )
    })

    expect(cleanupCalls).toBe(0)
    controller.enqueue(
      new TextEncoder().encode(
        `<html><body>${initialScriptHtml}ok</body></html>`,
      ),
    )
    controller.close()
    await response.text()
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('external cleanup releases a discarded stream transform immediately', async () => {
    // Mirrors a request handler that discards a stream response (for example a
    // middleware throwing after the handler returned): the bare cleanup() in
    // its finally block must tear the transform down at once instead of
    // leaving the renderer pinned until the lifetime timer.
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!
    serverSsr.takeInitialHydrationScriptTags()

    const upstreamCancelled = { value: false, reason: undefined as unknown }
    const appStream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('<html><body>'))
      },
      cancel(reason) {
        upstreamCancelled.value = true
        upstreamCancelled.reason = reason
      },
    })
    const aborts: Array<unknown> = []
    const responseStream = transformReadableStreamWithRouter(
      router,
      appStream as any,
      {
        onAbort: (reason) => aborts.push(reason),
      },
    )

    // The response is never read and never cancelled.
    serverSsr.cleanup()

    expect(upstreamCancelled.value).toBe(true)
    expect((upstreamCancelled.reason as Error).name).toBe('AbortError')
    expect(aborts).toHaveLength(1)
    expect(router.serverSsr).toBeUndefined()
    await expect(responseStream.getReader().read()).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  test('concurrent dehydrate calls throw instead of double-serializing', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!

    const first = serverSsr.dehydrate()
    await expect(serverSsr.dehydrate()).rejects.toThrow(
      'router is already dehydrated',
    )
    await first
    await expect(serverSsr.dehydrate()).rejects.toThrow(
      'router is already dehydrated',
    )
    serverSsr.cleanup()
  })

  test('onCleanup after cleanup invokes the listener immediately', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!
    serverSsr.cleanup()

    const listener = vi.fn()
    serverSsr.onCleanup(listener)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('a late onCleanup listener that throws is contained', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!
    serverSsr.cleanup()

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() =>
        serverSsr.onCleanup(() => {
          throw new Error('late-listener-boom')
        }),
      ).not.toThrow()
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in SSR cleanup listener:',
        expect.objectContaining({ message: 'late-listener-boom' }),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  test('binding a stream response after cleanup still observes request abort', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const cancel = vi.fn()
    const streamResponse = createSsrStreamResponse(
      router,
      new Response(new ReadableStream({ cancel })),
    )
    const dispose = vi.spyOn(streamResponse, 'dispose')
    router.serverSsr!.cleanup()

    const controller = new AbortController()
    const addSpy = vi.spyOn(controller.signal, 'addEventListener')
    const result = bindSsrResponseToRequest(
      router,
      streamResponse,
      controller.signal,
    )

    expect(result.serverSsrCleanup).toBe('stream')
    expect(addSpy).toHaveBeenCalledOnce()

    const reason = new Error('request disconnected')
    controller.abort(reason)
    await Promise.resolve()

    expect(dispose).toHaveBeenCalledExactlyOnceWith(reason)
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason)
  })

  test.each(['pass-through', 'merge'])(
    'shares the %s transform abort listener with final response disposal',
    async (mode) => {
      const router = buildRouter()
      attachRouterServerSsrUtils({ router, manifest: undefined })
      const serverSsr = router.serverSsr!
      if (mode === 'pass-through') {
        serverSsr.disableHydration()
      }
      const cleanup = vi.fn()
      serverSsr.onCleanup(cleanup)
      const requestAbort = new AbortController()
      const add = vi.spyOn(requestAbort.signal, 'addEventListener')
      const remove = vi.spyOn(requestAbort.signal, 'removeEventListener')
      const cancelSource = vi.fn(() => new Promise<void>(() => {}))
      const source = new ReadableStream<Uint8Array>({ cancel: cancelSource })
      const transformed = transformReadableStreamWithRouter(router, source, {
        signal: requestAbort.signal,
      })
      const original = createSsrStreamResponse(
        router,
        new Response(transformed),
      )
      const cancelFinal = vi.fn(() => new Promise<void>(() => {}))
      const response = new Response(new ReadableStream({ cancel: cancelFinal }))
      const dispose = vi.fn((reason?: unknown): undefined => {
        original.dispose(reason)
        void response.body!.cancel(reason).catch(() => {})
      })
      bindSsrResponseToRequest(
        router,
        { ...original, response, dispose },
        requestAbort.signal,
      )

      expect(add).toHaveBeenCalledOnce()
      const reason = new Error('request disconnected')
      const reader = transformed.getReader()
      const rejected = expect(reader.read()).rejects.toBe(reason)
      requestAbort.abort(reason)
      await rejected

      expect(dispose).toHaveBeenCalledExactlyOnceWith(reason)
      expect(cancelFinal).toHaveBeenCalledExactlyOnceWith(reason)
      expect(cancelSource).toHaveBeenCalledExactlyOnceWith(reason)
      expect(source.locked).toBe(false)
      expect(cleanup).toHaveBeenCalledOnce()
      expect(remove).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
      reader.releaseLock()
    },
  )

  test('successful transform completion removes abort handling without disposing the response', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    router.serverSsr!.disableHydration()
    const requestAbort = new AbortController()
    const add = vi.spyOn(requestAbort.signal, 'addEventListener')
    const remove = vi.spyOn(requestAbort.signal, 'removeEventListener')
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<html>done</html>'))
        controller.close()
      },
      cancel,
    })
    const transformed = transformReadableStreamWithRouter(router, source, {
      signal: requestAbort.signal,
    })
    const result = createSsrStreamResponse(router, new Response(transformed))
    const dispose = vi.spyOn(result, 'dispose')
    bindSsrResponseToRequest(router, result, requestAbort.signal)

    expect(await result.response.text()).toBe('<html>done</html>')
    requestAbort.abort(new Error('request ended after completion'))
    expect(add).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(dispose).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect(source.locked).toBe(false)
    expect(router.serverSsr).toBeUndefined()
  })

  test.each(['custom response', 'no signal', 'different signal'])(
    'keeps request binding for a %s',
    async (mode) => {
      const router = buildRouter()
      attachRouterServerSsrUtils({ router, manifest: undefined })
      router.serverSsr!.disableHydration()
      const requestAbort = new AbortController()
      const add = vi.spyOn(requestAbort.signal, 'addEventListener')
      const cancel = vi.fn()
      const source = new ReadableStream<Uint8Array>({ cancel })
      const body =
        mode === 'custom response'
          ? source
          : transformReadableStreamWithRouter(router, source, {
              signal:
                mode === 'different signal'
                  ? new AbortController().signal
                  : undefined,
            })
      const result = createSsrStreamResponse(router, new Response(body))
      const dispose = vi.spyOn(result, 'dispose')
      bindSsrResponseToRequest(router, result, requestAbort.signal)
      const reason = new Error('request disconnected')
      requestAbort.abort(reason)
      await Promise.resolve()

      expect(add).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledExactlyOnceWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(source.locked).toBe(false)
      expect(router.serverSsr).toBeUndefined()
    },
  )

  test('already-aborted response handoff disposes immediately without adding a listener', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const cancel = vi.fn()
    const result = createSsrStreamResponse(
      router,
      new Response(new ReadableStream({ cancel })),
    )
    const dispose = vi.spyOn(result, 'dispose')
    const requestAbort = new AbortController()
    const reason = new Error('request already disconnected')
    requestAbort.abort(reason)
    const add = vi.spyOn(requestAbort.signal, 'addEventListener')
    bindSsrResponseToRequest(router, result, requestAbort.signal)
    await Promise.resolve()

    expect(add).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledExactlyOnceWith(reason)
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason)
    expect(router.serverSsr).toBeUndefined()
  })

  test('disabled hydration streams through pass-through without a boundary', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const serverSsr = router.serverSsr!
    serverSsr.disableHydration()

    // No <Scripts /> boundary anywhere in the document.
    const html = '<html><body><main>static page</main></body></html>'
    const appStream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(html))
        c.close()
      },
    })

    const responseStream = transformReadableStreamWithRouter(
      router,
      appStream as any,
    )
    const text = await new Response(responseStream as any).text()

    expect(text).toBe(html)
    expect(text).not.toContain('$tsr-stream-boundary')
    expect(text).not.toContain('data-tsr-stream-part')
    expect(router.serverSsr).toBeUndefined()
  })

  test('disabled hydration renders strings through the eager fast path', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    router.serverSsr!.disableHydration()

    const html = '<html><body>no hydration</body></html>'
    const text = await transformHtmlStringWithRouter(router, html)

    expect(text).toBe('<!DOCTYPE html>' + html)
    expect(router.serverSsr).toBeUndefined()
  })

  test('disableHydration and dehydrate are mutually exclusive', async () => {
    const disabledFirst = buildRouter()
    attachRouterServerSsrUtils({ router: disabledFirst, manifest: undefined })
    disabledFirst.serverSsr!.disableHydration()
    // Idempotent second call.
    expect(() => disabledFirst.serverSsr!.disableHydration()).not.toThrow()
    await expect(disabledFirst.serverSsr!.dehydrate()).rejects.toThrow(
      'hydration is disabled for this request',
    )
    disabledFirst.serverSsr!.cleanup()

    const dehydratedFirst = buildRouter()
    attachRouterServerSsrUtils({ router: dehydratedFirst, manifest: undefined })
    await dehydratedFirst.serverSsr!.dehydrate()
    expect(() => dehydratedFirst.serverSsr!.disableHydration()).toThrow(
      'cannot disable hydration after dehydrate()',
    )
    dehydratedFirst.serverSsr!.cleanup()
  })
})
