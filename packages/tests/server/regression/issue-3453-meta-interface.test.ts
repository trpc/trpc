import '../___packages';
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
