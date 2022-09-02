import './___packages';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from '../src/transformer';

test('default transformer', () => {
  const t = initTRPC
    .context<{
      foo: 'bar';
    }>()
    .create();
  const router = t.router({});

  expectTypeOf(router._def._ctx).toMatchTypeOf<{
    foo: 'bar';
  }>();
  expectTypeOf(t._config.transformer).toMatchTypeOf<DefaultDataTransformer>();
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
    router._def.transformer,
  ).toMatchTypeOf<CombinedDataTransformer>();
  expectTypeOf(
    router._def.transformer,
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
