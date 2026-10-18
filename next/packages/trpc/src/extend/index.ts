/**
 * Building blocks for libraries that extend tRPC (`@trpc12/trpc/extend`): an
 * untyped client, the link runner, procedure calls and the wire format.
 * Versioned like the rest of the package.
 *
 * @example
 * ```ts
 * import { createUntypedClient } from '@trpc12/trpc/extend';
 *
 * const untyped = createUntypedClient({ links: [httpLink({ url })] });
 * const post = await untyped.request({ type: 'query', path: 'post.byId', input: { id: '1' } });
 * ```
 * @module
 */
export {
  createRecursiveProxy,
  createUntypedClient,
  makeOperation,
  splitCallOptions,
  type TrpcUntypedClient,
  type UntypedCallOptions,
} from '../client/client.ts';
export {
  clientErrorFromCause,
  firstValue,
  runLinks,
  runOperation,
} from '../client/link.ts';
export {
  callProcedure,
  normalizeCause,
  type CallOpts,
} from '../server/execution/index.ts';
export {
  getProcedure,
  resolveProcedure,
  routerMetaOf,
} from '../server/procedures/index.ts';
export {
  fromWireError,
  toWireError,
  type WireError,
} from '../internal/error.ts';
export {
  CONTENT_TYPE,
  HEADER,
  PROTOCOL_VERSION,
  type BatchCall,
  type BatchLine,
} from '../internal/protocol.ts';
export {
  assertLoaded,
  flattenRouter,
  flattenRoutes,
  scopedRoute,
  type FlatRoutes,
  type RouteScope,
  inputJsonSchema,
  outputJsonSchema,
  procedureJson,
} from '../internal/describe.ts';
export { toJsonSchema, type JsonSchema } from '../internal/json-schema.ts';
