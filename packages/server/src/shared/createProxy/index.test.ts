import { createProxy } from '.';

test('createProxy', () => {
  const proxy = createProxy((opts) => opts);
  expect(proxy.deeply.nested.function(1, 2, 3)).toEqual({
    path: ['deeply', 'nested', 'function'],
    args: [1, 2, 3],
  });
});
