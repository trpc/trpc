import { expect, test } from 'vite-plus/test';

import { expected } from './acronym-case.ts';

test.each([
  ['TRPCError', 'TrpcError'],
  ['AnyTRPCError', 'AnyTrpcError'],
  ['initTRPC', 'initTrpc'],
  ['maxURLLength', 'maxUrlLength'],
  ['toJSONSchema', 'toJsonSchema'],
  ['generateOpenAPI', 'generateOpenApi'],
  ['HTTPLinkOptions', 'HttpLinkOptions'],
  ['parseSSE', 'parseSse'],
  ['experimental_initTRPC', 'experimental_initTrpc'],
])('%s → %s', (name, fixed) => {
  expect(expected(name)).toBe(fixed);
});

test.each([
  'TrpcError',
  'httpLink',
  'SSE_EVENT',
  'X',
  'toJSON',
  'trpc',
  'experimental_TrpcModule',
  'experimental_TRPC_MODULE_OPTIONS',
])('%s is fine', (name) => {
  expect(expected(name)).toBeUndefined();
});

test('type parameters keep their T prefix', () => {
  expect(expected('TRouter', true)).toBeUndefined();
  expect(expected('TJSONValue', true)).toBe('TJsonValue');
});
