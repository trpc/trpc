import { describe, expect, it } from '@effect/vitest';
import { upgradeSource } from '@trpc12/upgrade';

import { codemodSamples } from './samples.ts';

describe('the codemod playground samples', () => {
  it.each(codemodSamples)(
    'the $label sample is rewritten and leaves steps to do by hand',
    (sample) => {
      const result = upgradeSource(sample.code, sample.filename);
      expect(result.changed).toBe(true);
      expect(result.code).toMatch(/from '@trpc12\//);
      expect(result.notes.length).toBeGreaterThan(0);
    },
  );

  it('has a sample for each tab, each with its own file', () => {
    expect(new Set(codemodSamples.map((sample) => sample.id)).size).toBe(
      codemodSamples.length,
    );
    expect(new Set(codemodSamples.map((sample) => sample.filename)).size).toBe(
      codemodSamples.length,
    );
  });
});
