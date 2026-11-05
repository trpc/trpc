/**
 * Syncs the sponsors from GitHub and Open Collective:
 * `pnpm --filter www sponsors:sync` reads who sponsors KATT and the trpc
 * organization on GitHub, and who backs trpc on Open Collective, and what
 * each has paid, then writes `sponsors.json` (which the site shows) and the
 * sponsors section of the repo's `README.md` and of each published
 * package's (`publishedReadmes`). GitHub needs a token of KATT's
 * (an admin of the organization) that can read both accounts'
 * sponsorships: a classic token with `read:user` and `read:org`, from
 * `SPONSORS_SYNC_GITHUB_TOKEN` or, in a terminal, asked for when that isn't
 * set. Open Collective's API needs none.
 *
 * `--only-when-sponsors-change` writes nothing while the same sponsors are
 * listed in the same tiers, so the daily CI run
 * (`.github/workflows/sponsors.yml`) commits only when one joined,
 * left or changed tier.
 *
 * `--readme-only` rewrites the READMEs from `sponsors.json` without GitHub,
 * for after changing how it's laid out (`sponsors-readme.ts`).
 *
 * The weighing is in `sponsors-list.ts`; who sponsors some other way, and
 * money GitHub doesn't attribute, is `sponsorsConfig` here.
 */
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import {
  Clock,
  Config,
  Console,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  type Redacted,
  Schema,
} from 'effect';
import { Command, Flag, Prompt } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { Avatars, fetchAvatars } from '../src/og/avatar.ts';
import {
  isSmallSponsor,
  type Sponsor,
  sponsorKey,
  sponsorTiers,
} from '../src/sponsors.ts';
import {
  fetchLifetimeValues,
  fetchSponsorships,
  type SponsoredAccount,
  type Sponsorship,
  SponsorsSyncError,
} from './sponsors-github.ts';
import {
  isSameSponsor,
  type SponsorsConfig,
  sponsorsList,
} from './sponsors-list.ts';
import {
  fetchBackers,
  type OpenCollectiveBacker,
} from './sponsors-opencollective.ts';
import { sponsorCloudVersion } from './og-cards.ts';
import { sponsorsMarkdown, withSponsorsBlock } from './sponsors-readme.ts';

/** The accounts whose sponsors the site shows, together. */
export const sponsoredAccounts: ReadonlyArray<SponsoredAccount> = [
  { kind: 'user', login: 'KATT' },
  { kind: 'organization', login: 'trpc' },
];

/** The Open Collective accounts whose backers the site shows with them. */
export const openCollectiveAccounts: ReadonlyArray<string> = ['trpc'];

export const sponsorsConfig: SponsorsConfig = {
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
  shownPrivately: ['madisonredtfeldt'],
};

const sponsorFields = {
  createdAt: Schema.Number,
  imgSrc: Schema.String,
  link: Schema.String,
  name: Schema.String,
  rank: Schema.optionalKey(Schema.Number),
  tier: Schema.optionalKey(
    Schema.Literals(sponsorTiers.map((entry) => entry.tier)),
  ),
  weight: Schema.Number,
  imageless: Schema.optionalKey(Schema.Literal(true)),
};

const SponsorSchema = Schema.Union([
  Schema.Struct({
    source: Schema.Literal('github'),
    login: Schema.String,
    ...sponsorFields,
  }),
  Schema.Struct({
    source: Schema.Literal('opencollective'),
    slug: Schema.String,
    profileUrl: Schema.String,
    ...sponsorFields,
  }),
]);

/**
 * `sponsors`, with each small sponsor whose avatar doesn't load marked
 * `imageless`, so the site leaves them out rather than draw a broken image.
 * Partners keep their place whatever their avatar does. Fails if no small
 * sponsor's avatar loads, which says more about the network than them.
 */
export const markImageless = Effect.fn('markImageless')(function* (
  sponsors: ReadonlyArray<Sponsor>,
) {
  const small = sponsors.filter(isSmallSponsor);
  const loaded = yield* fetchAvatars(small.map((sponsor) => sponsor.imgSrc));
  if (small.length > 0 && loaded.size === 0) {
    return yield* new SponsorsSyncError({
      message: `No avatar loaded for any of the ${small.length} small sponsors; is the network or GitHub's avatar host down? Wrote nothing.`,
    });
  }
  return sponsors.map((sponsor): Sponsor =>
    isSmallSponsor(sponsor) && !loaded.has(sponsor.imgSrc)
      ? { ...sponsor, imageless: true }
      : sponsor,
  );
});

/** Where the sync writes. */
export interface SponsorsFiles {
  /** The repo's README, then each published package's (`publishedReadmes`). */
  readonly readmes: ReadonlyArray<string>;
  readonly sponsorsFile: string;
}

export const sponsorsJson = (sponsors: ReadonlyArray<Sponsor>) =>
  `${JSON.stringify(sponsors, null, 2)}\n`;

const PackageJson = Schema.Struct({
  private: Schema.optionalKey(Schema.Boolean),
});

/**
 * The README of each package in `packagesDir` that's published (not
 * `private`), by name: npm shows it, so it lists the sponsors too.
 */
export const publishedReadmes = Effect.fn('publishedReadmes')(function* (
  packagesDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = (yield* fs.readDirectory(packagesDir)).toSorted();
  const readmes = yield* Effect.forEach(names, (name) =>
    Effect.gen(function* () {
      const packageJson = path.join(packagesDir, name, 'package.json');
      const readme = path.join(packagesDir, name, 'README.md');
      if (!(yield* fs.exists(packageJson)) || !(yield* fs.exists(readme))) {
        return [];
      }
      const { private: isPrivate } = yield* fs
        .readFileString(packageJson)
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.fromJsonString(PackageJson)),
          ),
        );
      return isPrivate === true ? [] : [readme];
    }),
  );
  return readmes.flat();
});

/**
 * Each of `readmes` with its sponsors section rewritten for `sponsors`,
 * and whether that changed it. Fails, before anything is written, on a
 * README without the markers.
 */
const readmeUpdates = Effect.fn('readmeUpdates')(function* (opts: {
  readonly readmes: ReadonlyArray<string>;
  readonly sponsors: ReadonlyArray<Sponsor>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const markdown = sponsorsMarkdown(
    opts.sponsors,
    yield* sponsorCloudVersion(opts.sponsors),
  );
  return yield* Effect.forEach(opts.readmes, (readme) =>
    Effect.gen(function* () {
      const before = yield* fs.readFileString(readme);
      const after = withSponsorsBlock(before, markdown);
      if (after === undefined) {
        return yield* new SponsorsSyncError({
          message: `${readme} has no <!-- SPONSORS:LIST:START --> followed by <!-- SPONSORS:LIST:END --> to write the sponsors between`,
        });
      }
      return { after, changed: after !== before, readme };
    }),
  );
});

/** Writes the READMEs `readmeUpdates` changed, and returns their paths. */
const writeReadmes = Effect.fn('writeReadmes')(function* (
  updates: ReadonlyArray<{
    readonly after: string;
    readonly changed: boolean;
    readonly readme: string;
  }>,
) {
  const fs = yield* FileSystem.FileSystem;
  const changed = updates.filter((update) => update.changed);
  yield* Effect.forEach(changed, (update) =>
    fs.writeFileString(update.readme, update.after),
  );
  return changed.map((update) => update.readme);
});

const readSponsorsFile = Effect.fn('readSponsorsFile')(function* (
  sponsorsFile: string,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(sponsorsFile).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Array(SponsorSchema)),
        { onExcessProperty: 'error' },
      ),
    ),
    Effect.mapError(
      (cause) =>
        new SponsorsSyncError({
          message: `${sponsorsFile}: ${cause.message}`,
        }),
    ),
  );
});

/** Rewrites the `readmes`' sponsors sections from `sponsorsFile`. */
export const readmeFromSponsorsFile = Effect.fn('readmeFromSponsorsFile')(
  function* (opts: SponsorsFiles) {
    const sponsors = yield* readSponsorsFile(opts.sponsorsFile);
    const written = yield* writeReadmes(
      yield* readmeUpdates({ readmes: opts.readmes, sponsors }),
    );
    return written.length === 0
      ? `${opts.readmes.join(', ')} already list the ${sponsors.length} sponsors.`
      : `Wrote ${sponsors.length} sponsors to ${written.join(', ')}.`;
  },
);

/**
 * Who backs on Open Collective now, and which of them sponsor on GitHub
 * too, in public or `shownPrivately`.
 */
export function openCollectiveSummary(
  backers: ReadonlyArray<OpenCollectiveBacker>,
  sponsorships: ReadonlyArray<Sponsorship>,
  shownPrivately: ReadonlyArray<string>,
) {
  const current = backers.filter((backer) => backer.isCurrent);
  const names = current.map((backer) =>
    sponsorships.some(
      (sponsorship) =>
        (sponsorship.isPublic || shownPrivately.includes(sponsorship.login)) &&
        isSameSponsor(backer, {
          githubLogin: sponsorship.login,
          websiteUrl: sponsorship.websiteUrl,
        }),
    )
      ? `${backer.name} (also on GitHub)`
      : backer.name,
  );
  const past = backers.length - current.length;
  return [
    `Open Collective: ${current.length} backing now`,
    ...(names.length === 0 ? [] : [`: ${names.join(', ')}`]),
    past === 0 ? '.' : `; ${past} who backed before left out.`,
  ].join('');
}

/**
 * Fetches the accounts' sponsors and the Open Collective accounts'
 * backers, then writes them to `sponsorsFile` and the `readmes`, or nothing
 * when one of those lacks the markers. Writes nothing
 * when GitHub reports no sponsors or no payments, which means the token
 * can't see them, rather than emptying the list.
 * With `onlyWhenSponsorsChange`, also writes nothing while `sponsorsFile`
 * lists the same sponsors in the same tiers, however their weights, ranks
 * or details changed.
 */
export const syncSponsors = Effect.fn('syncSponsors')(function* (
  opts: SponsorsFiles & {
    readonly accounts: ReadonlyArray<SponsoredAccount>;
    readonly config: SponsorsConfig;
    readonly onlyWhenSponsorsChange?: boolean;
    readonly openCollective?: ReadonlyArray<string>;
    readonly token: Redacted.Redacted;
  },
) {
  const [fetched, backers] = yield* Effect.all(
    [
      Effect.forEach(
        opts.accounts,
        (account) =>
          Effect.all(
            {
              lifetimeValues: fetchLifetimeValues(account, opts.token),
              sponsorships: fetchSponsorships(account, opts.token),
            },
            { concurrency: 'unbounded' },
          ),
        { concurrency: 'unbounded' },
      ),
      Effect.forEach(opts.openCollective ?? [], fetchBackers, {
        concurrency: 'unbounded',
      }).pipe(Effect.map((perAccount) => perAccount.flat())),
    ],
    { concurrency: 'unbounded' },
  );
  const sponsorships = fetched.flatMap((account) => account.sponsorships);
  const lifetimeValues = fetched.flatMap((account) => account.lifetimeValues);
  const logins = opts.accounts.map((account) => account.login).join(' and ');
  if (sponsorships.length === 0) {
    return yield* new SponsorsSyncError({
      message: `GitHub reports no sponsors of ${logins}; is SPONSORS_SYNC_GITHUB_TOKEN theirs? Wrote nothing.`,
    });
  }
  if (lifetimeValues.length === 0) {
    return yield* new SponsorsSyncError({
      message: `GitHub reports nothing paid to ${logins}; is SPONSORS_SYNC_GITHUB_TOKEN theirs? Wrote nothing.`,
    });
  }
  if ((opts.openCollective ?? []).length > 0) {
    yield* Console.log(
      openCollectiveSummary(backers, sponsorships, opts.config.shownPrivately),
    );
  }
  const sponsors = yield* markImageless(
    sponsorsList({
      config: opts.config,
      lifetimeValues,
      now: yield* Clock.currentTimeMillis,
      openCollective: backers,
      sponsorships,
    }),
  );
  const imageless = sponsors.filter((sponsor) => sponsor.imageless === true);
  if (imageless.length > 0) {
    yield* Console.log(
      `No avatar loaded for ${imageless.map(sponsorKey).join(', ')}; the site leaves them out.`,
    );
  }
  if (opts.onlyWhenSponsorsChange === true) {
    const lineup = (sponsor: Sponsor) =>
      `${sponsorKey(sponsor)} ${sponsor.tier ?? ''} ${sponsor.imageless === true ? 'imageless' : ''}`;
    const listed = new Set(
      (yield* readSponsorsFile(opts.sponsorsFile)).map(lineup),
    );
    if (
      listed.size === sponsors.length &&
      sponsors.every((sponsor) => listed.has(lineup(sponsor)))
    ) {
      return `No sponsor joined, left or changed tier among the ${sponsors.length} in ${opts.sponsorsFile}; wrote nothing.`;
    }
  }
  const updates = yield* readmeUpdates({ readmes: opts.readmes, sponsors });
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(opts.sponsorsFile, sponsorsJson(sponsors));
  yield* writeReadmes(updates);
  return `Wrote ${sponsors.length} sponsors to ${[opts.sponsorsFile, ...opts.readmes].join(', ')}.`;
});

if (import.meta.main) {
  const here = (relative: string) =>
    fileURLToPath(new URL(relative, import.meta.url));
  const paths = publishedReadmes(here('../../packages')).pipe(
    Effect.map((packageReadmes): SponsorsFiles => ({
      readmes: [here('../../README.md'), ...packageReadmes],
      sponsorsFile: here('../sponsors.json'),
    })),
  );
  const tokenNeeded = "a token of KATT's with read:user and read:org";
  const token = Effect.gen(function* () {
    const fromEnv = yield* Config.option(
      Config.Redacted('SPONSORS_SYNC_GITHUB_TOKEN'),
    );
    if (Option.isSome(fromEnv)) {
      return fromEnv.value;
    }
    if (!process.stdin.isTTY) {
      return yield* new SponsorsSyncError({
        message: `SPONSORS_SYNC_GITHUB_TOKEN isn't set: it has to be ${tokenNeeded} (or use --readme-only).`,
      });
    }
    return yield* Prompt.run(
      Prompt.Password({
        message: `GitHub token (${tokenNeeded})`,
        validate: (value) =>
          value === ''
            ? Effect.fail('Paste a token, or set SPONSORS_SYNC_GITHUB_TOKEN')
            : Effect.succeed(value),
      }),
    );
  }).pipe(
    Effect.catch((error) =>
      Match.valueTags(error, {
        ConfigError: (configError) =>
          Effect.fail(
            new SponsorsSyncError({
              message: `SPONSORS_SYNC_GITHUB_TOKEN: ${configError.message}`,
            }),
          ),
        QuitError: () =>
          Effect.fail(new SponsorsSyncError({ message: 'No token entered.' })),
        SponsorsSyncError: (syncError) => Effect.fail(syncError),
      }),
    ),
  );
  const command = Command.make(
    'sponsors-sync',
    {
      onlyWhenSponsorsChange: Flag.Boolean('only-when-sponsors-change').pipe(
        Flag.withDescription(
          'Write nothing unless a sponsor joined, left or changed tier (what CI runs), not for new weights, ranks or details',
        ),
        Flag.withDefault(false),
      ),
      readmeOnly: Flag.Boolean('readme-only').pipe(
        Flag.withDescription(
          "Rewrite the READMEs' sponsors from sponsors.json, without GitHub",
        ),
        Flag.withDefault(false),
      ),
    },
    (opts) =>
      paths.pipe(
        Effect.flatMap((files) =>
          opts.readmeOnly
            ? readmeFromSponsorsFile(files)
            : Effect.flatMap(token, (value) =>
                syncSponsors({
                  ...files,
                  accounts: sponsoredAccounts,
                  config: sponsorsConfig,
                  onlyWhenSponsorsChange: opts.onlyWhenSponsorsChange,
                  openCollective: openCollectiveAccounts,
                  token: value,
                }),
              ),
        ),
        Effect.flatMap(Console.log),
      ),
  ).pipe(
    Command.withDescription(
      "Sync the sponsors from GitHub and Open Collective into sponsors.json and the READMEs' sponsors sections",
    ),
  );
  Command.run(command, { version: '0.0.0' }).pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        Layer.provideMerge(Avatars.layer(), FetchHttpClient.layer),
      ),
    ),
    NodeRuntime.runMain,
  );
}
