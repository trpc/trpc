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
])('%s → %s', (name, fixed) => {
  expect(expected(name)).toBe(fixed);
});

test.each(['TrpcError', 'httpLink', 'SSE_EVENT', 'X', 'toJSON', 'trpc'])(
  '%s is fine',
  (name) => {
    expect(expected(name)).toBeUndefined();
  },
);

test('type parameters keep their T prefix', () => {
  expect(expected('TRouter', true)).toBeUndefined();
  expect(expected('TJSONValue', true)).toBe('TJsonValue');
});
