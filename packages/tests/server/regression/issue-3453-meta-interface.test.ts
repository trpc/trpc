import { initTRPC } from '@trpc/server';

test('meta as interface', () => {
  interface Meta {
    foo: 'bar';
  }
  initTRPC.meta<Meta>();
});

test('context as interface', () => {
  interface Context {
    foo: 'bar';
  }
  initTRPC.context<Context>();
});

test('bad: meta as primitive', () => {
  // @ts-expect-error this is not allowed
  initTRPC.meta<1>();
});

test('bad: context as primitive', () => {
  // @ts-expect-error this is not allowed
  initTRPC.context<1>();
});
