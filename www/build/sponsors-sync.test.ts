import { fileURLToPath } from 'node:url';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path, Redacted, Result } from 'effect';
import { HttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';

import {
  connectionPage,
  fakeGithub,
  isPaymentsQuery,
  paymentNode,
  type SentQuery,
  sponsorshipNode,
} from './fake-github.ts';
import {
  fakeOpenCollective,
  memberNode,
  openCollectiveData,
  orderNode,
} from './fake-opencollective.ts';
import { Avatars, AvatarStatusError } from '../src/og/avatar.ts';
import type { Sponsorship } from './sponsors-github.ts';
import type { SponsorsConfig } from './sponsors-list.ts';
import {
  type OpenCollectiveBacker,
  openCollectiveUrl,
} from './sponsors-opencollective.ts';
import {
  endMarker,
  startMarker,
  withSponsorsBlock,
} from './sponsors-readme.ts';
import {
  openCollectiveSummary,
  publishedReadmes,
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
      avatarUrl: 'https://github.com/acme.png',
      dollars: 7_200,
      every: 'year',
      login: 'Acme',
      name: 'Acme',
      since: '2026-02-11',
      websiteUrl: 'https://acme.dev/',
    },
  ],
  extra: [],
  shownPrivately: [],
};

const packageReadme = [
  '# `@trpc/server`',
  '',
  '## Sponsors',
  '',
  startMarker,
  endMarker,
  '',
].join('\n');

/** A temp dir with the repo's README, a package's, and an old `sponsors.json`, by path. */
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'sponsors-sync-' });
  const paths = {
    packageReadme: path.join(root, 'packages/server/README.md'),
    readme: path.join(root, 'README.md'),
    sponsorsFile: path.join(root, 'sponsors.json'),
  };
  yield* fs.makeDirectory(path.join(root, 'packages/server'), {
    recursive: true,
  });
  yield* fs.writeFileString(paths.readme, readme);
  yield* fs.writeFileString(paths.packageReadme, packageReadme);
  yield* fs.writeFileString(paths.sponsorsFile, '[]\n');
  return {
    ...paths,
    readmes: [paths.readme, paths.packageReadme],
  } satisfies SponsorsFiles;
});

function github(respond: (sent: SentQuery) => ReadonlyArray<unknown>) {
  return fakeGithub((sent) => ({ body: connectionPage(respond(sent)) }));
}

/** `Avatars` that load, but those whose URL has one of `broken` in it. */
const avatars = (broken: () => ReadonlyArray<string> = () => []) =>
  Layer.succeed(
    Avatars,
    Avatars.of({
      fetch: (image) =>
        broken().some((login) => image.includes(login))
          ? Effect.fail(new AvatarStatusError({ status: 404, url: image }))
          : Effect.succeed('data:'),
    }),
  );

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
            ? [paymentNode('initech', 360_000), paymentNode('fan', 2_000)]
            : [paymentNode('initech', 360_000)];
        }
        return login === 'KATT'
          ? [
              sponsorshipNode('initech', {
                createdAt: '2025-01-23T15:14:59Z',
                tier: { isOneTime: false, monthlyPriceInDollars: 600 },
              }),
              sponsorshipNode('fan', { createdAt: '2021-09-20T13:12:22Z' }),
              sponsorshipNode('shy', { privacyLevel: 'PRIVATE' }),
            ]
          : [
              sponsorshipNode('initech', {
                createdAt: '2025-03-01T00:00:00Z',
                tier: { isOneTime: false, monthlyPriceInDollars: 600 },
              }),
            ];
      });
      return Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse('2026-10-18'));
        const files = yield* fixture;
        const message = yield* sync(files);
        expect(message).toBe(
          `Wrote 3 sponsors to ${files.sponsorsFile}, ${files.readme}, ${files.packageReadme}.`,
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
            source: 'github',
            weight: 5.3,
          },
          expect.objectContaining({
            createdAt: Date.parse('2025-01-23T15:14:59Z'),
            login: 'initech',
            rank: 1,
            tier: 'gold',
            weight: 100,
          }),
          expect.objectContaining({
            login: 'Acme',
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
        expect(written).toContain(
          '<a href="https://trpc.io/sponsor#sponsors"><img src="https://trpc.io/og/sponsor-cloud.png?v=',
        );
        const block = (text: string) =>
          text.slice(text.indexOf(startMarker), text.indexOf(endMarker));
        expect(block(yield* fs.readFileString(files.packageReadme))).toBe(
          block(written),
        );
        const at = (text: string) => written.indexOf(text);
        expect(at('### Gold partners')).toBeGreaterThan(-1);
        expect(at('alt="INITECH"')).toBeGreaterThan(at('### Gold partners'));
        expect(at('### Silver partners')).toBeGreaterThan(at('alt="INITECH"'));
        expect(at('alt="Acme"')).toBeGreaterThan(at('### Silver partners'));
        expect(at('### Backers')).toBeGreaterThan(at('alt="Acme"'));
        expect(at('alt="FAN"')).toBeGreaterThan(at('### Backers'));
        expect(fake.sent).toHaveLength(4);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, fake.layer, avatars()),
        ),
      );
    },
  );

  it.effect(
    'with onlyWhenSponsorsChange, writes only when a sponsor joined, left or changed tier',
    () => {
      let logins = ['initech', 'fan'];
      let fanCents = 2_000;
      let fanMonthly = 10;
      const fake = github((sent) =>
        isPaymentsQuery(sent)
          ? [paymentNode('initech', 360_000), paymentNode('fan', fanCents)]
          : logins.map((login) =>
              sponsorshipNode(login, {
                tier: {
                  isOneTime: false,
                  monthlyPriceInDollars: login === 'fan' ? fanMonthly : 600,
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
          `Wrote 2 sponsors to ${files.sponsorsFile}, ${files.readme}, ${files.packageReadme}.`,
        );
        expect(yield* fs.readFileString(files.sponsorsFile)).toContain(
          '"tier": "bronze"',
        );

        logins = ['initech', 'newcomer'];
        expect(yield* syncWhenSponsorsChange).toBe(
          `Wrote 2 sponsors to ${files.sponsorsFile}, ${files.readme}, ${files.packageReadme}.`,
        );
        const after: ReadonlyArray<{ login: string }> = JSON.parse(
          yield* fs.readFileString(files.sponsorsFile),
        );
        expect(after.map((sponsor) => sponsor.login).toSorted()).toEqual([
          'initech',
          'newcomer',
        ]);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, fake.layer, avatars()),
        ),
      );
    },
  );

  it.effect(
    'marks a small sponsor whose avatar does not load imageless, and writes when that changes',
    () => {
      let broken: ReadonlyArray<string> = ['fan', 'initech'];
      const fake = github((sent) =>
        isPaymentsQuery(sent)
          ? [
              paymentNode('initech', 360_000),
              paymentNode('fan', 2_000),
              paymentNode('pal', 1_000),
            ]
          : [
              sponsorshipNode('initech', {
                tier: { isOneTime: false, monthlyPriceInDollars: 600 },
              }),
              sponsorshipNode('fan'),
              sponsorshipNode('pal'),
            ],
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
        const imageless = Effect.map(
          fs.readFileString(files.sponsorsFile),
          (json) =>
            (
              JSON.parse(json) as ReadonlyArray<{
                readonly imageless?: true;
                readonly login: string;
              }>
            ).flatMap((sponsor) =>
              sponsor.imageless === true ? [sponsor.login] : [],
            ),
        );
        yield* syncWhenSponsorsChange;
        expect(yield* imageless).toEqual(['fan']);
        expect(yield* fs.readFileString(files.readme)).not.toContain(
          'alt="FAN"',
        );

        broken = ['initech'];
        expect(yield* syncWhenSponsorsChange).toBe(
          `Wrote 3 sponsors to ${files.sponsorsFile}, ${files.readme}, ${files.packageReadme}.`,
        );
        expect(yield* imageless).toEqual([]);
        expect(yield* fs.readFileString(files.readme)).toContain('alt="FAN"');
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            fake.layer,
            avatars(() => broken),
          ),
        ),
      );
    },
  );

  it.effect(
    'adds who backs on Open Collective now, as one sponsor with their GitHub sponsorship',
    () => {
      const gh = github((sent) =>
        isPaymentsQuery(sent)
          ? [paymentNode('fan', 2_000)]
          : [sponsorshipNode('fan')],
      );
      const oc = fakeOpenCollective(
        openCollectiveData({
          members: [
            memberNode('fan-oc', {
              account: {
                socialLinks: [
                  { type: 'GITHUB', url: 'https://github.com/fan' },
                ],
              },
              totalDonations: { currency: 'SEK', valueInCents: 100_000 },
            }),
            memberNode('hooli', {
              account: { name: 'Hooli', website: 'https://www.hooli.dev' },
              totalDonations: { currency: 'SEK', valueInCents: 200_000 },
            }),
            memberNode('left'),
          ],
          orders: [
            orderNode('fan-oc', {
              amount: { currency: 'SEK', valueInCents: 30_000 },
            }),
            orderNode('hooli', {
              amount: { currency: 'SEK', valueInCents: 30_000 },
            }),
          ],
          rates: { SEK: 0.1 },
        }),
      );
      const http = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          (request.url === openCollectiveUrl ? oc.client : gh.client).execute(
            request,
          ),
        ),
      );
      return Effect.gen(function* () {
        const files = yield* fixture;
        const fs = yield* FileSystem.FileSystem;
        yield* syncSponsors({
          ...files,
          accounts: [{ kind: 'user', login: 'KATT' }],
          config: { ...config, direct: [] },
          openCollective: ['trpc'],
          token: Redacted.make('test-token'),
        });
        expect(
          JSON.parse(yield* fs.readFileString(files.sponsorsFile)),
        ).toEqual([
          expect.objectContaining({
            login: 'fan',
            source: 'github',
            weight: 62,
          }),
          expect.objectContaining({
            imgSrc: 'https://images.opencollective.com/hooli/avatar.png',
            link: 'https://www.hooli.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc',
            name: 'Hooli',
            profileUrl: 'https://opencollective.com/hooli',
            slug: 'hooli',
            source: 'opencollective',
            weight: 100,
          }),
        ]);
        expect(yield* fs.readFileString(files.readme)).toContain(
          'src="https://images.opencollective.com/hooli/avatar.png?height=200"',
        );
        expect(oc.sent.map((sent) => sent.variables.slug)).toContain('trpc');
      }).pipe(
        Effect.provide(Layer.mergeAll(NodeServices.layer, http, avatars())),
      );
    },
  );

  it.effect('writes nothing when a README lacks the markers', () => {
    const fake = github((sent) =>
      isPaymentsQuery(sent)
        ? [paymentNode('fan', 2_000)]
        : [sponsorshipNode('fan')],
    );
    return Effect.gen(function* () {
      const files = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(files.packageReadme, '# No sponsors here\n');
      const synced = yield* Effect.result(sync(files));
      expect(Result.isFailure(synced) && synced.failure.message).toBe(
        `${files.packageReadme} has no <!-- SPONSORS:LIST:START --> followed by <!-- SPONSORS:LIST:END --> to write the sponsors between`,
      );
      expect(yield* fs.readFileString(files.sponsorsFile)).toBe('[]\n');
      expect(yield* fs.readFileString(files.readme)).toBe(readme);
    }).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, fake.layer, avatars())),
    );
  });

  it.effect("writes nothing when no small sponsor's avatar loads", () => {
    const fake = github((sent) =>
      isPaymentsQuery(sent)
        ? [paymentNode('fan', 2_000), paymentNode('pal', 1_000)]
        : [sponsorshipNode('fan'), sponsorshipNode('pal')],
    );
    return Effect.gen(function* () {
      const files = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const synced = yield* Effect.result(
        syncSponsors({
          ...files,
          accounts: [{ kind: 'user', login: 'KATT' }],
          config: { ...config, direct: [] },
          token: Redacted.make('test-token'),
        }),
      );
      expect(Result.isFailure(synced) && synced.failure.message).toBe(
        "No avatar loaded for any of the 2 small sponsors; is the network or GitHub's avatar host down? Wrote nothing.",
      );
      expect(yield* fs.readFileString(files.sponsorsFile)).toBe('[]\n');
      expect(yield* fs.readFileString(files.readme)).toBe(readme);
      expect(yield* fs.readFileString(files.packageReadme)).toBe(packageReadme);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          fake.layer,
          avatars(() => ['fan', 'pal']),
        ),
      ),
    );
  });

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
        expect(yield* fs.readFileString(files.packageReadme)).toBe(
          packageReadme,
        );
      }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, avatars())));
    },
  );
});

describe('openCollectiveSummary', () => {
  const backer = (
    name: string,
    overrides: Partial<OpenCollectiveBacker> = {},
  ): OpenCollectiveBacker => ({
    avatarUrl: '',
    createdAt: 0,
    githubLogin: null,
    isCurrent: true,
    monthlyDollars: 0,
    name,
    paidCents: 0,
    slug: name,
    websiteUrl: null,
    ...overrides,
  });
  const fan: Sponsorship = {
    avatarUrl: '',
    createdAt: 0,
    isPublic: true,
    login: 'fan',
    monthlyDollars: 10,
    name: null,
    websiteUrl: null,
  };

  it('names who backs now, and who sponsors on GitHub too', () => {
    expect(
      openCollectiveSummary(
        [
          backer('Hooli'),
          backer('Fan', { githubLogin: 'fan' }),
          backer('Guest', { isCurrent: false }),
        ],
        [fan],
        [],
      ),
    ).toBe(
      'Open Collective: 2 backing now: Hooli, Fan (also on GitHub); 1 who backed before left out.',
    );
    expect(openCollectiveSummary([], [fan], [])).toBe(
      'Open Collective: 0 backing now.',
    );
  });

  it('counts a private GitHub sponsor as on GitHub only if they can be shown', () => {
    const backers = [backer('Fan', { githubLogin: 'fan' })];
    const secret = { ...fan, isPublic: false };
    expect(openCollectiveSummary(backers, [secret], [])).toBe(
      'Open Collective: 1 backing now: Fan.',
    );
    expect(openCollectiveSummary(backers, [secret], ['fan'])).toBe(
      'Open Collective: 1 backing now: Fan (also on GitHub).',
    );
  });
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
            source: 'github',
            weight: 4,
          },
          {
            createdAt: 2,
            imgSrc: 'https://images.opencollective.com/hooli/logo.png',
            link: 'https://opencollective.com/hooli',
            name: 'Hooli',
            profileUrl: 'https://opencollective.com/hooli',
            slug: 'hooli',
            source: 'opencollective',
            weight: 2,
          },
        ]),
      );
      expect(yield* readmeFromSponsorsFile(files)).toBe(
        `Wrote 2 sponsors to ${files.readme}, ${files.packageReadme}.`,
      );
      const written = yield* fs.readFileString(files.readme);
      expect(written).toContain(
        '<td align="center"><a href="https://github.com/fan"><img src="https://avatars.githubusercontent.com/u/1?v=4&amp;s=200" width="100" alt="Fan"/><br />Fan</a></td>',
      );
      expect(written).toContain(
        '<a href="https://opencollective.com/hooli"><img src="https://images.opencollective.com/hooli/logo.png?height=200"',
      );
      expect(yield* readmeFromSponsorsFile(files)).toBe(
        `${files.readme}, ${files.packageReadme} already list the 2 sponsors.`,
      );
      expect(yield* fs.readFileString(files.readme)).toBe(written);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails on a README without the markers, and writes none', () =>
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
            source: 'github',
            weight: 40,
          },
        ]),
      );
      yield* fs.writeFileString(files.packageReadme, '# No sponsors here\n');
      const result = yield* Effect.result(readmeFromSponsorsFile(files));
      expect(Result.isFailure(result) && result.failure.message).toBe(
        `${files.packageReadme} has no <!-- SPONSORS:LIST:START --> followed by <!-- SPONSORS:LIST:END --> to write the sponsors between`,
      );
      expect(yield* fs.readFileString(files.readme)).toBe(readme);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails on a sponsors.json it does not expect', () =>
    Effect.gen(function* () {
      const files = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const sponsor = {
        createdAt: 1,
        imgSrc: 'https://images.opencollective.com/hooli/logo.png',
        link: 'https://opencollective.com/hooli',
        name: 'Hooli',
        weight: 2,
      };
      for (const unexpected of [
        [{ login: 'fan' }],
        [{ ...sponsor, login: 'hooli' }],
        [{ ...sponsor, login: 'hooli', source: 'github', slug: 'x' }],
        [{ ...sponsor, login: 'hooli', source: 'opencollective' }],
      ]) {
        yield* fs.writeFileString(
          files.sponsorsFile,
          JSON.stringify(unexpected),
        );
        const result = yield* Effect.result(readmeFromSponsorsFile(files));
        expect(Result.isFailure(result) && result.failure.message).toMatch(
          new RegExp(`^${files.sponsorsFile}: `),
        );
      }
      expect(yield* fs.readFileString(files.readme)).toBe(readme);
      expect(yield* fs.readFileString(files.packageReadme)).toBe(packageReadme);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('publishedReadmes', () => {
  it.effect("lists each published package's README, not a private one's", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: 'sponsors-packages-',
      });
      const write = (file: string, text: string) =>
        Effect.andThen(
          fs.makeDirectory(path.dirname(path.join(root, file)), {
            recursive: true,
          }),
          fs.writeFileString(path.join(root, file), text),
        );
      yield* write('server/package.json', '{"name":"@trpc/server"}');
      yield* write('server/README.md', packageReadme);
      yield* write('client/package.json', '{"private":false}');
      yield* write('client/README.md', packageReadme);
      yield* write('tests/package.json', '{"private":true}');
      yield* write('tests/README.md', '# Tests');
      yield* write('no-readme/package.json', '{}');
      yield* write('not-a-package/README.md', '# Notes');
      expect(yield* publishedReadmes(root)).toEqual([
        path.join(root, 'client/README.md'),
        path.join(root, 'server/README.md'),
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("gives every published package's README the sponsors markers", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const readmes = yield* publishedReadmes(
        fileURLToPath(new URL('../../packages', import.meta.url)),
      );
      expect(readmes.map((readme) => readme.split('/').at(-2))).toEqual(
        expect.arrayContaining(['client', 'react-query', 'server']),
      );
      expect(readmes.some((readme) => readme.includes('/tests/'))).toBe(false);
      for (const readme of readmes) {
        expect(
          withSponsorsBlock(yield* fs.readFileString(readme), ''),
          readme,
        ).toBeDefined();
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
