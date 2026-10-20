/**
 * The API `.agent-docs/open/client-timeout-error.md` proposes, as types:
 * C adds a `timeout` option to the client and to each call. A and B need
 * no new API (B only changes which code an aborted call fails with).
 */
import type {
  AtLeastOneLink,
  LinksContext,
  LinksTypes,
  RouterOf,
  TrpcClient,
  TypedClientOptions,
} from '@trpc12/trpc/client';
import type { Duration } from 'effect';

interface TimeoutOption {
  /** Fails the call with `TIMEOUT` once it has run this long, retries included. */
  timeout?: Duration.Input | undefined;
}

/** C: `createTrpcClient` with a client-wide `timeout`, which each call can override. */
export declare function createTrpcClientC<
  TSource,
  const TLinks extends AtLeastOneLink<RouterOf<TSource>>,
>(
  opts: TypedClientOptions<TSource, TLinks> & TimeoutOption,
): TrpcClient<
  RouterOf<TSource>,
  LinksContext<TLinks> & TimeoutOption,
  undefined,
  LinksTypes<TLinks>
>;
