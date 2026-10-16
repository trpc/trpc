import { HttpRouter, HttpServerResponse } from "effect/http"
import * as inspector from "node:inspector/promises"

const WARMUP = 5_000
const REQUESTS = 50_000
const RETAINED_LIMIT = 64
const CHURN_LIMIT = 17_000
const DEFERRED_REQUESTS = 20_000
const DEFERRED_CONCURRENCY = 32
// main deferred a per-request span-end task via setImmediate (~4k bytes/request
// held until the loop turns); the native-tracer fast path ends the span inline.
const DEFERRED_LIMIT = 512

const gc = (globalThis as any).gc as undefined | (() => void)
if (gc === undefined) {
  console.error("run with --expose-gc")
  process.exit(1)
}

const session = new inspector.Session()
session.connect()

const { dispose, handler } = HttpRouter.toWebHandler(
  HttpRouter.add("GET", "/ping", HttpServerResponse.text("pong")),
  { disableLogger: true }
)

const run = async (count: number) => {
  for (let i = 0; i < count; i++) {
    const response = await handler(new Request("http://localhost/ping"))
    await response.arrayBuffer()
  }
}

// a promise-chained load never yields to the event loop, so any per-request
// macrotask (setImmediate) the request path schedules accumulates unrun
const runConcurrent = async (count: number) => {
  let remaining = count
  const worker = async () => {
    while (remaining > 0) {
      remaining--
      const response = await handler(new Request("http://localhost/ping"))
      await response.arrayBuffer()
    }
  }
  await Promise.all(Array.from({ length: DEFERRED_CONCURRENCY }, worker))
}

interface ProfileNode {
  callFrame: { functionName: string; url: string; lineNumber: number }
  selfSize: number
  children?: Array<ProfileNode>
}

const topFrames = (head: ProfileNode) => {
  const byFrame = new Map<string, number>()
  let total = 0
  const visit = (node: ProfileNode) => {
    if (node.selfSize > 0) {
      const f = node.callFrame
      const url = f.url.replace(/^.*\/(packages|node_modules)\//, "$1/")
      const key = `${f.functionName || "(anonymous)"} @ ${url}:${f.lineNumber + 1}`
      byFrame.set(key, (byFrame.get(key) ?? 0) + node.selfSize)
      total += node.selfSize
    }
    node.children?.forEach(visit)
  }
  visit(head)
  return {
    total,
    frames: [...byFrame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  }
}

// Allow FinalizationRegistry callbacks to run before measuring retained heap.
const heapUsed = async () => {
  for (let i = 0; i < 5; i++) {
    gc()
    await new Promise((resolve) => setImmediate(resolve))
  }
  return process.memoryUsage().heapUsed
}

await run(WARMUP)

const heapBefore = await heapUsed()
await run(REQUESTS)
const heapAfter = await heapUsed()

// A promise-chained burst never yields to the event loop, so synchronous-GC
// heap deltas expose per-request work deferred into macrotask queues.
await runConcurrent(WARMUP)
gc()
gc()
const deferredBefore = process.memoryUsage().heapUsed
await runConcurrent(DEFERRED_REQUESTS)
gc()
gc()
const deferredAfter = process.memoryUsage().heapUsed

await session.post("HeapProfiler.startSampling", {
  samplingInterval: 16384,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true
})
await run(REQUESTS)
const { profile } = await session.post("HeapProfiler.stopSampling")

await dispose()

const { frames, total } = topFrames(profile.head as ProfileNode)
const churnPerRequest = Math.round(total / REQUESTS)
const retainedPerRequest = Math.round((heapAfter - heapBefore) / REQUESTS)
const deferredPerRequest = Math.round((deferredAfter - deferredBefore) / DEFERRED_REQUESTS)

console.log(`requests:            ${REQUESTS}`)
console.log(`allocated/request:   ${churnPerRequest} bytes (limit ${CHURN_LIMIT})`)
console.log(`retained/request:    ${retainedPerRequest} bytes (limit ${RETAINED_LIMIT})`)
console.log(`deferred/request:    ${deferredPerRequest} bytes (limit ${DEFERRED_LIMIT})`)
console.log("top allocation sites:")
for (const [key, size] of frames) {
  const pct = ((size / total) * 100).toFixed(1).padStart(5)
  console.log(`  ${pct}%  ${(size / 1024 / 1024).toFixed(2).padStart(7)} MiB  ${key}`)
}

if (retainedPerRequest > RETAINED_LIMIT) {
  console.error(`FAIL: retained heap grows ${retainedPerRequest} bytes/request`)
  process.exit(1)
}
if (deferredPerRequest > DEFERRED_LIMIT) {
  console.error(`FAIL: microtask-only burst holds ${deferredPerRequest} bytes/request exceeds ${DEFERRED_LIMIT}`)
  process.exit(1)
}
if (churnPerRequest > CHURN_LIMIT) {
  console.error(`FAIL: allocation churn ${churnPerRequest} bytes/request exceeds ${CHURN_LIMIT}`)
  process.exit(1)
}
console.log("PASS")
