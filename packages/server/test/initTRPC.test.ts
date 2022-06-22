import './___packages';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src/core';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from '../src/transformer';

test('default transformer', () => {
  const t = initTRPC()();
  const router = t.router({});
  expectTypeOf(router.transformer).toMatchTypeOf<DefaultDataTransformer>();
});
test('custom transformer', () => {
  const transformer: DataTransformerOptions = {
    deserialize: (v) => v,
    serialize: (v) => v,
  };
  const t = initTRPC()({
    transformer,
  });
  const router = t.router({});
  expectTypeOf(router.transformer).toMatchTypeOf<CombinedDataTransformer>();
  expectTypeOf(router.transformer).not.toMatchTypeOf<DefaultDataTransformer>();
});
