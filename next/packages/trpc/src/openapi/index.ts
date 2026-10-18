/**
 * OpenAPI (`@trpc12/trpc/openapi`, 18): serve a router over REST, generate an
 * OpenAPI 3.1 document from its schemas, serve an API reference UI, and call
 * REST endpoints with the tRPC client.
 *
 * @example
 * ```ts
 * import { experimental_createOpenApiHandler, experimental_generateOpenApi, experimental_openapi, experimental_openApiReference } from '@trpc12/trpc/openapi';
 *
 * const t = initTrpc().concat(experimental_openapi());
 * const byId = t.procedure
 *   .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
 *   .input(z.object({ id: z.string() }))
 *   .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
 *   .query(…);
 *
 * export const openapi = experimental_createOpenApiHandler({
 *   router: appRouter,
 *   middleware: [experimental_openApiReference({ router: appRouter, specGenerateOptions: { info: { title: 'API', version: '1.0.0' } } })],
 * });
 * // GET /api/posts/1 → 200 { id, title } or 404 { defined, code: 'NOT_FOUND', data: { id } }
 * ```
 * @see ../../../../.agent-docs/proposals/18-openapi.md
 * @module
 */
export {
  experimental_parseBracketNotation,
  experimental_toBracketNotation,
} from './bracket.ts';
export { experimental_coerceBySchema } from './coerce.ts';
export {
  experimental_generateContractFromOpenApi,
  type GenerateContractOptions,
  type OpenApiSource,
} from './to-contract.ts';
export type { OpenApiErrorBody } from './errors.ts';
export {
  experimental_generateOpenApi,
  type GenerateOpenApiOptions,
  type OpenApiDocument,
  type OpenApiInfo,
  type OpenApiOperation,
  type OpenApiServer,
} from './generate.ts';
export {
  experimental_createOpenApiHandler,
  type BaseOpenApiHandlerOptions,
  type OpenApiCall,
  type OpenApiHandler,
  type OpenApiHandlerOptions,
} from './handler.ts';
export { experimental_openapi } from './extension.ts';
export type {
  OpenApiMeta,
  OperationSpec,
  Route,
  RouteGroup,
} from './routes.ts';
export { experimental_openApiLink, type OpenApiLinkOptions } from './link.ts';
export {
  experimental_openApiReference,
  type OpenApiReferenceOptions,
} from './reference.ts';
export {
  experimental_resolveRoute,
  type HttpMethod,
  type ResolvedRoute,
} from './routes.ts';
export type { JsonSchema } from '../internal/json-schema.ts';
