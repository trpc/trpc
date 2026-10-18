/**
 * Syncs the sponsors from GitHub: `pnpm --filter @trpc12/www sponsors:sync`
 * reads who sponsors KATT and the trpc organization, and what each has paid,
 * then writes `sponsors.json` (which the site shows) and the sponsors
 * section of the repo's `README.md`. It needs `TRPC_GITHUB_TOKEN`, a token
 * of KATT's (an admin of the organization) that can read both accounts'
 * sponsorships: a classic token with `read:user` and `read:org`.
 *
 * `--readme-only` rewrites the README from `sponsors.json` without GitHub,
 * for after changing the partners (`partnerLogins` in `src/sponsors.ts`).
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
  type Redacted,
  Schema,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { partnerLogins, type Sponsor } from '../src/sponsors.ts';
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
  extra: [
    {
      dollars: 1500,
      login: 'greptileai',
      why: 'Three months sponsored from a private account',
    },
  ],
  shownPrivately: ['madisonredtfeldt'],
};

const SponsorSchema = Schema.Struct({
  createdAt: Schema.Number,
  imgSrc: Schema.String,
  link: Schema.String,
  login: Schema.String,
  name: Schema.String,
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
  const after = withSponsorsBlock(
    before,
    sponsorsMarkdown({ partners: partnerLogins, sponsors: opts.sponsors }),
  );
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

/** Rewrites `readme`'s sponsors section from `sponsorsFile`. */
export const readmeFromSponsorsFile = Effect.fn('readmeFromSponsorsFile')(
  function* (opts: SponsorsFiles) {
    const fs = yield* FileSystem.FileSystem;
    const sponsors = yield* fs.readFileString(opts.sponsorsFile).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Array(SponsorSchema)),
        ),
      ),
      Effect.mapError(
        (cause) =>
          new SponsorsSyncError({
            message: `${opts.sponsorsFile}: ${cause.message}`,
          }),
      ),
    );
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
 */
export const syncSponsors = Effect.fn('syncSponsors')(function* (
  opts: SponsorsFiles & {
    readonly accounts: ReadonlyArray<SponsoredAccount>;
    readonly config: SponsorsConfig;
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
      message: `GitHub reports no sponsors of ${logins}; is TRPC_GITHUB_TOKEN theirs? Wrote nothing.`,
    });
  }
  if (lifetimeValues.length === 0) {
    return yield* new SponsorsSyncError({
      message: `GitHub reports nothing paid to ${logins}; is TRPC_GITHUB_TOKEN theirs? Wrote nothing.`,
    });
  }
  const sponsors = sponsorsList({
    config: opts.config,
    lifetimeValues,
    now: yield* Clock.currentTimeMillis,
    sponsorships,
  });
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(opts.sponsorsFile, sponsorsJson(sponsors));
  yield* writeReadme({ readme: opts.readme, sponsors });
  return `Wrote ${sponsors.length} sponsors to ${opts.sponsorsFile} and ${opts.readme}.`;
});

if (import.meta.main) {
  const here = (relative: string) =>
    fileURLToPath(new URL(relative, import.meta.url));
  const paths: SponsorsFiles = {
    readme: here('../../../README.md'),
    sponsorsFile: here('../sponsors.json'),
  };
  const token = Config.Redacted('TRPC_GITHUB_TOKEN').pipe(
    Effect.mapError(
      () =>
        new SponsorsSyncError({
          message:
            "TRPC_GITHUB_TOKEN isn't set: it has to be a token of KATT's with read:user and read:org (or use --readme-only).",
        }),
    ),
  );
  const command = Command.make(
    'sponsors-sync',
    {
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
