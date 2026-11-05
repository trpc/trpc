import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { drawnSponsors, type Sponsor, sponsors } from '../src/sponsors.ts';
import type { OgCard } from '../src/og/card.ts';
import { ogCardsSource, sponsorCloudVersion } from './og-cards.ts';

const sponsor = (login: string, weight: number): Sponsor => ({
  createdAt: 0,
  imgSrc: `https://avatars.githubusercontent.com/u/${login}?v=4`,
  link: `https://example.com/${login}`,
  login,
  name: login,
  source: 'github',
  weight,
});

describe('sponsorCloudVersion', () => {
  it.effect(
    'changes with who the cloud draws, but not the imageless, so the sync and the build agree',
    () =>
      Effect.gen(function* () {
        const list = [sponsor('a', 40), sponsor('b', 20)];
        const version = yield* sponsorCloudVersion(list);
        expect(version).toMatch(/^[0-9a-f]{10}$/);
        expect(
          yield* sponsorCloudVersion([
            ...list,
            { ...sponsor('c', 10), imageless: true },
          ]),
        ).toBe(version);
        expect(
          yield* sponsorCloudVersion([sponsor('a', 40), sponsor('b', 21)]),
        ).not.toBe(version);
        expect(yield* sponsorCloudVersion(sponsors)).toBe(
          yield* sponsorCloudVersion(drawnSponsors),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('ogCardsSource', () => {
  const doc = (path: string): OgCard => ({
    description: '',
    kind: 'doc',
    path,
    title: path,
    url: `https://trpc.io${path}`,
  });

  it("refuses a page whose card's URL would be another's", () => {
    expect(() => ogCardsSource([doc('/index')])).toThrow("home card's");
    expect(() => ogCardsSource([doc('/_/sponsor-cloud')])).toThrow('/_');
    expect(() => ogCardsSource([doc('/docs/abcdef0123')])).toThrow(
      'looks like a version',
    );
    expect(() => ogCardsSource([doc('/a'), doc('/a')])).toThrow('Two');
    expect(ogCardsSource([doc('/docs/a'), doc('/_docs')])).toContain(
      '"/docs/a"',
    );
  });
});
