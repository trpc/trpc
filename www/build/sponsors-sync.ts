/**
 * Syncs the sponsors from GitHub: `pnpm --filter www sponsors:sync`
 * reads who sponsors KATT and the trpc organization, and what each has paid,
 * then writes `sponsors.json` (which the site shows) and the sponsors
 * section of the repo's `README.md`. It needs a token of KATT's (an admin
 * of the organization) that can read both accounts' sponsorships: a classic
 * token with `read:user` and `read:org`, from `SPONSORS_SYNC_GITHUB_TOKEN` or, in a
 * terminal, asked for when that isn't set.
 *
 * `--only-when-sponsors-change` writes nothing while the same sponsors are
 * listed in the same tiers, so the daily CI run
 * (`.github/workflows/next-sponsors.yml`) commits only when one joined,
 * left or changed tier.
 *
 * `--readme-only` rewrites the README from `sponsors.json` without GitHub,
 * for after changing how it's laid out (`sponsors-readme.ts`).
 *
 * The weighing is in `sponsors-list.ts`; who sponsors outside GitHub, and
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
  type Redacted,
  Schema,
} from 'effect';
import { Command, Flag, Prompt } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { type Sponsor, sponsorTiers } from '../src/sponsors.ts';
import {
  fetchLifetimeValues,
  fetchSponsorships,
  type SponsoredAccount,
  SponsorsSyncError,
} from './sponsors-github.ts';
import { type SponsorsConfig, sponsorsList } from './sponsors-list.ts';
import { sponsorsMarkdown, withSponsorsBlock } from './sponsors-readme.ts';

/** The accounts whose sponsors the site shows, together. */
export const sponsoredAccounts: ReadonlyArray<SponsoredAccount> = [
  { kind: 'user', login: 'KATT' },
  { kind: 'organization', login: 'trpc' },
];

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

const SponsorSchema = Schema.Struct({
  createdAt: Schema.Number,
  imgSrc: Schema.String,
  link: Schema.String,
  login: Schema.String,
  name: Schema.String,
  rank: Schema.optionalKey(Schema.Number),
  tier: Schema.optionalKey(
    Schema.Literals(sponsorTiers.map((entry) => entry.tier)),
  ),
  weight: Schema.Number,
});

/** Where the sync writes. */
export interface SponsorsFiles {
  readonly readme: string;
  readonly sponsorsFile: string;
}

export const sponsorsJson = (sponsors: ReadonlyArray<Sponsor>) =>
  `${JSON.stringify(sponsors, null, 2)}\n`;

/** Rewrites `readme`'s sponsors section; `false` when it was current. */
export const writeReadme = Effect.fn('writeReadme')(function* (opts: {
  readonly readme: string;
  readonly sponsors: ReadonlyArray<Sponsor>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const before = yield* fs.readFileString(opts.readme);
  const after = withSponsorsBlock(before, sponsorsMarkdown(opts.sponsors));
  if (after === undefined) {
    return yield* new SponsorsSyncError({
      message: `${opts.readme} has no <!-- SPONSORS:LIST:START --> followed by <!-- SPONSORS:LIST:END --> to write the sponsors between`,
    });
  }
  if (after === before) {
    return false;
  }
  yield* fs.writeFileString(opts.readme, after);
  return true;
});

const readSponsorsFile = Effect.fn('readSponsorsFile')(function* (
  sponsorsFile: string,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(sponsorsFile).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Array(SponsorSchema)),
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

/** Rewrites `readme`'s sponsors section from `sponsorsFile`. */
export const readmeFromSponsorsFile = Effect.fn('readmeFromSponsorsFile')(
  function* (opts: SponsorsFiles) {
    const sponsors = yield* readSponsorsFile(opts.sponsorsFile);
    const changed = yield* writeReadme({ readme: opts.readme, sponsors });
    return changed
      ? `Wrote ${sponsors.length} sponsors to ${opts.readme}.`
      : `${opts.readme} already lists the ${sponsors.length} sponsors.`;
  },
);

/**
 * Fetches the accounts' sponsors, then writes them to `sponsorsFile` and
 * `readme`. Writes nothing when GitHub reports no sponsors or no payments,
 * which means the token can't see them, rather than emptying the list.
 * With `onlyWhenSponsorsChange`, also writes nothing while `sponsorsFile`
 * lists the same sponsors in the same tiers, however their weights, ranks
 * or details changed.
 */
export const syncSponsors = Effect.fn('syncSponsors')(function* (
  opts: SponsorsFiles & {
    readonly accounts: ReadonlyArray<SponsoredAccount>;
    readonly config: SponsorsConfig;
    readonly onlyWhenSponsorsChange?: boolean;
    readonly token: Redacted.Redacted;
  },
) {
  const fetched = yield* Effect.forEach(
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
  const sponsors = sponsorsList({
    config: opts.config,
    lifetimeValues,
    now: yield* Clock.currentTimeMillis,
    sponsorships,
  });
  if (opts.onlyWhenSponsorsChange === true) {
    const lineup = (sponsor: Sponsor) =>
      `${sponsor.login} ${sponsor.tier ?? ''}`;
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
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(opts.sponsorsFile, sponsorsJson(sponsors));
  yield* writeReadme({ readme: opts.readme, sponsors });
  return `Wrote ${sponsors.length} sponsors to ${opts.sponsorsFile} and ${opts.readme}.`;
});

if (import.meta.main) {
  const here = (relative: string) =>
    fileURLToPath(new URL(relative, import.meta.url));
  const paths: SponsorsFiles = {
    readme: here('../../README.md'),
    sponsorsFile: here('../sponsors.json'),
  };
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
          "Rewrite the README's sponsors from sponsors.json, without GitHub",
        ),
        Flag.withDefault(false),
      ),
    },
    (opts) =>
      Effect.flatMap(
        opts.readmeOnly
          ? readmeFromSponsorsFile(paths)
          : Effect.flatMap(token, (value) =>
              syncSponsors({
                ...paths,
                accounts: sponsoredAccounts,
                config: sponsorsConfig,
                onlyWhenSponsorsChange: opts.onlyWhenSponsorsChange,
                token: value,
              }),
            ),
        Console.log,
      ),
  ).pipe(
    Command.withDescription(
      "Sync the sponsors from GitHub into sponsors.json and the README's sponsors section",
    ),
  );
  Command.run(command, { version: '0.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
    NodeRuntime.runMain,
  );
}
