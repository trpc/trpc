/**
 * Browser geolocation integration for Effect programs.
 *
 * This module defines a `Geolocation` service backed by
 * `navigator.geolocation`. The service can read one current position or stream
 * watched position updates with a sliding buffer. Browser callback failures are
 * represented as `GeolocationError` values with `PositionUnavailable`,
 * `PermissionDenied`, or `Timeout` reasons. The module also provides the
 * browser-backed layer and a `watchPosition` accessor.
 *
 * @since 4.0.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"

const TypeId = "~@effect/platform-browser/Geolocation"
const ErrorTypeId = "~@effect/platform-browser/Geolocation/GeolocationError"

/**
 * Defines the service interface for browser geolocation, providing effects for the current position and streams of watched positions.
 *
 * **When to use**
 *
 * Use when browser code needs a typed Effect service for one-shot location
 * reads or streamed location updates.
 *
 * **Details**
 *
 * `getCurrentPosition` returns one position effect. `watchPosition` returns a
 * stream and accepts the browser `PositionOptions` plus an optional sliding
 * `bufferSize`.
 *
 * **Gotchas**
 *
 * Browser permission prompts, denied permissions, timeouts, unavailable
 * position data, secure-context restrictions, and policy restrictions are
 * surfaced as `GeolocationError`.
 *
 * @see {@link GeolocationError} for represented browser geolocation failures
 * @see {@link layer} for the browser-backed service implementation
 *
 * @category services
 * @since 4.0.0
 */
export interface Geolocation {
  readonly [TypeId]: typeof TypeId
  readonly getCurrentPosition: (
    options?: PositionOptions | undefined
  ) => Effect.Effect<GeolocationPosition, GeolocationError>
  readonly watchPosition: (
    options?:
      | PositionOptions & {
        readonly bufferSize?: number | undefined
      }
      | undefined
  ) => Stream.Stream<GeolocationPosition, GeolocationError>
}

/**
 * Service tag for browser geolocation capabilities.
 *
 * **When to use**
 *
 * Use when you need to access or provide geolocation capabilities through
 * Effect's context.
 *
 * @see {@link layer} for providing the browser-backed geolocation service
 *
 * @category services
 * @since 4.0.0
 */
export const Geolocation: Context.Service<Geolocation, Geolocation> = Context.Service<Geolocation>(TypeId)

/**
 * Tagged error wrapping a browser geolocation failure reason.
 *
 * @category errors
 * @since 4.0.0
 */
export class GeolocationError extends Data.TaggedError("GeolocationError")<{
  readonly reason: GeolocationErrorReason
}> {
  constructor(props: {
    readonly reason: GeolocationErrorReason
  }) {
    super({
      ...props,
      cause: props.reason.cause
    } as any)
  }

  readonly [ErrorTypeId] = ErrorTypeId

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Error reason for the browser geolocation `POSITION_UNAVAILABLE` failure.
 *
 * @category errors
 * @since 4.0.0
 */
export class PositionUnavailable extends Data.TaggedError("PositionUnavailable")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this._tag
  }
}

/**
 * Error reason for the browser geolocation `PERMISSION_DENIED` failure.
 *
 * @category errors
 * @since 4.0.0
 */
export class PermissionDenied extends Data.TaggedError("PermissionDenied")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this._tag
  }
}

/**
 * Error reason for the browser geolocation `TIMEOUT` failure.
 *
 * @category errors
 * @since 4.0.0
 */
export class Timeout extends Data.TaggedError("Timeout")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this._tag
  }
}

/**
 * Union of browser geolocation error reasons represented by the service.
 *
 * @category errors
 * @since 4.0.0
 */
export type GeolocationErrorReason = PositionUnavailable | PermissionDenied | Timeout

const makeQueue = (
  options:
    | PositionOptions & {
      readonly bufferSize?: number | undefined
    }
    | undefined
) =>
  Queue.sliding<GeolocationPosition, GeolocationError>(options?.bufferSize ?? 16).pipe(
    Effect.tap((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          navigator.geolocation.watchPosition(
            (position) => Queue.offerUnsafe(queue, position),
            (cause) => {
              if (cause.code === cause.PERMISSION_DENIED) {
                const error = new GeolocationError({
                  reason: new PermissionDenied({ cause })
                })
                Queue.failCauseUnsafe(queue, Cause.fail(error))
              } else if (cause.code === cause.TIMEOUT) {
                const error = new GeolocationError({
                  reason: new Timeout({ cause })
                })
                Queue.failCauseUnsafe(queue, Cause.fail(error))
              } else if (cause.code === cause.POSITION_UNAVAILABLE) {
                const error = new GeolocationError({
                  reason: new PositionUnavailable({ cause })
                })
                Queue.failCauseUnsafe(queue, Cause.fail(error))
              }
            },
            options
          )
        ),
        (handleId) => Effect.sync(() => navigator.geolocation.clearWatch(handleId))
      )
    )
  )

/**
 * Layer that provides `Geolocation` using `navigator.geolocation`, with watched positions buffered in a sliding queue.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Geolocation> = Layer.succeed(
  Geolocation,
  Geolocation.of({
    [TypeId]: TypeId,
    getCurrentPosition: (options) =>
      makeQueue(options).pipe(
        Effect.flatMap(Queue.take),
        Effect.scoped
      ),
    watchPosition: (options) =>
      makeQueue(options).pipe(
        Effect.map(Stream.fromQueue),
        Stream.unwrap
      )
  })
)

/**
 * Reads geolocation positions from the `Geolocation` service as a stream, with
 * an optional sliding buffer size.
 *
 * @category accessors
 * @since 4.0.0
 */
export const watchPosition = (
  options?:
    | PositionOptions & {
      readonly bufferSize?: number | undefined
    }
    | undefined
): Stream.Stream<GeolocationPosition, GeolocationError, Geolocation> =>
  Stream.unwrap(Effect.map(
    Effect.service(Geolocation),
    (geolocation) => geolocation.watchPosition(options)
  ))
