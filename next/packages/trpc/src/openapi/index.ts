/**
 * OpenAPI (`@trpc12/trpc/openapi`, 18): serve a router over REST, generate an
 * OpenAPI 3.1 document from its schemas, serve an API reference UI, and call
 * REST endpoints with the tRPC client.
 *
 * @example
 * ```ts
 * import { createOpenApiHandler, generateOpenApi, openapi, openApiReference } from '@trpc12/trpc/openapi';
 *
 * const t = initTrpc().with(openapi());
 * const byId = t.procedure
 *   .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
 *   .input(z.object({ id: z.string() }))
 *   .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
 *   .query(…);
 *
 * export const openapi = createOpenApiHandler({
 *   router: appRouter,
 *   middleware: [openApiReference({ router: appRouter, specGenerateOptions: { info: { title: 'API', version: '1.0.0' } } })],
 * });
 * // GET /api/posts/1 → 200 { id, title } or 404 { defined, code: 'NOT_FOUND', data: { id } }
 * ```
 * @see ../../../../.agent-docs/proposals/18-openapi.md
 * @module
 */
export { parseBracketNotation, toBracketNotation } from './bracket.ts';
export { coerceBySchema } from './coerce.ts';
export {
  generateContractFromOpenApi,
  type GenerateContractOptions,
  type OpenApiSource,
} from './to-contract.ts';
export type { OpenApiErrorBody } from './errors.ts';
export {
  generateOpenApi,
  type GenerateOpenApiOptions,
  type OpenApiDocument,
  type OpenApiInfo,
  type OpenApiOperation,
  type OpenApiServer,
} from './generate.ts';
export {
  createOpenApiHandler,
  type BaseOpenApiHandlerOptions,
  type OpenApiCall,
  type OpenApiHandler,
  type OpenApiHandlerOptions,
} from './handler.ts';
export { openapi } from './extension.ts';
export type {
  OpenApiMeta,
  OperationSpec,
  Route,
  RouteGroup,
} from './routes.ts';
export { openApiLink, type OpenApiLinkOptions } from './link.ts';
export { openApiReference, type OpenApiReferenceOptions } from './reference.ts';
export { resolveRoute, type HttpMethod, type ResolvedRoute } from './routes.ts';
export type { JsonSchema } from '../internal/json-schema.ts';
