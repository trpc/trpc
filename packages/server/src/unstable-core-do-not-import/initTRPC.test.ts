import { initTRPC } from './initTRPC';
import type {
  CombinedDataTransformer,
  DataTransformerOptions,
} from './transformer';

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

  expectTypeOf<typeof t._config.$types.transformer>().toEqualTypeOf<false>();
  expectTypeOf(t._config.transformer).toEqualTypeOf<CombinedDataTransformer>();
});
test('custom transformer', () => {
  const transformer: DataTransformerOptions = {
    deserialize: (v) => v,
    serialize: (v) => v,
  };
  const t = initTRPC.create({
    transformer,
  });

  expectTypeOf<typeof t._config.$types.transformer>().toEqualTypeOf<true>();
  expectTypeOf(t._config.transformer).toEqualTypeOf<CombinedDataTransformer>();
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

  // {
  //   const {
  //     _config: { $types },
  //   } = initTRPC.create();
  //   // @ts-expect-error mock unknown key
  //   expect(() => $types.unknown).toThrow(
  //     `Tried to access "$types.unknown" which is not available at runtime`,
  //   );
  // }
});

test('detect server env', () => {
  expect(() => initTRPC.create({ isServer: false })).toThrow(
    `You're trying to use @trpc/server in a non-server environment. This is not supported by default.`,
  );

  expect(() =>
    initTRPC.create({ isServer: false, allowOutsideOfServer: true }),
  ).not.toThrowError();
});

test('context function type', () => {
  const createContext = () => ({
    foo: 'bar' as const,
  });

  const t = initTRPC.context<typeof createContext>().create();

  expectTypeOf<typeof t._config.$types.ctx>().toMatchTypeOf<{
    foo: 'bar';
  }>();
});

test('context async function type', () => {
  const createContext = async () => ({
    foo: 'bar' as const,
  });

  const t = initTRPC.context<typeof createContext>().create();

  expectTypeOf<typeof t._config.$types.ctx>().toMatchTypeOf<{
    foo: 'bar';
  }>();
});
