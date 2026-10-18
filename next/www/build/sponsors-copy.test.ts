import { describe, expect, it } from '@effect/vitest';
import { Effect, Result } from 'effect';

import { sponsorsJson } from './sponsors-copy.ts';

const syncOutput = `// eslint-disable

// prettier-ignore
export const topSponsors = [] as const;

// prettier-ignore
export const allSponsors = [
  {
    "name": "Newer",
    "imgSrc": "https://avatars.githubusercontent.com/u/2?v=4",
    "weight": 3,
    "login": "newer",
    "link": "https://newer.dev/?ref=trpc",
    "createdAt": 1770000000000,
    "value": 900
  },
  {
    "name": "Older",
    "imgSrc": "https://avatars.githubusercontent.com/u/1?v=4",
    "weight": 80,
    "login": "older",
    "link": "https://github.com/older",
    "createdAt": 1630000000000
  }
] as const;
`;

describe('sponsorsJson', () => {
  it.effect(
    "lists the sync script's sponsors oldest first, with the fields the site shows",
    () =>
      Effect.gen(function* () {
        const json = yield* sponsorsJson(syncOutput);
        expect(json.endsWith('\n')).toBe(true);
        expect(JSON.parse(json)).toEqual([
          {
            createdAt: 1630000000000,
            imgSrc: 'https://avatars.githubusercontent.com/u/1?v=4',
            link: 'https://github.com/older',
            login: 'older',
            name: 'Older',
            weight: 80,
          },
          {
            createdAt: 1770000000000,
            imgSrc: 'https://avatars.githubusercontent.com/u/2?v=4',
            link: 'https://newer.dev/?ref=trpc',
            login: 'newer',
            name: 'Newer',
            weight: 3,
          },
        ]);
      }),
  );

  it.effect('fails on a sponsor without the fields the site shows', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        sponsorsJson(
          'export const allSponsors = [{ "name": "No login" }] as const;',
        ),
      );
      expect(Result.isFailure(result)).toBe(true);
    }),
  );
});
