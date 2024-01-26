/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Unsubscribable } from '@trpc/server/observable';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  AnySubscriptionProcedure,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
  IntersectionError,
  ProcedureOptions,
  ProcedureRouterRecord,
  ProcedureType,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createFlatProxy,
  createRecursiveProxy,
} from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import type {
  TRPCSubscriptionObserver,
  UntypedClientProperties,
} from './internals/TRPCUntypedClient';
import { TRPCUntypedClient } from './internals/TRPCUntypedClient';
import type { TRPCClientError } from './TRPCClientError';

/**
 * @public
 **/
export type inferRouterClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<TRouter['_def']['record'], TRouter>;

/** @internal */
export type Resolver<
  TProcedure extends AnyProcedure,
  TRoot extends AnyRootTypes,
> = (
  input: inferProcedureInput<TProcedure>,
  opts?: ProcedureOptions,
) => Promise<inferTransformedProcedureOutput<TRoot, TProcedure>>;

type SubscriptionResolver<
  TProcedure extends AnyProcedure,
  TRoot extends AnyRootTypes,
> = (
  input: inferProcedureInput<TProcedure>,
  opts?: Partial<
    TRPCSubscriptionObserver<
      inferTransformedSubscriptionOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >
  > &
    ProcedureOptions,
) => Unsubscribable;

type DecorateProcedure<
  TProcedure extends AnyProcedure,
  TRoot extends AnyRootTypes,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TProcedure, TRoot>;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TProcedure, TRoot>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: SubscriptionResolver<TProcedure, TRoot>;
    }
  : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TRouter extends AnyRouter,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record'], TRouter>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey], TRouter['_def']['_config']['$types']>
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
