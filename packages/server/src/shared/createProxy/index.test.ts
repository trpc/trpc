import { createProxy } from '.';

test('createProxy', () => {
  const target = {
    deeply: {
      nested: {
        function: jest.fn(),
      },
    },
  };
  const proxy = createProxy({
    target: target,
    callback(opts) {
      return opts;
    },
  });
  expect(proxy.deeply.nested.function(1, 2, 3)).toEqual({
    path: 'deeply.nested.function',
    args: [1, 2, 3],
  });
});
