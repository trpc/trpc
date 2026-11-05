/**
 * `virtual:og-cards`: what each page's social card shows, by the card's path
 * (`ogImagePath`), for `routes/og.$.ts` to render on request. It also sets
 * `import.meta.env.OG_CARDS_VERSION` (`ogImageUrl`).
 */
import { createHash } from 'node:crypto';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import type { Plugin } from 'vite';

import type { OgCard } from '../src/og/card.ts';
import { sponsorCloudPath } from '../src/og/sponsor-cloud.ts';
import { ogImagePath, ogImageSize } from '../src/seo.ts';
import { site } from '../src/site.ts';
import { cardFooter } from '../src/sponsors.ts';

const moduleId = 'virtual:og-cards';
const resolvedId = `\0${moduleId}`;

/** The module's source: a map from each card's path to the card. */
export const ogCardsSource = (cards: ReadonlyArray<OgCard>) => {
  const byPath = new Map<string, OgCard>();
  for (const card of cards) {
    const path = ogImagePath(card.path);
    if (path === sponsorCloudPath) {
      throw new Error(`${card.path}'s social card would be the sponsor cloud`);
    }
    if (byPath.has(path)) {
      throw new Error(`Two social cards for ${card.path}`);
    }
    byPath.set(path, card);
  }
  return `export const cards = new Map(${JSON.stringify([...byPath])});\n`;
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

/**
 * A short hash of what the cards draw but the live numbers and avatar
 * pictures: every card, the sponsors along their foot, the site's name and
 * tagline, the cards' size, and the renderer (`rendererFiles`).
 * Social sites keep a card by its URL for days, so `ogImageUrl` puts this
 * in it, and a card that changes gets a new URL; a deploy that changes no
 * card keeps the old one.
 */
export const ogCardsVersion = Effect.fn('ogCardsVersion')(function* (
  cards: ReadonlyArray<OgCard>,
) {
  const fs = yield* FileSystem.FileSystem;
  const contents = yield* Effect.forEach(
    yield* rendererFiles(),
    (file) => fs.readFile(file),
    { concurrency: 'unbounded' },
  );
  const hash = createHash('sha256')
    .update(ogCardsSource(cards))
    .update(JSON.stringify(cardFooter))
    .update(JSON.stringify(site))
    .update(JSON.stringify(ogImageSize));
  for (const content of contents) {
    hash.update(content);
  }
  return hash.digest('hex').slice(0, 10);
});

export function ogCards(cards: ReadonlyArray<OgCard>): Plugin {
  const source = ogCardsSource(cards);
  return {
    config: () =>
      Effect.runPromise(
        ogCardsVersion(cards).pipe(
          Effect.map((version) => ({
            define: {
              'import.meta.env.OG_CARDS_VERSION': JSON.stringify(version),
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
