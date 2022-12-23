import {
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

  expectTypeOf<typeof router._def._config.$types.ctx>().toMatchTypeOf<{
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
  ).toMatchTypeOf<DataTransformerOptions>();
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
    expectTypeOf<typeof t._config.$types.ctx>().toEqualTypeOf<object>();
    expectTypeOf<typeof t._config.$types.meta>().toEqualTypeOf<object>();

    // eslint-disable-next-line @typescript-eslint/ban-types
    expectTypeOf<typeof t._config.$types.meta>().toEqualTypeOf<{}>();
    // eslint-disable-next-line @typescript-eslint/ban-types
    expectTypeOf<typeof t._config.$types.meta>().toEqualTypeOf<{}>();
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
    expectTypeOf<typeof t._config.$types.ctx>().toEqualTypeOf<Context>();
    expectTypeOf<typeof t._config.$types.meta>().toEqualTypeOf<Meta>();
  }

  {
    const {
      _config: { $types },
    } = initTRPC.create();
    // @ts-expect-error mock unknown key
    expect(() => $types.unknown).toThrow(
      `Tried to access "$types.unknown" which is not available at runtime`,
    );
  }
});

test('detect server env', () => {
  expect(() => initTRPC.create({ isServer: false })).toThrow(
    `You're trying to use @trpc/server in a non-server environment. This is not supported by default.`,
  );

  expect(() =>
    initTRPC.create({ isServer: false, allowOutsideOfServer: true }),
  ).not.toThrowError();
});
