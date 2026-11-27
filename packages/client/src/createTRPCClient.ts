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
import type {
  inferLinksContext,
  inferLinksUnsupported,
  ReservedCallOptions,
  TRPCLink,
} from './links/types';
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
 * `TContext` is the `context` calls take, and `TUnsupported` the operation
 * types the links can't carry; `createTRPCClient({ router, links })` infers
 * both from the links.
 * @see https://trpc.io/docs/client/vanilla/infer-types
 * @public
 **/
export type TRPCClient<
  TRouter extends AnyRouter,
  TContext extends object = Record<string, unknown>,
  TUnsupported extends ProcedureType = never,
> = DecoratedProcedureRecord<
  {
    transformer: TRouter['_def']['_config']['$types']['transformer'];
    errorShape: TRouter['_def']['_config']['$types']['errorShape'];
  },
  TRouter['_def']['record'],
  { context: TContext; unsupported: TUnsupported }
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
 * The fields a client's links declare by name, without index signatures or
 * symbol keys: the ones calls can pass at the top level of their options.
 * @internal
 */
type inferDeclaredContextFields<TContext extends object> = {
  [
    TKey in keyof TContext as TKey extends string
      ? string extends TKey
        ? never
        : TKey
      : never
  ]: TContext[TKey];
};

/**
 * The options of a call on the client. On a client created with
 * `router: routerType<AppRouter>()`, the fields its links declare go at the
 * top level, like v12: `{ retry: false, signal }`. `context` still takes
 * them, and any field an undeclared link may read.
 * @public
 */
export type TRPCCallOptions<TContext extends object = Record<string, unknown>> =
  keyof inferDeclaredContextFields<TContext> extends never
    ? TRPCProcedureOptions<TContext>
    : inferDeclaredContextFields<TContext> & TRPCProcedureOptions<TContext>;

/**
 * The `.query()` or `.mutate()` of a procedure on the client.
 * @internal
 */
export type Resolver<
  TDef extends TRPCResolverDef,
  TContext extends object = Record<string, unknown>,
> = (
  input: TDef['input'],
  opts?: TRPCCallOptions<TContext>,
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
  // A parameter rather than written out below: TypeScript before 6 can't
  // tell that the conditional `TRPCCallOptions` satisfies `TOpts`'s
  // constraint as its default.
  TCallOptions extends object = TRPCCallOptions<TContext>,
> = {
  (
    input: TDef['input'],
    opts: TRPCSubscriptionCallbacks<TDef['output'], TRPCClientError<TDef>> &
      TCallOptions,
  ): Unsubscribable;
  <
    TOpts extends TCallOptions &
      Partial<TRPCSubscriptionObserver<TDef['output'], TRPCClientError<TDef>>> =
      TCallOptions,
  >(
    input: TDef['input'],
    opts?: TRPCSubscriptionWithoutCallbacks<TOpts>,
  ): AsyncIterableIterator<inferAsyncIterableYield<TDef['output']>>;
};

/**
 * What a client's links allow: the `context` calls take, and the operation
 * types they can't carry.
 * @internal
 */
type ClientLinksDef = {
  context: object;
  unsupported: ProcedureType;
};

// A method the links can't carry is `never` rather than missing, so the
// client stays assignable to `TRPCClient<TRouter>` for integrations.
type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends TRPCResolverDef,
  TLinks extends ClientLinksDef,
> = TType extends 'query'
  ? {
      query: TType extends TLinks['unsupported']
        ? never
        : Resolver<TDef, TLinks['context']>;
    }
  : TType extends 'mutation'
    ? {
        mutate: TType extends TLinks['unsupported']
          ? never
          : Resolver<TDef, TLinks['context']>;
      }
    : TType extends 'subscription'
      ? {
          subscribe: TType extends TLinks['unsupported']
            ? never
            : SubscriptionResolver<TDef, TLinks['context']>;
        }
      : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRoot extends InferrableClientTypes,
  TRecord extends RouterRecord,
  TLinks extends ClientLinksDef,
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
          TLinks
        >
      : $Value extends RouterRecord
        ? DecoratedProcedureRecord<TRoot, $Value, TLinks>
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

const reservedCallOptionKeys: ReadonlySet<string> = new Set<
  keyof ReservedCallOptions
>([
  'signal',
  'context',
  'lastEventId',
  'onStarted',
  'onData',
  'onError',
  'onStopped',
  'onComplete',
  'onConnectionStateChange',
]);

/**
 * Moves the fields a call passes at the top level of its options into
 * `context`, over the ones it passes there.
 */
function withTopLevelContext(opts: unknown): unknown {
  if (typeof opts !== 'object' || opts === null) {
    return opts;
  }
  const callOpts: Record<string, unknown> = {};
  const context: Record<string, unknown> = {};
  let hasTopLevelContext = false;
  for (const [key, value] of Object.entries(opts)) {
    if (reservedCallOptionKeys.has(key)) {
      callOpts[key] = value;
    } else {
      context[key] = value;
      hasTopLevelContext = true;
    }
  }
  if (!hasTopLevelContext) {
    return opts;
  }
  callOpts['context'] = {
    ...(callOpts['context'] as Record<string, unknown> | undefined),
    ...context,
  };
  return callOpts;
}

/**
 * Wraps an untyped client in the typed proxy `createTRPCClient` returns.
 * @internal
 */
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
): TRPCClient<TRouter> {
  return createClientProxy(client, { topLevelContext: false });
}

/**
 * The typed proxy. With `topLevelContext`, calls pass the fields their
 * links declare at the top level of their options.
 */
function createClientProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
  opts: { topLevelContext: boolean },
): TRPCClient<TRouter> {
  const proxy = createRecursiveProxy<TRPCClient<TRouter>>(({ path, args }) => {
    const pathCopy = [...path];
    const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);

    const fullPath = pathCopy.join('.');
    const [input, callOpts] = args;
    const callArgs =
      opts.topLevelContext && args.length > 1
        ? [input, withTopLevelContext(callOpts)]
        : args;

    return (client[procedureType] as any)(fullPath, ...(callArgs as any));
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
 * `routerType`, and the links that send its calls. Calls pass the fields
 * the links declare at the top level of their options.
 * @example
 * ```ts
 * const client = createTRPCClient({
 *   router: routerType<AppRouter>(),
 *   links: [retryLink({ retry: () => true }), httpBatchLink({ url })],
 * });
 * const post = await client.post.byId.query({ id: '1' }, { retry: false });
 * ```
 * @see https://trpc.io/docs/client/vanilla/setup#3-initialize-the-trpc-client
 */
export function createTRPCClient<
  TRouter extends AnyRouter,
  const TLinks extends readonly TRPCLink<TRouter, any>[],
>(
  opts: CreateTRPCClientWithRouterOptions<TRouter, TLinks>,
): TRPCClient<
  TRouter,
  inferLinksContext<TLinks>,
  inferLinksUnsupported<TLinks>
>;
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
  return createClientProxy(client, {
    // only clients created with `router` take link fields at the top level
    topLevelContext: 'router' in opts,
  });
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
