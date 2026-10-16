/**
 * Binary frame protocol for multiplexing JSON and raw streams over HTTP.
 *
 * Frame format: [type:1][streamId:4][length:4][payload:length]
 * - type: 1 byte - frame type (JSON, CHUNK, END, ERROR)
 * - streamId: 4 bytes big-endian uint32 - stream identifier
 * - length: 4 bytes big-endian uint32 - payload length
 * - payload: variable length bytes
 */

import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_ERROR,
  FRAME_TYPE_JSON,
  MAX_FRAME_PAYLOAD_SIZE,
} from '@tanstack/start-client-core/client-rpc'

type FrameType =
  | typeof FRAME_TYPE_JSON
  | typeof FRAME_TYPE_CHUNK
  | typeof FRAME_TYPE_END
  | typeof FRAME_TYPE_ERROR

/** Cached TextEncoder for frame encoding */
const textEncoder = new TextEncoder()

/** Shared empty payload for END frames - avoids allocation per call */
const EMPTY_PAYLOAD = new Uint8Array(0)
const MAX_ERROR_MESSAGE_CODE_UNITS = 4096

/**
 * Encodes a single frame with header and payload.
 */
function encodeFrame(
  type: FrameType,
  streamId: number,
  payload: Uint8Array,
): Uint8Array {
  if (payload.byteLength > MAX_FRAME_PAYLOAD_SIZE) {
    throw new RangeError(
      `Frame payload exceeds ${MAX_FRAME_PAYLOAD_SIZE} bytes`,
    )
  }
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length)
  // Write header bytes directly to avoid DataView allocation per frame
  // Frame format: [type:1][streamId:4 BE][length:4 BE]
  frame[0] = type
  frame[1] = (streamId >>> 24) & 0xff
  frame[2] = (streamId >>> 16) & 0xff
  frame[3] = (streamId >>> 8) & 0xff
  frame[4] = streamId & 0xff
  frame[5] = (payload.length >>> 24) & 0xff
  frame[6] = (payload.length >>> 16) & 0xff
  frame[7] = (payload.length >>> 8) & 0xff
  frame[8] = payload.length & 0xff
  frame.set(payload, FRAME_HEADER_SIZE)
  return frame
}

/** Encodes an error message payload, truncated to a bounded length. */
function encodeErrorPayload(error: unknown): Uint8Array {
  const originalMessage =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const message =
    originalMessage.length > MAX_ERROR_MESSAGE_CODE_UNITS
      ? `${originalMessage.slice(0, MAX_ERROR_MESSAGE_CODE_UNITS)}…`
      : originalMessage
  return textEncoder.encode(message)
}

/**
 * Late stream registration for RawStreams discovered after serialization starts.
 * Used when Promise<RawStream> resolves after the initial synchronous pass.
 */
export interface LateStreamRegistration {
  id: number
  stream: ReadableStream<Uint8Array>
}

/** One serialized JSON patch and the raw streams referenced by that patch. */
export interface MultiplexedStreamRecord {
  json: Uint8Array
  rawStreams: Array<LateStreamRegistration>
}

export interface MultiplexedStreamOptions {
  onCancel?: (reason?: unknown) => void
  signal?: AbortSignal
}

type CancellableReader = Pick<
  ReadableStreamDefaultReader<unknown>,
  'cancel' | 'releaseLock'
>

/**
 * Creates a multiplexed ReadableStream from serialized response records.
 *
 * A record's JSON frame is admitted before any raw stream referenced by that
 * record starts. Raw streams from admitted records are pumped concurrently.
 * The caller bounds the stream count before records reach this function.
 */
export function createMultiplexedStream(
  recordStream: ReadableStream<MultiplexedStreamRecord>,
  options: MultiplexedStreamOptions = {},
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array>
  let stopped: false | [unknown] = false
  let activePumps = 0
  let wakeDemand: (() => void) | undefined
  let admission: Promise<void> | undefined
  const readers = new Set<CancellableReader>()
  const pendingRawStreams = new Set<ReadableStream<Uint8Array>>()
  const abortOutput = () => errorOutput(options.signal?.reason)

  const wakeAdmission = () => {
    const wake = wakeDemand
    wakeDemand = undefined
    wake?.()
  }

  const cancelReader = (reader: CancellableReader, reason?: unknown) => {
    void reader.cancel(reason).catch(() => {})
  }

  const cancelStream = (stream: ReadableStream<unknown>, reason?: unknown) => {
    void stream.cancel(reason).catch(() => {})
  }

  const stop = (reason?: unknown) => {
    if (stopped) {
      return false
    }
    stopped = [reason]
    options.signal?.removeEventListener('abort', abortOutput)
    wakeAdmission()
    for (const reader of readers) {
      cancelReader(reader, reason)
    }
    for (const stream of pendingRawStreams) {
      cancelStream(stream, reason)
    }
    pendingRawStreams.clear()
    return true
  }

  const errorOutput = (error: unknown) => {
    if (!stop(error)) {
      return
    }
    try {
      controller.error(error)
    } catch {
      // The output was already closed by its consumer.
    }
  }

  const waitForDemand = async () => {
    while (!stopped && (controller.desiredSize ?? 0) <= 0) {
      await new Promise<void>((resolve) => {
        wakeDemand = resolve
      })
    }
    return !stopped
  }

  // Only the pump at the head of this chain may inspect desiredSize and
  // enqueue. Each other pump can retain at most one unencoded source chunk.
  // The frame is encoded only once the output has demand for it.
  const admitFrame = (
    type: FrameType,
    streamId: number,
    payload: Uint8Array,
  ): boolean | Promise<boolean> => {
    if (stopped) {
      return false
    }
    if (!admission && (controller.desiredSize ?? 0) > 0) {
      controller.enqueue(encodeFrame(type, streamId, payload))
      return true
    }

    const runAdmission = async () => {
      if (!(await waitForDemand())) {
        return false
      }
      controller.enqueue(encodeFrame(type, streamId, payload))
      return true
    }
    const result = admission ? admission.then(runAdmission) : runAdmission()
    const clearAdmission = () => {
      if (admission === tail) {
        admission = undefined
      }
    }
    const tail = result.then(clearAdmission, clearAdmission)
    admission = tail
    return result
  }

  const maybeClose = () => {
    if (activePumps !== 0 || !stop()) {
      return
    }
    try {
      controller.close()
    } catch {
      // The output was already closed by its consumer.
    }
  }

  const startPump = (pump: () => Promise<void>) => {
    activePumps++
    void pump().then(
      () => {
        activePumps--
        maybeClose()
      },
      (error) => {
        activePumps--
        errorOutput(error)
      },
    )
  }

  async function pumpRawStream(
    streamId: number,
    stream: ReadableStream<Uint8Array>,
  ) {
    const reader = stream.getReader()
    readers.add(reader)
    try {
      while (!stopped) {
        const { done, value } = await reader.read()
        // Cancellation can run while the read is suspended.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (stopped) {
          return
        }
        if (done) {
          const frameAdmission = admitFrame(
            FRAME_TYPE_END,
            streamId,
            EMPTY_PAYLOAD,
          )
          if (frameAdmission !== true) {
            await frameAdmission
          }
          return
        }
        if (!(value instanceof Uint8Array)) {
          throw new TypeError('RawStream chunks must be Uint8Array')
        }
        // One frame per read, split only when the chunk exceeds a frame.
        let offset = 0
        do {
          const chunk =
            value.byteLength <= MAX_FRAME_PAYLOAD_SIZE
              ? value
              : value.subarray(offset, offset + MAX_FRAME_PAYLOAD_SIZE)
          const frameAdmission = admitFrame(FRAME_TYPE_CHUNK, streamId, chunk)
          if (
            frameAdmission !== true &&
            (frameAdmission === false || !(await frameAdmission))
          ) {
            return
          }
          offset += MAX_FRAME_PAYLOAD_SIZE
        } while (offset < value.byteLength)
      }
    } catch (error) {
      if (!stopped) {
        // A raw-stream failure is isolated to that stream.
        const frameAdmission = admitFrame(
          FRAME_TYPE_ERROR,
          streamId,
          encodeErrorPayload(error),
        )
        if (frameAdmission !== true) {
          await frameAdmission
        }
      }
    } finally {
      readers.delete(reader)
      reader.releaseLock()
    }
  }

  async function pumpRecords() {
    const reader = recordStream.getReader()
    readers.add(reader)
    try {
      while (!stopped) {
        const { done, value } = await reader.read()
        // Cancellation can run while the read is suspended.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (stopped) {
          if (!done) {
            for (const registration of value.rawStreams) {
              cancelStream(registration.stream, stopped[0])
            }
          }
          return
        }
        if (done) {
          return
        }
        for (const registration of value.rawStreams) {
          pendingRawStreams.add(registration.stream)
        }
        const frameAdmission = admitFrame(FRAME_TYPE_JSON, 0, value.json)
        if (
          frameAdmission !== true &&
          (frameAdmission === false || !(await frameAdmission))
        ) {
          return
        }
        for (const registration of value.rawStreams) {
          pendingRawStreams.delete(registration.stream)
          startPump(
            pumpRawStream.bind(undefined, registration.id, registration.stream),
          )
        }
      }
    } catch (error) {
      if (!stopped) {
        // JSON records describe the response graph, so losing one is fatal.
        errorOutput(error)
      }
    } finally {
      readers.delete(reader)
      reader.releaseLock()
    }
  }

  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
      if (options.signal?.aborted) {
        cancelStream(recordStream, options.signal.reason)
        errorOutput(options.signal.reason)
        return
      }
      options.signal?.addEventListener('abort', abortOutput, { once: true })
      startPump(pumpRecords)
    },
    pull() {
      wakeAdmission()
    },
    cancel(reason) {
      if (stop(reason)) {
        options.onCancel?.(reason)
      }
    },
  })
}
