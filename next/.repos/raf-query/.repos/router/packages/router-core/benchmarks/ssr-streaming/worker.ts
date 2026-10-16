import { createHash } from 'node:crypto'
import { ReadableStream } from 'node:stream/web'
import { performance } from 'node:perf_hooks'

const MiB = 1024 * 1024
// Shared legacy-compatible input: origin finds the ID, while the current
// transform finds the exact boundary suffix. Both benchmark the same bytes.
const BARRIER =
  '<script id="$tsr-stream-barrier">document.currentScript.remove();/*$tsr-stream-boundary*/</script>'
const SHELL_PREFIX = '<!doctype html><html><body><main>done</main>'
const PREFIX = `${SHELL_PREFIX}${BARRIER}`
const SUFFIX = '</body></html>'
const SCRIPT_OPEN = '<script>'
const SCRIPT_CLOSE = ';document.currentScript.remove()</script>'
const REACT_PATCH_PREFIX = '<div hidden id="S:0">'
const REACT_PATCH_SUFFIX = '</div><script>$RC("B:0","S:0")</script>'
const REACT_PATCH_BYTES = 32 * 1024
const REACT_PATCH =
  REACT_PATCH_PREFIX +
  'x'.repeat(
    REACT_PATCH_BYTES - REACT_PATCH_PREFIX.length - REACT_PATCH_SUFFIX.length,
  ) +
  REACT_PATCH_SUFFIX
const SMALL_REACT_PATCH =
  '<div hidden id="S:0">x</div><script>$RC("B:0","S:0")</script>'
const SMALL_SOLID_RECORD = '<template id="solid-patch">x</template>'
const COALESCED_PATCH = '<script>applyPatch()</script>'
const COALESCED_LAST_PATCH = '<script>lastPatch()</script>'
const COALESCED_FILLER = '<div class="body">ordinary text</div>'
// Mirrors of `src/ssr/hydrationScripts.ts` limits and states. The worker
// also runs against a baseline worktree, so it cannot import them; keep these
// in step with MAX_HYDRATION_OUTPUT_CHUNK_BYTES, MAX_DIRECT_CODE_UNITS,
// MIN_OUTPUT_BYTES, and HydrationScriptOutputState.
const OUTPUT_BYTES = 64 * 1024
const FILL_BYTES = 64 * 1024
const DIRECT_HYDRATION_CODE_UNITS = 16 * 1024
const MIN_HYDRATION_OUTPUT_BYTES = 256

const HydrationOutputState = {
  Waiting: 0,
  Ready: 1,
  Active: 2,
  Done: 3,
  Failed: 4,
} as const
type HydrationOutputState =
  (typeof HydrationOutputState)[keyof typeof HydrationOutputState]
const HydrationRecordPhase = {
  Opening: 0,
  Source: 1,
  Closing: 2,
} as const
type HydrationRecordPhase =
  (typeof HydrationRecordPhase)[keyof typeof HydrationRecordPhase]
const hydrationEncoder = new TextEncoder()

type Mode = 'raw' | 'fast' | 'merge'
type Shape = 'flat' | 'rope'
type Framework = 'react' | 'solid' | 'vue'
type RendererSafePoint = 'script-close' | 'record-end'
type BaselineImplementation = 'origin'
type AppStreamValue = Uint8Array | string
type Transform = (
  router: any,
  stream: ReadableStream<AppStreamValue>,
  options?: { rendererSafePoint?: RendererSafePoint },
) => ReadableStream<Uint8Array>

type Memory = {
  heapUsed: number
  external: number
  arrayBuffers: number
  rss: number
}

type ScenarioMetadata = {
  name: string
  framework: Framework
  rendererSafePoint?: RendererSafePoint
}

type Scenario =
  | (ScenarioMetadata & {
      kind: 'hydration'
      records: number
      recordBytes: number
      shape: Shape
    })
  | (ScenarioMetadata & {
      kind: 'closing'
      bytes: number
      framework: 'react'
      rendererSafePoint: 'script-close'
    })
  | (ScenarioMetadata & {
      kind: 'renderer-records'
      record: string
      records: number
      closeBeforeRecords: boolean
      routerRecordBytes: number
      framework: 'react' | 'solid'
      rendererSafePoint: RendererSafePoint
    })
  | (ScenarioMetadata & {
      kind: 'coalesced-close'
      bytes: number
      scriptAtEnd: boolean
      closeInNextChunk: boolean
      framework: 'react'
      rendererSafePoint: 'script-close'
    })
  | (ScenarioMetadata & {
      kind: 'application-string'
      bytes: number
      shape: Shape
      routerRecordBytes: number
      framework: 'react'
      rendererSafePoint: 'script-close'
    })

function parseScenario(name: string): Scenario {
  const coalescedCloseMatch =
    /^react-coalesced-(early-script|next-close|late-script)-(1|64)k$/.exec(name)
  if (coalescedCloseMatch) {
    return {
      kind: 'coalesced-close',
      name,
      bytes: Number(coalescedCloseMatch[2]) * 1024,
      scriptAtEnd: coalescedCloseMatch[1] === 'late-script',
      closeInNextChunk: coalescedCloseMatch[1] === 'next-close',
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  const commonHydrationMatch =
    /^hydration(?:(?:-(solid|vue))?)-(1|4|16|32|64)k$/.exec(name)
  if (commonHydrationMatch) {
    const framework =
      (commonHydrationMatch[1] as Framework | undefined) ?? 'react'
    return {
      kind: 'hydration',
      name,
      records: 1,
      recordBytes: Number(commonHydrationMatch[2]) * 1024,
      shape: 'flat',
      framework,
      rendererSafePoint:
        framework === 'react'
          ? 'script-close'
          : framework === 'solid'
            ? 'record-end'
            : undefined,
    }
  }
  if (name === 'hydration-17m') {
    return {
      kind: 'hydration',
      name,
      records: 1,
      recordBytes: 17 * MiB,
      shape: 'flat',
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  if (name === 'router-records-15m') {
    return {
      kind: 'hydration',
      name,
      records: 480,
      recordBytes: 32 * 1024,
      shape: 'flat',
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  if (name === 'closing-heavy-17m') {
    return {
      kind: 'closing',
      name,
      bytes: 17 * MiB,
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  if (name === 'react18-patches-17m') {
    return {
      kind: 'renderer-records',
      name,
      record: REACT_PATCH,
      records: (17 * MiB) / REACT_PATCH_BYTES,
      closeBeforeRecords: true,
      routerRecordBytes: 32 * 1024,
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  if (name === 'react19-patches-17m') {
    return {
      kind: 'renderer-records',
      name,
      record: REACT_PATCH,
      records: (17 * MiB) / REACT_PATCH_BYTES,
      closeBeforeRecords: false,
      routerRecordBytes: 32 * 1024,
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  if (name === 'react-patches-64-records') {
    return {
      kind: 'renderer-records',
      name,
      record: SMALL_REACT_PATCH,
      records: 64,
      closeBeforeRecords: false,
      routerRecordBytes: 1024,
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  if (name === 'solid-patches-64-records') {
    return {
      kind: 'renderer-records',
      name,
      record: SMALL_SOLID_RECORD,
      records: 64,
      closeBeforeRecords: false,
      routerRecordBytes: 1024,
      framework: 'solid',
      rendererSafePoint: 'record-end',
    }
  }
  const applicationStringMatch =
    /^application-string-(flat|rope)-(1|4|17)m$/.exec(name)
  if (applicationStringMatch) {
    return {
      kind: 'application-string',
      name,
      bytes: Number(applicationStringMatch[2]) * MiB,
      shape: applicationStringMatch[1] as Shape,
      routerRecordBytes: 1024,
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  const routerMatch = /^(router-string)-(flat|rope)-(1|4|17|32)m$/.exec(name)
  if (routerMatch) {
    return {
      kind: 'hydration',
      name,
      records: 1,
      recordBytes: Number(routerMatch[3]) * MiB,
      shape: routerMatch[2] as Shape,
      framework: 'react',
      rendererSafePoint: 'script-close',
    }
  }
  throw new Error(`Unknown benchmark scenario: ${name}`)
}

function forceGc() {
  if (typeof globalThis.gc !== 'function') {
    throw new Error('The benchmark worker requires node --expose-gc')
  }
  globalThis.gc()
  globalThis.gc()
}

function memory(): Memory {
  const value = process.memoryUsage()
  return {
    heapUsed: value.heapUsed,
    external: value.external,
    arrayBuffers: value.arrayBuffers,
    rss: value.rss,
  }
}

function delta(value: Memory, baseline: Memory): Memory {
  return {
    heapUsed: value.heapUsed - baseline.heapUsed,
    external: value.external - baseline.external,
    arrayBuffers: value.arrayBuffers - baseline.arrayBuffers,
    rss: value.rss - baseline.rss,
  }
}

function maxMemory(target: Memory, value: Memory) {
  target.heapUsed = Math.max(target.heapUsed, value.heapUsed)
  target.external = Math.max(target.external, value.external)
  target.arrayBuffers = Math.max(target.arrayBuffers, value.arrayBuffers)
  target.rss = Math.max(target.rss, value.rss)
}

function marker(index: number) {
  return `r${index.toString(36).padStart(6, '0')}:`
}

function fillCode(index: number) {
  return 97 + (index % 20)
}

function createSource(bytes: number, index: number, shape: Shape) {
  const recordMarker = marker(index)
  const remaining = bytes - recordMarker.length
  if (remaining < 0) {
    throw new Error('Source record is smaller than its marker')
  }
  if (shape === 'flat') {
    const source = Buffer.allocUnsafe(bytes)
    source.fill(fillCode(index))
    source.write(recordMarker, 0, 'ascii')
    return source.toString('latin1')
  }
  const piece = String.fromCharCode(fillCode(index)).repeat(4096)
  let source = recordMarker
  let left = remaining
  while (left > 0) {
    source += left >= piece.length ? piece : piece.slice(0, left)
    left -= Math.min(left, piece.length)
  }
  return source
}

function updateRepeated(
  hash: ReturnType<typeof createHash>,
  code: number,
  bytes: number,
) {
  const buffer = Buffer.allocUnsafe(Math.min(FILL_BYTES, bytes || 1)).fill(code)
  let left = bytes
  while (left > 0) {
    const length = Math.min(left, buffer.length)
    hash.update(buffer.subarray(0, length))
    left -= length
  }
}

function updateSource(
  hash: ReturnType<typeof createHash>,
  bytes: number,
  index: number,
) {
  const recordMarker = marker(index)
  hash.update(recordMarker)
  updateRepeated(hash, fillCode(index), bytes - recordMarker.length)
}

type RouterSource = {
  records: number
  recordBytes: number
  shape: Shape
}

function getRouterSource(scenario: Scenario): RouterSource | undefined {
  if (scenario.kind === 'hydration') {
    return {
      records: scenario.records,
      recordBytes: scenario.recordBytes,
      shape: scenario.shape,
    }
  }
  if (scenario.kind === 'renderer-records') {
    return {
      records: 1,
      recordBytes: scenario.routerRecordBytes,
      shape: 'flat',
    }
  }
  if (scenario.kind === 'application-string') {
    return {
      records: 1,
      recordBytes: scenario.routerRecordBytes,
      shape: 'flat',
    }
  }
  return undefined
}

function expected(scenario: Scenario, mode: Mode) {
  const hash = createHash('sha256')
  let bytes = 0
  const add = (value: string) => {
    hash.update(value)
    bytes += Buffer.byteLength(value)
  }
  const addRouterRecord = (recordBytes: number, index: number) => {
    add(SCRIPT_OPEN)
    updateSource(hash, recordBytes, index)
    bytes += recordBytes
    add(SCRIPT_CLOSE)
  }
  const addRouterSources = () => {
    const source = getRouterSource(scenario)
    if (!source) {
      return
    }
    for (let index = 0; index < source.records; index++) {
      addRouterRecord(source.recordBytes, index)
    }
  }
  const addRendererRecords = (record: string, records: number) => {
    for (let index = 0; index < records; index++) {
      add(record)
    }
  }

  if (scenario.kind === 'coalesced-close') {
    add(PREFIX)
    if (!scenario.scriptAtEnd) {
      add(COALESCED_PATCH)
    }
    add(createCoalescedFiller(scenario.bytes))
    if (scenario.scriptAtEnd) {
      add(COALESCED_PATCH)
    }
    if (mode !== 'merge') {
      add(SUFFIX)
    }
    add(COALESCED_LAST_PATCH)
    if (mode === 'merge') {
      add(SUFFIX)
    }
  } else if (scenario.kind === 'closing') {
    add(SHELL_PREFIX)
    const pattern = '<div><span>x</span></div>'
    const repetitions = Math.floor(scenario.bytes / pattern.length)
    const remainder = scenario.bytes % pattern.length
    for (let index = 0; index < repetitions; index++) {
      add(pattern)
    }
    add(pattern.slice(0, remainder))
    add(BARRIER)
    add(SUFFIX)
  } else if (scenario.kind === 'hydration') {
    if (mode === 'merge') {
      add(PREFIX)
      addRouterSources()
    } else {
      add(SHELL_PREFIX)
      addRouterSources()
      add(BARRIER)
    }
    add(SUFFIX)
  } else if (scenario.kind === 'renderer-records') {
    if (mode === 'merge') {
      add(PREFIX)
      addRendererRecords(scenario.record, scenario.records)
      addRouterSources()
      add(SUFFIX)
    } else {
      add(SHELL_PREFIX)
      addRouterSources()
      add(BARRIER)
      if (scenario.closeBeforeRecords) {
        add(SUFFIX)
      }
      addRendererRecords(scenario.record, scenario.records)
      if (!scenario.closeBeforeRecords) {
        add(SUFFIX)
      }
    }
  } else {
    if (mode === 'merge') {
      add(PREFIX)
      addRouterSources()
    } else {
      add(SHELL_PREFIX)
      addRouterSources()
      add(BARRIER)
    }
    updateRepeated(hash, 'x'.charCodeAt(0), scenario.bytes)
    bytes += scenario.bytes
    add(SUFFIX)
  }
  return { bytes, digest: hash.digest('hex') }
}

const expectedOutputCache = new Map<string, ReturnType<typeof expected>>()

function getExpectedOutput(scenario: Scenario, mode: Mode) {
  const key = `${scenario.name}:${mode}`
  let value = expectedOutputCache.get(key)
  if (!value) {
    value = expected(scenario, mode)
    expectedOutputCache.set(key, value)
  }
  return value
}

function* repeatedPatternBytes(pattern: string, bytes: number) {
  const chunk = pattern.repeat(Math.floor(FILL_BYTES / pattern.length))
  let left = bytes
  while (left > 0) {
    const value = chunk.slice(0, Math.min(left, chunk.length))
    yield Buffer.from(value)
    left -= value.length
  }
}

function* repeatedCompletePatternBytes(
  pattern: string,
  bytes: number,
  maxChunkBytes = FILL_BYTES,
) {
  let repetitions = Math.floor(bytes / pattern.length)
  const repetitionsPerChunk = Math.max(
    1,
    Math.floor(maxChunkBytes / pattern.length),
  )
  const fullChunk = pattern.repeat(repetitionsPerChunk)
  while (repetitions > 0) {
    const count = Math.min(repetitions, repetitionsPerChunk)
    yield Buffer.from(
      count === repetitionsPerChunk ? fullChunk : pattern.repeat(count),
    )
    repetitions -= count
  }
}

function* routerScriptBytes(source: RouterSource): Generator<Uint8Array> {
  for (let index = 0; index < source.records; index++) {
    yield Buffer.from(SCRIPT_OPEN + marker(index))
    let left = source.recordBytes - marker(index).length
    while (left > 0) {
      const length = Math.min(left, FILL_BYTES)
      yield Buffer.alloc(length, fillCode(index))
      left -= length
    }
    yield Buffer.from(SCRIPT_CLOSE)
  }
}

function* integratedBytes(scenario: Scenario): Generator<Uint8Array> {
  if (scenario.kind === 'coalesced-close') {
    yield* coalescedCloseApplicationBytes(scenario)
    return
  }
  if (scenario.kind === 'closing') {
    yield Buffer.from(SHELL_PREFIX)
    yield* repeatedPatternBytes('<div><span>x</span></div>', scenario.bytes)
    yield Buffer.from(BARRIER)
    yield Buffer.from(SUFFIX)
    return
  }

  yield Buffer.from(SHELL_PREFIX)
  const source = getRouterSource(scenario)
  if (source) {
    yield* routerScriptBytes(source)
  }
  yield Buffer.from(BARRIER)

  if (scenario.kind === 'hydration') {
    yield Buffer.from(SUFFIX)
  } else if (scenario.kind === 'renderer-records') {
    if (scenario.closeBeforeRecords) {
      yield Buffer.from(SUFFIX)
    }
    yield* repeatedCompletePatternBytes(
      scenario.record,
      scenario.record.length * scenario.records,
      scenario.record.length,
    )
    if (!scenario.closeBeforeRecords) {
      yield Buffer.from(SUFFIX)
    }
  } else {
    yield Buffer.alloc(scenario.bytes, 'x'.charCodeAt(0))
    yield Buffer.from(SUFFIX)
  }
}

function createCoalescedFiller(bytes: number) {
  return (
    COALESCED_FILLER.repeat(Math.floor(bytes / COALESCED_FILLER.length)) +
    'x'.repeat(bytes % COALESCED_FILLER.length)
  )
}

function* coalescedCloseApplicationBytes(
  scenario: Extract<Scenario, { kind: 'coalesced-close' }>,
) {
  const filler = createCoalescedFiller(scenario.bytes)
  const content =
    PREFIX +
    (scenario.scriptAtEnd ? filler + COALESCED_PATCH : COALESCED_PATCH + filler)
  const close = SUFFIX + COALESCED_LAST_PATCH
  yield Buffer.from(content + (scenario.closeInNextChunk ? '' : close))
  if (scenario.closeInNextChunk) {
    yield Buffer.from(close)
  }
  // Keep hydration Waiting while the coalesced bytes drain. Without this
  // record, source prefetch can report EOF before the transform scans them.
  yield new Uint8Array(0)
}

function* rendererRecordApplicationBytes(
  scenario: Extract<Scenario, { kind: 'renderer-records' }>,
) {
  yield Buffer.from(PREFIX)
  if (scenario.closeBeforeRecords) {
    yield Buffer.from(SUFFIX)
  }
  yield* repeatedCompletePatternBytes(
    scenario.record,
    scenario.record.length * scenario.records,
    scenario.record.length,
  )
  if (!scenario.closeBeforeRecords) {
    yield Buffer.from(SUFFIX)
  }
  // This empty record lets the transform consume all renderer bytes before
  // the source reports EOF and starts the independent router producer.
  yield new Uint8Array(0)
}

function streamFromIterator(
  iterator: Iterator<AppStreamValue>,
  onEof?: () => void,
  beforeEof?: Promise<void>,
  onBeforeEof?: () => void,
) {
  return new ReadableStream<AppStreamValue>({
    async pull(controller) {
      const next = iterator.next()
      if (next.done) {
        onBeforeEof?.()
        await beforeEof
        onEof?.()
        controller.close()
      } else {
        controller.enqueue(next.value)
      }
    },
  })
}

function createApplicationString(
  scenario: Extract<Scenario, { kind: 'application-string' }>,
) {
  if (scenario.shape === 'flat') {
    const value = Buffer.allocUnsafe(
      PREFIX.length + scenario.bytes + SUFFIX.length,
    )
    value.write(PREFIX, 0, 'ascii')
    value.fill('x'.charCodeAt(0), PREFIX.length, PREFIX.length + scenario.bytes)
    value.write(SUFFIX, PREFIX.length + scenario.bytes, 'ascii')
    return value.toString('latin1')
  }
  const piece = 'x'.repeat(4096)
  let value = PREFIX
  let left = scenario.bytes
  while (left > 0) {
    value += left >= piece.length ? piece : piece.slice(0, left)
    left -= Math.min(left, piece.length)
  }
  return value + SUFFIX
}

function makeRouter(serializationFinished: boolean) {
  let finished = serializationFinished
  let streamFastPathReserved = false
  let cleanupCount = 0
  let renderFinishedCount = 0
  let reserveCalls = 0
  let scriptSubscriptions = 0
  let htmlSubscriptions = 0
  let bufferedHtmlReads = 0
  let fastPathGrants = 0
  let hydrationOutputClaims = 0
  let hydrationOutputSubscriptions = 0
  let hydrationOutputPulls = 0
  const scriptListeners = new Set<(parts: ReadonlyArray<string>) => void>()
  const htmlListeners = new Set<(html: string) => void>()
  const finishedListeners = new Set<() => void>()
  const pendingScripts: Array<string> = []
  const bufferedHtml: Array<string> = []
  const hydrationSources: Array<string | undefined> = []
  let hydrationSourceHead = 0
  let hydrationSource: string | undefined
  let hydrationSegment = ''
  let hydrationSegmentOffset = 0
  let hydrationPhase: HydrationRecordPhase = HydrationRecordPhase.Opening
  let hydrationOutputCapacity = MIN_HYDRATION_OUTPUT_BYTES
  let hydrationState: HydrationOutputState = HydrationOutputState.Waiting
  let hydrationError: unknown
  let hydrationListener: (() => void) | undefined
  let hydrationOutput:
    | {
        readonly state: number
        readonly error: unknown
        pullChunk(): Uint8Array
        subscribe(onChange: () => void): () => void
      }
    | undefined
  let liftBarrier!: () => void
  const barrier = new Promise<void>((resolve) => {
    liftBarrier = resolve
  })

  function hydrationQueueIsEmpty() {
    return hydrationSourceHead === hydrationSources.length
  }

  function refreshHydrationState(notify = true) {
    const next = hydrationSource
      ? HydrationOutputState.Active
      : !hydrationQueueIsEmpty()
        ? HydrationOutputState.Ready
        : finished
          ? HydrationOutputState.Done
          : HydrationOutputState.Waiting
    if (hydrationState !== next) {
      hydrationState = next
      if (notify) {
        hydrationListener?.()
      }
    }
  }

  function releaseHydrationSource() {
    hydrationSources[hydrationSourceHead++] = undefined
    if (hydrationQueueIsEmpty()) {
      hydrationSources.length = 0
      hydrationSourceHead = 0
    }
    hydrationSource = undefined
    hydrationSegment = ''
    hydrationSegmentOffset = 0
    hydrationPhase = HydrationRecordPhase.Opening
    refreshHydrationState(false)
  }

  function startHydrationSource(codeUnits: number) {
    hydrationSource = hydrationSources[hydrationSourceHead]!
    hydrationPhase = HydrationRecordPhase.Opening
    hydrationSegment = SCRIPT_OPEN
    hydrationSegmentOffset = 0
    hydrationOutputCapacity = Math.max(
      MIN_HYDRATION_OUTPUT_BYTES,
      Math.min(OUTPUT_BYTES, codeUnits),
    )
    hydrationState = HydrationOutputState.Active
  }

  function advanceHydrationSegment() {
    if (hydrationPhase === HydrationRecordPhase.Opening) {
      hydrationPhase = HydrationRecordPhase.Source
      hydrationSegment = hydrationSource!
      hydrationSegmentOffset = 0
    } else if (hydrationPhase === HydrationRecordPhase.Source) {
      hydrationPhase = HydrationRecordPhase.Closing
      hydrationSegment = SCRIPT_CLOSE
      hydrationSegmentOffset = 0
    } else {
      releaseHydrationSource()
    }
  }

  function pullHydrationChunk() {
    hydrationOutputPulls++
    if (
      hydrationState !== HydrationOutputState.Ready &&
      hydrationState !== HydrationOutputState.Active
    ) {
      throw new Error('Benchmark hydration output is not ready')
    }

    try {
      if (hydrationState === HydrationOutputState.Ready) {
        const source = hydrationSources[hydrationSourceHead]!
        const codeUnits =
          SCRIPT_OPEN.length + source.length + SCRIPT_CLOSE.length
        if (codeUnits <= DIRECT_HYDRATION_CODE_UNITS) {
          const bytes = hydrationEncoder.encode(
            SCRIPT_OPEN + source + SCRIPT_CLOSE,
          )
          hydrationSource = source
          releaseHydrationSource()
          return bytes
        }
        startHydrationSource(codeUnits)
      }

      const bytes = new Uint8Array(hydrationOutputCapacity)
      let outputOffset = 0
      while (hydrationSource) {
        if (hydrationSegmentOffset === hydrationSegment.length) {
          advanceHydrationSegment()
        } else if (outputOffset === bytes.length) {
          break
        } else {
          const target =
            outputOffset === 0 ? bytes : bytes.subarray(outputOffset)
          const result = hydrationEncoder.encodeInto(
            hydrationSegment.slice(hydrationSegmentOffset),
            target,
          )
          if (result.read === 0) {
            if (outputOffset === 0) {
              throw new Error('Benchmark hydration encoder made no progress')
            }
            break
          }
          hydrationSegmentOffset += result.read
          outputOffset += result.written
        }
      }
      if (outputOffset === 0) {
        throw new Error('Benchmark hydration record produced no output')
      }
      return outputOffset === bytes.length
        ? bytes
        : bytes.subarray(0, outputOffset)
    } catch (error) {
      hydrationError = error
      hydrationState = HydrationOutputState.Failed
      hydrationListener?.()
      throw error
    }
  }

  function reserveFastPath(output?: typeof hydrationOutput) {
    reserveCalls++
    if (
      !finished ||
      streamFastPathReserved ||
      pendingScripts.length > 0 ||
      hydrationSource !== undefined ||
      !hydrationQueueIsEmpty() ||
      (hydrationOutput ? output !== hydrationOutput : output !== undefined)
    ) {
      return false
    }
    streamFastPathReserved = true
    fastPathGrants++
    return true
  }

  function claimOutput() {
    hydrationOutputClaims++
    if (hydrationOutput) {
      throw new Error('Benchmark hydration output already has a consumer')
    }
    hydrationOutput = {
      get state() {
        return hydrationState
      },
      get error() {
        return hydrationError
      },
      pullChunk: pullHydrationChunk,
      subscribe(onChange: () => void) {
        hydrationOutputSubscriptions++
        if (hydrationListener) {
          throw new Error('Benchmark hydration output already has a subscriber')
        }
        hydrationListener = onChange
        return () => {
          if (hydrationListener === onChange) {
            hydrationListener = undefined
          }
        }
      },
    }
    refreshHydrationState(false)
    return hydrationOutput
  }

  const hydrationScripts = {
    reserveFastPath,
    claimOutput,
    liftBarrier,
    // The worktree transform skips barrier scanning until the initial take.
    // The synthetic fixture renders the boundary in its input, so report the
    // take as already done.
    isInitialTaken: () => true,
    // The worktree transform arms the serialization deadline through the
    // transport; the fixture manages its own timing.
    startSerializationTimeout: (_timeoutMs: number) => {},
  }

  const serverSsr = {
    hydrationScripts,
    isSerializationFinished: () => finished,
    // Keep the old transport shape so this one fixture can run origin and the
    // candidate baseline against the same synthetic request.
    reserveStreamFastPath: reserveFastPath,
    claimHydrationScriptOutput: claimOutput,
    onScriptBatch(listener: (parts: ReadonlyArray<string>) => void) {
      scriptSubscriptions++
      scriptListeners.add(listener)
      if (pendingScripts.length > 0) {
        const parts = pendingScripts.splice(0)
        listener(parts)
      }
      return () => scriptListeners.delete(listener)
    },
    onInjectedHtml(listener: (html: string) => void) {
      htmlSubscriptions++
      htmlListeners.add(listener)
      return () => htmlListeners.delete(listener)
    },
    takeBufferedHtml() {
      bufferedHtmlReads++
      return bufferedHtml.shift()
    },
    onSerializationFinished(listener: () => void) {
      finishedListeners.add(listener)
      return () => finishedListeners.delete(listener)
    },
    setRenderFinished() {
      renderFinishedCount++
      liftBarrier()
    },
    liftScriptBarrier: liftBarrier,
    // The worktree transform registers a cleanup listener to tear down
    // promptly on external cleanup. The fixture drives termination itself,
    // so registration is accepted and ignored.
    onCleanup(_listener: () => void) {},
    cleanup() {
      cleanupCount++
      scriptListeners.clear()
      htmlListeners.clear()
      finishedListeners.clear()
      pendingScripts.length = 0
      bufferedHtml.length = 0
      hydrationSources.length = 0
      hydrationSourceHead = 0
      hydrationSource = undefined
      hydrationSegment = ''
      hydrationSegmentOffset = 0
      hydrationPhase = HydrationRecordPhase.Opening
      hydrationOutputCapacity = MIN_HYDRATION_OUTPUT_BYTES
      hydrationListener = undefined
      hydrationOutput = undefined
      hydrationError = undefined
      hydrationState = HydrationOutputState.Done
    },
  }
  return {
    router: { options: {}, serverSsr },
    emit(source: string) {
      if (hydrationOutput) {
        hydrationSources.push(source)
        refreshHydrationState()
      } else if (scriptListeners.size > 0) {
        for (const listener of scriptListeners) {
          listener([source])
        }
      } else {
        pendingScripts.push(source)
      }
      if (htmlListeners.size > 0) {
        const html = SCRIPT_OPEN + source + SCRIPT_CLOSE
        bufferedHtml.push(html)
        for (const listener of htmlListeners) {
          listener(html)
        }
        if (bufferedHtml[0] === html) {
          bufferedHtml.shift()
        }
      }
    },
    finish() {
      finished = true
      refreshHydrationState()
      for (const listener of finishedListeners) {
        listener()
      }
    },
    barrier,
    counts: () => ({
      cleanupCount,
      renderFinishedCount,
      reserveCalls,
      fastPathGrants,
      scriptSubscriptions,
      htmlSubscriptions,
      bufferedHtmlReads,
      hydrationOutputClaims,
      hydrationOutputSubscriptions,
      hydrationOutputPulls,
    }),
  }
}

function createInput(
  scenario: Scenario,
  mode: Mode,
  onEof: () => void,
  beforeEof?: Promise<void>,
  onBeforeEof?: () => void,
) {
  if (mode === 'merge' && scenario.kind === 'application-string') {
    return streamFromIterator(
      [createApplicationString(scenario)][Symbol.iterator](),
      onEof,
      beforeEof,
      onBeforeEof,
    )
  }
  if (mode === 'merge' && scenario.kind === 'hydration') {
    return streamFromIterator(
      [Buffer.from(PREFIX), Buffer.from(SUFFIX)][Symbol.iterator](),
      onEof,
      beforeEof,
      onBeforeEof,
    )
  }
  if (mode === 'merge' && scenario.kind === 'renderer-records') {
    return streamFromIterator(
      rendererRecordApplicationBytes(scenario),
      onEof,
      beforeEof,
      onBeforeEof,
    )
  }
  return streamFromIterator(
    integratedBytes(scenario),
    onEof,
    beforeEof,
    onBeforeEof,
  )
}

function findNeedle(chunk: Uint8Array, needle: Buffer, tail: Buffer) {
  const value = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  let count = 0

  if (tail.length > 0 && value.length > 0) {
    const headLength = Math.min(value.length, needle.length - 1)
    const boundary = Buffer.allocUnsafe(tail.length + headLength)
    boundary.set(tail)
    boundary.set(value.subarray(0, headLength), tail.length)
    let offset = 0
    for (;;) {
      const found = boundary.indexOf(needle, offset)
      if (found === -1) {
        break
      }
      if (found < tail.length && found + needle.length > tail.length) {
        count++
      }
      offset = found + 1
    }
  }

  let offset = 0
  for (;;) {
    const found = value.indexOf(needle, offset)
    if (found === -1) {
      break
    }
    count++
    offset = found + 1
  }

  const keep = Math.min(needle.length - 1, tail.length + value.length)
  let nextTail: Buffer
  if (keep === 0) {
    nextTail = Buffer.alloc(0)
  } else if (value.length >= keep) {
    nextTail = Buffer.from(value.subarray(value.length - keep))
  } else {
    nextTail = Buffer.allocUnsafe(keep)
    const tailBytes = keep - value.length
    nextTail.set(tail.subarray(tail.length - tailBytes))
    nextTail.set(value, tailBytes)
  }
  return {
    count,
    tail: nextTail,
  }
}

export async function run(
  transform: Transform,
  implementation: string,
  scenarioName: string,
  mode: Mode,
  writeResult = true,
  measureMemory = true,
  validateOutput = true,
) {
  const scenario = parseScenario(scenarioName)
  const expectedOutput = getExpectedOutput(scenario, mode)
  const routerSource = getRouterSource(scenario)
  const containsRouterScripts = routerSource !== undefined
  const hasLateScripts = mode === 'merge' && containsRouterScripts
  const fake = makeRouter(mode !== 'merge')
  let resolveProducerComplete!: () => void
  const producerComplete = new Promise<void>((resolve) => {
    resolveProducerComplete = resolve
  })
  if (!hasLateScripts) {
    resolveProducerComplete()
  }
  let resolveAppContentConsumed!: () => void
  const appContentConsumed = new Promise<void>((resolve) => {
    resolveAppContentConsumed = resolve
  })
  if (scenario.kind !== 'renderer-records' || mode !== 'merge') {
    resolveAppContentConsumed()
  }
  let startedAt = 0
  let rendererEofMs: number | null = null
  const input = createInput(
    scenario,
    mode,
    () => {
      rendererEofMs = performance.now() - startedAt
      if (mode === 'merge' && !hasLateScripts) {
        fake.finish()
      }
    },
    hasLateScripts ? producerComplete : undefined,
    resolveAppContentConsumed,
  )
  if (measureMemory) {
    forceGc()
  }
  const baseline = measureMemory ? memory() : undefined
  const peak: Memory = { heapUsed: 0, external: 0, arrayBuffers: 0, rss: 0 }
  const sample = () => {
    if (!measureMemory) {
      return
    }
    const value = delta(memory(), baseline!)
    maxMemory(peak, value)
  }

  startedAt = performance.now()
  const output =
    mode === 'raw'
      ? (input as ReadableStream<Uint8Array>)
      : transform(
          fake.router,
          input,
          scenario.rendererSafePoint
            ? { rendererSafePoint: scenario.rendererSafePoint }
            : {},
        )

  let sourceProducerMs = 0
  let producerFinishedMs: number | null = null
  let outstandingSourceRecords = 0
  let outstandingSourceCodeUnits = 0
  let sourceRecordHighWater = 0
  let sourceCodeUnitHighWater = 0
  const producer = hasLateScripts
    ? (async () => {
        await fake.barrier
        await appContentConsumed
        const sourceStartedAt = performance.now()
        for (let index = 0; index < routerSource!.records; index++) {
          const source = createSource(
            routerSource!.recordBytes,
            index,
            routerSource!.shape,
          )
          outstandingSourceRecords++
          outstandingSourceCodeUnits += source.length
          sourceRecordHighWater = Math.max(
            sourceRecordHighWater,
            outstandingSourceRecords,
          )
          sourceCodeUnitHighWater = Math.max(
            sourceCodeUnitHighWater,
            outstandingSourceCodeUnits,
          )
          fake.emit(source)
          if (index % 16 === 15) {
            await new Promise<void>((resolve) => setImmediate(resolve))
          }
        }
        fake.finish()
        sourceProducerMs = performance.now() - sourceStartedAt
        producerFinishedMs = performance.now() - startedAt
        sample()
        resolveProducerComplete()
      })()
    : Promise.resolve()

  const reader = output.getReader()
  const hash = validateOutput ? createHash('sha256') : undefined
  const firstScriptNeedle = Buffer.from(marker(0))
  const completedScriptNeedle = Buffer.from(SCRIPT_CLOSE)
  let firstScriptTail: Buffer = Buffer.alloc(0)
  let completedScriptTail: Buffer = Buffer.alloc(0)
  let firstRouterScriptMs: number | null = null
  let bytes = 0
  let chunks = 0
  let maxOutputChunkBytes = 0
  let ttfbMs: number | null = null
  for (;;) {
    const result = await reader.read()
    if (result.done) {
      break
    }
    const now = performance.now()
    if (ttfbMs === null) {
      ttfbMs = now - startedAt
    }
    const value = result.value
    bytes += value.byteLength
    chunks++
    maxOutputChunkBytes = Math.max(maxOutputChunkBytes, value.byteLength)
    hash?.update(value)
    if (
      validateOutput &&
      containsRouterScripts &&
      firstRouterScriptMs === null
    ) {
      const match = findNeedle(value, firstScriptNeedle, firstScriptTail)
      firstScriptTail = match.tail
      if (match.count > 0) {
        firstRouterScriptMs = now - startedAt
      }
    }
    if (validateOutput && hasLateScripts) {
      const completed = findNeedle(
        value,
        completedScriptNeedle,
        completedScriptTail,
      )
      completedScriptTail = completed.tail
      if (completed.count > 0) {
        outstandingSourceRecords -= completed.count
        outstandingSourceCodeUnits -=
          completed.count * routerSource!.recordBytes
      }
    }
    if (chunks % 16 === 0) {
      sample()
    }
  }
  await producer
  sample()
  const elapsedMs = performance.now() - startedAt
  const digest = hash?.digest('hex') ?? expectedOutput.digest
  const memoryBeforeFinalGc = measureMemory ? memory() : undefined
  if (measureMemory) {
    maxMemory(peak, delta(memoryBeforeFinalGc!, baseline!))
    forceGc()
  }
  const finalMemory = measureMemory ? memory() : undefined
  const counts = fake.counts()
  let selectedApi:
    | 'none'
    | 'hydration-output'
    | 'script-batch'
    | 'injected-html'
    | 'buffered-html' = 'none'
  if (
    bytes !== expectedOutput.bytes ||
    (validateOutput && digest !== expectedOutput.digest)
  ) {
    throw new Error(
      `Output validation failed: ${bytes}/${digest} !== ${expectedOutput.bytes}/${expectedOutput.digest}`,
    )
  }
  if (validateOutput && hasLateScripts && outstandingSourceRecords !== 0) {
    throw new Error(
      `Only ${routerSource!.records - outstandingSourceRecords} router records completed`,
    )
  }
  if (validateOutput && containsRouterScripts && firstRouterScriptMs === null) {
    throw new Error('The output did not contain the first router script')
  }
  if (
    validateOutput &&
    hasLateScripts &&
    scenario.kind === 'hydration' &&
    (firstRouterScriptMs === null ||
      rendererEofMs === null ||
      firstRouterScriptMs >= rendererEofMs)
  ) {
    throw new Error(
      `Router source did not start before renderer EOF: ${firstRouterScriptMs}/${rendererEofMs}`,
    )
  }
  if (
    validateOutput &&
    hasLateScripts &&
    (producerFinishedMs === null ||
      rendererEofMs === null ||
      producerFinishedMs > rendererEofMs)
  ) {
    throw new Error(
      `Router producer finished after renderer EOF: ${producerFinishedMs}/${rendererEofMs}`,
    )
  }
  if (
    mode !== 'raw' &&
    (counts.cleanupCount < 1 || counts.renderFinishedCount !== 1)
  ) {
    throw new Error(`Invalid lifecycle counts: ${JSON.stringify(counts)}`)
  }
  if (
    mode === 'fast' &&
    (counts.reserveCalls !== 1 ||
      counts.fastPathGrants !== 1 ||
      counts.hydrationOutputClaims !== 0 ||
      counts.hydrationOutputSubscriptions !== 0 ||
      counts.hydrationOutputPulls !== 0)
  ) {
    throw new Error(
      `Fast path was not selected exactly once: ${JSON.stringify(counts)}`,
    )
  }
  if (mode === 'merge') {
    const mergeApi =
      counts.hydrationOutputClaims === 1 &&
      counts.hydrationOutputSubscriptions === 1 &&
      counts.scriptSubscriptions === 0 &&
      counts.htmlSubscriptions === 0
        ? 'hydration-output'
        : counts.hydrationOutputClaims === 0 &&
            counts.scriptSubscriptions === 1 &&
            counts.htmlSubscriptions === 0
          ? 'script-batch'
          : counts.hydrationOutputClaims === 0 &&
              counts.scriptSubscriptions === 0 &&
              counts.htmlSubscriptions === 1
            ? counts.bufferedHtmlReads > 0
              ? 'buffered-html'
              : 'injected-html'
            : undefined
    if (!mergeApi || counts.reserveCalls < 1) {
      throw new Error(
        `Merge path/API assertion failed: ${JSON.stringify(counts)}`,
      )
    }
    selectedApi = mergeApi
  }
  const dynamicPassThroughSelected =
    mode === 'merge' && counts.fastPathGrants === 1
  const result = {
    implementation,
    scenario: scenario.name,
    framework: scenario.framework,
    rendererSafePoint: scenario.rendererSafePoint,
    mode,
    memoryMeasured: measureMemory,
    selectedApi,
    dynamicPassThroughSelected,
    outputBytes: bytes,
    outputSha256: digest,
    chunks,
    maxOutputChunkBytes,
    ttfbMs,
    firstRouterScriptMs,
    producerFinishedMs,
    rendererEofMs,
    elapsedMs,
    throughputMiBPerSecond: bytes / MiB / (elapsedMs / 1000),
    sourceProducerMs,
    sourceRecordHighWater,
    sourceCodeUnitHighWater,
    memoryBaselineBytes: baseline,
    memoryPeakBytes: measureMemory ? peak : undefined,
    memoryBeforeFinalGcBytes: memoryBeforeFinalGc,
    memoryBeforeFinalGcDeltaBytes: measureMemory
      ? delta(memoryBeforeFinalGc!, baseline!)
      : undefined,
    memoryAfterFinalGcBytes: finalMemory,
    memoryAfterFinalGcDeltaBytes: measureMemory
      ? delta(finalMemory!, baseline!)
      : undefined,
    resourceUsage: measureMemory ? process.resourceUsage() : undefined,
    lifecycle: counts,
  }
  if (writeResult) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }
  return result
}

type NumericSummary = {
  mean: number
  median: number
  p10: number
  p90: number
  min: number
  max: number
}

function summarizeNumbers(values: Array<number>): NumericSummary {
  const sorted = values.slice().sort((a, b) => a - b)
  const at = (fraction: number) =>
    sorted[Math.floor((sorted.length - 1) * fraction)]!
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median,
    p10: at(0.1),
    p90: at(0.9),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  }
}

type MeasuredRun = Awaited<ReturnType<typeof run>>

type WarmBatch = {
  requests: number
  elapsedMs: number
  wallElapsedMs: number
  ttfbMs: number
  outputBytes: number
  outputSha256: string
  chunks: number
  maxOutputChunkBytes: number
  sourceRecordHighWater: number
  dynamicPassThroughRequests: number
}

type WarmBatchAccumulator = Omit<
  WarmBatch,
  'outputBytes' | 'outputSha256' | 'chunks'
> & {
  first?: MeasuredRun
}

function createWarmBatchAccumulator(requests: number): WarmBatchAccumulator {
  return {
    requests,
    elapsedMs: 0,
    wallElapsedMs: 0,
    ttfbMs: 0,
    maxOutputChunkBytes: 0,
    sourceRecordHighWater: 0,
    dynamicPassThroughRequests: 0,
  }
}

function recordWarmRun(
  batch: WarmBatchAccumulator,
  row: MeasuredRun,
  wallElapsedMs: number,
) {
  batch.first ??= row
  batch.elapsedMs += row.elapsedMs
  batch.wallElapsedMs += wallElapsedMs
  batch.ttfbMs += row.ttfbMs!
  batch.maxOutputChunkBytes = Math.max(
    batch.maxOutputChunkBytes,
    row.maxOutputChunkBytes,
  )
  batch.sourceRecordHighWater = Math.max(
    batch.sourceRecordHighWater,
    row.sourceRecordHighWater,
  )
  if (row.dynamicPassThroughSelected) {
    batch.dynamicPassThroughRequests++
  }
}

function finishWarmBatch(batch: WarmBatchAccumulator): WarmBatch {
  const { first, ...totals } = batch
  if (!first) {
    throw new Error('A warm benchmark batch did not run any requests')
  }
  return {
    ...totals,
    outputBytes: first.outputBytes,
    outputSha256: first.outputSha256,
    chunks: first.chunks,
  }
}

async function runWarmPair(
  baselineName: BaselineImplementation,
  baselineTransform: Transform,
  worktreeTransform: Transform,
  scenario: Scenario,
  mode: Mode,
  requests: number,
  startWith: 'baseline' | 'worktree',
) {
  const batches = {
    baseline: createWarmBatchAccumulator(requests),
    worktree: createWarmBatchAccumulator(requests),
  }

  for (let index = 0; index < requests; index++) {
    const baselineFirst = (index & 1) === (startWith === 'baseline' ? 0 : 1)
    let implementation: 'baseline' | 'worktree' = baselineFirst
      ? 'baseline'
      : 'worktree'
    for (let position = 0; position < 2; position++) {
      const wallStartedAt = performance.now()
      const row = await run(
        implementation === 'baseline' ? baselineTransform : worktreeTransform,
        implementation === 'baseline' ? baselineName : 'worktree',
        scenario.name,
        mode,
        false,
        false,
        false,
      )
      recordWarmRun(
        batches[implementation],
        row,
        performance.now() - wallStartedAt,
      )
      implementation = implementation === 'baseline' ? 'worktree' : 'baseline'
    }
  }

  return {
    baseline: finishWarmBatch(batches.baseline),
    worktree: finishWarmBatch(batches.worktree),
  }
}

function summarizeWarmBatches(
  implementation: string,
  scenario: Scenario,
  mode: Mode,
  rows: Array<WarmBatch>,
) {
  const batchRequests = rows[0]!.requests
  const elapsedMs = summarizeNumbers(
    rows.map((row) => row.elapsedMs / row.requests),
  )
  const batchElapsedMs = summarizeNumbers(rows.map((row) => row.elapsedMs))
  const batchWallElapsedMs = summarizeNumbers(
    rows.map((row) => row.wallElapsedMs),
  )
  const ttfbMs = summarizeNumbers(rows.map((row) => row.ttfbMs / row.requests))
  const throughputMiBPerSecond = summarizeNumbers(
    rows.map(
      (row) => (row.outputBytes * row.requests) / MiB / (row.elapsedMs / 1000),
    ),
  )
  const dynamicPassThroughRequests = rows.reduce(
    (total, row) => total + row.dynamicPassThroughRequests,
    0,
  )
  return {
    implementation,
    scenario: scenario.name,
    framework: scenario.framework,
    rendererSafePoint: scenario.rendererSafePoint,
    mode,
    measurement: 'warm',
    memoryMeasured: false,
    iterations: rows.length,
    batchRequests,
    measuredRequests: rows.length * batchRequests,
    dynamicPassThroughRequests,
    dynamicPassThroughRate:
      dynamicPassThroughRequests / (rows.length * batchRequests),
    outputBytes: rows[0]!.outputBytes,
    outputSha256: rows[0]!.outputSha256,
    chunks: rows[0]!.chunks,
    maxOutputChunkBytes: Math.max(
      ...rows.map((row) => row.maxOutputChunkBytes),
    ),
    ttfbMs: ttfbMs.median,
    elapsedMs: elapsedMs.median,
    throughputMiBPerSecond: throughputMiBPerSecond.median,
    sourceRecordHighWater: Math.max(
      ...rows.map((row) => row.sourceRecordHighWater),
    ),
    statistics: {
      elapsedMs,
      batchElapsedMs,
      batchWallElapsedMs,
      ttfbMs,
      throughputMiBPerSecond,
    },
  }
}

function summarizePercentRatios(values: Array<number>) {
  const logs = summarizeNumbers(values.map((value) => Math.log(value)))
  const toPercent = (value: number) => (Math.exp(value) - 1) * 100
  return {
    geometricMean: toPercent(logs.mean),
    median: toPercent(logs.median),
    p10: toPercent(logs.p10),
    p90: toPercent(logs.p90),
    min: toPercent(logs.min),
    max: toPercent(logs.max),
  }
}

async function measureWarmComparison(
  baselineName: BaselineImplementation,
  baselineTransform: Transform,
  worktreeTransform: Transform,
  scenarioNames: Array<string>,
  requestedModes: Array<string>,
  warmups: number,
  iterations: number,
  batchRequests: number,
) {
  const results = []
  const comparisons = []

  for (const scenarioName of scenarioNames) {
    const scenario = parseScenario(scenarioName)
    const availableModes: Array<Mode> =
      scenario.kind === 'application-string' ||
      scenario.kind === 'coalesced-close'
        ? ['merge']
        : scenario.kind !== 'renderer-records' && scenario.framework === 'react'
          ? ['fast', 'merge']
          : ['merge']
    const modes = availableModes.filter((mode) => requestedModes.includes(mode))
    for (const mode of modes) {
      await run(
        baselineTransform,
        baselineName,
        scenario.name,
        mode,
        false,
        false,
        true,
      )
      await run(
        worktreeTransform,
        'worktree',
        scenario.name,
        mode,
        false,
        false,
        true,
      )
      forceGc()
      for (let index = 0; index < warmups; index++) {
        const order: Array<'baseline' | 'worktree'> =
          index % 2 === 0 ? ['baseline', 'worktree'] : ['worktree', 'baseline']
        for (const implementation of order) {
          await run(
            implementation === 'baseline'
              ? baselineTransform
              : worktreeTransform,
            implementation === 'baseline' ? baselineName : 'worktree',
            scenario.name,
            mode,
            false,
            false,
          )
        }
      }

      const rows: Record<'baseline' | 'worktree', Array<WarmBatch>> = {
        baseline: [],
        worktree: [],
      }
      const elapsedRatios: Array<number> = []
      const wallElapsedRatios: Array<number> = []
      for (let index = 0; index < iterations; index++) {
        const pair = await runWarmPair(
          baselineName,
          baselineTransform,
          worktreeTransform,
          scenario,
          mode,
          batchRequests,
          index % 2 === 0 ? 'baseline' : 'worktree',
        )
        rows.baseline.push(pair.baseline)
        rows.worktree.push(pair.worktree)
        elapsedRatios.push(pair.worktree.elapsedMs / pair.baseline.elapsedMs)
        wallElapsedRatios.push(
          pair.worktree.wallElapsedMs / pair.baseline.wallElapsedMs,
        )
      }

      const baseline = summarizeWarmBatches(
        baselineName,
        scenario,
        mode,
        rows.baseline,
      )
      const worktree = summarizeWarmBatches(
        'worktree',
        scenario,
        mode,
        rows.worktree,
      )
      const baselineElapsedTotal = rows.baseline.reduce(
        (total, row) => total + row.elapsedMs,
        0,
      )
      const worktreeElapsedTotal = rows.worktree.reduce(
        (total, row) => total + row.elapsedMs,
        0,
      )
      const baselineWallTotal = rows.baseline.reduce(
        (total, row) => total + row.wallElapsedMs,
        0,
      )
      const worktreeWallTotal = rows.worktree.reduce(
        (total, row) => total + row.wallElapsedMs,
        0,
      )
      results.push(
        { ...baseline, comparisonBaseline: baselineName },
        { ...worktree, comparisonBaseline: baselineName },
      )
      comparisons.push({
        baseline: baselineName,
        scenario: scenario.name,
        framework: scenario.framework,
        rendererSafePoint: scenario.rendererSafePoint,
        mode,
        pairedElapsedPercent: summarizePercentRatios(elapsedRatios),
        pairedWallElapsedPercent: summarizePercentRatios(wallElapsedRatios),
        aggregateElapsedPercent:
          (worktreeElapsedTotal / baselineElapsedTotal - 1) * 100,
        aggregateWallElapsedPercent:
          (worktreeWallTotal / baselineWallTotal - 1) * 100,
        elapsedMedianPercent:
          (worktree.statistics.elapsedMs.median /
            baseline.statistics.elapsedMs.median -
            1) *
          100,
        samples: rows.baseline.map((baselineRow, index) => ({
          baselineElapsedMs: baselineRow.elapsedMs,
          candidateElapsedMs: rows.worktree[index]!.elapsedMs,
          baselineWallElapsedMs: baselineRow.wallElapsedMs,
          candidateWallElapsedMs: rows.worktree[index]!.wallElapsedMs,
          elapsedRatio: elapsedRatios[index]!,
          wallElapsedRatio: wallElapsedRatios[index]!,
        })),
      })
    }
  }

  return {
    warmups,
    iterations,
    batchRequests,
    measuredRequestsPerImplementation: iterations * batchRequests,
    scenarios: scenarioNames,
    order: `${baselineName}/worktree order alternates for every request and reverses at each batch start`,
    validation:
      'SHA-256 and marker checks in untimed preflight/warm-up requests; timed requests retain byte, lifecycle, and API checks',
    source:
      'fresh renderer bytes for fast mode and one fresh router source string for merge mode',
    memory: 'not measured in the warm latency loop',
    garbageCollection:
      'forced once before warm-up; natural GC remains enabled for all measured batches',
    results,
    comparisons,
  }
}

export function runWarmComparison(
  transforms: Record<'origin' | 'worktree', Transform>,
  scenarioNames: Array<string>,
  requestedModes: Array<string>,
  warmups: number,
  iterations: number,
  batchRequests: number,
) {
  return measureWarmComparison(
    'origin',
    transforms.origin,
    transforms.worktree,
    scenarioNames,
    requestedModes,
    warmups,
    iterations,
    batchRequests,
  )
}

function safeWindowEnd(value: string, start: number, wantedEnd: number) {
  const end = Math.min(wantedEnd, value.length)
  if (end <= start || end >= value.length) {
    return end
  }
  const previous = value.charCodeAt(end - 1)
  const next = value.charCodeAt(end)
  return previous >= 0xd800 &&
    previous <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff
    ? end - 1
    : end
}

export function runProbe(
  shape: Shape,
  sizeMiB: number,
  strategy: 'suffix' | 'window',
) {
  const bytes = sizeMiB * MiB
  const source = createSource(bytes, 0, shape)
  const expectedHash = createHash('sha256')
  updateSource(expectedHash, bytes, 0)
  const expectedDigest = expectedHash.digest('hex')
  forceGc()
  const baseline = memory()
  const encoder = new TextEncoder()
  const passes = []
  for (let pass = 1; pass <= 2; pass++) {
    const hash = createHash('sha256')
    const peak: Memory = { heapUsed: 0, external: 0, arrayBuffers: 0, rss: 0 }
    let offset = 0
    let chunks = 0
    const startedAt = performance.now()
    while (offset < source.length) {
      const output = new Uint8Array(OUTPUT_BYTES)
      const input =
        strategy === 'suffix'
          ? source.slice(offset)
          : source.slice(
              offset,
              safeWindowEnd(source, offset, offset + OUTPUT_BYTES),
            )
      const encoded = encoder.encodeInto(input, output)
      if (encoded.read === 0) {
        throw new Error('Probe encoder made no progress')
      }
      offset += encoded.read
      hash.update(output.subarray(0, encoded.written))
      chunks++
      if (chunks % 16 === 0) {
        maxMemory(peak, delta(memory(), baseline))
      }
    }
    const elapsedMs = performance.now() - startedAt
    const digest = hash.digest('hex')
    if (digest !== expectedDigest || offset !== source.length) {
      throw new Error('Source-window probe validation failed')
    }
    maxMemory(peak, delta(memory(), baseline))
    forceGc()
    const afterGc = delta(memory(), baseline)
    passes.push({
      pass,
      elapsedMs,
      throughputMiBPerSecond: bytes / MiB / (elapsedMs / 1000),
      chunks,
      memoryPeakBytes: peak,
      memoryAfterGcBytes: afterGc,
    })
  }
  process.stdout.write(
    `${JSON.stringify({
      implementation: 'v8-probe',
      scenario: `encode-${shape}-${sizeMiB}m`,
      mode: strategy,
      sourceReadyBaselineBytes: baseline,
      outputBytes: bytes,
      outputChunkBytes: OUTPUT_BYTES,
      outputSha256: expectedDigest,
      passes,
    })}\n`,
  )
}

type HydrationOwner = {
  takeInitialHydrationScriptTags(): unknown
  claimOutput(): {
    state: number
    pullChunk(): Uint8Array
  }
  liftBarrier(): void
  pushSource(source: string): void
  finish(): void
  cleanup(): void
}

type CreateHydrationOwner = (
  nonce: string | undefined,
  initialSources: ReadonlyArray<string>,
) => HydrationOwner

type HydrationOwnerExpected = {
  records: number
  recordBytes: number
  bytes: number
  digest: string
}

const hydrationOwnerExpectedCache = new Map<string, HydrationOwnerExpected>()

function getHydrationOwnerExpected(scenarioName: string) {
  const cached = hydrationOwnerExpectedCache.get(scenarioName)
  if (cached) {
    return cached
  }
  const match = /^hydration-owner-(\d+)x(\d+)k$/.exec(scenarioName)
  if (!match) {
    throw new Error(`Unknown hydration-owner scenario: ${scenarioName}`)
  }
  const records = Number(match[1])
  const recordBytes = Number(match[2]) * 1024
  const hash = createHash('sha256')
  let bytes = 0
  const addExpected = (value: string) => {
    hash.update(value)
    bytes += Buffer.byteLength(value)
  }
  let partIndex = 0
  while (partIndex <= records) {
    const batchStart = partIndex
    let codeUnits = SCRIPT_OPEN.length + SCRIPT_CLOSE.length - 1
    while (partIndex <= records) {
      const partLength =
        partIndex === records ? '$_TSR.e()'.length : recordBytes
      const nextCodeUnits = codeUnits + 1 + partLength
      if (partIndex > batchStart && nextCodeUnits > OUTPUT_BYTES) {
        break
      }
      codeUnits = nextCodeUnits
      partIndex++
      if (codeUnits > OUTPUT_BYTES) {
        break
      }
    }
    addExpected(SCRIPT_OPEN)
    for (let index = batchStart; index < partIndex; index++) {
      if (index > batchStart) {
        addExpected(';')
      }
      if (index === records) {
        addExpected('$_TSR.e()')
      } else {
        updateSource(hash, recordBytes, index)
        bytes += recordBytes
      }
    }
    addExpected(SCRIPT_CLOSE)
  }
  const expected = {
    records,
    recordBytes,
    bytes,
    digest: hash.digest('hex'),
  }
  hydrationOwnerExpectedCache.set(scenarioName, expected)
  return expected
}

function measureHydrationOwner(
  createHydrationOwner: CreateHydrationOwner,
  implementation: string,
  scenarioName: string,
  measureMemory: boolean,
  validateOutput = true,
) {
  const expected = getHydrationOwnerExpected(scenarioName)
  if (measureMemory) {
    forceGc()
  }
  const baseline = measureMemory ? memory() : undefined
  const peak: Memory = { heapUsed: 0, external: 0, arrayBuffers: 0, rss: 0 }
  const sample = () => {
    if (measureMemory) {
      maxMemory(peak, delta(memory(), baseline!))
    }
  }
  const owner = createHydrationOwner(undefined, [])
  owner.takeInitialHydrationScriptTags()
  const output = owner.claimOutput()
  owner.liftBarrier()
  for (let index = 0; index < expected.records; index++) {
    owner.pushSource(createSource(expected.recordBytes, index, 'flat'))
  }
  owner.finish()
  sample()
  const hash = validateOutput ? createHash('sha256') : undefined
  let bytes = 0
  let chunks = 0
  let maxOutputChunkBytes = 0
  const startedAt = performance.now()
  while (
    output.state === HydrationOutputState.Ready ||
    output.state === HydrationOutputState.Active
  ) {
    const chunk = output.pullChunk()
    hash?.update(chunk)
    bytes += chunk.byteLength
    chunks++
    maxOutputChunkBytes = Math.max(maxOutputChunkBytes, chunk.byteLength)
    if (measureMemory && (chunks & 15) === 0) {
      sample()
    }
  }
  const elapsedMs = performance.now() - startedAt
  if (measureMemory) {
    sample()
  }
  const digest = hash?.digest('hex') ?? expected.digest
  if (
    output.state !== HydrationOutputState.Done ||
    bytes !== expected.bytes ||
    (validateOutput && digest !== expected.digest) ||
    maxOutputChunkBytes > OUTPUT_BYTES
  ) {
    throw new Error(
      `Hydration-owner validation failed: ${output.state}/${bytes}/${digest}/${maxOutputChunkBytes}`,
    )
  }
  owner.cleanup()
  return {
    implementation,
    scenario: scenarioName,
    framework: 'router-core',
    mode: 'owner',
    outputBytes: bytes,
    outputSha256: digest,
    chunks,
    maxOutputChunkBytes,
    elapsedMs,
    throughputMiBPerSecond: bytes / MiB / (elapsedMs / 1000),
    memoryPeakBytes: measureMemory ? peak : undefined,
    sourceRecordHighWater: expected.records + 1,
  }
}

export function runHydrationOwner(
  createHydrationOwner: CreateHydrationOwner,
  implementation: string,
  scenarioName: string,
) {
  process.stdout.write(
    `${JSON.stringify(
      measureHydrationOwner(
        createHydrationOwner,
        implementation,
        scenarioName,
        true,
      ),
    )}\n`,
  )
}

export function runHydrationOwnerSoak(
  createHydrationOwner: CreateHydrationOwner,
  implementation: string,
  scenarioName: string,
) {
  const expected = getHydrationOwnerExpected(scenarioName)
  const requestsPerBlock = expected.records > 1000 ? 5 : 500
  const blocks = 10
  measureHydrationOwner(
    createHydrationOwner,
    implementation,
    scenarioName,
    false,
    true,
  )
  for (let index = 0; index < Math.min(100, requestsPerBlock); index++) {
    measureHydrationOwner(
      createHydrationOwner,
      implementation,
      scenarioName,
      false,
      false,
    )
  }
  forceGc()
  const baseline = memory()
  const highWater: Memory = {
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0,
    rss: 0,
  }
  const checkpoints = []
  const startedAt = performance.now()
  for (let block = 1; block <= blocks; block++) {
    for (let request = 0; request < requestsPerBlock; request++) {
      measureHydrationOwner(
        createHydrationOwner,
        implementation,
        scenarioName,
        false,
        false,
      )
    }
    forceGc()
    const retained = delta(memory(), baseline)
    maxMemory(highWater, retained)
    checkpoints.push({ block, requests: block * requestsPerBlock, retained })
  }
  const elapsedMs = performance.now() - startedAt
  const finalRetained = checkpoints.at(-1)!.retained
  process.stdout.write(
    `${JSON.stringify({
      implementation,
      scenario: scenarioName,
      framework: 'router-core',
      mode: 'owner-soak',
      requests: blocks * requestsPerBlock,
      aggregateOutputBytes: expected.bytes * blocks * requestsPerBlock,
      validatedPerRequestOutputSha256: expected.digest,
      elapsedIncludingGcMs: elapsedMs,
      throughputIncludingGcMiBPerSecond:
        (expected.bytes * blocks * requestsPerBlock) / MiB / (elapsedMs / 1000),
      retainedHighWaterBytes: highWater,
      retainedAfterFinalGcBytes: finalRetained,
      retentionCheckpoints: checkpoints,
      sourceRecordHighWater: expected.records + 1,
    })}\n`,
  )
}

export function runWarmHydrationOwnerComparison(
  factories: Record<'origin' | 'worktree', CreateHydrationOwner>,
  scenarioNames: Array<string>,
  warmups: number,
  iterations: number,
  batchRequests: number,
) {
  const results = []
  const comparisons = []
  for (const scenarioName of scenarioNames) {
    measureHydrationOwner(factories.origin, 'origin', scenarioName, false, true)
    measureHydrationOwner(
      factories.worktree,
      'worktree',
      scenarioName,
      false,
      true,
    )
    forceGc()
    for (let index = 0; index < warmups; index++) {
      const first = index % 2 === 0 ? 'origin' : 'worktree'
      const second = first === 'origin' ? 'worktree' : 'origin'
      measureHydrationOwner(factories[first], first, scenarioName, false, false)
      measureHydrationOwner(
        factories[second],
        second,
        scenarioName,
        false,
        false,
      )
    }
    const elapsed: Record<'origin' | 'worktree', Array<number>> = {
      origin: [],
      worktree: [],
    }
    const wall: Record<'origin' | 'worktree', Array<number>> = {
      origin: [],
      worktree: [],
    }
    const samples = []
    const firstResult: Partial<
      Record<'origin' | 'worktree', ReturnType<typeof measureHydrationOwner>>
    > = {}
    for (let iteration = 0; iteration < iterations; iteration++) {
      const totals = {
        origin: { elapsed: 0, wall: 0 },
        worktree: { elapsed: 0, wall: 0 },
      }
      for (let request = 0; request < batchRequests; request++) {
        const originFirst = (request & 1) === (iteration & 1)
        const order: Array<'origin' | 'worktree'> = originFirst
          ? ['origin', 'worktree']
          : ['worktree', 'origin']
        for (const implementation of order) {
          const startedAt = performance.now()
          const row = measureHydrationOwner(
            factories[implementation],
            implementation,
            scenarioName,
            false,
            false,
          )
          firstResult[implementation] ??= row
          totals[implementation].wall += performance.now() - startedAt
          totals[implementation].elapsed += row.elapsedMs
        }
      }
      elapsed.origin.push(totals.origin.elapsed / batchRequests)
      elapsed.worktree.push(totals.worktree.elapsed / batchRequests)
      wall.origin.push(totals.origin.wall / batchRequests)
      wall.worktree.push(totals.worktree.wall / batchRequests)
      samples.push({
        baselineElapsedMs: totals.origin.elapsed,
        candidateElapsedMs: totals.worktree.elapsed,
        baselineWallElapsedMs: totals.origin.wall,
        candidateWallElapsedMs: totals.worktree.wall,
        elapsedRatio: totals.worktree.elapsed / totals.origin.elapsed,
        wallElapsedRatio: totals.worktree.wall / totals.origin.wall,
      })
    }
    const originElapsed = summarizeNumbers(elapsed.origin)
    const worktreeElapsed = summarizeNumbers(elapsed.worktree)
    for (const implementation of ['origin', 'worktree'] as const) {
      const statistics = summarizeNumbers(elapsed[implementation])
      results.push({
        ...firstResult[implementation],
        implementation,
        measurement: 'warm',
        memoryMeasured: false,
        iterations,
        batchRequests,
        measuredRequests: iterations * batchRequests,
        elapsedMs: statistics.median,
        throughputMiBPerSecond:
          firstResult[implementation]!.outputBytes /
          MiB /
          (statistics.median / 1000),
        statistics: { elapsedMs: statistics },
        comparisonBaseline: 'origin',
      })
    }
    comparisons.push({
      baseline: 'origin',
      scenario: scenarioName,
      framework: 'router-core',
      mode: 'owner',
      pairedElapsedPercent: summarizePercentRatios(
        samples.map((sample) => sample.elapsedRatio),
      ),
      pairedWallElapsedPercent: summarizePercentRatios(
        samples.map((sample) => sample.wallElapsedRatio),
      ),
      aggregateElapsedPercent:
        (worktreeElapsed.mean / originElapsed.mean - 1) * 100,
      aggregateWallElapsedPercent:
        (summarizeNumbers(wall.worktree).mean /
          summarizeNumbers(wall.origin).mean -
          1) *
        100,
      elapsedMedianPercent:
        (worktreeElapsed.median / originElapsed.median - 1) * 100,
      samples,
    })
  }
  return {
    warmups,
    iterations,
    batchRequests,
    measuredRequestsPerImplementation: iterations * batchRequests,
    scenarios: scenarioNames,
    order: 'origin/worktree order alternates for every request and batch',
    validation:
      'SHA-256 in one untimed preflight per implementation; timed requests retain byte, state, and output-limit checks',
    memory: 'not measured in the warm latency loop',
    garbageCollection: 'forced once before each scenario warm-up',
    results,
    comparisons,
  }
}
