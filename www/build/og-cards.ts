/**
 * `virtual:og-cards`: what each page's social card shows, by the page's
 * path, for `routes/og.$.ts` to render on request. It also sets
 * the versions in their URLs (`og/version.ts`):
 * `import.meta.env.OG_CARDS_VERSION` and `SPONSOR_CLOUD_VERSION`.
 */
import { createHash } from 'node:crypto';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import type { Plugin } from 'vite';

import type { OgCard } from '../src/og/card.ts';
import { sponsorCloudSource } from '../src/og/sponsor-cloud.ts';
import { versionLike } from '../src/og/version.ts';
import { ogImageSize } from '../src/seo.ts';
import { site } from '../src/site.ts';
import { cardFooter, drawnSponsors, type Sponsor } from '../src/sponsors.ts';

const moduleId = 'virtual:og-cards';
const resolvedId = `\0${moduleId}`;

/**
 * Why `path` can't have a social card, if it can't: its card's URL would be
 * another's (`og/version.ts`) were it `/index`, the home card's, in `_`,
 * the images that aren't a page's, or ending in what looks like a version.
 */
const clash = (path: string) =>
  path === '/index'
    ? "is the home card's"
    : path === '/_' || path.startsWith('/_/')
      ? "is in /_, the images that aren't a page's"
      : versionLike.test(path.split('/').at(-1) ?? '')
        ? 'ends in what looks like a version'
        : undefined;

/** The module's source: a map from each card's page to the card. */
export const ogCardsSource = (cards: ReadonlyArray<OgCard>) => {
  const byPage = new Map<string, OgCard>();
  for (const card of cards) {
    const reason = clash(card.path);
    if (reason !== undefined) {
      throw new Error(`${card.path}'s social card ${reason}`);
    }
    if (byPage.has(card.path)) {
      throw new Error(`Two social cards for ${card.path}`);
    }
    byPage.set(card.path, card);
  }
  return `export const cards = new Map(${JSON.stringify([...byPage])});\n`;
};

/** The packages that lay out, rasterize and letter the cards. */
const rendererPackages = ['satori', '@resvg/resvg-wasm', '@fontsource/inter'];

/**
 * The module outside `src/og` that lays out the cards' text. Of `seo.ts`
 * they use only `ogImageSize`, which `ogCardsVersion` hashes, so a change
 * to a page's head doesn't change every card's URL.
 */
const rendererModules = ['src/content/inline-code.ts'];

/**
 * What the cards are drawn with: `src/og`'s modules and `rendererModules`,
 * the wordmark, and `rendererPackages`' `package.json`s, whose versions
 * change with an upgrade.
 */
const rendererFiles = Effect.fn('rendererFiles')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const www = yield* path.fromFileUrl(new URL('..', import.meta.url));
  const ogDir = path.join(www, 'src/og');
  const modules = (yield* fs.readDirectory(ogDir))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .toSorted()
    .map((name) => path.join(ogDir, name));
  return [
    ...modules,
    ...rendererModules.map((file) => path.join(www, file)),
    path.join(www, 'public/img/logo-text-black.svg'),
    ...rendererPackages.map((name) =>
      path.join(www, 'node_modules', name, 'package.json'),
    ),
  ];
});

/** A short hash of `parts` and `files`' contents. */
const hashOf = Effect.fn('hashOf')(function* (
  parts: ReadonlyArray<string>,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const contents = yield* Effect.forEach(files, (file) => fs.readFile(file), {
    concurrency: 'unbounded',
  });
  const hash = createHash('sha256');
  for (const part of [...parts, ...contents]) {
    hash.update(part);
  }
  return hash.digest('hex').slice(0, 10);
});

/**
 * A short hash of what the cards draw but the live numbers and avatar
 * pictures: every card, the sponsors along their foot, the site's name and
 * tagline, the cards' size, and the renderer (`rendererFiles`).
 * `ogImageUrl` puts it in the cards' path (`og/version.ts`), so a card
 * that changes gets a new URL, and one that doesn't can be cached for good.
 */
export const ogCardsVersion = Effect.fn('ogCardsVersion')(function* (
  cards: ReadonlyArray<OgCard>,
) {
  return yield* hashOf(
    [
      ogCardsSource(cards),
      JSON.stringify(cardFooter),
      JSON.stringify(site),
      JSON.stringify(ogImageSize),
    ],
    yield* rendererFiles(),
  );
});

/** The modules outside `src/og` that lay out the sponsor cloud and pick its avatars. */
const cloudModules = ['src/components/sponsors/pack.ts', 'src/sponsors.ts'];

/**
 * A short hash of what the sponsor cloud draws of `sponsors` but their
 * pictures (`sponsorCloudSource`), and its renderer (`rendererFiles` and
 * `cloudModules`): the build serves the cloud at it, and as the `ETag` of
 * the READMEs' URL for it (`sponsorCloudUrl`).
 */
export const sponsorCloudVersion = Effect.fn('sponsorCloudVersion')(function* (
  sponsors: ReadonlyArray<Sponsor>,
) {
  const path = yield* Path.Path;
  const www = yield* path.fromFileUrl(new URL('..', import.meta.url));
  return yield* hashOf(
    [sponsorCloudSource(sponsors)],
    [
      ...(yield* rendererFiles()),
      ...cloudModules.map((file) => path.join(www, file)),
    ],
  );
});

export function ogCards(cards: ReadonlyArray<OgCard>): Plugin {
  const source = ogCardsSource(cards);
  return {
    config: () =>
      Effect.runPromise(
        Effect.all([
          ogCardsVersion(cards),
          sponsorCloudVersion(drawnSponsors),
        ]).pipe(
          Effect.map(([cardsVersion, cloudVersion]) => ({
            define: {
              'import.meta.env.OG_CARDS_VERSION': JSON.stringify(cardsVersion),
              'import.meta.env.SPONSOR_CLOUD_VERSION':
                JSON.stringify(cloudVersion),
            },
          })),
          Effect.provide(NodeServices.layer),
        ),
      ),
    load: (id) => (id === resolvedId ? source : undefined),
    name: 'trpc-www:og-cards',
    resolveId: (id) => (id === moduleId ? resolvedId : undefined),
  };
}
