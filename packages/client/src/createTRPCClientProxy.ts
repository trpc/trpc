/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  ProcedureArgs,
  ProcedureRouterRecord,
  ProcedureType,
  inferProcedureOutput,
} from '@trpc/server';
import type {
  Unsubscribable,
  inferObservableValue,
} from '@trpc/server/observable';
import { LegacyV9ProcedureTag, createProxy } from '@trpc/server/shared';
import { TRPCClientError } from './TRPCClientError';
import { CreateTRPCClientOptions, createTRPCClient } from './createTRPCClient';
import {
  TRPCClient as Client,
  TRPCSubscriptionObserver,
} from './internals/TRPCClient';

export type inferRouterProxyClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<TRouter['_def']['record'], TRouter>;

type Resolver<TProcedure extends Procedure<any>> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => Promise<inferProcedureOutput<TProcedure>>;

type SubscriptionResolver<
  TProcedure extends Procedure<any>,
  TRouter extends AnyRouter,
> = (
  ...args: [
    input: ProcedureArgs<TProcedure['_def']>[0],
    opts: ProcedureArgs<TProcedure['_def']>[1] &
      Partial<
        TRPCSubscriptionObserver<
          inferObservableValue<inferProcedureOutput<TProcedure>>,
          TRPCClientError<TRouter>
        >
      >,
  ]
) => Unsubscribable;

type DecorateProcedure<
  TProcedure extends Procedure<any>,
  TRouter extends AnyRouter,
> = OmitNeverKeys<{
  query: TProcedure extends { _query: true } ? Resolver<TProcedure> : never;

  mutate: TProcedure extends { _mutation: true } ? Resolver<TProcedure> : never;

  subscribe: TProcedure extends { _subscription: true }
    ? SubscriptionResolver<TProcedure, TRouter>
    : never;
}>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TRouter extends AnyRouter,
> = OmitNeverKeys<{
  [TKey in keyof TProcedures]: TProcedures[TKey] extends LegacyV9ProcedureTag
    ? never
    : TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<
        TProcedures[TKey]['_def']['record'],
        TProcedures[TKey]
      >
    : DecorateProcedure<assertProcedure<TProcedures[TKey]>, TRouter>;
}>;

const clientCallTypeMap: Record<
  keyof DecorateProcedure<any, any>,
  ProcedureType
> = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
};

/**
 * @deprecated use `createTRPCProxyClient` instead
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  const proxy = createProxy(({ path, args }) => {
    const pathCopy = [...path];
    const clientCallType = pathCopy.pop()! as keyof DecorateProcedure<any, any>;
    const procedureType = clientCallTypeMap[clientCallType];

    const fullPath = pathCopy.join('.');
    return (client as any)[procedureType](fullPath, ...args);
  });
  return proxy as inferRouterProxyClient<TRouter>;
}

export function createTRPCProxyClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCClient<TRouter>(opts);
  const proxy = createTRPCClientProxy(client);
  return proxy;
}
