/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Unsubscribable } from '@trpc/server/observable';
import type {
  AnyProcedure,
  AnyRouter,
  inferClientTypes,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  IntersectionError,
  ProcedureType,
  RouterRecord,
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
import type { ClientContext, TRPCProcedureOptions } from './internals/types';
import type { TRPCClientError } from './TRPCClientError';

/**
 * @public
 **/
export type inferRouterClient<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
> = DecoratedProcedureRecord<TRouter, TRouter['_def']['record'], TContext>;

type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

type coerceAsyncGeneratorToIterable<T> =
  T extends AsyncGenerator<infer $T, infer $Return, infer $Next>
    ? AsyncIterable<$T, $Return, $Next>
    : T;

/** @internal */
export type Resolver<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = (
  input: TDef['input'],
  opts?: TRPCProcedureOptions<TContext>,
) => Promise<coerceAsyncGeneratorToIterable<TDef['output']>>;

type SubscriptionResolver<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = (
  input: TDef['input'],
  opts: Partial<
    TRPCSubscriptionObserver<TDef['output'], TRPCClientError<TDef>>
  > &
    TRPCProcedureOptions<TContext>,
) => Unsubscribable;

type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = TType extends 'query'
  ? {
      query: Resolver<TDef, TContext>;
    }
  : TType extends 'mutation'
    ? {
        mutate: Resolver<TDef, TContext>;
      }
    : TType extends 'subscription'
      ? {
          subscribe: SubscriptionResolver<TDef, TContext>;
        }
      : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRouter extends AnyRouter,
  TRecord extends RouterRecord,
  TContext extends ClientContext,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? DecorateProcedure<
          $Value['_def']['type'],
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<
              inferClientTypes<TRouter>,
              $Value
            >;
            errorShape: inferClientTypes<TRouter>['errorShape'];
            transformer: inferClientTypes<TRouter>['transformer'];
          },
          TContext
        >
      : $Value extends RouterRecord
        ? DecoratedProcedureRecord<TRouter, $Value, TContext>
        : never
    : never;
};

const clientCallTypeMap: Record<
  keyof DecorateProcedure<any, any, any>,
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
export type CreateTRPCClient<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
> =
  inferRouterClient<TRouter, TContext> extends infer $Value
    ? UntypedClientProperties & keyof $Value extends never
      ? inferRouterClient<TRouter, TContext>
      : IntersectionError<UntypedClientProperties & keyof $Value>
    : never;

/**
 * @internal
 */
export function createTRPCClientProxy<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
>(client: TRPCUntypedClient<TRouter>): CreateTRPCClient<TRouter, TContext> {
  const proxy = createRecursiveProxy<CreateTRPCClient<TRouter, TContext>>(
    ({ path, args }) => {
      const pathCopy = [...path];
      const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);

      const fullPath = pathCopy.join('.');

      return (client as any)[procedureType](fullPath, ...args);
    },
  );
  return createFlatProxy<CreateTRPCClient<TRouter, TContext>>((key) => {
    if (client.hasOwnProperty(key)) {
      return (client as any)[key as any];
    }
    if (key === '__untypedClient') {
      return client;
    }
    return proxy[key];
  });
}

export function createTRPCClient<
  TRouter extends AnyRouter,
  TContext extends ClientContext = ClientContext,
>(opts: CreateTRPCClientOptions<TRouter>): CreateTRPCClient<TRouter, TContext> {
  const client = new TRPCUntypedClient(opts);
  const proxy = createTRPCClientProxy<TRouter, TContext>(client);
  return proxy;
}

/**
 * Get an untyped client from a proxy client
 * @internal
 */
export function getUntypedClient<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
>(client: inferRouterClient<TRouter, TContext>): TRPCUntypedClient<TRouter> {
  return (client as any).__untypedClient;
}
