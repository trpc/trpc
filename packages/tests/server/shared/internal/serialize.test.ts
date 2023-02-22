import { expectTypeOf } from 'expect-type'
import { Serialize } from '@trpc/server/shared/internal/serialize';

interface MixedKnownAndUnknownKeys {
    name: string;
    [x: string]: unknown;
}

test('it serializes objects with known and unknown keys', () => {
    expectTypeOf<MixedKnownAndUnknownKeys>().toMatchTypeOf<Serialize<MixedKnownAndUnknownKeys>>()
})
