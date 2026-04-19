import { QueryCache, QueryClient } from '@tanstack/react-query';
import type { CreateTRPCReactQueryClientConfig } from '@trpc/react-query/shared';
import { getQueryClient } from '@trpc/react-query/shared';
import { isServer } from './runtime';

const gcTimePatchedSymbol = Symbol.for(
  '@trpc/next.forceServerGcTimeInfinity.patched',
);

type PatchedQueryCache = QueryCache & {
  [gcTimePatchedSymbol]?: boolean;
  build: (...args: any[]) => any;
};

let didWarnPatchFailure = false;

/**
 * Dev-only warning for unsupported patch scenarios.
 * We deliberately avoid throwing here to keep request handling resilient.
 */
function warnPatchFailure() {
  if (process.env['NODE_ENV'] === 'production' || didWarnPatchFailure) {
    return;
  }
  didWarnPatchFailure = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[@trpc/next] `forceServerGcTimeInfinity` is enabled, but QueryCache.build could not be patched. Server gcTime/cacheTime may not be forced to Infinity.',
  );
}

/**
 * Build wrapper used by both patching strategies:
 * - dedicated `ServerSafeQueryCache` for internally created clients
 * - in-place patching for externally provided QueryClient instances
 *
 * We intentionally set both keys for cross-version behavior:
 * - `cacheTime` for TanStack Query v4
 * - `gcTime` for TanStack Query v5
 */
function createBuildWithInfinity(originalBuild: (...args: any[]) => any) {
  return (...args: any[]) => {
    const [client, options, state] = args;
    return originalBuild(
      client,
      {
        ...options,
        // `cacheTime` is for v4 compatibility and `gcTime` is used by v5.
        cacheTime: Infinity,
        gcTime: Infinity,
      },
      state,
    );
  };
}

function tryPatchBuildToInfinity(queryCache: PatchedQueryCache): boolean {
  // Guard against unexpected QueryCache shapes from future versions or wrappers.
  if (typeof queryCache.build !== 'function') {
    return false;
  }

  const ownDesc = Object.getOwnPropertyDescriptor(queryCache, 'build');
  const protoDesc = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(queryCache),
    'build',
  );
  const desc = ownDesc ?? protoDesc;

  if (desc && desc.writable === false && !desc.set) {
    return false;
  }

  const previousBuild = queryCache.build;
  const originalBuild = queryCache.build.bind(queryCache);
  const nextBuild = createBuildWithInfinity(originalBuild);

  if (!Reflect.set(queryCache, 'build', nextBuild)) {
    return false;
  }

  return queryCache.build !== previousBuild;
}

/**
 * Internal creation path.
 * When we control QueryClient construction we prefer an explicit QueryCache class,
 * then apply the same patching logic used by the external-client fallback path.
 */
export class ServerSafeQueryCache extends QueryCache {
  constructor(...args: ConstructorParameters<typeof QueryCache>) {
    super(...args);
    const patched = tryPatchBuildToInfinity(this as PatchedQueryCache);
    if (!patched) {
      warnPatchFailure();
    }
  }
}

function patchQueryCacheBuildToInfinity(queryClient: QueryClient): QueryClient {
  const queryCache = queryClient.getQueryCache() as PatchedQueryCache;

  // Idempotent guard for reused QueryClient instances across renders/requests.
  if (queryCache[gcTimePatchedSymbol]) {
    return queryClient;
  }

  const patched = tryPatchBuildToInfinity(queryCache);
  if (!patched) {
    warnPatchFailure();
    return queryClient;
  }

  queryCache[gcTimePatchedSymbol] = true;

  return queryClient;
}

export function getQueryClientWithServerGcTimeInfinity(
  config: CreateTRPCReactQueryClientConfig,
  forceServerGcTimeInfinity: boolean | undefined,
): QueryClient {
  // Feature is opt-in and server-only by design.
  if (!forceServerGcTimeInfinity || !isServer()) {
    return getQueryClient(config);
  }

  // External QueryClient: cannot replace instance, so patch in-place.
  if (config.queryClient) {
    return patchQueryCacheBuildToInfinity(config.queryClient);
  }

  // Internal QueryClient: install dedicated server-safe QueryCache.
  return new QueryClient({
    ...config.queryClientConfig,
    queryCache: new ServerSafeQueryCache(),
  });
}
