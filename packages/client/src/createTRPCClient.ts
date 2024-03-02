/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Unsubscribable } from '@trpc/server/observable';
import type {
  AnyProcedure,
  AnyRouter,
  inferClientTypes,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  IntersectionError,
  ProcedureOptions,
  ProcedureType,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createFlatProxy,
  createRecursiveProxy,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCDecoratedClientOptions } from './createTRPCClientOptions';
import type { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import type {
  TRPCSubscriptionObserver,
  UntypedClientProperties,
} from './internals/TRPCUntypedClient';
import { TRPCUntypedClient } from './internals/TRPCUntypedClient';
import type { TRPCLinkDecoration } from './links';
import type { TRPCClientError } from './TRPCClientError';

/**
 * @public
 **/
export type inferRouterClient<
  TRouter extends AnyRouter,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> = DecoratedProcedureRecord<TRouter, TRouter['_def']['record'], TDecoration>;

type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

/** @internal */
export type Resolver<
  TDef extends ResolverDef,
  TType extends ProcedureType,
  TDecoration extends TRPCLinkDecoration,
> = (
  input: TDef['input'],
  opts?: ProcedureOptions & Partial<TDecoration[TType]>,
) => Promise<TDef['output']>;

type SubscriptionResolver<
  TDef extends ResolverDef,
  TDecoration extends TRPCLinkDecoration,
> = (
  input: TDef['input'],
  opts?: Partial<
    TRPCSubscriptionObserver<TDef['output'], TRPCClientError<TDef>>
  > &
    ProcedureOptions &
    Partial<TDecoration['subscription']>,
) => Unsubscribable;

type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends ResolverDef,
  TDecoration extends TRPCLinkDecoration,
> = TType extends 'query'
  ? {
      query: Resolver<TDef, 'query', TDecoration>;
    }
  : TType extends 'mutation'
  ? {
      mutate: Resolver<TDef, 'query', TDecoration>;
    }
  : TType extends 'subscription'
  ? {
      subscribe: SubscriptionResolver<TDef, TDecoration>;
    }
  : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRouter extends AnyRouter,
  TRecord extends RouterRecord,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? DecoratedProcedureRecord<TRouter, $Value, TDecoration>
      : $Value extends AnyProcedure
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
          TDecoration
        >
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
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> = inferRouterClient<TRouter, TDecoration> extends infer $Value
  ? UntypedClientProperties & keyof $Value extends never
    ? inferRouterClient<TRouter, TDecoration>
    : IntersectionError<UntypedClientProperties & keyof $Value>
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

type FIXME = any;
export function createTRPCClient<
  TRouter extends AnyRouter,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
>(
  opts:
    | CreateTRPCClientOptions<TRouter>
    | TRPCDecoratedClientOptions<TRouter, TDecoration>,
): CreateTRPCClient<TRouter> {
  const client = new TRPCUntypedClient(opts as FIXME);
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
