/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../vite-env.d.ts" />

import { getCrossReferenceHeader } from 'seroval'
import { invariant } from '../invariant'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import { GLOBAL_TSR } from './constants'
import { encodeIntoBoundedChunk } from './htmlBoundaryScanner'
import type { RouterManagedTag } from '../manifest'

export const SSR_SERIALIZATION_SCOPE_ID = 'tsr'
const HYDRATION_SCRIPT_BOUNDARY_TAIL = ';/*$tsr-stream-boundary*/'

const encoder = new TextEncoder()
const SOURCE_SEPARATOR = ';'
const MAX_INITIAL_SOURCE_CODE_UNITS = 16 * 1024
const MAX_BACKLOG_CODE_UNITS = 16 * 1024 * 1024
const MAX_BACKLOG_SOURCES = 4_096
const MIN_OUTPUT_BYTES = 256
const MAX_DIRECT_CODE_UNITS = 16 * 1024
export const MAX_HYDRATION_OUTPUT_CHUNK_BYTES = 64 * 1024
const MAX_DYNAMIC_RECORD_CODE_UNITS = MAX_HYDRATION_OUTPUT_CHUNK_BYTES

const STREAM_PART_ATTRIBUTE = 'data-tsr-stream-part'
const INITIAL_CLEANUP_SOURCE = `{let s=document.currentScript,p;while((p=s.previousElementSibling)&&p.hasAttribute('${STREAM_PART_ATTRIBUTE}'))p.remove();s.remove()}`
const INITIAL_CLEANUP_SUFFIX = SOURCE_SEPARATOR + INITIAL_CLEANUP_SOURCE
const DYNAMIC_CLOSE_SOURCE = 'document.currentScript.remove()</script>'
const HYDRATION_SCRIPT_BOUNDARY_SOURCE =
  `document.currentScript.remove()` + HYDRATION_SCRIPT_BOUNDARY_TAIL
const HYDRATION_SCRIPT_BOUNDARY_SUFFIX =
  HYDRATION_SCRIPT_BOUNDARY_TAIL + '</script>'
export const HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX =
  HYDRATION_SCRIPT_BOUNDARY_SUFFIX.lastIndexOf('*')
export const HYDRATION_SCRIPT_BOUNDARY_BYTES = encoder.encode(
  HYDRATION_SCRIPT_BOUNDARY_SUFFIX,
)

const ROUTER_PREFIX = GLOBAL_TSR + '.router='
const PROMISE_PREFIX = GLOBAL_TSR + '.p(()=>'
const DEFAULT_INITIAL_SOURCES = [
  getCrossReferenceHeader(SSR_SERIALIZATION_SCOPE_ID),
  minifiedTsrBootStrapScript,
]

export const HydrationScriptOutputState = {
  Waiting: 0,
  Ready: 1,
  Active: 2,
  Done: 3,
  Failed: 4,
} as const

export type HydrationScriptOutputState =
  (typeof HydrationScriptOutputState)[keyof typeof HydrationScriptOutputState]

/** A request-local, single-consumer stream of complete records. */
export type HydrationScriptOutput = {
  readonly state: HydrationScriptOutputState
  readonly error: unknown
  pullChunk: () => Uint8Array
  subscribe: (onChange: () => void) => () => void
}

type ConsumerOwnership =
  | HydrationScriptOutput
  | 'fast-path'
  | 'cleaned'
  | undefined

/** The one-time initial `<Scripts>` take: hydration tags plus the boundary. */
export type InitialHydrationScriptTags = {
  before: Array<RouterManagedTag>
  boundary: RouterManagedTag
}

function escapeAttribute(value: string) {
  return value.replace(/[&"'<>]/g, (char) => `&#${char.charCodeAt(0)};`)
}

function createInitialTags(
  sources: ReadonlyArray<string>,
  nonce: string | undefined,
): InitialHydrationScriptTags {
  const before: Array<RouterManagedTag> = []
  for (const source of sources) {
    if (!source) {
      continue
    }
    const previous = before[before.length - 1]
    if (
      previous?.children &&
      previous.children.length + SOURCE_SEPARATOR.length + source.length <=
        MAX_INITIAL_SOURCE_CODE_UNITS
    ) {
      previous.children += SOURCE_SEPARATOR + source
    } else {
      before.push({
        tag: 'script',
        attrs: { nonce, [STREAM_PART_ATTRIBUTE]: '' },
        children: source,
      })
    }
  }
  // Cleanup runs before route and asset scripts. If hydration code fails, its
  // transport tags can remain because that page cannot hydrate successfully.
  const lastHydrationTag = before[before.length - 1]
  if (lastHydrationTag) {
    const lastSource = lastHydrationTag.children!
    if (
      lastSource.length + INITIAL_CLEANUP_SUFFIX.length <=
      MAX_INITIAL_SOURCE_CODE_UNITS
    ) {
      lastHydrationTag.children = lastSource + INITIAL_CLEANUP_SUFFIX
    } else {
      // Do not concatenate onto a large source. A renderer could flatten the
      // result and temporarily retain a second copy of the hydration payload.
      before.push({
        tag: 'script',
        attrs: { nonce, [STREAM_PART_ATTRIBUTE]: '' },
        children: INITIAL_CLEANUP_SOURCE,
      })
    }
  }
  return {
    before,
    boundary: {
      tag: 'script',
      attrs: { nonce },
      children: HYDRATION_SCRIPT_BOUNDARY_SOURCE,
    } satisfies RouterManagedTag,
  }
}

type HydrationScripts = {
  pushSerializedSource: (
    data: string,
    initial: boolean,
    wrap: boolean,
  ) => boolean
  pushSource: (nextSource: string) => boolean
  fail: (reason: unknown) => void
  finish: () => void
  takeInitialHydrationScriptTags: () => InitialHydrationScriptTags | undefined
  disableHydration: () => void
  isInitialTaken: () => boolean
  skipInitialTake: () => void
  liftBarrier: () => void
  claimOutput: () => HydrationScriptOutput
  reserveFastPath: (output?: HydrationScriptOutput) => boolean
  startSerializationTimeout: (timeoutMs: number) => void
  cleanup: () => void
}

class HydrationScriptsOwner implements HydrationScriptOutput {
  private queuedSources: Array<string | undefined> = []
  private queuedSourceHead = 0
  private initialTaken = false
  private barrierLifted = false
  private producerDone = false
  private consumer: ConsumerOwnership
  private listener: (() => void) | undefined

  private active: Array<string | undefined> | undefined
  private retainedSources = 0
  private regularCodeUnits = 0
  private hasOversizedSource = false

  private segmentIndex = 0
  private closingSegmentIndex = 0
  private source = ''
  private sourceOffset = 0
  private outputCapacity = MIN_OUTPUT_BYTES

  private outputState: HydrationScriptOutputState =
    HydrationScriptOutputState.Waiting
  private outputError: unknown
  private timeout: ReturnType<typeof setTimeout> | undefined
  private opening: string | undefined

  constructor(
    private readonly nonce: string | undefined,
    initialSources?: ReadonlyArray<string>,
  ) {
    // ServerSsr exposes this method as a bare callback, so keep this single
    // method bound while all other owner operations live on the prototype.
    this.takeInitialHydrationScriptTags =
      this.takeInitialHydrationScriptTags.bind(this)

    const seedSources = initialSources ?? DEFAULT_INITIAL_SOURCES
    for (const seedSource of seedSources) {
      if (!this.account(seedSource)) {
        break
      }
      this.queuedSources.push(seedSource)
    }
  }

  get state() {
    return this.outputState
  }

  get error() {
    return this.outputError
  }

  private notify() {
    try {
      this.listener?.()
    } catch (listenerError) {
      console.error('Hydration script output listener error:', listenerError)
    }
  }

  private refresh(notifyChange = true) {
    const next =
      this.outputState === HydrationScriptOutputState.Failed
        ? HydrationScriptOutputState.Failed
        : this.active
          ? HydrationScriptOutputState.Active
          : typeof this.consumer === 'object' &&
              this.initialTaken &&
              this.barrierLifted &&
              !this.queueIsEmpty()
            ? HydrationScriptOutputState.Ready
            : this.producerDone && this.initialTaken && this.queueIsEmpty()
              ? HydrationScriptOutputState.Done
              : HydrationScriptOutputState.Waiting
    if (this.outputState !== next) {
      this.outputState = next
      if (notifyChange) {
        this.notify()
      }
    }
  }

  private clearTimeoutIfSet() {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout)
      this.timeout = undefined
    }
  }

  private queueIsEmpty() {
    return this.queuedSourceHead === this.queuedSources.length
  }

  private clearQueue() {
    this.queuedSources = []
    this.queuedSourceHead = 0
  }

  private dropBufferedOutput() {
    this.clearQueue()
    this.active = undefined
    this.retainedSources = 0
    this.regularCodeUnits = 0
    this.hasOversizedSource = false
    this.segmentIndex = 0
    this.closingSegmentIndex = 0
    this.source = ''
    this.sourceOffset = 0
    this.outputCapacity = MIN_OUTPUT_BYTES
    this.opening = undefined
  }

  fail(reason: unknown) {
    if (
      this.consumer === 'cleaned' ||
      this.outputState === HydrationScriptOutputState.Failed
    ) {
      return
    }
    this.outputError = reason
    this.clearTimeoutIfSet()
    this.dropBufferedOutput()
    this.outputState = HydrationScriptOutputState.Failed
    this.notify()
  }

  private rejectBacklog(kind: 'source-part' | 'code-unit') {
    this.fail(new Error(`SSR hydration backlog exceeded maximum ${kind} count`))
    return false
  }

  private account(nextSource: string) {
    if (this.retainedSources === MAX_BACKLOG_SOURCES) {
      return this.rejectBacklog('source-part')
    }
    if (nextSource.length > MAX_BACKLOG_CODE_UNITS) {
      if (this.hasOversizedSource) {
        return this.rejectBacklog('code-unit')
      }
      this.hasOversizedSource = true
    } else if (
      this.regularCodeUnits + nextSource.length >
      MAX_BACKLOG_CODE_UNITS
    ) {
      return this.rejectBacklog('code-unit')
    } else {
      this.regularCodeUnits += nextSource.length
    }
    this.retainedSources++
    return true
  }

  private releaseSource(part: string) {
    this.retainedSources--
    if (part.length > MAX_BACKLOG_CODE_UNITS) {
      this.hasOversizedSource = false
    } else {
      this.regularCodeUnits -= part.length
    }
  }

  private releaseAccounting(batch: ReadonlyArray<string | undefined>) {
    for (const part of batch) {
      if (part !== undefined) {
        this.releaseSource(part)
      }
    }
  }

  liftBarrier() {
    if (this.consumer !== 'cleaned' && !this.barrierLifted) {
      this.barrierLifted = true
      this.refresh()
    }
  }

  private producerCanWrite() {
    return (
      this.consumer !== 'cleaned' &&
      this.outputState !== HydrationScriptOutputState.Failed &&
      !this.producerDone
    )
  }

  pushSource(nextSource: string) {
    if (!this.producerCanWrite()) {
      return false
    }
    if (this.account(nextSource)) {
      this.queuedSources.push(nextSource)
      if (this.initialTaken) {
        this.refresh()
      }
    } else {
      return false
    }
    // A notification can synchronously fail or clean up this owner.
    return this.producerCanWrite()
  }

  private takeQueuedBatch(batchLength: number) {
    if (
      this.queuedSourceHead === 0 &&
      batchLength === this.queuedSources.length
    ) {
      const batch = this.queuedSources
      this.clearQueue()
      return batch
    }
    const end = this.queuedSourceHead + batchLength
    const batch = this.queuedSources.slice(this.queuedSourceHead, end)
    for (let index = this.queuedSourceHead; index < end; index++) {
      this.queuedSources[index] = undefined
    }
    this.queuedSourceHead = end
    if (this.queueIsEmpty()) {
      this.clearQueue()
    } else if (
      this.queuedSourceHead >= 1024 &&
      this.queuedSourceHead >= this.queuedSources.length - this.queuedSourceHead
    ) {
      this.queuedSources = this.queuedSources.slice(this.queuedSourceHead)
      this.queuedSourceHead = 0
    }
    return batch
  }

  private release(batch: Array<string | undefined>) {
    this.releaseAccounting(batch)
    this.active = undefined
    this.source = ''
    this.sourceOffset = 0
    this.refresh(false)
  }

  private advanceSource() {
    const batch = this.active!
    if (this.segmentIndex > 0 && this.segmentIndex < this.closingSegmentIndex) {
      const partIndex = (this.segmentIndex - 1) >> 1
      if (this.segmentIndex % 2 === 1) {
        const part = batch[partIndex]
        if (part !== undefined) {
          this.releaseSource(part)
          batch[partIndex] = undefined
        }
      }
    }
    this.segmentIndex++
    // Segment 0 is the opening tag. Sources and separators alternate until
    // the closing segment. The next advance releases the complete record.
    if (this.segmentIndex < this.closingSegmentIndex) {
      const partIndex = (this.segmentIndex - 1) >> 1
      this.source =
        this.segmentIndex % 2 === 1 ? batch[partIndex]! : SOURCE_SEPARATOR
    } else if (this.segmentIndex === this.closingSegmentIndex) {
      this.source = DYNAMIC_CLOSE_SOURCE
    } else {
      this.release(batch)
    }
    this.sourceOffset = 0
  }

  private pullActive() {
    const bytes = new Uint8Array(this.outputCapacity)
    let offset = 0
    while (this.active) {
      if (this.sourceOffset === this.source.length) {
        this.advanceSource()
      } else if (offset === bytes.length) {
        break
      } else {
        const result = encodeIntoBoundedChunk(
          this.source,
          this.sourceOffset,
          bytes,
          offset,
        )
        if (result.read === 0) {
          break
        }
        this.sourceOffset += result.read
        offset += result.written
      }
    }
    if (offset === 0) {
      throw new Error('SSR router script record produced no output')
    }
    if (offset === bytes.length) {
      return bytes
    }
    // A subarray view pins the whole output buffer. Copy mostly-empty tail
    // chunks (typically the final close-tag remnant) so the large buffer can
    // be collected immediately.
    return offset * 2 < bytes.length
      ? bytes.slice(0, offset)
      : bytes.subarray(0, offset)
  }

  private pullReady() {
    const scriptOpening = (this.opening ??= this.nonce
      ? `<script nonce="${escapeAttribute(this.nonce)}">`
      : '<script>')
    let codeUnits = scriptOpening.length + DYNAMIC_CLOSE_SOURCE.length
    let batchLength = 0
    for (
      let index = this.queuedSourceHead;
      index < this.queuedSources.length;
      index++
    ) {
      const part = this.queuedSources[index]!
      const nextCodeUnits = codeUnits + SOURCE_SEPARATOR.length + part.length
      if (batchLength > 0 && nextCodeUnits > MAX_DYNAMIC_RECORD_CODE_UNITS) {
        break
      }
      codeUnits = nextCodeUnits
      batchLength++
      if (codeUnits > MAX_DYNAMIC_RECORD_CODE_UNITS) {
        // A complete JavaScript source is not safely splittable across tags.
        break
      }
    }
    const batch = this.takeQueuedBatch(batchLength)
    if (codeUnits <= MAX_DIRECT_CODE_UNITS) {
      const joined =
        batch.length === 1 ? batch[0]! : batch.join(SOURCE_SEPARATOR)
      const bytes = encoder.encode(
        scriptOpening + joined + SOURCE_SEPARATOR + DYNAMIC_CLOSE_SOURCE,
      )
      this.release(batch)
      return bytes
    }
    this.active = batch
    this.segmentIndex = 0
    this.closingSegmentIndex = (batch.length << 1) + 1
    this.source = scriptOpening
    this.sourceOffset = 0
    this.outputCapacity = Math.max(
      MIN_OUTPUT_BYTES,
      Math.min(MAX_HYDRATION_OUTPUT_CHUNK_BYTES, codeUnits),
    )
    this.outputState = HydrationScriptOutputState.Active
    return this.pullActive()
  }

  pullChunk() {
    if (
      this.outputState !== HydrationScriptOutputState.Ready &&
      this.outputState !== HydrationScriptOutputState.Active
    ) {
      throw new Error('Hydration script output is not ready')
    }
    try {
      return this.outputState === HydrationScriptOutputState.Ready
        ? this.pullReady()
        : this.pullActive()
    } catch (cause) {
      this.fail(cause)
      throw cause
    }
  }

  subscribe(onChange: () => void) {
    if (this.consumer === 'cleaned') {
      return () => {}
    }
    if (this.listener) {
      throw new Error('SSR hydration output already has a subscriber')
    }
    this.listener = onChange
    return () => {
      if (this.listener === onChange) {
        this.listener = undefined
      }
    }
  }

  pushSerializedSource(data: string, initial: boolean, wrap: boolean) {
    let serialized = initial ? ROUTER_PREFIX + data : data
    if (wrap) {
      serialized = PROMISE_PREFIX + serialized + ')'
    }
    return this.pushSource(serialized)
  }

  finish() {
    if (!this.pushSource(GLOBAL_TSR + '.e()')) {
      return
    }
    this.producerDone = true
    this.clearTimeoutIfSet()
    this.refresh()
  }

  takeInitialHydrationScriptTags() {
    if (
      this.consumer === 'cleaned' ||
      this.outputState === HydrationScriptOutputState.Failed ||
      this.initialTaken
    ) {
      return undefined
    }
    // No source can drain before the initial take, so the queue has no
    // cleared prefix. Once tags are composed, the same empty array can become
    // the dynamic queue without allocating a replacement.
    const sources = this.queuedSources as Array<string>
    const tags = createInitialTags(sources, this.nonce)
    this.initialTaken = true
    this.releaseAccounting(sources)
    sources.length = 0
    this.queuedSourceHead = 0
    this.refresh()
    return tags
  }

  /**
   * Opt this request out of hydration output entirely (for example a
   * `hydrate: false` page). Drops the queued bootstrap sources, marks the
   * producer done, and makes the fast pass-through path reservable without
   * a rendered `<Scripts>` boundary. Must run before the initial take and
   * before serialization produces output.
   */
  disableHydration() {
    if (
      this.consumer === 'cleaned' ||
      this.outputState === HydrationScriptOutputState.Failed
    ) {
      return
    }
    if (this.initialTaken || this.consumer !== undefined || this.producerDone) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          'Invariant failed: hydration output is already committed; ' +
            'disableHydration() must run before <Scripts> renders and ' +
            'before serialization starts.',
        )
      }

      invariant()
    }
    this.releaseAccounting(this.queuedSources)
    this.clearQueue()
    this.initialTaken = true
    this.barrierLifted = true
    this.producerDone = true
    this.refresh()
  }

  // The rendered boundary can only exist after the initial take. The merger
  // uses this to skip barrier scanning for all earlier renderer bytes.
  isInitialTaken() {
    return this.initialTaken
  }

  // Application EOF without a rendered <Scripts> boundary. The initial
  // sources become late records after the document so the response still
  // completes instead of failing after its HTML was already delivered.
  skipInitialTake() {
    if (this.consumer !== 'cleaned' && !this.initialTaken) {
      this.initialTaken = true
      this.refresh()
    }
  }

  claimOutput(): HydrationScriptOutput {
    if (this.consumer === 'cleaned') {
      throw new Error('SSR hydration script output is already cleaned up')
    }
    if (this.consumer !== undefined) {
      throw new Error('SSR hydration script output already has a consumer')
    }
    this.consumer = this
    this.refresh(false)
    return this
  }

  reserveFastPath(output?: HydrationScriptOutput) {
    const ownsConsumer = this.consumer === output
    if (
      this.outputState === HydrationScriptOutputState.Failed ||
      !this.producerDone ||
      !this.initialTaken ||
      !this.queueIsEmpty() ||
      this.active ||
      !ownsConsumer
    ) {
      return false
    }
    this.consumer = 'fast-path'
    return true
  }

  // Arms the serialization deadline once the renderer finished. The
  // lifecycle signal stays separate from this merge-transport concern.
  startSerializationTimeout(timeoutMs: number) {
    if (
      this.consumer === 'cleaned' ||
      this.outputState === HydrationScriptOutputState.Failed ||
      this.producerDone ||
      this.timeout !== undefined
    ) {
      return
    }
    this.timeout = setTimeout(() => {
      this.timeout = undefined
      if (
        this.consumer !== 'cleaned' &&
        this.outputState !== HydrationScriptOutputState.Failed &&
        !this.producerDone
      ) {
        console.error('Serialization timeout after app render finished')
        this.fail(new Error('Serialization timeout after app render finished'))
      }
    }, timeoutMs)
  }

  cleanup() {
    if (this.consumer === 'cleaned') {
      return
    }
    this.consumer = 'cleaned'
    this.clearTimeoutIfSet()
    this.dropBufferedOutput()
    this.listener = undefined
    this.outputError = undefined
    this.producerDone = true
    this.outputState = HydrationScriptOutputState.Done
  }
}

/** Create the hydration-script owner for one server request. */
export function createHydrationScripts(
  nonce: string | undefined,
  initialSources?: ReadonlyArray<string>,
): HydrationScripts {
  return new HydrationScriptsOwner(nonce, initialSources)
}
