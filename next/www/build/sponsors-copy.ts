/**
 * trpc.io's sponsors, as the v11 site's sync script
 * (`www/src/components/sponsors/script.pull.ts` in the repo root) writes
 * them, turned into `sponsors.json` for this site. `old-docs-copy.ts` runs
 * it with the rest of the copy, so a merge of `main` brings the latest list.
 */
import { stripTypeScriptTypes } from 'node:module';
import { Data, Effect, Schema } from 'effect';

/** Where the sync script writes the list, in the repo root's `www`. */
export const sponsorsSource = 'src/components/sponsors/script.output.ts';

/** Where the copy writes it, in this site. */
export const sponsorsFile = 'sponsors.json';

const Sponsor = Schema.Struct({
  createdAt: Schema.Number,
  imgSrc: Schema.String,
  link: Schema.String,
  login: Schema.String,
  name: Schema.String,
  weight: Schema.Number,
});

const SyncOutput = Schema.Struct({
  allSponsors: Schema.Array(Sponsor),
});

class SponsorsCopyError extends Data.TaggedError('SponsorsCopyError')<{
  readonly message: string;
}> {}

/**
 * `sponsors.json`'s contents from the sync script's output: every sponsor,
 * in the order they started, with only the fields the site shows.
 */
export const sponsorsJson = Effect.fn('sponsorsJson')(function* (
  source: string,
) {
  const loaded = yield* Effect.tryPromise({
    catch: (cause) =>
      new SponsorsCopyError({
        message: `${sponsorsSource} didn't run: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
    try: async (): Promise<unknown> =>
      import(
        `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`
      ),
  });
  const output = yield* Schema.decodeUnknownEffect(SyncOutput)(loaded).pipe(
    Effect.mapError(
      (cause) =>
        new SponsorsCopyError({
          message: `${sponsorsSource}: unexpected sponsors: ${cause.message}`,
        }),
    ),
  );
  // `toSorted` is stable: sponsors who started at the same time keep the
  // sync script's order.
  const sponsors = output.allSponsors
    .map((sponsor) => ({
      createdAt: sponsor.createdAt,
      imgSrc: sponsor.imgSrc,
      link: sponsor.link,
      login: sponsor.login,
      name: sponsor.name,
      weight: sponsor.weight,
    }))
    .toSorted((a, b) => a.createdAt - b.createdAt);
  return `${JSON.stringify(sponsors, null, 2)}\n`;
});
