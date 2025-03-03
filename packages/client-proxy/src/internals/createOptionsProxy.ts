import type {
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
} from '@trpc/client';
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
import type { OptionalCursorInput, ResolverDef, WithRequired } from './types';
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
  TProxy extends TRPCClientProxyOptions<any>,
> = TType extends 'query'
  ? TProxy['overloads']['queries'] &
      (TDef['input'] extends OptionalCursorInput
        ? TProxy['overloads']['infinite-queries']
        : Record<string, never>)
  : TType extends 'mutation'
    ? TProxy['overloads']['mutations']
    : TType extends 'subscription'
      ? TProxy['overloads']['subscriptions']
      : never;

/**
 * @internal
 */
export type DecoratedRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TProxy extends TRPCClientProxyOptions<any>,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecoratedRouterRecord<TRoot, $Value, TProxy> &
          TProxy['overloads']['paths'] &
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

export type TRPCClientProxy<
  TRouter extends AnyTRPCRouter,
  TProxy extends TRPCClientProxyOptions<TRouter>,
> = DecoratedRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TProxy
> &
  DecorateRouterKeyable;

type ProcedureRecord = Record<
  string,
  (bag: { path: string; call(input: unknown): unknown }) => unknown
>;

export interface TRPCClientProxyOptionsInternal<TRouter extends AnyTRPCRouter> {
  router: TRouter;
  ctx:
    | inferRouterContext<TRouter>
    | (() => MaybePromise<inferRouterContext<TRouter>>);
}

export interface TRPCClientProxyOptionsExternal<TRouter extends AnyTRPCRouter> {
  client: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>;
}

export type TRPCClientProxyOptions<TRouter extends AnyTRPCRouter> = {
  overloads: {
    queries?: ProcedureRecord;
    mutations?: ProcedureRecord;
    paths?: ProcedureRecord;
    subscriptions?: ProcedureRecord;
    'infinite-queries'?: ProcedureRecord;
  };
} & (
  | TRPCClientProxyOptionsInternal<TRouter>
  | TRPCClientProxyOptionsExternal<TRouter>
);

/**
 * Create a typed proxy from your router types. Can also be used on the server.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3b-setup-without-react-context
 * @see https://trpc.io/docs/client/tanstack-react-query/server-components#5-create-a-trpc-caller-for-server-components
 */
export function createTRPCClientProxy<
  TRouter extends AnyTRPCRouter,
  TProxy extends
    TRPCClientProxyOptions<TRouter> = TRPCClientProxyOptions<TRouter>,
>(opts: TProxy): TRPCClientProxy<TRouter, TProxy> {
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

  opts.overloads ??= {};
  opts.overloads.queries ??= {};
  opts.overloads.mutations ??= {};
  opts.overloads.paths ??= {};
  opts.overloads.subscriptions ??= {};
  opts.overloads['infinite-queries'] ??= {};

  // TODO: restrict this at the type level if possible?
  const knownKeys = new Set<string>();
  for (const overloader in opts.overloads) {
    for (const key in opts.overloads[
      overloader as keyof typeof opts.overloads
    ]) {
      if (knownKeys.has(key)) {
        throw new Error(
          `Duplicate key '${key}' in overloads. Keys must be unique across all overload types`,
        );
      }
      knownKeys.add(key);
    }
  }

  return createTRPCRecursiveProxy(({ args, path: _path }) => {
    const path = [..._path];
    const utilName = path.pop();
    const [arg1, arg2] = args as any[];

    const contextMap: Record<string, () => unknown> = {
      '~types': undefined as any,

      //
    };

    return contextMap[utilName]();
  });
}
