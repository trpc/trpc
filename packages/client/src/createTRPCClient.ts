/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootConfig,
  AnyRouter,
  AnySubscriptionProcedure,
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
import { IntersectionError } from '@trpc/server/unstableInternalsExport';
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
export type inferRouterClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<TRouter, TRouter['_def']['record']>;

/** @internal */
export type Resolver<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => Promise<inferTransformedProcedureOutput<TConfig, TProcedure>>;

type SubscriptionResolver<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = (
  ...args: [
    input: ProcedureArgs<TProcedure['_def']>[0],
    opts: Partial<
      TRPCSubscriptionObserver<
        inferTransformedSubscriptionOutput<TConfig, TProcedure>,
        TRPCClientError<TConfig>
      >
    > &
      ProcedureArgs<TProcedure['_def']>[1],
  ]
) => Unsubscribable;

type DecorateProcedure<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TConfig, TProcedure>;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TConfig, TProcedure>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: SubscriptionResolver<TConfig, TProcedure>;
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
    ? DecorateProcedure<TRouter['_def']['_config'], TProcedures[TKey]>
    : never;
};

const clientCallTypeMap: Record<
  keyof DecorateProcedure<any, any>,
  ProcedureType
> = {
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
export type CreateTRPCClient<TRouter extends AnyRouter> =
  inferRouterClient<TRouter> extends infer $ProcedureRecord
    ? UntypedClientProperties & keyof $ProcedureRecord extends never
      ? inferRouterClient<TRouter>
      : IntersectionError<UntypedClientProperties & keyof $ProcedureRecord>
    : never;

/**
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
): CreateTRPCClient<TRouter> {
  return createFlatProxy<CreateTRPCClient<TRouter>>((key) => {
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

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): CreateTRPCClient<TRouter> {
  const client = new TRPCUntypedClient(opts);
  const proxy = createTRPCClientProxy<TRouter>(client);
  return proxy;
}

/**
 * Get an untyped client from a proxy client
 * @internal
 */
export function getUntypedClient<TRouter extends AnyRouter>(
  client: inferRouterClient<TRouter>,
): TRPCUntypedClient<TRouter> {
  return (client as any).__untypedClient;
}
