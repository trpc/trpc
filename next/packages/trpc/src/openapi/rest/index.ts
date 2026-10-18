/**
 * The REST mapping the OpenAPI handler, generator and link share: the `route`
 * meta and the extension that adds it, bracket notation, coercion by schema,
 * and the error body.
 *
 * @module
 */
export {
  experimental_parseBracketNotation,
  experimental_toBracketNotation,
} from './bracket.ts';
export { experimental_coerceBySchema, propertySchema } from './coerce.ts';
export { fromOpenApiError, toOpenApiError } from './errors.ts';
export type { OpenApiErrorBody } from './errors.ts';
export { experimental_openapi } from './extension.ts';
export {
  compileRoute,
  experimental_resolveRoute,
  fillPath,
  normalizePrefix,
  routeGroupOf,
  routeOf,
  usesQuery,
} from './routes.ts';
export type {
  HttpMethod,
  OpenApiMeta,
  OperationSpec,
  ResolvedRoute,
  Route,
  RouteGroup,
} from './routes.ts';
