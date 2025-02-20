import { z } from 'zod';
import type { Serialize } from './serialize';

test('serialize', () => {
  const ABC = z
    .tuple([z.literal('a'), z.literal('b'), z.literal('c')])
    .brand('ABC');
  type ABC = z.infer<typeof ABC>;

  type Output = Serialize<ABC>;

  expectTypeOf<Output>().toMatchTypeOf<['a', 'b', 'c']>();
});

test('serialize', () => {
  type Output = Serialize<['a', 'b', 'c']>;

  expectTypeOf<Output>().toEqualTypeOf<['a', 'b', 'c']>();
});
