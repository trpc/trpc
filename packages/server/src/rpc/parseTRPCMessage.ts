import type { ProcedureType } from '../core';
import type { CombinedDataTransformer } from '../transformer';
import type { TRPCClientOutgoingMessage } from './envelopes';

/* istanbul ignore next -- @preserve */
function assertIsObject(obj: unknown): asserts obj is Record<string, unknown> {
  if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
    throw new Error('Not an object');
  }
}

/* istanbul ignore next -- @preserve */
function assertIsProcedureType(obj: unknown): asserts obj is ProcedureType {
  if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
    throw new Error('Invalid procedure type');
  }
}

/* istanbul ignore next -- @preserve */
function assertIsRequestId(
  obj: unknown,
): asserts obj is number | string | null {
  if (
    obj !== null &&
    typeof obj === 'number' &&
    isNaN(obj) &&
    typeof obj !== 'string'
  ) {
    throw new Error('Invalid request id');
  }
}

/* istanbul ignore next -- @preserve */
function assertIsString(obj: unknown): asserts obj is string {
  if (typeof obj !== 'string') {
    throw new Error('Invalid string');
  }
}

/* istanbul ignore next -- @preserve */
function assertIsJSONRPC2OrUndefined(
  obj: unknown,
): asserts obj is '2.0' | undefined {
  if (typeof obj !== 'undefined' && obj !== '2.0') {
    throw new Error('Must be JSONRPC 2.0');
  }
}

/** @public */
export function parseTRPCMessage(
  obj: unknown,
  transformer: CombinedDataTransformer,
): TRPCClientOutgoingMessage {
  assertIsObject(obj);

  const { id, jsonrpc, method, params } = obj;
  assertIsRequestId(id);
  assertIsJSONRPC2OrUndefined(jsonrpc);

  if (method === 'subscription.stop') {
    return {
      id,
      jsonrpc,
      method,
    };
  }
  assertIsProcedureType(method);
  assertIsObject(params);
  const { input: rawInput, path } = params;

  assertIsString(path);

  const input = transformer.input.deserialize(rawInput);

  return {
    id,
    jsonrpc,
    method,
    params: {
      input,
      path,
    },
  };
}
