import { defaultTransformer } from '../transformer';
import { parseTRPCMessage } from './parseTRPCMessage';

/**
 * `parseTRPCMessage` validates the JSON-RPC `id` of an incoming WebSocket
 * message. A valid request id is `number | string | null`; anything else must
 * be rejected before it is used as a `clientSubscriptions` Map key.
 */
const parse = (id: unknown) =>
  parseTRPCMessage(
    { id, jsonrpc: '2.0', method: 'subscription.stop' },
    defaultTransformer,
  );

describe('parseTRPCMessage - request id validation', () => {
  test.each([1, 0, -1, 42, 'abc', '', 'my-id', null])(
    'accepts valid request id: %p',
    (id) => {
      expect(() => parse(id)).not.toThrow();
      expect(parse(id)).toMatchObject({ id, method: 'subscription.stop' });
    },
  );

  test.each([true, false, {}, [], undefined, NaN])(
    'rejects invalid request id: %p',
    (id) => {
      expect(() => parse(id)).toThrow('Invalid request id');
    },
  );
});
