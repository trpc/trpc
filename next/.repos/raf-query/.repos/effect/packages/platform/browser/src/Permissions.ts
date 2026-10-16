/**
 * Effect service for the browser Permissions API.
 *
 * This module defines a `Permissions` service backed by
 * `navigator.permissions`. The service exposes `query`, which returns the
 * browser `PermissionStatus` for a permission name. Failed browser operations
 * are represented as `PermissionsError` values with `InvalidStateError` or
 * `TypeError` reasons, and `layer` provides the browser-backed service.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const TypeId = "~@effect/platform-browser/Permissions"
const ErrorTypeId = "~@effect/platform-browser/Permissions/PermissionsError"

/**
 * Wrapper on the Permission API (`navigator.permissions`) with methods for
 * querying status of permissions.
 *
 * @category services
 * @since 4.0.0
 */
export interface Permissions {
  readonly [TypeId]: typeof TypeId

  /**
   * Returns the state of a user permission on the global scope.
   */
  readonly query: <Name extends PermissionName>(
    name: Name
  ) => Effect.Effect<
    // `name` is identical to the name passed to Permissions.query
    // https://developer.mozilla.org/en-US/docs/Web/API/PermissionStatus
    Omit<PermissionStatus, "name"> & { name: Name },
    PermissionsError
  >
}

/**
 * Error reason for an `InvalidStateError` raised by the browser Permissions API.
 *
 * @category errors
 * @since 4.0.0
 */
export class PermissionsInvalidStateError extends Data.TaggedError("InvalidStateError")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this._tag
  }
}

/**
 * Error reason for a `TypeError` raised by the browser Permissions API.
 *
 * @category errors
 * @since 4.0.0
 */
export class PermissionsTypeError extends Data.TaggedError("TypeError")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this._tag
  }
}

/**
 * Union of browser Permissions API error reasons represented by the service.
 *
 * @category errors
 * @since 4.0.0
 */
export type PermissionsErrorReason = PermissionsInvalidStateError | PermissionsTypeError

/**
 * Tagged error wrapping a browser Permissions API failure reason.
 *
 * @category errors
 * @since 4.0.0
 */
export class PermissionsError extends Data.TaggedError("PermissionsError")<{
  readonly reason: PermissionsErrorReason
}> {
  constructor(props: { readonly reason: PermissionsErrorReason }) {
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
 * Service tag for browser permission querying.
 *
 * **When to use**
 *
 * Use when you need to require or provide browser permission querying through
 * Effect's context.
 *
 * @category services
 * @since 4.0.0
 */
export const Permissions: Context.Service<Permissions, Permissions> = Context.Service<Permissions>(TypeId)

/**
 * Provides the `Permissions` service using the browser `navigator.permissions` API.
 *
 * **When to use**
 *
 * Use when you need a live browser `Permissions` service backed by the ambient
 * `navigator.permissions` implementation.
 *
 * **Details**
 *
 * `query` delegates to `navigator.permissions.query({ name })` and wraps
 * rejected browser operations in `PermissionsError`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Permissions> = Layer.succeed(
  Permissions,
  Permissions.of({
    [TypeId]: TypeId,
    query: (name) =>
      Effect.tryPromise({
        try: () => navigator.permissions.query({ name }) as Promise<any>,
        catch: (cause) =>
          new PermissionsError({
            reason: cause instanceof DOMException
              ? new PermissionsInvalidStateError({ cause })
              : new PermissionsTypeError({ cause })
          })
      })
  })
)
