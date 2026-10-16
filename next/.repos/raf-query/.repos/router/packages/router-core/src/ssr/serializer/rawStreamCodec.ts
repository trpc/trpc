import { createStream } from 'seroval'

// Web-only primitives shared by the JSON and SSR RawStream plugins. This
// module is part of the client bundle: it must not reference `Buffer`, and
// the encode and decode halves must stay independently tree-shakeable.

export function toBase64(bytes: Uint8Array) {
  const chunks: Array<string> = []
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(
      String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as any),
    )
  }
  return btoa(chunks.join(''))
}

export function fromBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const textDecoder = /* @__PURE__ */ new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
})

/** `'t' + utf8` for a valid UTF-8 chunk, otherwise `'b' + base64`. */
export function encodeText(value: Uint8Array) {
  try {
    return 't' + textDecoder.decode(value)
  } catch {
    return 'b' + toBase64(value)
  }
}

const textEncoder = /* @__PURE__ */ new TextEncoder()

export function decodeText(value: string) {
  const data = value.slice(1)
  return value[0] === 't' ? textEncoder.encode(data) : fromBase64(data)
}

/**
 * Pump a byte stream into a Seroval stream, one encoded chunk per read.
 * Returns the Seroval stream and a `stop` function that cancels the reader
 * without signalling the Seroval stream; the abort signal and read failures
 * stop the pump and throw through the Seroval stream.
 */
export function pumpEncodedStream(
  readable: ReadableStream<Uint8Array>,
  encode: (value: Uint8Array) => string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()

  const stream = createStream<string | undefined>()
  const reader = readable.getReader()
  let active = true

  const release = () => {
    active = false
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const stop = (reason?: unknown) => {
    if (!active) {
      return false
    }
    void reader.cancel(reason).catch(() => {})
    release()
    return true
  }
  const abort = () => {
    if (stop(signal!.reason)) {
      stream.throw(signal!.reason)
    }
  }

  signal?.addEventListener('abort', abort)
  ;(async () => {
    try {
      while (active) {
        const { done, value } = await reader.read()
        if (!active) {
          return
        }
        if (done) {
          release()
          stream.return(undefined)
          return
        }
        stream.next(encode(value))
      }
    } catch (error) {
      if (stop(error)) {
        stream.throw(error)
      }
    }
  })()

  return [stream, stop] as const
}

/** Rebuild a byte stream from encoded Seroval stream chunks. */
export function fromEncodedStream(
  source: ReturnType<typeof createStream<string | undefined>>,
  decode: (value: string) => Uint8Array,
) {
  // Dropping the disposer after a terminal event lets Seroval's buffer be
  // collected while application code still holds the finished stream.
  let unsubscribe: (() => void) | undefined
  let done = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const dispose = source.on({
        next(value) {
          if (done) {
            return
          }
          try {
            controller.enqueue(decode(value!))
          } catch (error) {
            // A malformed chunk fails this stream and abandons the source.
            done = true
            const stop = unsubscribe
            unsubscribe = undefined
            stop?.()
            controller.error(error)
          }
        },
        throw(error) {
          if (!done) {
            done = true
            unsubscribe = undefined
            controller.error(error)
          }
        },
        return() {
          if (!done) {
            done = true
            unsubscribe = undefined
            controller.close()
          }
        },
      })
      if (done) {
        dispose()
      } else {
        unsubscribe = dispose
      }
    },
    cancel() {
      const dispose = unsubscribe
      unsubscribe = undefined
      dispose?.()
    },
  })
}
