/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  ProcedureArgs,
  ProcedureRouterRecord,
  inferProcedureOutput,
} from '@trpc/server';
import type {
  Unsubscribable,
  inferObservableValue,
} from '@trpc/server/observable';
import type { TRPCResultMessage } from '@trpc/server/rpc';
import { createProxy } from '@trpc/server/shared';
import { TRPCClientError } from './TRPCClientError';
import { CreateTRPCClientOptions, createTRPCClient } from './createTRPCClient';
import {
  TRPCClient as Client,
  TRPCSubscriptionObserver,
} from './internals/TRPCClient';

type Resolver<TProcedure extends Procedure<any>> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => Promise<inferProcedureOutput<TProcedure>>;

type SubscriptionResolver<TProcedure extends Procedure<any>> = (
  ...args: [
    input: ProcedureArgs<TProcedure['_def']>[0],
    opts: ProcedureArgs<TProcedure['_def']>[1] &
      Partial<
        TRPCSubscriptionObserver<
          TRPCResultMessage<
            inferObservableValue<inferProcedureOutput<TProcedure>>
          >,
          TRPCClientError<TProcedure>
        >
      >,
  ]
) => Unsubscribable;

type DecorateProcedure<TProcedure extends Procedure<any>> = TProcedure extends {
  _subscription: true;
}
  ? SubscriptionResolver<TProcedure>
  : Resolver<TProcedure>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> =
  OmitNeverKeys<{
    [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
      ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
      : assertProcedure<TProcedures[TKey]>['_def']['_old'] extends true
      ? never
      : DecorateProcedure<assertProcedure<TProcedures[TKey]>>;
  }>;

/**
 * @deprecated use createTRPCProxyClient instead
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  const proxy = createProxy(({ path, args }) => {
    return client.procedureCall({
      path: path.join('.'),
      input: args[0],
      opts: args[1] as any,
    });
  });
  return proxy as DecoratedProcedureRecord<TRouter['_def']['record']>;
}

export function createTRPCProxyClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCClient<TRouter>(opts);
  const proxy = createTRPCClientProxy(client);
  return proxy;
}
