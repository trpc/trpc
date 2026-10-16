export type SourceMarker = 'server' | 'client'

export type ServerData = {
  name: string
  timestamp: number
  source: 'server'
}

export type DeferredMessage = {
  message: string
  source: SourceMarker
}

export type QueryType = 'sync' | 'fast-async' | 'slow-async'

export type QueryData = {
  type: QueryType
  id: number
  value: string
  source: SourceMarker
}

export const deferredDataMessage = 'Deferred data loaded!'
export const deferredDataDelay = 1000
export const deferredServerDelay = 800
export const deferredImmediateName = 'Fast User'
export const deferredSlowName = 'Slow User'
export const deferredErrorMessage = 'Error in deferred object'

export const fastSerialStaticData = 'This is static data'
export const fastSerialSmallValue = 'small-data'

export const syncOnlyMessage = 'Hello from sync loader!'
export const syncOnlyItems = ['item-1', 'item-2', 'item-3'] as const

export const slowRenderDeferredMessage = 'Deferred resolved!'
export const slowRenderDeferredDelay = 50
export const slowRenderQuickName = 'Quick data'
export const slowRenderComponents = [
  'Slow component 1',
  'Slow component 2',
  'Slow component 3',
] as const

export const nestedLevelDelays = [200, 400, 600] as const
export const nestedPlainDelay = 300
export const nestedPlainMessage = 'Plain deferred resolved!'

export const streamPromiseValue = 'promise-resolved'
export const streamPromiseDelay = 150
export const streamChunkDelay = 200
export const streamChunks = Array.from({ length: 5 }, (_, i) => `chunk-${i}`)

export const routerHtmlPayloadChars = 17 * 1024 * 1024
export const routerHtmlPayloadChar = 'x'
export const routerHtmlPayloadDelay = 100

export const manyPromiseItems = [
  {
    key: 'immediate1',
    testId: 'immediate-1',
    label: 'Immediate 1',
    value: 'immediate-1',
    delayMs: 0,
  },
  {
    key: 'immediate2',
    testId: 'immediate-2',
    label: 'Immediate 2',
    value: 'immediate-2',
    delayMs: 10,
  },
  {
    key: 'immediate3',
    testId: 'immediate-3',
    label: 'Immediate 3',
    value: 'immediate-3',
    delayMs: 20,
  },
  {
    key: 'fast1',
    testId: 'fast-1',
    label: 'Fast 1',
    value: 'fast-1',
    delayMs: 50,
  },
  {
    key: 'fast2',
    testId: 'fast-2',
    label: 'Fast 2',
    value: 'fast-2',
    delayMs: 75,
  },
  {
    key: 'fast3',
    testId: 'fast-3',
    label: 'Fast 3',
    value: 'fast-3',
    delayMs: 100,
  },
  {
    key: 'fast4',
    testId: 'fast-4',
    label: 'Fast 4',
    value: 'fast-4',
    delayMs: 125,
  },
  {
    key: 'medium1',
    testId: 'medium-1',
    label: 'Medium 1',
    value: 'medium-1',
    delayMs: 150,
  },
  {
    key: 'medium2',
    testId: 'medium-2',
    label: 'Medium 2',
    value: 'medium-2',
    delayMs: 200,
  },
  {
    key: 'medium3',
    testId: 'medium-3',
    label: 'Medium 3',
    value: 'medium-3',
    delayMs: 250,
  },
  {
    key: 'slow1',
    testId: 'slow-1',
    label: 'Slow 1',
    value: 'slow-1',
    delayMs: 300,
  },
  {
    key: 'slow2',
    testId: 'slow-2',
    label: 'Slow 2',
    value: 'slow-2',
    delayMs: 400,
  },
  {
    key: 'slow3',
    testId: 'slow-3',
    label: 'Slow 3',
    value: 'slow-3',
    delayMs: 500,
  },
  {
    key: 'verySlow1',
    testId: 'very-slow-1',
    label: 'Very Slow 1',
    value: 'very-slow-1',
    delayMs: 600,
  },
  {
    key: 'verySlow2',
    testId: 'very-slow-2',
    label: 'Very Slow 2',
    value: 'very-slow-2',
    delayMs: 800,
  },
] as const

export const concurrentBatchCount = 5
export const concurrentBatchDelays = [100, 200, 300] as const

export const queryHeavyItems = [
  {
    type: 'sync',
    id: 1,
    value: 'sync-value-1',
    delayMs: 0,
    testId: 'sync-query-1',
    fallback: 'Loading sync 1...',
  },
  {
    type: 'sync',
    id: 2,
    value: 'sync-value-2',
    delayMs: 0,
    testId: 'sync-query-2',
    fallback: 'Loading sync 2...',
  },
  {
    type: 'sync',
    id: 3,
    value: 'sync-value-3',
    delayMs: 0,
    testId: 'sync-query-3',
    fallback: 'Loading sync 3...',
  },
  {
    type: 'fast-async',
    id: 1,
    value: 'fast-async-1',
    delayMs: 50,
    testId: 'fast-async-query-1',
    fallback: 'Loading fast 1...',
  },
  {
    type: 'fast-async',
    id: 2,
    value: 'fast-async-2',
    delayMs: 75,
    testId: 'fast-async-query-2',
    fallback: 'Loading fast 2...',
  },
  {
    type: 'fast-async',
    id: 3,
    value: 'fast-async-3',
    delayMs: 100,
    testId: 'fast-async-query-3',
    fallback: 'Loading fast 3...',
  },
  {
    type: 'slow-async',
    id: 1,
    value: 'slow-async-1',
    delayMs: 200,
    testId: 'slow-async-query-1',
    fallback: 'Loading slow 1...',
  },
  {
    type: 'slow-async',
    id: 2,
    value: 'slow-async-2',
    delayMs: 300,
    testId: 'slow-async-query-2',
    fallback: 'Loading slow 2...',
  },
  {
    type: 'slow-async',
    id: 3,
    value: 'slow-async-3',
    delayMs: 400,
    testId: 'slow-async-query-3',
    fallback: 'Loading slow 3...',
  },
] as const

export function sourceMarker(): SourceMarker {
  return typeof window === 'undefined' ? 'server' : 'client'
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function makeServerData(name: string): ServerData {
  return {
    name,
    timestamp: Date.now(),
    source: 'server',
  }
}

export function makeDeferred<T>(value: T, delayMs: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayMs))
}

export function makeDeferredMessage(
  message: string,
  delayMs: number,
): Promise<DeferredMessage> {
  return makeDeferred({ message, source: sourceMarker() }, delayMs)
}

export function makeFastSerialSmallData() {
  return {
    value: fastSerialSmallValue,
    timestamp: Date.now(),
    source: 'server' as const,
  }
}

export function makeSyncOnlyData() {
  return {
    message: syncOnlyMessage,
    timestamp: Date.now(),
    items: syncOnlyItems,
    source: sourceMarker(),
  }
}

export function makeLevelData(level: number) {
  return { level, timestamp: Date.now() }
}

export function makeQueryData(item: {
  type: QueryType
  id: number
  value: string
}): QueryData {
  return {
    type: item.type,
    id: item.id,
    value: item.value,
    source: sourceMarker(),
  }
}

export function createManyPromises() {
  return Object.fromEntries(
    manyPromiseItems.map((item) => [
      item.key,
      makeDeferred(item.value, item.delayMs),
    ]),
  ) as Record<(typeof manyPromiseItems)[number]['key'], Promise<string>>
}

export function createConcurrentPromises(
  count: number,
  delayMs: number,
): Array<Promise<string>> {
  const sharedPromise = delay(delayMs)
  return Array.from({ length: count }, (_, i) =>
    sharedPromise.then(() => `concurrent-${i + 1}`),
  )
}

export function createConcurrentLoaderData() {
  const batch1 = createConcurrentPromises(
    concurrentBatchCount,
    concurrentBatchDelays[0],
  )
  const batch2 = createConcurrentPromises(
    concurrentBatchCount,
    concurrentBatchDelays[1],
  )
  const batch3 = createConcurrentPromises(
    concurrentBatchCount,
    concurrentBatchDelays[2],
  )

  return {
    concurrent1_1: batch1[0],
    concurrent1_2: batch1[1],
    concurrent1_3: batch1[2],
    concurrent1_4: batch1[3],
    concurrent1_5: batch1[4],
    concurrent2_1: batch2[0],
    concurrent2_2: batch2[1],
    concurrent2_3: batch2[2],
    concurrent2_4: batch2[3],
    concurrent2_5: batch2[4],
    concurrent3_1: batch3[0],
    concurrent3_2: batch3[1],
    concurrent3_3: batch3[2],
    concurrent3_4: batch3[3],
    concurrent3_5: batch3[4],
  }
}

export function createStreamPromise(): Promise<string> {
  return makeDeferred(streamPromiseValue, streamPromiseDelay)
}

export function createChunkStream(): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      for (const chunk of streamChunks) {
        await delay(streamChunkDelay)
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

export function createRouterHtmlPayload() {
  return makeDeferred(
    {
      value: routerHtmlPayloadChar.repeat(routerHtmlPayloadChars),
      source: sourceMarker(),
    },
    routerHtmlPayloadDelay,
  )
}
