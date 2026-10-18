import {
  type ProcedureBuilder,
  initTrpc,
  type RootDef,
} from '../server/procedures/index.ts';
import { mergeRoute, type OpenApiMeta } from './routes.ts';

/**
 * The OpenAPI root extension (03 Q3.6): adds the `route` meta key, the REST
 * mapping the OpenAPI handler, generator and link read. `.meta({ route })`
 * calls merge by key, and `spec` functions compose, so a base procedure can
 * set tags or `security` that its leaves extend. Contracts take it too:
 * `contract.create().concat(experimental_openapi())`.
 *
 * @example
 * ```ts
 * const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
 *
 * export const byId = t.procedure
 *   .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
 *   .input(z.object({ id: z.string() }))
 *   .query(({ input }) => db.post.find(input.id));
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_openapi(): ProcedureBuilder<
  RootDef<{}, OpenApiMeta>
> {
  return initTrpc<{ meta: OpenApiMeta }>({
    mergeMeta: { route: mergeRoute },
  }).procedure;
}
