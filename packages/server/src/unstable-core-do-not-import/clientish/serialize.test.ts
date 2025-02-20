import { z } from 'zod';
import type { SerializeTuple } from './serialize';

export const ABC = z
  .tuple([z.literal('a'), z.literal('b'), z.literal('c')])
  .brand('ABC');
export type ABC = z.infer<typeof ABC>;

test('serialize', () => {
  type Output = SerializeTuple<ABC>;

  expectTypeOf<Output>().toMatchTypeOf<['a', 'b', 'c']>();
});

test('serialize', () => {
  type Output = SerializeTuple<['a', 'b', 'c']>;

  expectTypeOf<Output>().toEqualTypeOf<['a', 'b', 'c']>();
});
