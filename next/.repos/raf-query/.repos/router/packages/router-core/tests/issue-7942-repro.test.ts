import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { MAX_HYDRATION_OUTPUT_CHUNK_BYTES } from '../src/ssr/hydrationScripts'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { transformReadableStreamWithRouter } from '../src/ssr/transformStreamWithRouter'
import { createTestRouter } from './routerTestUtils'
import type { RouterManagedTag } from '../src/manifest'
import type { InitialHydrationScriptTags } from '../src/ssr/hydrationScripts'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createLoaderSsrRouter(loader: () => unknown) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
    loader,
  })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
}

function createManualUpstream() {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  const cancelled = { value: false }
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
    },
    cancel() {
      cancelled.value = true
    },
  })

  return {
    stream,
    cancelled,
    push(value: string) {
      controllerRef!.enqueue(encoder.encode(value))
    },
    close() {
      controllerRef!.close()
    },
  }
}

function renderManagedScript(tag: RouterManagedTag) {
  const id = tag.attrs?.id ? ` id="${tag.attrs.id}"` : ''
  return `<script${id}>${tag.children ?? ''}</script>`
}

function renderManagedScripts(tags: Array<RouterManagedTag>) {
  return tags.map(renderManagedScript).join('')
}

function expectInitialScripts(
  scripts: InitialHydrationScriptTags | undefined,
): InitialHydrationScriptTags {
  expect(scripts?.boundary.children).toContain('$tsr-stream-boundary')
  expect(scripts?.boundary.attrs).not.toHaveProperty('id')
  expect(scripts?.before.length).toBeGreaterThan(0)
  for (const script of scripts!.before) {
    expect(script.attrs?.['data-tsr-stream-part']).toBe('')
  }
  return scripts!
}

async function readAll(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: Array<string> = []
  const chunkSizes: Array<number> = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      chunks.push(decoder.decode())
      return {
        text: chunks.join(''),
        chunkSizes,
      }
    }
    chunkSizes.push(value.byteLength)
    chunks.push(decoder.decode(value, { stream: true }))
  }
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

describe('issue #7942', () => {
  test('eager loader data stays in the segmented initial scripts', async () => {
    const router = createLoaderSsrRouter(() => ({ value: 'eager-loader-data' }))
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    const initialScripts = expectInitialScripts(
      router.serverSsr!.takeInitialHydrationScriptTags(),
    )
    expect(
      initialScripts.before.some((script) =>
        script.children?.includes('eager-loader-data'),
      ),
    ).toBe(true)
    expect(router.serverSsr!.takeInitialHydrationScriptTags()).toBeUndefined()

    router.serverSsr!.cleanup()
  })

  test('keeps a large eager serialization part isolated from small initial scripts', async () => {
    const payload = 'initial-large-value-'.repeat(2_000)
    const router = createLoaderSsrRouter(() => ({ value: payload }))
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    const initialScripts = expectInitialScripts(
      router.serverSsr!.takeInitialHydrationScriptTags(),
    )
    const streamParts = initialScripts.before
    const payloadScripts = streamParts.filter((script) =>
      script.children?.includes(payload),
    )

    expect(payloadScripts).toHaveLength(1)
    expect(streamParts.indexOf(payloadScripts[0]!)).toBeGreaterThan(0)
    expect(
      streamParts
        .filter((script) => script !== payloadScripts[0])
        .every((script) => !script.children?.includes(payload)),
    ).toBe(true)

    router.serverSsr!.cleanup()
  })

  test('streams a large deferred loader result in bounded chunks after the next safe boundary', async () => {
    const deferred = createDeferred<string>()
    const router = createLoaderSsrRouter(() => ({ value: deferred.promise }))
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    const initialScripts = expectInitialScripts(
      router.serverSsr!.takeInitialHydrationScriptTags(),
    )
    const liftBarrier = vi.spyOn(
      router.serverSsr!.hydrationScripts,
      'liftBarrier',
    )
    const upstream = createManualUpstream()
    const output = transformReadableStreamWithRouter(router, upstream.stream)
    const outputPromise = readAll(output)

    const appShell =
      `<html><body>${renderManagedScripts([
        ...initialScripts.before,
        initialScripts.boundary,
      ])}` + `<main>app</main>`
    expect(appShell.length).toBeLessThan(MAX_HYDRATION_OUTPUT_CHUNK_BYTES)
    upstream.push(appShell)
    await waitFor(() => liftBarrier.mock.calls.length === 1)

    const payload = 'x'.repeat(17 * 1024 * 1024)
    deferred.resolve(payload)

    const tail = '</body></html>'
    upstream.push(tail)
    upstream.close()

    const result = await outputPromise
    const renderedInitialScripts = renderManagedScripts([
      ...initialScripts.before,
      initialScripts.boundary,
    ])
    const earliestInjectionOffset =
      '<html><body>'.length + renderedInitialScripts.length
    const payloadOffset = result.text.indexOf(payload)
    const injectedStart = result.text.lastIndexOf('<script>', payloadOffset)
    const dynamicClose = 'document.currentScript.remove()</script>'
    const injectedEnd =
      result.text.lastIndexOf(dynamicClose) + dynamicClose.length
    expect(payloadOffset).toBeGreaterThan(injectedStart)
    expect(injectedStart).toBeGreaterThanOrEqual(earliestInjectionOffset)
    expect(injectedStart).toBeLessThanOrEqual(appShell.length)
    expect(injectedEnd).toBeGreaterThan(payloadOffset)
    expect(
      result.text.slice(0, injectedStart) + result.text.slice(injectedEnd),
    ).toBe(appShell + tail)
    expect(result.text.endsWith(tail)).toBe(true)
    expect(Math.max(...result.chunkSizes)).toBeLessThanOrEqual(
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
    )
    expect(upstream.cancelled.value).toBe(false)
    expect(router.serverSsr).toBeUndefined()
  })

  test('rejects multiple router fragments that genuinely accumulate past the guard', async () => {
    const payloadCharsPerValue = 1024 * 1024
    const deferredValues = Array.from({ length: 17 }, () =>
      createDeferred<string>(),
    )
    const router = createLoaderSsrRouter(() => ({
      values: deferredValues.map((deferred) => deferred.promise),
    }))
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    const initialScripts = expectInitialScripts(
      router.serverSsr!.takeInitialHydrationScriptTags(),
    )

    const liftBarrier = vi.spyOn(
      router.serverSsr!.hydrationScripts,
      'liftBarrier',
    )
    const upstream = createManualUpstream()
    const output = transformReadableStreamWithRouter(router, upstream.stream)
    const outputResult = readAll(output).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    )

    upstream.push(
      `<html><body>${renderManagedScripts([
        ...initialScripts.before,
        initialScripts.boundary,
      ])}<main>app</main>`,
    )
    await waitFor(() => liftBarrier.mock.calls.length === 1)

    for (let index = 0; index < deferredValues.length; index++) {
      deferredValues[index]!.resolve(
        `${index}:` + 'y'.repeat(payloadCharsPerValue),
      )
    }

    const result = await outputResult
    expect(result.value).toBeUndefined()
    expect(result.error).toBeInstanceOf(Error)
    expect((result.error as Error).message).toContain(
      'SSR hydration backlog exceeded maximum code-unit count',
    )
    expect(upstream.cancelled.value).toBe(true)
    expect(router.serverSsr).toBeUndefined()
  })
})
