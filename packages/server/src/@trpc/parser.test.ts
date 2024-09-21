import { z } from 'zod';
import type { inferParser } from './parser';

test('inferParser', () => {
  const parser = z.object({ foo: z.string(), bar: z.number() });
  parser.safeParseAsync(false);
  type $Types = inferParser<typeof parser>;

  expectTypeOf<$Types['error']>().toMatchTypeOf<
    z.ZodError<{
      foo: string;
      bar: number;
    }>
  >();
});
