import { parseTRPCMessage } from '@trpc/server/rpc';
import type { CombinedDataTransformer } from '@trpc/server/unstable-core-do-not-import';

/**
 * Regression tests for assertIsRequestId.
 *
 * The condition was previously inverted: it only threw for NaN and silently
 * accepted booleans, objects, arrays, and undefined as valid request IDs.
 * Fixed by correcting the boolean logic so anything that is not null, a string,
 * or a finite number is rejected.
 *
 * Ref: https://github.com/trpc/trpc/issues/7430
 * Ref: https://github.com/trpc/trpc/issues/7450
 */

const noopTransformer: CombinedDataTransformer = {
  input: { serialize: (v) => v, deserialize: (v) => v },
  output: { serialize: (v) => v, deserialize: (v) => v },
};

function makeMsg(id: unknown) {
  return { id, method: 'subscription.stop' };
}

describe('parseTRPCMessage - assertIsRequestId', () => {
  describe('valid ids - should not throw', () => {
    test('number id', () => {
      expect(() => parseTRPCMessage(makeMsg(1), noopTransformer)).not.toThrow();
    });

    test('string id', () => {
      expect(() => parseTRPCMessage(makeMsg('abc'), noopTransformer)).not.toThrow();
    });

    test('null id', () => {
      expect(() => parseTRPCMessage(makeMsg(null), noopTransformer)).not.toThrow();
    });

    test('zero id', () => {
      expect(() => parseTRPCMessage(makeMsg(0), noopTransformer)).not.toThrow();
    });

    test('empty string id', () => {
      expect(() => parseTRPCMessage(makeMsg(''), noopTransformer)).not.toThrow();
    });
  });

  describe('invalid ids - should throw (regression: previously accepted silently)', () => {
    test('NaN id throws', () => {
      expect(() => parseTRPCMessage(makeMsg(NaN), noopTransformer)).toThrow('Invalid request id');
    });

    test('boolean true id throws', () => {
      expect(() => parseTRPCMessage(makeMsg(true), noopTransformer)).toThrow('Invalid request id');
    });

    test('boolean false id throws', () => {
      expect(() => parseTRPCMessage(makeMsg(false), noopTransformer)).toThrow('Invalid request id');
    });

    test('object id throws', () => {
      expect(() => parseTRPCMessage(makeMsg({}), noopTransformer)).toThrow('Invalid request id');
    });

    test('array id throws', () => {
      expect(() => parseTRPCMessage(makeMsg([]), noopTransformer)).toThrow('Invalid request id');
    });

    test('undefined id throws', () => {
      expect(() => parseTRPCMessage(makeMsg(undefined), noopTransformer)).toThrow('Invalid request id');
    });
  });
});
