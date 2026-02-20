/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Observable, Unsubscribable } from '@trpc/server/observable';
import type {
  AnyProcedure,
  AnyRouter,
  inferClientTypes,
  inferProcedureInput,
  InferrableClientTypes,
  inferTransformedProcedureOutput,
  ProcedureType,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createFlatProxy,
  createRecursiveProxy,
} from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import type { TRPCSubscriptionObserver } from './internals/TRPCUntypedClient';
import { TRPCUntypedClient } from './internals/TRPCUntypedClient';
import type { TRPCProcedureOptions } from './internals/types';
import type { TRPCClientError } from './TRPCClientError';

/**
 * @public
 * @deprecated use {@link TRPCClient} instead, will be removed in v12
 **/
export type inferRouterClient<TRouter extends AnyRouter> = TRPCClient<TRouter>;

/**
 * @public
 * @deprecated use {@link TRPCClient} instead, will be removed in v12
 **/
export type CreateTRPCClient<TRouter extends AnyRouter> = TRPCClient<TRouter>;

const untypedClientSymbol = Symbol.for('trpc_untypedClient');

/**
 * @public
 **/
export type TRPCClient<TRouter extends AnyRouter> = DecoratedProcedureRecord<
  {
    transformer: TRouter['_def']['_config']['$types']['transformer'];
    errorShape: TRouter['_def']['_config']['$types']['errorShape'];
  },
  TRouter['_def']['record']
> & {
  [untypedClientSymbol]: TRPCUntypedClient<TRouter>;
};

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
export type Resolver<TDef extends ResolverDef> = (
  input: TDef['input'],
  opts?: TRPCProcedureOptions,
) => Promise<coerceAsyncGeneratorToIterable<TDef['output']>>;

/** @internal - Observable-based resolver for query$/mutate$ (Angular/RxJS) */
export type ObservableResolver<TDef extends ResolverDef> = (
  input: TDef['input'],
  opts?: TRPCProcedureOptions,
) => Observable<
  coerceAsyncGeneratorToIterable<TDef['output']>,
  TRPCClientError<TDef>
>;

type SubscriptionResolver<TDef extends ResolverDef> = (
  input: TDef['input'],
  opts: Partial<
    TRPCSubscriptionObserver<TDef['output'], TRPCClientError<TDef>>
  > &
    TRPCProcedureOptions,
) => Unsubscribable;

type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends ResolverDef,
> = TType extends 'query'
  ? {
      query: Resolver<TDef>;
      /** Observable that emits the query result. Use with Angular/RxJS without fromPromise(). */
      query$: ObservableResolver<TDef>;
    }
  : TType extends 'mutation'
    ? {
        mutate: Resolver<TDef>;
        /** Observable that emits the mutation result. Use with Angular/RxJS without fromPromise(). */
        mutate$: ObservableResolver<TDef>;
      }
    : TType extends 'subscription'
      ? {
          subscribe: SubscriptionResolver<TDef>;
        }
      : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRoot extends InferrableClientTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? DecorateProcedure<
          $Value['_def']['type'],
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<
              inferClientTypes<TRoot>,
              $Value
            >;
            errorShape: inferClientTypes<TRoot>['errorShape'];
            transformer: inferClientTypes<TRoot>['transformer'];
          }
        >
      : $Value extends RouterRecord
        ? DecoratedProcedureRecord<TRoot, $Value>
        : never
    : never;
};

const clientCallTypeMap: Record<
  keyof DecorateProcedure<any, any>,
  ProcedureType | 'queryObservable' | 'mutationObservable'
> = {
  query: 'query',
  query$: 'queryObservable',
  mutate: 'mutation',
  mutate$: 'mutationObservable',
  subscribe: 'subscription',
};

/** @internal */
export const clientCallTypeToProcedureType = (
  clientCallType: string,
): ProcedureType => {
  const mapped = clientCallTypeMap[clientCallType as keyof typeof clientCallTypeMap];
  if (mapped === 'queryObservable') return 'query';
  if (mapped === 'mutationObservable') return 'mutation';
  return mapped as ProcedureType;
};

/**
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
): TRPCClient<TRouter> {
  const proxy = createRecursiveProxy<TRPCClient<TRouter>>(({ path, args }) => {
    const pathCopy = [...path];
    const callType = pathCopy.pop()!;
    const fullPath = pathCopy.join('.');

    if (callType === 'query$') {
      return (client as any).queryObservable(
        fullPath,
        (args as any)[0],
        (args as any)[1],
      );
    }
    if (callType === 'mutate$') {
      return (client as any).mutationObservable(
        fullPath,
        (args as any)[0],
        (args as any)[1],
      );
    }

    const procedureType = clientCallTypeToProcedureType(callType);
    return (client[procedureType] as any)(fullPath, ...(args as any));
  });
  return createFlatProxy<TRPCClient<TRouter>>((key) => {
    if (key === untypedClientSymbol) {
      return client;
    }
    return proxy[key];
  });
}

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): TRPCClient<TRouter> {
  const client = new TRPCUntypedClient(opts);
  const proxy = createTRPCClientProxy<TRouter>(client);
  return proxy;
}

/**
 * Get an untyped client from a proxy client
 * @internal
 */
export function getUntypedClient<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
): TRPCUntypedClient<TRouter> {
  return client[untypedClientSymbol];
}
