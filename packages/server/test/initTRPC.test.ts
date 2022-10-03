import {
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
  initTRPC,
} from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';

test('default transformer', () => {
  const t = initTRPC
    .context<{
      foo: 'bar';
    }>()
    .create();
  const router = t.router({});

  expectTypeOf<typeof router._def._config._def.ctx>().toMatchTypeOf<{
    foo: 'bar';
  }>();

  expectTypeOf(t._config.transformer).toMatchTypeOf<DefaultDataTransformer>();
  expectTypeOf(
    router._def._config.transformer,
  ).toMatchTypeOf<DefaultDataTransformer>();
});
test('custom transformer', () => {
  const transformer: DataTransformerOptions = {
    deserialize: (v) => v,
    serialize: (v) => v,
  };
  const t = initTRPC.create({
    transformer,
  });
  const router = t.router({});
  expectTypeOf(
    router._def._config.transformer,
  ).toMatchTypeOf<CombinedDataTransformer>();
  expectTypeOf(
    router._def._config.transformer,
  ).not.toMatchTypeOf<DefaultDataTransformer>();
});

test('meta typings', () => {
  type Meta = { __META__: true };
  const meta: Meta = { __META__: true };

  const t = initTRPC.meta<Meta>().create();

  const procedure = t.procedure.meta(meta);

  expect(procedure._def.meta).toBe(meta);
  expectTypeOf(procedure._def.meta).toMatchTypeOf<Meta | undefined>();
});

test('config types', () => {
  {
    const t = initTRPC.create();

    t._config;
    // ^?
    expectTypeOf<typeof t._config._def.ctx>().toEqualTypeOf<{}>();
    expectTypeOf<typeof t._config._def.meta>().toEqualTypeOf<{}>();
  }

  {
    type Meta = {
      foo: 'bar';
    };
    type Context = {
      bar: 'foo';
    };
    const t = initTRPC.meta<Meta>().context<Context>().create();

    // ^?
    expectTypeOf<typeof t._config._def.ctx>().toEqualTypeOf<Context>();
    expectTypeOf<typeof t._config._def.meta>().toEqualTypeOf<Meta>();
  }
});
