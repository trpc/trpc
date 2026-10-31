import type {
  AnyTRPCProcedure,
  AnyTRPCRootTypes,
  AnyTRPCRouter,
  inferProcedureErrorShape,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  TRPCRouterRecord,
} from '@trpc/server';
import { createTRPCRecursiveProxy } from '@trpc/server';
import type { TRPCOptionsProxyOptions } from './createOptionsProxy';
import { createProcedureCaller } from './createOptionsProxy';
import type {
  DecorateInfiniteQueryHandleVerbs,
  DecorateQueryHandleVerbs,
  HandleVerb,
} from './handles';
import { startHandle } from './handles';
import { trpcInfiniteQueryOptions } from './infiniteQueryOptions';
import { trpcQueryOptions } from './queryOptions';
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  OptionalCursorInput,
  ResolverDef,
} from './types';
import { getQueryKeyInternal, unwrapLazyArg } from './utils';

type DecorateHandleProcedure<TDef extends ResolverDef> =
  DecorateQueryHandleVerbs<TDef> &
    (TDef['input'] extends OptionalCursorInput
      ? DecorateInfiniteQueryHandleVerbs<TDef>
      : Record<string, never>);

type QueryKeys<TRecord extends TRPCRouterRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends TRPCRouterRecord
    ? TKey
    : TRecord[TKey] extends AnyTRPCProcedure
      ? TRecord[TKey]['_def']['type'] extends 'query'
        ? TKey
        : never
      : never;
}[keyof TRecord];

/**
 * @internal
 */
export type DecoratedHandleRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = {
  [TKey in QueryKeys<TRecord>]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecoratedHandleRouterRecord<TRoot, $Value, TFeatureFlags>
      : $Value extends AnyTRPCProcedure
        ? DecorateHandleProcedure<{
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<TRoot, $Value>;
            transformer: TRoot['transformer'];
            errorShape: inferProcedureErrorShape<TRoot, $Value>;
            featureFlags: TFeatureFlags;
          }>
        : never
    : never;
};

export type unstable_TRPCHandleProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = DecoratedHandleRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TFeatureFlags
>;

const verbs: Record<
  | keyof DecorateQueryHandleVerbs<any>
  | keyof DecorateInfiniteQueryHandleVerbs<any>,
  { kind: 'query' | 'infinite'; verb: HandleVerb }
> = {
  prefetch: { kind: 'query', verb: 'prefetch' },
  ensure: { kind: 'query', verb: 'ensure' },
  fetch: { kind: 'query', verb: 'fetch' },
  prefetchInfinite: { kind: 'infinite', verb: 'prefetch' },
  ensureInfinite: { kind: 'infinite', verb: 'ensure' },
  fetchInfinite: { kind: 'infinite', verb: 'fetch' },
};

/**
 * Create a proxy that starts queries and returns serializable handles for them.
 * Use it where a page's queries start: server components and route loaders.
 * Components read the handles with `useTRPC().unstable_fromHandle(handle)`.
 *
 * Takes the same options as `createTRPCOptionsProxy`.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export function unstable_createTRPCHandleProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(
  opts: TRPCOptionsProxyOptions<TRouter, TFeatureFlags>,
): unstable_TRPCHandleProxy<TRouter, TFeatureFlags> {
  const prefix = opts.keyPrefix;
  const query = createProcedureCaller(opts)('query');

  return createTRPCRecursiveProxy(({ args, path: _path }) => {
    const path = [..._path];
    const name = path.pop() ?? '';
    const [input, verbOpts] = args as any[];

    const def = verbs[name as keyof typeof verbs] as
      (typeof verbs)[keyof typeof verbs] | undefined;
    if (!def) {
      throw new Error(
        `\`${[...path, name].join('.')}()\` isn't a handle verb. Use \`prefetch\`, \`ensure\` or \`fetch\`, or their \`Infinite\` forms.`,
      );
    }

    const queryKey = getQueryKeyInternal({
      path,
      input,
      type: def.kind,
      prefix,
    });
    const options =
      def.kind === 'infinite'
        ? trpcInfiniteQueryOptions({
            input,
            opts: verbOpts,
            path,
            queryClient: opts.queryClient,
            queryKey,
            query,
          })
        : trpcQueryOptions({
            input,
            opts: verbOpts,
            path,
            queryClient: opts.queryClient,
            queryKey,
            query,
          });

    return startHandle({
      queryClient: unwrapLazyArg(opts.queryClient),
      options,
      kind: def.kind,
      verb: def.verb,
    });
  });
}
