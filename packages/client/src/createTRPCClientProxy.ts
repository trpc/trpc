/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  OmitNever,
  ProcedureArgs,
  ProcedureRouterRecord,
  ProcedureType,
  inferProcedureOutput,
  initTRPC,
} from '@trpc/server';
import type {
  Unsubscribable,
  inferObservableValue,
} from '@trpc/server/observable';
import { createRecursiveProxy } from '@trpc/server/shared';
import { TRPCClientError } from './TRPCClientError';
import { CreateTRPCClientOptions } from './createTRPCClient';
import {
  TRPCClient as Client,
  TRPCClient,
  TRPCSubscriptionObserver,
} from './internals/TRPCClient';

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
  const proxy = createRecursiveProxy(({ path, args }) => {
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
  const client = new TRPCClient<TRouter>(opts);
  const proxy = createTRPCClientProxy(client);
  return proxy;
}

/**
 * @internal
 */
type DecorateFilter<
  TRouter extends AnyRouter,
  TFilter extends AnyProcedure,
  TRecord extends ProcedureRouterRecord = TRouter['_def']['record'],
> = OmitNever<{
  [TKey in keyof TRecord]: TRecord[TKey] extends AnyRouter
    ? DecorateFilter<TRecord[TKey], TFilter>
    : TRecord[TKey] extends TFilter
    ? Resolver<TRecord[TKey]>
    : never;
}>;

type Decorator<TRouter extends AnyRouter> = {
  query: DecorateFilter<TRouter, AnyQueryProcedure>;
  mutation: DecorateFilter<TRouter, AnyMutationProcedure>;
};

export function createTestClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new TRPCClient<TRouter>(opts);
  return client as any as Decorator<TRouter>;
}

const t = initTRPC.create();
const router = t.router({
  top: t.procedure.query(() => 1),
  foo: t.router({
    bar: t.procedure.query(() => {
      return 1;
    }),
    moo: t.procedure.mutation(() => {
      return 1;
    }),
  }),
});
export async function fn() {
  const { query, mutation } = createTestClient<typeof router>({ links: [] });

  await query.top();
  await query.foo.bar();
  const _res = await mutation.foo.moo();
  //     ^?

  // @ts-expect-error shouldn't exist
  mutation.foo.bar;
}
