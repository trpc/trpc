import { describe, expect, it } from '@effect/vitest';

import trpcPackage from '../../packages/trpc/package.json' with { type: 'json' };
import { unindexedPaths, v12Indexable } from './site.ts';

describe('v12Indexable', () => {
  it("stays false until v12's first npm release: @trpc12/trpc is private until then", () => {
    expect(trpcPackage.name).toBe('@trpc12/trpc');
    expect(v12Indexable && trpcPackage.private).toBe(false);
  });

  it('keeps everything under /v12 out of search until it flips', () => {
    expect(unindexedPaths).toEqual(v12Indexable ? [] : ['/v12']);
  });
});
