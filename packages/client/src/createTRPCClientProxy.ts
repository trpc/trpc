/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  ProcedureArgs,
  ProcedureRouterRecord,
  ProcedureType,
  inferProcedureOutput,
} from '@trpc/server';
import type {
  Unsubscribable,
  inferObservableValue,
} from '@trpc/server/observable';
import { createFlatProxy, createRecursiveProxy } from '@trpc/server/shared';
import { TRPCClientError } from './TRPCClientError';
import { CreateTRPCClientOptions } from './createTRPCClient';
import {
  TRPCClient as Client,
  TRPCClient,
  TRPCSubscriptionObserver,
} from './internals/TRPCClient';
import { TRPCClientRuntime } from './links';

export type inferRouterProxyClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<TRouter['_def']['record'], TRouter>;

type Resolver<TProcedure extends AnyProcedure> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => Promise<inferProcedureOutput<TProcedure>>;

type SubscriptionResolver<
  TProcedure extends AnyProcedure,
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
  TProcedure extends AnyProcedure,
  TRouter extends AnyRouter,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TProcedure>;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TProcedure>;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      subscribe: SubscriptionResolver<TProcedure, TRouter>;
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
    ? DecoratedProcedureRecord<
        TProcedures[TKey]['_def']['record'],
        TProcedures[TKey]
      >
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey], TRouter>
    : never;
};

/**
 * attributes other than the proxy paths
 */
const clientAttributes = ['runtime'] as const;

const clientCallTypeMap: Record<
  keyof DecorateProcedure<any, any>,
  ProcedureType
> = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
};

export type CreateTRPCProxyClient<TRouter extends AnyRouter> =
  inferRouterProxyClient<TRouter> & {
    /**
     * the TRPC runtime
     */
    runtime: TRPCClientRuntime;
  };

/**
 * @deprecated use `createTRPCProxyClient` instead
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  return createFlatProxy<CreateTRPCProxyClient<TRouter>>((key) => {
    const name = key as typeof clientAttributes[number];
    if (clientAttributes.includes(name)) {
      return client[name];
    }

    return createRecursiveProxy(({ path, args }) => {
      const pathCopy = [key, ...path];
      const clientCallType = pathCopy.pop()! as keyof DecorateProcedure<
        any,
        any
      >;

      const procedureType = clientCallTypeMap[clientCallType];

      const fullPath = pathCopy.join('.');

      return (client as any)[procedureType](fullPath, ...args);
    });
  });
}

export function createTRPCProxyClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new TRPCClient<TRouter>(opts);
  const proxy = createTRPCClientProxy(client);
  return proxy;
}
