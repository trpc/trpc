import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path, Redacted, Result } from 'effect';
import { TestClock } from 'effect/testing';

import {
  connectionPage,
  fakeGithub,
  isPaymentsQuery,
  paymentNode,
  type SentQuery,
  sponsorshipNode,
} from './fake-github.ts';
import type { SponsorsConfig } from './sponsors-list.ts';
import { endMarker, startMarker } from './sponsors-readme.ts';
import {
  readmeFromSponsorsFile,
  sponsoredAccounts,
  type SponsorsFiles,
  syncSponsors,
} from './sponsors-sync.ts';

const readme = [
  '# tRPC',
  '',
  '## Sponsors',
  '',
  startMarker,
  'the old list',
  endMarker,
  '',
  '## All contributors',
  '',
].join('\n');

const config: SponsorsConfig = {
  direct: [
    {
      avatarUrl: 'https://github.com/serpapi.png',
      dollars: 6000,
      every: 'year',
      login: 'SerpApi',
      name: 'SerpApi',
      since: '2026-02-11',
      websiteUrl: 'https://serpapi.com/',
    },
  ],
  extra: [],
  shownPrivately: [],
};

/** A temp dir with a README and an old `sponsors.json`, by path. */
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'sponsors-sync-' });
  const files: SponsorsFiles = {
    readme: path.join(root, 'README.md'),
    sponsorsFile: path.join(root, 'sponsors.json'),
  };
  yield* fs.writeFileString(files.readme, readme);
  yield* fs.writeFileString(files.sponsorsFile, '[]\n');
  return files;
});

function github(respond: (sent: SentQuery) => ReadonlyArray<unknown>) {
  return fakeGithub((sent) => ({ body: connectionPage(respond(sent)) }));
}

const sync = (files: SponsorsFiles) =>
  syncSponsors({
    ...files,
    accounts: sponsoredAccounts,
    config,
    token: Redacted.make('test-token'),
  });

describe('syncSponsors', () => {
  it.effect(
    "writes both accounts' sponsors to sponsors.json and the README",
    () => {
      const fake = github((sent) => {
        const login = sent.variables.login;
        if (isPaymentsQuery(sent)) {
          return login === 'KATT'
            ? [paymentNode('coderabbitai', 300_000), paymentNode('fan', 2_000)]
            : [paymentNode('coderabbitai', 300_000)];
        }
        return login === 'KATT'
          ? [
              sponsorshipNode('coderabbitai', {
                createdAt: '2025-01-23T15:14:59Z',
                tier: { isOneTime: false, monthlyPriceInDollars: 500 },
              }),
              sponsorshipNode('fan', { createdAt: '2021-09-20T13:12:22Z' }),
              sponsorshipNode('shy', { privacyLevel: 'PRIVATE' }),
            ]
          : [
              sponsorshipNode('coderabbitai', {
                createdAt: '2025-03-01T00:00:00Z',
                tier: { isOneTime: false, monthlyPriceInDollars: 500 },
              }),
            ];
      });
      return Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse('2026-10-18'));
        const files = yield* fixture;
        const message = yield* sync(files);
        expect(message).toBe(
          `Wrote 3 sponsors to ${files.sponsorsFile} and ${files.readme}.`,
        );
        const fs = yield* FileSystem.FileSystem;
        const json = yield* fs.readFileString(files.sponsorsFile);
        expect(json.endsWith('}\n]\n')).toBe(true);
        expect(JSON.parse(json)).toEqual([
          {
            createdAt: Date.parse('2021-09-20T13:12:22Z'),
            imgSrc: 'https://avatars.githubusercontent.com/fan?v=4',
            link: 'https://github.com/fan',
            login: 'fan',
            name: 'FAN',
            weight: 1,
          },
          expect.objectContaining({
            createdAt: Date.parse('2025-01-23T15:14:59Z'),
            login: 'coderabbitai',
            rank: 1,
            tier: 'gold',
            weight: 100,
          }),
          expect.objectContaining({
            login: 'SerpApi',
            rank: 2,
            tier: 'silver',
            weight: 100,
          }),
        ]);
        const written = yield* fs.readFileString(files.readme);
        expect(written.startsWith('# tRPC\n\n## Sponsors\n\n')).toBe(true);
        expect(written.endsWith(`${endMarker}\n\n## All contributors\n`)).toBe(
          true,
        );
        expect(written).not.toContain('the old list');
        const at = (text: string) => written.indexOf(text);
        expect(at('### Gold partners')).toBeGreaterThan(-1);
        expect(at('alt="CODERABBITAI"')).toBeGreaterThan(
          at('### Gold partners'),
        );
        expect(at('### Silver partners')).toBeGreaterThan(
          at('alt="CODERABBITAI"'),
        );
        expect(at('alt="SerpApi"')).toBeGreaterThan(at('### Silver partners'));
        expect(at('### Backers')).toBeGreaterThan(at('alt="SerpApi"'));
        expect(at('alt="FAN"')).toBeGreaterThan(at('### Backers'));
        expect(fake.sent).toHaveLength(4);
      }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, fake.layer)));
    },
  );

  it.effect(
    'with onlyWhenSponsorsChange, writes only when a sponsor joined, left or changed tier',
    () => {
      let logins = ['coderabbitai', 'fan'];
      let fanCents = 2_000;
      let fanMonthly = 10;
      const fake = github((sent) =>
        isPaymentsQuery(sent)
          ? [paymentNode('coderabbitai', 300_000), paymentNode('fan', fanCents)]
          : logins.map((login) =>
              sponsorshipNode(login, {
                tier: {
                  isOneTime: false,
                  monthlyPriceInDollars: login === 'fan' ? fanMonthly : 500,
                },
              }),
            ),
      );
      return Effect.gen(function* () {
        const files = yield* fixture;
        const fs = yield* FileSystem.FileSystem;
        const syncWhenSponsorsChange = syncSponsors({
          ...files,
          accounts: [{ kind: 'user', login: 'KATT' }],
          config: { ...config, direct: [] },
          onlyWhenSponsorsChange: true,
          token: Redacted.make('test-token'),
        });
        yield* syncWhenSponsorsChange;
        const json = yield* fs.readFileString(files.sponsorsFile);
        const written = yield* fs.readFileString(files.readme);
        expect(JSON.parse(json)).toHaveLength(2);

        fanCents = 1_500_000;
        fanMonthly = 20;
        expect(yield* syncWhenSponsorsChange).toBe(
          `No sponsor joined, left or changed tier among the 2 in ${files.sponsorsFile}; wrote nothing.`,
        );
        expect(yield* fs.readFileString(files.sponsorsFile)).toBe(json);
        expect(yield* fs.readFileString(files.readme)).toBe(written);

        fanMonthly = 250;
        expect(yield* syncWhenSponsorsChange).toBe(
          `Wrote 2 sponsors to ${files.sponsorsFile} and ${files.readme}.`,
        );
        expect(yield* fs.readFileString(files.sponsorsFile)).toContain(
          '"tier": "bronze"',
        );

        logins = ['coderabbitai', 'newcomer'];
        expect(yield* syncWhenSponsorsChange).toBe(
          `Wrote 2 sponsors to ${files.sponsorsFile} and ${files.readme}.`,
        );
        const after: ReadonlyArray<{ login: string }> = JSON.parse(
          yield* fs.readFileString(files.sponsorsFile),
        );
        expect(after.map((sponsor) => sponsor.login).toSorted()).toEqual([
          'coderabbitai',
          'newcomer',
        ]);
      }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, fake.layer)));
    },
  );

  it.effect(
    'writes nothing when GitHub reports no sponsors or no payments',
    () => {
      const noSponsors = github(() => []);
      const noPayments = github((sent) =>
        isPaymentsQuery(sent) ? [] : [sponsorshipNode('fan')],
      );
      return Effect.gen(function* () {
        const files = yield* fixture;
        const fs = yield* FileSystem.FileSystem;
        const first = yield* Effect.result(
          sync(files).pipe(Effect.provide(noSponsors.layer)),
        );
        expect(Result.isFailure(first) && first.failure.message).toBe(
          'GitHub reports no sponsors of KATT and trpc; is SPONSORS_SYNC_GITHUB_TOKEN theirs? Wrote nothing.',
        );
        const second = yield* Effect.result(
          sync(files).pipe(Effect.provide(noPayments.layer)),
        );
        expect(Result.isFailure(second) && second.failure.message).toBe(
          'GitHub reports nothing paid to KATT and trpc; is SPONSORS_SYNC_GITHUB_TOKEN theirs? Wrote nothing.',
        );
        expect(yield* fs.readFileString(files.sponsorsFile)).toBe('[]\n');
        expect(yield* fs.readFileString(files.readme)).toBe(readme);
      }).pipe(Effect.provide(NodeServices.layer));
    },
  );
});

describe('readmeFromSponsorsFile', () => {
  it.effect("rewrites the README's sponsors from sponsors.json", () =>
    Effect.gen(function* () {
      const files = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(
        files.sponsorsFile,
        JSON.stringify([
          {
            createdAt: 1,
            imgSrc: 'https://avatars.githubusercontent.com/u/1?v=4',
            link: 'https://github.com/fan',
            login: 'fan',
            name: 'Fan',
            weight: 4,
          },
        ]),
      );
      expect(yield* readmeFromSponsorsFile(files)).toBe(
        `Wrote 1 sponsors to ${files.readme}.`,
      );
      const written = yield* fs.readFileString(files.readme);
      expect(written).toContain(
        '<td align="center"><a href="https://github.com/fan"><img src="https://avatars.githubusercontent.com/u/1?v=4&amp;s=200" width="100" alt="Fan"/><br />Fan</a></td>',
      );
      expect(yield* readmeFromSponsorsFile(files)).toBe(
        `${files.readme} already lists the 1 sponsors.`,
      );
      expect(yield* fs.readFileString(files.readme)).toBe(written);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails on a README without the markers', () =>
    Effect.gen(function* () {
      const files = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(files.readme, '# No sponsors here\n');
      const result = yield* Effect.result(readmeFromSponsorsFile(files));
      expect(Result.isFailure(result) && result.failure.message).toBe(
        `${files.readme} has no <!-- SPONSORS:LIST:START --> followed by <!-- SPONSORS:LIST:END --> to write the sponsors between`,
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails on a sponsors.json it does not expect', () =>
    Effect.gen(function* () {
      const files = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(files.sponsorsFile, '[{"login":"fan"}]');
      const result = yield* Effect.result(readmeFromSponsorsFile(files));
      expect(Result.isFailure(result) && result.failure.message).toMatch(
        new RegExp(`^${files.sponsorsFile}: `),
      );
      expect(yield* fs.readFileString(files.readme)).toBe(readme);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
