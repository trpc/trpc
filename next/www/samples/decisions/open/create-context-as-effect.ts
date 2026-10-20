/**
 * The API `.agent-docs/open/create-context-as-effect.md` proposes, as types:
 * B lets a handler's `createContext` return an Effect, whose services join
 * what the `layer` or `runtime` must provide. A is `createFetchHandler` as
 * it is.
 */
import type { AnyTrpcError } from '@trpc12/trpc/client';
import type {
  AnyRouter,
  BaseHandlerOptions,
  CreateContextOpts,
  FetchHandler,
  LayerOption,
  RuntimeOption,
  SerializerOption,
  inferRouterContext,
  inferRouterServices,
} from '@trpc12/trpc/server';
import type { Effect } from 'effect';

/** B: `createContext` returns a value, a promise or an Effect. */
export type FetchHandlerOptionsB<
  TRouter extends AnyRouter,
  TPlatform,
  R,
> = BaseHandlerOptions<TRouter> &
  SerializerOption & {
    createContext?: (
      opts: CreateContextOpts<TPlatform>,
    ) =>
      | inferRouterContext<TRouter>
      | Promise<inferRouterContext<TRouter>>
      | Effect.Effect<inferRouterContext<TRouter>, AnyTrpcError, R>;
  } & (
    | LayerOption<inferRouterServices<TRouter> | NoInfer<R>>
    | RuntimeOption<inferRouterServices<TRouter> | NoInfer<R>>
  );

export declare function createFetchHandlerB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
  R = never,
>(opts: FetchHandlerOptionsB<TRouter, TPlatform, R>): FetchHandler<TPlatform>;
