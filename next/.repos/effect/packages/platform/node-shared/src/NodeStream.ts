/**
 * Adapters between Node streams and Effect streams, channels, and readables.
 *
 * This module is the stream boundary for Node APIs. It wraps `Readable` and
 * `Duplex` values as Effect `Stream`s and `Channel`s, pipes Effect streams
 * through Node duplex streams, exposes an Effect `Stream` back to Node as a
 * `Readable`, and collects readable payloads into strings, array buffers, or
 * `Uint8Array`s with optional byte limits.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "effect/Array"
import * as ByteSize from "effect/ByteSize"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { dual, type LazyArg } from "effect/Function"
import * as Latch from "effect/Latch"
import * as MutableRef from "effect/MutableRef"
import * as Pull from "effect/Pull"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type { Duplex } from "node:stream"
import { finished, Readable } from "node:stream"
import { StringDecoder } from "node:string_decoder"
import { destroyStream as destroyReadable } from "./internal/stream.ts"
import { pullIntoWritable } from "./NodeSink.ts"

/**
 * Error indicating that a buffered Node stream exceeded its byte limit.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MaxBytesError extends Error {
  readonly _tag = "MaxBytesError"
  readonly maxBytes: number

  constructor(maxBytes: number) {
    super("maxBytes exceeded")
    this.maxBytes = maxBytes
  }
}

/**
 * Converts a Node readable stream into an Effect `Stream`, reading chunks with
 * independent read sizes and batch limits, mapping stream errors with `onError`,
 * and destroying the readable on completion unless `closeOnDone` is `false`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromReadable = <A = Uint8Array, E = Cause.UnknownError>(options: {
  readonly evaluate: LazyArg<Readable | NodeJS.ReadableStream>
  readonly onError?: (error: unknown) => E
  /**
   * Maximum number of Node reads per pull (default 4096). Set to Infinity
   * for unbounded batching. Does not control the size of each Node read.
   */
  readonly chunkSize?: number | undefined
  /**
   * Size passed to Node's `read(size)`. Omit to use Node's unsized reads.
   */
  readonly readSize?: number | undefined
  readonly closeOnDone?: boolean | undefined
}): Stream.Stream<A, E> => Stream.fromChannel(fromReadableChannel<A, E>(options))

/**
 * Creates a `Channel` that pulls chunks from a Node readable stream, mapping
 * errors with `onError` and destroying the readable on completion unless
 * `closeOnDone` is `false`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromReadableChannel = <A = Uint8Array, E = Cause.UnknownError>(options: {
  readonly evaluate: LazyArg<Readable | NodeJS.ReadableStream>
  readonly onError?: (error: unknown) => E
  /**
   * Maximum number of Node reads per pull (default 4096). Set to Infinity
   * for unbounded batching. Does not control the size of each Node read.
   */
  readonly chunkSize?: number | undefined
  /**
   * Size passed to Node's `read(size)`. Omit to use Node's unsized reads.
   */
  readonly readSize?: number | undefined
  readonly closeOnDone?: boolean | undefined
}): Channel.Channel<Arr.NonEmptyReadonlyArray<A>, E> =>
  Channel.fromTransform((_, scope) =>
    readableToPullUnsafe({
      scope,
      readable: options.evaluate(),
      onError: options.onError ?? defaultOnError as any,
      chunkSize: options.chunkSize,
      readSize: options.readSize,
      closeOnDone: options.closeOnDone
    })
  )

/**
 * Creates a `Channel` over a Node `Duplex`, writing upstream chunks with
 * backpressure while emitting chunks read from the duplex and optionally ending
 * the writable side when upstream completes.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromDuplex = <IE, I = Uint8Array, O = Uint8Array, E = Cause.UnknownError>(
  options: {
    readonly evaluate: LazyArg<Duplex>
    readonly onError?: (error: unknown) => E
    /**
     * Maximum number of Node reads per pull (default 4096). Set to Infinity
     * for unbounded batching. Does not control the size of each Node read.
     */
    readonly chunkSize?: number | undefined
    /**
     * Size passed to Node's `read(size)`. Omit to use Node's unsized reads.
     */
    readonly readSize?: number | undefined
    readonly endOnDone?: boolean | undefined
    readonly encoding?: BufferEncoding | undefined
  }
): Channel.Channel<Arr.NonEmptyReadonlyArray<O>, IE | E, void, Arr.NonEmptyReadonlyArray<I>, IE> =>
  Channel.fromTransform((upstream, scope) => {
    const duplex = options.evaluate()
    const exit = MutableRef.make<Exit.Exit<never, IE | E | Cause.Done> | undefined>(undefined)
    const latch = Latch.makeUnsafe(false)

    return pullIntoWritable({
      pull: upstream,
      writable: duplex,
      onError: options.onError ?? defaultOnError as any,
      endOnDone: options.endOnDone,
      encoding: options.encoding
    }).pipe(
      Effect.catchCause((cause) => {
        if (Pull.isDoneCause(cause)) return Effect.void
        exit.current = Exit.failCause(cause as Cause.Cause<IE | E | Cause.Done>)
        latch.openUnsafe()
        return Effect.void
      }),
      Effect.forkIn(scope),
      Effect.flatMap(() =>
        readableToPullUnsafe({
          scope,
          exit,
          latch,
          readable: duplex,
          onError: options.onError ?? defaultOnError as any,
          chunkSize: options.chunkSize,
          readSize: options.readSize
        })
      )
    )
  })

/**
 * Pipes an Effect `Stream` through a Node `Duplex`, writing the stream's
 * chunks to the duplex and emitting chunks read back from it.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const pipeThroughDuplex: {
  <B = Uint8Array, E2 = Cause.UnknownError>(
    options: {
      readonly evaluate: LazyArg<Duplex>
      readonly onError?: (error: unknown) => E2
      /**
       * Maximum number of Node reads per pull (default 4096). Set to Infinity
       * for unbounded batching. Does not control the size of each Node read.
       */
      readonly chunkSize?: number | undefined
      /**
       * Size passed to Node's `read(size)`. Omit to use Node's unsized reads.
       */
      readonly readSize?: number | undefined
      readonly endOnDone?: boolean | undefined
      readonly encoding?: BufferEncoding | undefined
    }
  ): <R, E, A>(self: Stream.Stream<A, E, R>) => Stream.Stream<B, E2 | E, R>
  <R, E, A, B = Uint8Array, E2 = Cause.UnknownError>(
    self: Stream.Stream<A, E, R>,
    options: {
      readonly evaluate: LazyArg<Duplex>
      readonly onError?: (error: unknown) => E2
      /**
       * Maximum number of Node reads per pull (default 4096). Set to Infinity
       * for unbounded batching. Does not control the size of each Node read.
       */
      readonly chunkSize?: number | undefined
      /**
       * Size passed to Node's `read(size)`. Omit to use Node's unsized reads.
       */
      readonly readSize?: number | undefined
      readonly endOnDone?: boolean | undefined
      readonly encoding?: BufferEncoding | undefined
    }
  ): Stream.Stream<B, E | E2, R>
} = dual(2, <R, E, A, B = Uint8Array, E2 = Cause.UnknownError>(
  self: Stream.Stream<A, E, R>,
  options: {
    readonly evaluate: LazyArg<Duplex>
    readonly onError?: (error: unknown) => E2
    /**
     * Maximum number of Node reads per pull (default 4096). Set to Infinity
     * for unbounded batching. Does not control the size of each Node read.
     */
    readonly chunkSize?: number | undefined
    /**
     * Size passed to Node's `read(size)`. Omit to use Node's unsized reads.
     */
    readonly readSize?: number | undefined
    readonly endOnDone?: boolean | undefined
    readonly encoding?: BufferEncoding | undefined
  }
): Stream.Stream<B, E | E2, R> =>
  Stream.pipeThroughChannelOrFail(
    self,
    fromDuplex(options)
  ))

/**
 * Pipes a stream of strings or bytes through a Node `Duplex` using default
 * options and `Cause.UnknownError` for stream failures.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const pipeThroughSimple: {
  (
    duplex: LazyArg<Duplex>
  ): <R, E>(self: Stream.Stream<string | Uint8Array, E, R>) => Stream.Stream<Uint8Array, E | Cause.UnknownError, R>
  <R, E>(
    self: Stream.Stream<string | Uint8Array, E, R>,
    duplex: LazyArg<Duplex>
  ): Stream.Stream<Uint8Array, Cause.UnknownError | E, R>
} = dual(2, <R, E>(
  self: Stream.Stream<string | Uint8Array, E, R>,
  duplex: LazyArg<Duplex>
): Stream.Stream<Uint8Array, Cause.UnknownError | E, R> => pipeThroughDuplex(self, { evaluate: duplex }))

/**
 * Converts an Effect `Stream` into a Node `Readable`, using the caller's
 * Effect context to run the stream and destroying the readable if the stream
 * fails.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toReadable = <E, R>(stream: Stream.Stream<string | Uint8Array, E, R>): Effect.Effect<Readable, never, R> =>
  Effect.map(
    Effect.context<R>(),
    (context) => new StreamAdapter(context, stream)
  )

/**
 * Converts a service-free Effect `Stream` into a Node `Readable` using an
 * empty Effect context.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toReadableNever = <E>(stream: Stream.Stream<string | Uint8Array, E, never>): Readable =>
  new StreamAdapter(
    Context.empty(),
    stream
  )

/**
 * Consumes a Node readable stream into a string using the selected encoding,
 * failing through `onError` on stream errors or when `maxBytes` is exceeded
 * and destroying the stream on interruption or failure.
 * `maxBytes` counts the bytes read from the stream. Streams that already emit
 * strings are counted by encoded string length, which can differ from the
 * bytes originally read.
 * Set `destroyOnOverflow` to `false` to drain the remaining data instead of
 * destroying the stream when the byte limit is exceeded.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toString = <E = Cause.UnknownError>(
  readable: LazyArg<Readable | NodeJS.ReadableStream>,
  options?: {
    readonly onError?: (error: unknown) => E
    readonly encoding?: BufferEncoding | undefined
    readonly maxBytes?: ByteSize.Input | undefined
    readonly destroyOnOverflow?: boolean | undefined
  }
): Effect.Effect<string, E> => {
  const maxBytesNumber = toMaxBytes(options?.maxBytes)
  const onError = options?.onError ?? defaultOnError
  const encoding = options?.encoding ?? "utf8"
  return Effect.callback((resume) => {
    const stream = readable() as Readable
    // Decoding here keeps `maxBytes` on raw bytes. A stream that already
    // decodes only emits strings, so switch it to `encoding` instead.
    // Object-mode strings are not encoded bytes and count as UTF-8.
    const decodes = stream.readableEncoding !== null
    if (decodes) stream.setEncoding(encoding)
    const decoder = new StringDecoder(encoding)

    let string = ""
    let bytes = 0
    const cleanup = finished(stream, { readable: true, writable: false }, (err) => {
      stream.off("data", onData)
      if (err) {
        destroyReadable(stream, cleanup)
        resume(Effect.fail(onError(err) as E))
      } else {
        cleanup()
        resume(Effect.succeed(string + decoder.end()))
      }
    })
    function onData(chunk: string | Uint8Array) {
      if (typeof chunk === "string") {
        string += chunk
        bytes += Buffer.byteLength(chunk, decodes ? encoding : "utf8")
      } else {
        string += decoder.write(chunk)
        bytes += chunk.byteLength
      }
      if (maxBytesNumber !== undefined && bytes > maxBytesNumber) {
        stream.off("data", onData)
        if (options?.destroyOnOverflow === false) {
          drainReadable(stream, cleanup)
        } else {
          destroyReadable(stream, cleanup)
        }
        resume(Effect.fail(onError(new MaxBytesError(maxBytesNumber)) as E))
      }
    }
    stream.on("data", onData)
    return Effect.sync(() => {
      stream.off("data", onData)
      destroyReadable(stream, cleanup)
    })
  })
}

/**
 * Consumes a Node readable stream into an `ArrayBuffer`, failing through
 * `onError` on stream errors or when `maxBytes` is exceeded and destroying the
 * stream on interruption or failure.
 * Set `destroyOnOverflow` to `false` to drain the remaining data instead of
 * destroying the stream when the byte limit is exceeded.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toArrayBuffer = <E = Cause.UnknownError>(
  readable: LazyArg<Readable | NodeJS.ReadableStream>,
  options?: {
    readonly onError?: (error: unknown) => E
    readonly maxBytes?: ByteSize.Input | undefined
    readonly destroyOnOverflow?: boolean | undefined
  }
): Effect.Effect<ArrayBuffer, E> => {
  const maxBytesNumber = toMaxBytes(options?.maxBytes)
  const onError = options?.onError ?? defaultOnError
  return Effect.callback((resume) => {
    const stream = readable() as Readable
    const buffers: Array<Uint8Array> = []
    let bytes = 0
    const cleanup = finished(stream, { readable: true, writable: false }, (err) => {
      stream.off("data", onData)
      if (err) {
        destroyReadable(stream, cleanup)
        return resume(Effect.fail(onError(err) as E))
      }
      cleanup()
      const buffer = buffers.length === 1 ? buffers[0] : Buffer.concat(buffers)
      if (buffer.byteOffset === 0 && buffer.buffer.byteLength === buffer.byteLength) {
        return resume(Effect.succeed(buffer.buffer as ArrayBuffer))
      }
      resume(
        Effect.succeed(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
      )
    })
    function onData(chunk: Uint8Array) {
      buffers.push(chunk)
      bytes += chunk.length
      if (maxBytesNumber !== undefined && bytes > maxBytesNumber) {
        stream.off("data", onData)
        if (options?.destroyOnOverflow === false) {
          drainReadable(stream, cleanup)
        } else {
          destroyReadable(stream, cleanup)
        }
        resume(Effect.fail(onError(new MaxBytesError(maxBytesNumber)) as E))
      }
    }
    stream.on("data", onData)
    return Effect.sync(() => {
      stream.off("data", onData)
      destroyReadable(stream, cleanup)
    })
  })
}

/**
 * Consumes a Node readable stream into a `Uint8Array`, using the same error
 * mapping and `maxBytes` handling as `toArrayBuffer`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toUint8Array = <E = Cause.UnknownError>(
  readable: LazyArg<Readable | NodeJS.ReadableStream>,
  options?: {
    readonly onError?: (error: unknown) => E
    readonly maxBytes?: ByteSize.Input | undefined
    readonly destroyOnOverflow?: boolean | undefined
  }
): Effect.Effect<Uint8Array, E> => Effect.map(toArrayBuffer(readable, options), (buffer) => new Uint8Array(buffer))

// ----------------------------------------------------------------------------
// internal
// ----------------------------------------------------------------------------

// Keep consuming after the consumer's listeners are removed, so the producer
// can finish and any late error stays handled.
const drainReadable = (stream: Readable, cleanup: () => void): void => {
  cleanup()
  const done = finished(stream, { readable: true, writable: false }, () => done())
  stream.resume()
}

const readableToPullUnsafe = <A, E>(options: {
  readonly scope: Scope.Scope
  readonly exit?: MutableRef.MutableRef<Exit.Exit<never, E | Cause.Done> | undefined> | undefined
  readonly latch?: Latch.Latch | undefined
  readonly readable: Readable | NodeJS.ReadableStream
  readonly onError: (error: unknown) => E
  readonly chunkSize: number | undefined
  readonly readSize: number | undefined
  readonly closeOnDone?: boolean | undefined
}) => {
  const readable = options.readable as Readable
  const chunkSize = options.chunkSize ?? 4096

  const closeOnDone = options.closeOnDone ?? true
  const exit = options.exit ?? MutableRef.make(undefined)
  const latch = options.latch ?? Latch.makeUnsafe(false)
  function onReadable() {
    latch.openUnsafe()
  }
  readable.on("readable", onReadable)
  const cleanup = finished(readable, { readable: true, writable: false }, (error) => {
    exit.current ??= Exit.fail(error ? options.onError(error) : Cause.Done())
    latch.openUnsafe()
  })

  const pull = Effect.suspend(function loop(): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E> {
    let item = options.readable.read(options.readSize) as A | null
    if (item === null) {
      if (exit.current) {
        return exit.current
      }
      if (readable.readableEnded) {
        return Effect.fail(Cause.Done())
      }
      latch.closeUnsafe()
      return Effect.flatMap(latch.await, loop)
    }
    const chunk = Arr.of(item as A)
    // read() can synchronously refill the buffer, so null is not a batch bound.
    while (chunk.length < chunkSize) {
      item = options.readable.read(options.readSize)
      if (item === null) break
      chunk.push(item)
    }
    return Effect.succeed(chunk)
  })

  return Effect.as(
    Scope.addFinalizer(
      options.scope,
      Effect.sync(() => {
        readable.off("readable", onReadable)
        if (closeOnDone) {
          destroyReadable(readable, cleanup)
        } else {
          cleanup()
        }
      })
    ),
    pull
  )
}

class StreamAdapter<E, R> extends Readable {
  private readonly readLatch: Latch.Latch
  private fiber: Fiber.Fiber<void, E> | undefined = undefined

  constructor(
    context: Context.Context<R>,
    stream: Stream.Stream<Uint8Array | string, E, R>
  ) {
    super({})
    this.readLatch = Latch.makeUnsafe(false)
    this.fiber = Stream.runForEachArray(stream, (chunk) =>
      this.readLatch.whenOpen(Effect.sync(() => {
        this.readLatch.closeUnsafe()
        for (let i = 0; i < chunk.length; i++) {
          const item = chunk[i]
          if (typeof item === "string") {
            this.push(item, "utf8")
          } else {
            this.push(item)
          }
        }
      }))).pipe(
        this.readLatch.whenOpen,
        Effect.provideContext(context),
        Effect.runFork
      )
    this.fiber.addObserver((exit) => {
      this.fiber = undefined
      if (Exit.isSuccess(exit)) {
        this.push(null)
      } else {
        this.destroy(Cause.squash(exit.cause) as any)
      }
    })
  }

  override _read(_size: number): void {
    this.readLatch.openUnsafe()
  }

  override _destroy(error: Error | null, callback: (error?: Error | null | undefined) => void): void {
    if (!this.fiber) {
      return callback(error)
    }
    Effect.runFork(Fiber.interrupt(this.fiber)).addObserver((exit) => {
      callback(exit._tag === "Failure" ? Cause.squash(exit.cause) as any : error)
    })
  }
}

const defaultOnError = (error: unknown): Cause.UnknownError => new Cause.UnknownError(error)

const toMaxBytes = (maxBytes: ByteSize.Input | undefined): number | undefined =>
  maxBytes === undefined || maxBytes === Infinity ? undefined : Number(ByteSize.fromInputUnsafe(maxBytes))
