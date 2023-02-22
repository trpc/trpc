import { Serialize } from '@trpc/server/shared/internal/serialize';
import { expectTypeOf } from 'expect-type';

interface MixedKnownAndUnknownKeys {
  name: string;
  [x: string]: unknown;
}

test('it serializes objects with known and unknown keys', () => {
  expectTypeOf<MixedKnownAndUnknownKeys>().toMatchTypeOf<
    Serialize<MixedKnownAndUnknownKeys>
  >();
});
