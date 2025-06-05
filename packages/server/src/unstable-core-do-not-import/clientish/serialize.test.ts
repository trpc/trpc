import { z as z4 } from 'zod/v4';
import type { Serialize } from './serialize';

test('Date', () => {
  type Source = Date;
  type Transformed = Serialize<Source>;

  expectTypeOf<Transformed>().toEqualTypeOf<string>();
});

// regression test for https://github.com/trpc/trpc/issues/6804
test('zod v4 json', () => {
  const jsonSchema = z4.json();
  type Source = (typeof jsonSchema)['_zod']['output'];
  type Transformed = Serialize<Source>;

  expectTypeOf<Transformed>().branded.toEqualTypeOf<Source>();
});
