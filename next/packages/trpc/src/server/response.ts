import { Context, Effect } from 'effect';
import type { ResponseHandle } from './middleware.ts';

/**
 * The call's response headers and status, for Effect code: the same handle
 * resolvers and middleware get as `response`. In a batch, headers merge
 * (`set-cookie` appends) and each call keeps its status. Over WebSockets
 * and in-process calls there is no response; the service is a scratch
 * handle nobody reads.
 *
 * @example
 * ```ts
 * t.procedure.query(() =>
 *   Effect.gen(function* () {
 *     yield* Response.setHeader('cache-control', 'max-age=60');
 *     yield* Response.setStatus(203);
 *     return yield* loadPosts;
 *   }),
 * );
 * ```
 * @since 0.0.1
 * @stability stable
 */
export interface Response {
  readonly _: unique symbol;
}

/**
 * The `Response` key and its accessors.
 * @since 0.0.1
 * @stability stable
 */
export interface ResponseService extends Context.ServiceClass<
  Response,
  '@trpc12/trpc/Response',
  ResponseHandle
> {
  /** Sets a header, replacing earlier values. */
  setHeader(name: string, value: string): Effect.Effect<void, never, Response>;
  /** Adds a value to a header, as `set-cookie` needs. */
  appendHeader(
    name: string,
    value: string,
  ): Effect.Effect<void, never, Response>;
  /** The success status. Errors use their own status. */
  setStatus(status: number): Effect.Effect<void, never, Response>;
}

const Key = Context.Service<Response, ResponseHandle>()(
  '@trpc12/trpc/Response',
);
const tag = Key as unknown as Context.Key<Response, ResponseHandle>;
const update = (f: (handle: ResponseHandle) => void) =>
  Effect.flatMap(tag, (handle) => Effect.sync(() => f(handle)));

/**
 * @since 0.0.1
 * @stability stable
 */
export const Response: ResponseService = Object.assign(Key, {
  setHeader: (name: string, value: string) =>
    update((h) => h.headers.set(name, value)),
  appendHeader: (name: string, value: string) =>
    update((h) => h.headers.append(name, value)),
  setStatus: (status: number) =>
    update((h) => {
      h.status = status;
    }),
});
