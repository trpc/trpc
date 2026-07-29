import { defaultTransformer } from '../transformer';
import { parseTRPCMessage } from './parseTRPCMessage';

function parse(id: unknown) {
  return parseTRPCMessage(
    {
      id,
      jsonrpc: '2.0',
      method: 'query',
      params: { path: 'greeting', input: undefined },
    },
    defaultTransformer,
  );
}

describe('request id validation', () => {
  test.each([['a string'], [1], [0], [-1], [1.5]])(
    'accepts %p as a request id',
    (id) => {
      expect(parse(id).id).toBe(id);
    },
  );

  test('accepts null, which `subscription.stop` messages rely on', () => {
    expect(
      parseTRPCMessage(
        { id: null, jsonrpc: '2.0', method: 'subscription.stop' },
        defaultTransformer,
      ).id,
    ).toBe(null);
  });

  test.each([[true], [false], [{}], [[]], [undefined], [NaN]])(
    'rejects %p as a request id',
    (id) => {
      expect(() => parse(id)).toThrow('Invalid request id');
    },
  );
});
