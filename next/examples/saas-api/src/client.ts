import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  link,
  loggerLink,
  retryLink,
  routerType,
  switchLink,
  type LoggerEvent,
} from '@trpc12/trpc/client';
import type { AppRouter } from './router.ts';

/**
 * Sends each call's tenant as `x-tenant`: the link's default, or the one a
 * call names with its `{ tenant }` call option.
 */
export const tenantLink = (defaultTenant?: string) =>
  link<{ context: { tenant?: string } }>((opts) => {
    const tenant = opts.op.context.tenant ?? defaultTenant;
    if (!tenant) return opts.next(opts.op);
    const headers = new Headers(opts.op.context.headers);
    headers.set('x-tenant', tenant);
    return opts.next({ ...opts.op, context: { ...opts.op.context, headers } });
  });

export interface ApiClientOptions {
  /** The server's origin; tRPC is at `/trpc`. */
  origin: string;
  /** A session token from `auth.login`. */
  token?: string;
  tenant?: string;
  fetch?: typeof globalThis.fetch;
  /** Receives every operation, result and error, when set. */
  log?: (event: LoggerEvent) => void;
}

export function createApiClient(opts: ApiClientOptions) {
  const url = `${opts.origin}/trpc`;
  const headers: Record<string, string> = opts.token
    ? { authorization: `Bearer ${opts.token}` }
    : {};
  return createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      loggerLink({
        enabled: () => opts.log !== undefined,
        log: (event) => opts.log?.(event),
      }),
      tenantLink(opts.tenant),
      // `admin.*` goes unbatched and is never retried; `{ via }` overrides.
      switchLink({
        name: 'via',
        links: {
          app: [
            dedupeLink(),
            retryLink(),
            httpLink({ url, batch: true, headers, fetch: opts.fetch }),
          ],
          admin: httpLink({ url, headers, fetch: opts.fetch }),
        },
        pick: (op) => (op.path.startsWith('admin.') ? 'admin' : 'app'),
      }),
    ],
  });
}
export type ApiClient = ReturnType<typeof createApiClient>;
