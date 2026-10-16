import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_ERROR,
  FRAME_TYPE_JSON,
  MAX_FRAMED_STREAMS,
  MAX_FRAME_PAYLOAD_SIZE,
  MAX_UNREAD_RAW_STREAM_BYTES,
} from '../constants'

const decoder = new TextDecoder()
const empty: Uint8Array = new Uint8Array()
// With a zero high-water mark, `-desiredSize` is the unread byte count.
const rawStreamQueue = new ByteLengthQueuingStrategy({ highWaterMark: 0 })

type Closed = 1
type Failed = readonly [unknown]
type State = 0 | Closed | Failed
type RawController =
  | ReadableStreamDefaultController<Uint8Array>
  | null // canceled by its consumer
  | false // ended by the wire or decoder
type RawEntry = [ReadableStream<Uint8Array>, RawController]

export function createFrameDecoder(input: ReadableStream<Uint8Array>) {
  const reader = input.getReader()
  const rawStreams = new Map<number, RawEntry>()
  let state = 0 as State
  let resume: (() => void) | undefined
  let jsonController!: ReadableStreamDefaultController<string>

  const wake = () => {
    resume?.()
    resume = undefined
  }

  const settleRaw = (entry: RawEntry, terminal: Closed | Failed) => {
    const controller = entry[1]
    entry[1] = false
    if (controller) {
      if (terminal === 1) {
        controller.close()
      } else {
        controller.error(terminal[0])
      }
    }
  }

  const chunks = new ReadableStream<string>({
    start(controller) {
      jsonController = controller
    },
    pull: wake,
    cancel(reason) {
      // Every raw stream, including one requested later, ends with this reason.
      const failed: Failed = [
        reason === undefined ? new Error('Framed response cancelled') : reason,
      ]
      state = failed
      wake()
      void reader.cancel(reason).catch(() => {})
      for (const entry of rawStreams.values()) {
        settleRaw(entry, failed)
      }
    },
  })

  function getRaw(id: number): RawEntry {
    const existing = rawStreams.get(id)
    if (existing) {
      return existing
    }
    if (rawStreams.size >= MAX_FRAMED_STREAMS) {
      throw new Error('Too many raw streams')
    }

    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value
        },
        cancel() {
          if (entry[1] !== false) {
            entry[1] = null
          }
        },
      },
      rawStreamQueue,
    )
    const entry: RawEntry = [stream, controller]
    rawStreams.set(id, entry)
    if (state !== 0) {
      settleRaw(entry, state)
    }
    return entry
  }

  function getStream(id: number): ReadableStream<Uint8Array> {
    if (id === 0 || id >>> 0 !== id) {
      throw new RangeError('Invalid raw stream ID')
    }
    return getRaw(id)[0]
  }

  void (async () => {
    let inputChunk = empty
    let inputOffset = 0

    async function more(): Promise<boolean> {
      while (inputOffset === inputChunk.byteLength) {
        inputChunk = empty
        inputOffset = 0
        const next = await reader.read()
        if (state !== 0 || next.done) {
          return false
        }
        inputChunk = next.value
      }
      return true
    }

    async function read(
      length: number,
      cleanEof?: boolean,
    ): Promise<Uint8Array | undefined> {
      if (length === 0) {
        return empty
      }
      if (!(await more())) {
        if (cleanEof) {
          return
        }
        throw new Error('Incomplete frame')
      }

      const available = inputChunk.byteLength - inputOffset
      if (available >= length) {
        const result = inputChunk.subarray(inputOffset, inputOffset + length)
        inputOffset += length
        if (inputOffset === inputChunk.byteLength) {
          inputChunk = empty
          inputOffset = 0
        }
        return result
      }

      const result = new Uint8Array(length)
      let offset = 0
      while (offset < length) {
        if (!(await more())) {
          throw new Error('Incomplete frame')
        }
        const size = Math.min(
          length - offset,
          inputChunk.byteLength - inputOffset,
        )
        result.set(inputChunk.subarray(inputOffset, inputOffset + size), offset)
        inputOffset += size
        offset += size
      }
      if (inputOffset === inputChunk.byteLength) {
        inputChunk = empty
        inputOffset = 0
      }
      return result
    }

    try {
      while (state === 0) {
        let header = await read(FRAME_HEADER_SIZE, true)
        // Cancellation can run while the read is suspended.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (state !== 0) {
          return
        }
        if (!header) {
          for (const entry of rawStreams.values()) {
            if (entry[1]) {
              throw new Error('Incomplete raw stream')
            }
          }
          state = 1
          jsonController.close()
          return
        }

        const type = header[0]!
        const streamId =
          ((header[1]! << 24) |
            (header[2]! << 16) |
            (header[3]! << 8) |
            header[4]!) >>>
          0
        const length =
          ((header[5]! << 24) |
            (header[6]! << 16) |
            (header[7]! << 8) |
            header[8]!) >>>
          0
        header = empty

        if (
          type > FRAME_TYPE_ERROR ||
          (type === FRAME_TYPE_JSON) !== (streamId === 0) ||
          length > MAX_FRAME_PAYLOAD_SIZE ||
          (type === FRAME_TYPE_END && length !== 0)
        ) {
          throw new Error('Invalid frame')
        }

        const entry = type === FRAME_TYPE_JSON ? undefined : getRaw(streamId)
        if (entry?.[1] === false) {
          throw new Error('Raw stream already ended')
        }

        let payload = (await read(length))!
        // Cancellation can run while the read is suspended.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (state !== 0) {
          return
        }
        if (!entry) {
          const value = decoder.decode(payload)
          payload = empty
          jsonController.enqueue(value)
          // Cancellation wakes this wait even when JSON demand stays at zero.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          while (state === 0 && jsonController.desiredSize! <= 0) {
            await new Promise<void>((resolve) => {
              resume = resolve
            })
          }
          continue
        }

        if (type === FRAME_TYPE_CHUNK) {
          const controller = entry[1]
          if (controller) {
            if (-controller.desiredSize! > MAX_UNREAD_RAW_STREAM_BYTES) {
              controller.error(
                new Error(`Raw stream ${streamId} has too many unread bytes`),
              )
              entry[1] = null
              payload = empty
              continue
            }
            // A small view would pin its whole network buffer; copy those.
            const chunk =
              payload.byteLength * 4 < payload.buffer.byteLength
                ? payload.slice()
                : payload
            payload = empty
            controller.enqueue(chunk)
          }
        } else {
          settleRaw(
            entry,
            type === FRAME_TYPE_END ? 1 : [new Error(decoder.decode(payload))],
          )
        }
      }
    } catch (error) {
      if (state === 0) {
        const failed: Failed = [error]
        state = failed
        void reader.cancel(error).catch(() => {})
        jsonController.error(error)
        for (const entry of rawStreams.values()) {
          settleRaw(entry, failed)
        }
      }
    } finally {
      inputChunk = empty
      reader.releaseLock()
    }
  })()

  return [chunks, getStream] as const
}
