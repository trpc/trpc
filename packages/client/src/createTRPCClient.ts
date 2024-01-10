import type {
  AnyRouter,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import type { Unsubscribable } from '@trpc/server/observable';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
import type {
  CreateTRPCClientOptions,
  TRPCRequestOptions,
  TRPCSubscriptionObserver,
} from './internals/TRPCUntypedClient';
import { TRPCUntypedClient } from './internals/TRPCUntypedClient';
import type { TRPCClientRuntime } from './links';
import type { TRPCClientError } from './TRPCClientError';

/**
 * @deprecated
 */
export interface TRPCClient<TRouter extends AnyRouter> {
  readonly runtime: TRPCClientRuntime;
  query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
    TInput extends inferProcedureInput<TQueries[TPath]>,
  >(
    path: TPath,
    input?: TInput,
    opts?: TRPCRequestOptions,
  ): Promise<inferProcedureOutput<TQueries[TPath]>>;

  mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
    TInput extends inferProcedureInput<TMutations[TPath]>,
  >(
    path: TPath,
    input?: TInput,
    opts?: TRPCRequestOptions,
  ): Promise<inferTransformedProcedureOutput<TMutations[TPath]>>;

  subscription<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    // TODO - this should probably be updated to use inferTransformedProcedureOutput but this is only hit for legacy clients
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>,
  >(
    path: TPath,
    input: TInput,
    opts: Partial<TRPCSubscriptionObserver<TOutput, TRPCClientError<TRouter>>> &
      TRPCRequestOptions,
  ): Unsubscribable;
}
/**
 * @deprecated use `createTRPCProxyClient` instead
 */
export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new TRPCUntypedClient(opts);
  return client as TRPCClient<TRouter>;
}
