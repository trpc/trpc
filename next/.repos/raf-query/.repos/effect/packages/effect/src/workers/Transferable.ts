/**
 * Marks encoded worker message fields that should move through `postMessage` as
 * transfer-list entries.
 *
 * Worker messages still pass through schema encoding and structured clone, but
 * schemas wrapped with `schema` can also report backing resources such as
 * `ArrayBuffer`, `ImageData.data.buffer`, or `MessagePort` to a `Collector`.
 * Worker platforms then pass the collected values as the transfer list for the
 * same `postMessage` call, avoiding copies for large payloads and ports.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import { dual } from "../Function.ts"
import * as Schema from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"

/**
 * Service for collecting `Transferable` objects while encoding worker messages
 * so they can be passed to `postMessage` transfer lists.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Collector extends Context.Service<Collector, {
  readonly addAll: (
    _: Iterable<globalThis.Transferable>
  ) => Effect.Effect<void>
  readonly addAllUnsafe: (_: Iterable<globalThis.Transferable>) => void
  readonly read: Effect.Effect<Array<globalThis.Transferable>>
  readonly readUnsafe: () => Array<globalThis.Transferable>
  readonly clearUnsafe: () => Array<globalThis.Transferable>
  readonly clear: Effect.Effect<Array<globalThis.Transferable>>
}>()("effect/workers/Transferable/Collector") {}

/**
 * Creates a mutable `Collector` service directly, exposing unsafe synchronous
 * methods for reading, adding, and clearing collected transferables.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCollectorUnsafe = (): Collector["Service"] => {
  let tranferables: Array<globalThis.Transferable> = []
  const unsafeAddAll = (transfers: Iterable<globalThis.Transferable>): void => {
    tranferables.push(...transfers)
  }
  const unsafeRead = (): Array<globalThis.Transferable> => tranferables
  const unsafeClear = (): Array<globalThis.Transferable> => {
    const prev = tranferables
    tranferables = []
    return prev
  }
  return Collector.of({
    addAllUnsafe: unsafeAddAll,
    addAll: (transferables) => Effect.sync(() => unsafeAddAll(transferables)),
    readUnsafe: unsafeRead,
    read: Effect.sync(unsafeRead),
    clearUnsafe: unsafeClear,
    clear: Effect.sync(unsafeClear)
  })
}

/**
 * Effect that creates a fresh `Collector` service for accumulating
 * transferables.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCollector: Effect.Effect<Collector["Service"]> = Effect.sync(makeCollectorUnsafe)

/**
 * Adds transferables to the current `Collector` when one is present in the
 * context, and does nothing otherwise.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const addAll = (
  tranferables: Iterable<globalThis.Transferable>
): Effect.Effect<void> =>
  Effect.contextWith((services) => {
    const collector = Context.getOrUndefined(services, Collector)
    if (!collector) return Effect.void
    collector.addAllUnsafe(tranferables)
    return Effect.void
  })

/**
 * Creates a schema getter that records transferables derived from a value in
 * the current `Collector` while passing the value through unchanged.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const getterAddAll = <A>(
  f: (_: A) => Iterable<globalThis.Transferable>
): SchemaGetter.Getter<A, A> =>
  SchemaGetter.transformEffect((e: A) =>
    Effect.contextWith((services) => {
      const collector = Context.getOrUndefined(services, Collector)
      if (!collector) return Effect.succeed(e)
      collector.addAllUnsafe(f(e))
      return Effect.succeed(e)
    })
  )

/**
 * Schema wrapper whose encode path can record transferables with a `Collector`
 * while preserving the wrapped schema's decoded type.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface Transferable<S extends Schema.Top> extends
  Schema.decodeTo<
    Schema.toType<S["Rebuild"]>,
    S["Rebuild"]
  >
{}

/**
 * Wraps a schema so encoding records transferables selected from the encoded
 * value, enabling worker messages to populate a `postMessage` transfer list.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schema: {
  <S extends Schema.Top>(
    f: (_: S["Encoded"]) => Iterable<globalThis.Transferable>
  ): (self: S) => Transferable<S>
  <S extends Schema.Top>(
    self: S,
    f: (_: S["Encoded"]) => Iterable<globalThis.Transferable>
  ): Transferable<S>
} = dual(
  2,
  <S extends Schema.Top>(
    self: S,
    f: (_: S["Encoded"]) => Iterable<globalThis.Transferable>
  ): Transferable<S> =>
    self.annotate({
      toCodecJson: () => passthroughLink
    }).pipe(
      Schema.decode({
        decode: SchemaGetter.passthrough(),
        encode: getterAddAll(f)
      })
    )
)

const passthroughLink = Schema.link()(Schema.Any, {
  decode: SchemaGetter.passthrough(),
  encode: SchemaGetter.passthrough()
})

/**
 * Schema for transferring `ImageData` values with their pixel data buffer.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ImageData: Transferable<Schema.declare<ImageData>> = schema(
  Schema.Any as any as Schema.declare<globalThis.ImageData>,
  (_) => [_.data.buffer]
)

/**
 * Schema for transferring `MessagePort` values as transferable objects.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MessagePort: Transferable<Schema.declare<MessagePort>> = schema(
  Schema.Any as any as Schema.declare<MessagePort>,
  (_) => [_]
)

/**
 * Schema for transferring `Uint8Array` values with their backing buffer.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Uint8Array: Transferable<Schema.instanceOf<globalThis.Uint8Array<ArrayBuffer>>> = schema(
  Schema.Uint8Array as any,
  (_) => [_.buffer]
)
