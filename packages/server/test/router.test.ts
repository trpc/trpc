import { expectTypeOf } from 'expect-type';
import { Router, router } from '../src';
import { Router as VNextRouter } from '../src/router';

test('deprecated router type is supported', () => {
  type Context = { foo: string };
  type RouterWithContext = VNextRouter<Context, Context, any, any, any, any>;

  const legacyRouter = new Router<Context, any, any, any, any>();

  expectTypeOf(legacyRouter).toMatchTypeOf<RouterWithContext>();
  expect(legacyRouter instanceof VNextRouter).toEqual(true);
});

test('double errors', async () => {
  expect(() => {
    router()
      .query('dupe', {
        resolve() {
          return null;
        },
      })
      .query('dupe', {
        resolve() {
          return null;
        },
      });
  }).toThrowErrorMatchingInlineSnapshot(`"Duplicate endpoint(s): dupe"`);
});
