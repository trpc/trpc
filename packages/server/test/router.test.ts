import { expectTypeOf } from 'expect-type';
import { Router } from '../src';
import { Router as VNextRouter } from '../src/router';

test('deprecated router type is supported', () => {
  type Context = { foo: string };
  type RouterWithContext = VNextRouter<Context, Context, any, any, any, any>;

  const legacyRouter = new Router<Context, any, any, any, any>();

  expectTypeOf(legacyRouter).toMatchTypeOf<RouterWithContext>();
  expect(legacyRouter instanceof VNextRouter).toEqual(true);
});
