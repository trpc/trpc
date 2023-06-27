/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  IntersectionError,
  ProcedureArgs,
  ProcedureRouterRecord,
  ProcedureType,
} from '@trpc/server';
import type { Unsubscribable } from '@trpc/server/observable';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
} from '@trpc/server/shared';
import { TRPCClient } from './createTRPCClient';
import { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import {
  TRPCSubscriptionObserver,
  TRPCUntypedClient,
  UntypedClientProperties,
} from './internals/TRPCUntypedClient';
import { TRPCClientError } from './TRPCClientError';

/**
 * @public
 **/
export type inferRouterProxyClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<TRouter, TRouter['_def']['record']>;

/** @internal */
export type Resolver<TProcedure extends AnyProcedure> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => Promise<inferTransformedProcedureOutput<TProcedure>>;

type SubscriptionResolver<TProcedure extends AnyProcedure> = (
  ...args: [
    input: ProcedureArgs<TProcedure['_def']>[0],
    opts: Partial<
      TRPCSubscriptionObserver<
        inferTransformedSubscriptionOutput<TProcedure>,
        TRPCClientError<TProcedure>
      >
    > &
      ProcedureArgs<TProcedure['_def']>[1],
  ]
) => Unsubscribable;

type DecorateProcedure<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        query: Resolver<TProcedure>;
      }
    : TProcedure extends AnyMutationProcedure
    ? {
        mutate: Resolver<TProcedure>;
      }
    : TProcedure extends AnySubscriptionProcedure
    ? {
        subscribe: SubscriptionResolver<TProcedure>;
      }
    : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRouter extends AnyRouter,
  TProcedures extends ProcedureRouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TRouter, TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey]>
    : never;
};

const clientCallTypeMap: Record<keyof DecorateProcedure<any>, ProcedureType> = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
};

/** @internal */
export const clientCallTypeToProcedureType = (
  clientCallType: string,
): ProcedureType => {
  return clientCallTypeMap[clientCallType as keyof typeof clientCallTypeMap];
};

/**
 * Creates a proxy client and shows type errors if you have query names that collide with built-in properties
 */
export type CreateTRPCProxyClient<TRouter extends AnyRouter> =
  inferRouterProxyClient<TRouter> extends infer $ProcedureRecord
    ? UntypedClientProperties & keyof $ProcedureRecord extends never
      ? inferRouterProxyClient<TRouter>
      : IntersectionError<UntypedClientProperties & keyof $ProcedureRecord>
    : never;

/**
 * @deprecated use `createTRPCProxyClient` instead
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
): CreateTRPCProxyClient<TRouter> {
  return createFlatProxy<CreateTRPCProxyClient<TRouter>>((key) => {
    if (client.hasOwnProperty(key)) {
      return (client as any)[key as any];
    }
    if (key === '__untypedClient') {
      return client;
    }
    return createRecursiveProxy(({ path, args }) => {
      const pathCopy = [key, ...path];
      const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);

      const fullPath = pathCopy.join('.');

      return (client as any)[procedureType](fullPath, ...args);
    });
  });
}

export function createTRPCProxyClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): CreateTRPCProxyClient<TRouter> {
  const client = new TRPCUntypedClient(opts);
  const proxy = createTRPCClientProxy(client as TRPCClient<TRouter>);
  return proxy;
}

/**
 * Get an untyped client from a proxy client
 * @internal
 */
export function getUntypedClient<TRouter extends AnyRouter>(
  client: inferRouterProxyClient<TRouter>,
): TRPCUntypedClient<TRouter> {
  return (client as any).__untypedClient;
}
