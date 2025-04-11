import type { TRPCClient, TRPCRequestOptions } from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyTRPCProcedure,
  AnyTRPCRootTypes,
  AnyTRPCRouter,
  inferProcedureInput,
  inferRouterContext,
  inferTransformedProcedureOutput,
  TRPCProcedureType,
  TRPCRouterRecord,
} from '@trpc/server';
import { callTRPCProcedure, createTRPCRecursiveProxy } from '@trpc/server';
import type { MaybePromise } from '@trpc/server/unstable-core-do-not-import';
import type { OptionalCursorInput, ResolverDef } from './types';
import { unwrapLazyArg } from './utils';

export interface DecorateRouterKeyable {
  //
}

interface TypeHelper<TDef extends ResolverDef> {
  /**
   * @internal prefer using inferInput and inferOutput to access types
   */
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
    errorShape: TDef['errorShape'];
  };
}

export type inferInput<TProcedure extends { '~types': { input: any } }> =
  TProcedure['~types']['input'];

export type inferOutput<TProcedure extends { '~types': { output: any } }> =
  TProcedure['~types']['output'];

export type DecorateProcedure<
  TType extends TRPCProcedureType,
  TDef extends ResolverDef,
  TProxy extends TRPCClientProxyMethods,
> = TType extends 'query'
  ? MethodTypes<TDef, TProxy['queries']> &
      (TDef['input'] extends OptionalCursorInput
        ? TProxy['infinite-queries']
        : Record<string, never>)
  : TType extends 'mutation'
    ? MethodTypes<TDef, TProxy['mutations']>
    : TType extends 'subscription'
      ? MethodTypes<TDef, TProxy['subscriptions']>
      : never;

/**
 * @internal
 */
export type DecoratedRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TProxy extends TRPCClientProxyMethods,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecoratedRouterRecord<TRoot, $Value, TProxy> &
          MethodTypes<never, TProxy['paths']> &
          DecorateRouterKeyable
      : $Value extends AnyTRPCProcedure
        ? DecorateProcedure<
            $Value['_def']['type'],
            {
              input: inferProcedureInput<$Value>;
              output: inferTransformedProcedureOutput<TRoot, $Value>;
              transformer: TRoot['transformer'];
              errorShape: TRoot['errorShape'];
            },
            TProxy
          >
        : never
    : never;
};

export type MethodTypes<
  TDef extends ResolverDef,
  T extends Record<string, MethodDef<TDef>> | undefined,
> = {
  [K in keyof Exclude<T, undefined>]: ReturnType<Exclude<T, undefined>[K]>;
};

export type TRPCClientProxy<
  TRouter extends AnyTRPCRouter,
  TProxy extends TRPCClientProxyMethods,
> = DecoratedRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TProxy
> &
  DecorateRouterKeyable;

type MethodDef<TDef extends ResolverDef> = (
  opts: {
    path: string[];
    call(input: TDef['input']): TDef['output'];
  } & TypeHelper<TDef>,
) => (...args: any[]) => unknown;

export interface TRPCClientProxyOptionsInternal<TRouter extends AnyTRPCRouter> {
  router: TRouter;
  ctx:
    | inferRouterContext<TRouter>
    | (() => MaybePromise<inferRouterContext<TRouter>>);
}

export interface TRPCClientProxyOptionsExternal<TRouter extends AnyTRPCRouter> {
  client: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>;
}

export type TRPCClientProxyMethods = {
  queries?: Record<string, MethodDef<ResolverDef>>;
  mutations?: Record<string, MethodDef<ResolverDef>>;
  paths?: Record<string, MethodDef<ResolverDef>>;
  subscriptions?: Record<string, MethodDef<ResolverDef>>;
  'infinite-queries'?: Record<string, MethodDef<ResolverDef>>;
};

export type TRPCClientProxyOuter<TRouter extends AnyTRPCRouter> =
  | TRPCClientProxyOptionsInternal<TRouter>
  | TRPCClientProxyOptionsExternal<TRouter>;

/**
 * Create a typed proxy from your router types. Can also be used on the server.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3b-setup-without-react-context
 * @see https://trpc.io/docs/client/tanstack-react-query/server-components#5-create-a-trpc-caller-for-server-components
 */
export function createTRPCClientProxy<TRouter extends AnyTRPCRouter>(
  opts: TRPCClientProxyOuter<TRouter>,
) {
  const callIt = (type: TRPCProcedureType): any => {
    return (path: string, input: unknown, trpcOpts: TRPCRequestOptions) => {
      if ('router' in opts) {
        return Promise.resolve(unwrapLazyArg(opts.ctx)).then((ctx) =>
          callTRPCProcedure({
            router: opts.router,
            path: path,
            getRawInput: async () => input,
            ctx: ctx,
            type: type,
            signal: undefined,
          }),
        );
      }

      const untypedClient =
        opts.client instanceof TRPCUntypedClient
          ? opts.client
          : getUntypedClient(opts.client);

      return untypedClient[type](path, input, trpcOpts);
    };
  };

  function create<TMethods extends TRPCClientProxyMethods>(
    methods: TMethods,
  ): TRPCClientProxy<TRouter, TMethods> {
    methods.queries ??= {};
    methods.mutations ??= {};
    methods.paths ??= {};
    methods.subscriptions ??= {};
    methods['infinite-queries'] ??= {};

    const typeMap: Record<string, TRPCProcedureType | 'any'> = {};
    const contextMap: Record<string, MethodDef<any>> = {};
    for (const overloader in methods) {
      const thisMethods = methods[overloader as keyof typeof methods];
      for (const key in thisMethods) {
        if (Object.hasOwn(contextMap, key)) {
          throw new Error(
            `Duplicate key '${key}' in overloads. Keys must be unique across all overload types`,
          );
        }
        contextMap[key] = thisMethods[key] as any;

        switch (overloader as keyof TRPCClientProxyMethods) {
          case 'queries':
          case 'infinite-queries':
            typeMap[key] = 'query';
            break;
          case 'mutations':
            typeMap[key] = 'mutation';
            break;
          case 'subscriptions':
            typeMap[key] = 'subscription';
            break;
          case 'paths':
            typeMap[key] = 'any';
        }
      }
    }

    return createTRPCRecursiveProxy(({ args, path: _path }) => {
      const path = [..._path];

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const utilName = path.pop()!;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return contextMap[utilName]!({
        path,

        // TODO: sort calling out and send inputs etc
        call(_input) {
          return callIt(typeMap[utilName] as TRPCProcedureType);
        },

        '~types': null as any,
      })(...args);
    });
  }

  return create;
}
