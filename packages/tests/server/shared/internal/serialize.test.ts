import { Test } from '../../___tsHelpers';
import { Serialize } from '@trpc/server/shared/internal/serialize';

interface MixedKnownAndUnknownKeys {
    name: string;
    [x: string]: unknown;
}

test('it serializes objects with known and unknown keys', () => {
    const serializeIsTheSame: Test<MixedKnownAndUnknownKeys, Serialize<MixedKnownAndUnknownKeys>> = 1;
    expect(serializeIsTheSame).toEqual(1);
})
