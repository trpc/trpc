/**
 * OpenAPI (`trpcdev/openapi`, 18): serve a router over REST, generate an
 * OpenAPI 3.1 document from its schemas, serve an API reference UI, and call
 * REST endpoints with the tRPC client.
 *
 * @example
 * ```ts
 * import { createOpenApiHandler, generateOpenApi, openApiReference } from 'trpcdev/openapi';
 *
 * const byId = t.procedure
 *   .route({ method: 'GET', path: '/posts/{id}', tags: ['posts'] })
 *   .input(z.object({ id: z.string() }))
 *   .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
 *   .query(…);
 *
 * export const openapi = createOpenApiHandler({
 *   router: appRouter,
 *   plugins: [openApiReference({ specGenerateOptions: { info: { title: 'API', version: '1.0.0' } } })],
 * });
 * // GET /api/posts/1 → 200 { id, title } or 404 { defined, code: 'NOT_FOUND', data: { id } }
 * ```
 * @see ../../../../.agent-docs/proposals/18-openapi.md
 * @module
 */
export { parseBracketNotation, toBracketNotation } from './bracket.ts';
export { coerceBySchema } from './coerce.ts';
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
  type OpenApiHandler,
  type OpenApiHandlerOptions,
  type OpenApiPlugin,
  type OpenApiPluginContext,
} from './handler.ts';
export { openApiLink, type OpenApiLinkOptions } from './link.ts';
export { openApiReference, type OpenApiReferenceOptions } from './reference.ts';
export type { HttpMethod, ResolvedRoute } from './routes.ts';
export type { JsonSchema } from '../internal/json-schema.ts';
