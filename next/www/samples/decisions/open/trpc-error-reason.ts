/**
 * The APIs `.agent-docs/open/trpc-error-reason.md` proposes, as types:
 * B adds an optional, never-serialized `reason` (a `Data.TaggedEnum`) to
 * the errors tRPC makes, seen in `onError`; C sends a few reasons to the
 * client as a `reason` field. A is `TrpcError` as it is.
 */
import type { AnyTrpcError } from '@trpc12/trpc/client';
import type {
  AnyRouter,
  FetchHandler,
  FetchHandlerOptions,
  OnErrorOpts,
} from '@trpc12/trpc/server';
import type { Data } from 'effect';

/** B: a few of #7677's ~60 failures, each fixing its code and message. */
export type ReasonB = Data.TaggedEnum<{
  BodyTooLarge: { readonly limit: number };
  ProcedureNotFound: { readonly path: string };
  InvalidJson: {};
  FetchFailed: {};
  SerializerMismatch: {
    readonly server: string;
    readonly client: string;
    readonly transport: string;
  };
}>;

type WithoutOnError<T> = T extends unknown ? Omit<T, 'onError'> : never;

/** B: `createFetchHandler`, whose `onError` sees each error's `reason`. */
export declare function createFetchHandlerB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: WithoutOnError<FetchHandlerOptions<TRouter, TPlatform>> & {
    router: TRouter;
    onError?: (
      opts: Omit<OnErrorOpts, 'error'> & {
        readonly error: AnyTrpcError & { readonly reason?: ReasonB };
      },
    ) => void;
  },
): FetchHandler<TPlatform>;

/** C: the reasons sent to the client. */
export type WireReasonC = 'ProcedureNotFound' | 'BodyTooLarge';

/** C: a call's error `E`, whose members can carry a `reason`. */
export type CallErrorC<E> = E & { readonly reason?: WireReasonC };
