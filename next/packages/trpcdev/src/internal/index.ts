/**
 * Internal glue (`trpcdev/internal`) for integrations built on trpcdev. No
 * semver guarantees.
 *
 * @see ../../../../.agent-docs/proposals/21-stability-and-jsdoc.md
 * @module
 */
export {
  callProcedure,
  normalizeCause,
  type CallOpts,
} from '../server/execute.ts';
export { getProcedure } from '../server/router.ts';
export { clientErrorFromCause, firstValue, runLinks } from '../client/link.ts';
export { createRecursiveProxy, makeOperation } from '../client/client.ts';
export { fromWireError, toWireError, type WireError } from './error.ts';
export {
  CONTENT_TYPE,
  HEADER,
  PROTOCOL_VERSION,
  type BatchCall,
  type BatchLine,
} from './protocol.ts';
export { flattenRouter, inputJsonSchema, procedureJson } from './describe.ts';
export { toJsonSchema, type JsonSchema } from './json-schema.ts';
