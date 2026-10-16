import type { ProcedureBuilder } from '../server/builder.ts';
import { initTrpc, type RootDef } from '../server/init.ts';
import { mergeRoute, type OpenApiMeta } from './routes.ts';

/**
 * The OpenAPI root extension (03 Q3.6): adds the `route` meta key, the REST
 * mapping the OpenAPI handler, generator and link read. `.meta({ route })`
 * calls merge by key, and `spec` functions compose, so a base procedure can
 * set tags or `security` that its leaves extend. Contracts take it too:
 * `contract.create().with(openapi())`.
 *
 * @example
 * ```ts
 * const t = initTrpc<{ ctx: Context }>().with(openapi());
 *
 * export const byId = t.procedure
 *   .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
 *   .input(z.object({ id: z.string() }))
 *   .query(({ input }) => db.post.find(input.id));
 * ```
 * @since 0.0.1
 * @stability stable
 */
export function openapi(): ProcedureBuilder<RootDef<{}, OpenApiMeta>> {
  return initTrpc<{ meta: OpenApiMeta }>({
    mergeMeta: { route: (before, next) => mergeRoute(before, next)! },
  }).procedure;
}
