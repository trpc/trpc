/* oxlint-disable typescript/no-non-null-assertion */
import type { Unsubscribable } from '@trpc/server/observable';
import type {
  AnyProcedure,
  AnyRouter,
  inferAsyncIterableYield,
  inferClientTypes,
  inferProcedureErrorShape,
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
import type {
  TRPCSubscriptionCallbacks,
  TRPCSubscriptionObserver,
  TRPCSubscriptionWithoutCallbacks,
} from './internals/TRPCUntypedClient';
import { TRPCUntypedClient } from './internals/TRPCUntypedClient';
import type { TRPCProcedureOptions } from './internals/types';
import type { inferLinksContext, TRPCLink } from './links/types';
import type { RouterType } from './routerType';
import type { TRPCTaggedPromise } from './safe';
import type { TRPCClientError } from './TRPCClientError';

/**
 * The type of a client for a router.
 * @deprecated Use {@link TRPCClient} instead. This will be removed in v12.
 * @public
 **/
export type inferRouterClient<TRouter extends AnyRouter> = TRPCClient<TRouter>;

/**
 * The type of a client for a router.
 * @deprecated Use {@link TRPCClient} instead. This will be removed in v12.
 * @public
 **/
export type CreateTRPCClient<TRouter extends AnyRouter> = TRPCClient<TRouter>;

const untypedClientSymbol = Symbol.for('trpc_untypedClient');

/**
 * A typed client for a router, as `createTRPCClient` returns it. Each
 * procedure has `.query()`, `.mutate()` or `.subscribe()`.
 *
 * `TContext` is the `context` calls take; `createTRPCClient({ router,
 * links })` infers it from the links.
 * @see https://trpc.io/docs/client/vanilla/infer-types
 * @public
 **/
export type TRPCClient<
  TRouter extends AnyRouter,
  TContext extends object = Record<string, unknown>,
> = DecoratedProcedureRecord<
  {
    transformer: TRouter['_def']['_config']['$types']['transformer'];
    errorShape: TRouter['_def']['_config']['$types']['errorShape'];
  },
  TRouter['_def']['record'],
  TContext
> & {
  [untypedClientSymbol]: TRPCUntypedClient<TRouter>;
};

/**
 * A procedure's types, as the client sees them.
 * @internal
 */
export type TRPCResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

type coerceAsyncGeneratorToIterable<T> =
  T extends AsyncGenerator<infer $T, infer $Return, infer $Next>
    ? AsyncIterable<$T, $Return, $Next>
    : T;

/**
 * The `.query()` or `.mutate()` of a procedure on the client.
 * @internal
 */
export type Resolver<
  TDef extends TRPCResolverDef,
  TContext extends object = Record<string, unknown>,
> = (
  input: TDef['input'],
  opts?: TRPCProcedureOptions<TContext>,
) => TRPCTaggedPromise<
  coerceAsyncGeneratorToIterable<TDef['output']>,
  TDef['errorShape']
>;

/**
 * The `.subscribe()` of a subscription procedure on the client.
 * @internal
 */
export type SubscriptionResolver<
  TDef extends TRPCResolverDef,
  TContext extends object = Record<string, unknown>,
> = {
  (
    input: TDef['input'],
    opts: TRPCSubscriptionCallbacks<TDef['output'], TRPCClientError<TDef>> &
      TRPCProcedureOptions<TContext>,
  ): Unsubscribable;
  <
    TOpts extends TRPCProcedureOptions<TContext> &
      Partial<TRPCSubscriptionObserver<TDef['output'], TRPCClientError<TDef>>> =
      TRPCProcedureOptions<TContext>,
  >(
    input: TDef['input'],
    opts?: TRPCSubscriptionWithoutCallbacks<TOpts>,
  ): AsyncIterableIterator<inferAsyncIterableYield<TDef['output']>>;
};

type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends TRPCResolverDef,
  TContext extends object,
> = TType extends 'query'
  ? { query: Resolver<TDef, TContext> }
  : TType extends 'mutation'
    ? { mutate: Resolver<TDef, TContext> }
    : TType extends 'subscription'
      ? { subscribe: SubscriptionResolver<TDef, TContext> }
      : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRoot extends InferrableClientTypes,
  TRecord extends RouterRecord,
  TContext extends object,
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
            errorShape: inferProcedureErrorShape<TRoot, $Value>;
            transformer: inferClientTypes<TRoot>['transformer'];
          },
          TContext
        >
      : $Value extends RouterRecord
        ? DecoratedProcedureRecord<TRoot, $Value, TContext>
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

/**
 * The procedure type of a client method: `query`, `mutate` or `subscribe`.
 * @internal
 */
export const clientCallTypeToProcedureType = (
  clientCallType: string,
): ProcedureType => {
  return clientCallTypeMap[clientCallType as keyof typeof clientCallTypeMap];
};

/**
 * Wraps an untyped client in the typed proxy `createTRPCClient` returns.
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
): TRPCClient<TRouter> {
  const proxy = createRecursiveProxy<TRPCClient<TRouter>>(({ path, args }) => {
    const pathCopy = [...path];
    const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);

    const fullPath = pathCopy.join('.');

    return (client[procedureType] as any)(fullPath, ...(args as any));
  });
  return createFlatProxy<TRPCClient<TRouter>>((key) => {
    if (key === untypedClientSymbol) {
      return client;
    }
    return proxy[key];
  });
}

/**
 * The options of `createTRPCClient` with the router's type passed as
 * `router: routerType<AppRouter>()`.
 * @public
 */
export type CreateTRPCClientWithRouterOptions<
  TRouter extends AnyRouter,
  TLinks extends readonly TRPCLink<TRouter, any>[] = TRPCLink<TRouter>[],
> = Omit<CreateTRPCClientOptions<TRouter>, 'links'> & {
  /**
   * The router's type, from `routerType<AppRouter>()`. It's a type only:
   * nothing about the router is sent or bundled.
   */
  router: RouterType<TRouter>;
  /**
   * The links each call goes through, in order. The last one must send
   * the call, such as `httpBatchLink`. What they declare types each call's
   * `context`, and which methods the client has.
   * @see https://trpc.io/docs/client/links
   */
  links: TLinks;
};

/**
 * Creates a typed client for a router. Pass the router's type with
 * `routerType`, and the links that send its calls. What the links declare
 * types each call's `context`.
 * @example
 * ```ts
 * const client = createTRPCClient({
 *   router: routerType<AppRouter>(),
 *   links: [retryLink({ retry: () => false }), httpBatchLink({ url })],
 * });
 * const post = await client.post.byId.query(
 *   { id: '1' },
 *   { context: { retry: (opts) => opts.attempts <= 3 } },
 * );
 * ```
 * @see https://trpc.io/docs/client/vanilla/setup#3-initialize-the-trpc-client
 */
export function createTRPCClient<
  TRouter extends AnyRouter,
  const TLinks extends readonly TRPCLink<TRouter, any>[],
>(
  opts: CreateTRPCClientWithRouterOptions<TRouter, TLinks>,
): TRPCClient<TRouter, inferLinksContext<TLinks>>;
/**
 * Creates a typed client for a router. Pass the router's type, and the
 * links that send its calls.
 * @example
 * ```ts
 * const client = createTRPCClient<AppRouter>({
 *   links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
 * });
 * const post = await client.post.byId.query({ id: '1' });
 * ```
 * @see https://trpc.io/docs/client/vanilla/setup#3-initialize-the-trpc-client
 */
// Kept last: `ReturnType<typeof createTRPCClient>` reads the last overload.
export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): TRPCClient<TRouter>;
export function createTRPCClient<TRouter extends AnyRouter>(
  opts: Omit<CreateTRPCClientOptions<TRouter>, 'links'> & {
    links: readonly TRPCLink<TRouter, any>[];
  },
): TRPCClient<TRouter> {
  // `router` is a type only, so the untyped client ignores it
  const client = new TRPCUntypedClient<TRouter>({
    links: [...opts.links],
  });
  const proxy = createTRPCClientProxy<TRouter>(client);
  return proxy;
}

/**
 * The untyped client behind a typed client, which calls procedures by
 * path string.
 * @internal
 */
export function getUntypedClient<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
): TRPCUntypedClient<TRouter> {
  return client[untypedClientSymbol];
}
