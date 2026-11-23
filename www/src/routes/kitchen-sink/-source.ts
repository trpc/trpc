import { site } from '~/site.ts';

import type { Showcase } from './-showcases.ts';

/**
 * The commit this build is from, so the links show the code that runs.
 * Not in `-showcases.ts`, which `vite.config.ts` imports, where this
 * constant isn't defined.
 */
const ref = () => __TRPC_SENTRY_RELEASE__ || 'main';

/** Each route's folder matches its path: `/kitchen-sink/handles`. */
const folder = (showcase: Showcase) => `www/src/routes${showcase.path}`;

/** The showcase's folder on GitHub. */
export function showcaseFolderUrl(showcase: Showcase) {
  return `${site.github}/tree/${ref()}/${folder(showcase)}`;
}

/** A file in the showcase's folder on GitHub, such as `index.tsx`. */
export function showcaseFileUrl(showcase: Showcase, file: string) {
  return `${site.github}/blob/${ref()}/${folder(showcase)}/${file}`;
}
