/**
 * Building blocks for libraries that extend tRPC (`trpcdev/extend`): an
 * untyped client, the link runner, procedure calls and the wire format.
 * Versioned like the rest of the package.
 *
 * @example
 * ```ts
 * import { createUntypedClient } from 'trpcdev/extend';
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
  type TrpcUntypedClient,
} from '../client/client.ts';
export { clientErrorFromCause, firstValue, runLinks } from '../client/link.ts';
export {
  callProcedure,
  normalizeCause,
  type CallOpts,
} from '../server/execute.ts';
export { getProcedure } from '../server/router.ts';
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
  flattenRouter,
  inputJsonSchema,
  procedureJson,
} from '../internal/describe.ts';
export { toJsonSchema, type JsonSchema } from '../internal/json-schema.ts';
