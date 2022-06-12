import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src/core';
import { CombinedDataTransformer } from '../src/transformer';

test('setup', async () => {
  {
    const t = initTRPC()();
    const router = t.router({});
    // FIXME
    expectTypeOf(router.transformer).toMatchTypeOf<CombinedDataTransformer>();
  }
});
