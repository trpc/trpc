import { cors } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import type { HttpServerRequest } from 'effect/http';
import { appRouter } from './router.ts';
import { appLayer, SaasDb } from './store.ts';
import type { RequestContext } from './trpc.ts';

export const appOrigin = 'https://app.example.test';

/** A bearer token, else the `sid` cookie `auth.login` sets. */
export function contextFrom(
  request: HttpServerRequest.HttpServerRequest,
): RequestContext {
  const bearer = request.headers['authorization']?.match(/^Bearer (.+)$/)?.[1];
  return {
    sessionToken: bearer ?? request.cookies['sid'] ?? null,
    tenantSlug: request.headers['x-tenant'] ?? null,
  };
}

/** One handler per store, so each server (and test) starts from the seed. */
export function createApiHandler(db: SaasDb = SaasDb.seeded()) {
  return createFetchHandler({
    router: appRouter,
    batch: true,
    layer: appLayer(db),
    middleware: [cors({ allowedOrigins: [appOrigin], credentials: true })],
    createContext: (opts) => contextFrom(opts.request),
  });
}
export type ApiHandler = ReturnType<typeof createApiHandler>;
