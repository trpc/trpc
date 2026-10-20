import { Effect } from 'effect';
import type { ResolvedConfig } from 'vite';

import { renderMarkdown, type RenderOptions } from './markdown.ts';
import { makeRenderPool, type RenderPool } from './render-pool.ts';
import {
  makeTwoslashCache,
  type TwoslashCacheOptions,
} from './twoslash-cache.ts';

/**
 * The build's render processes, shared by the plugins that render markdown
 * so they don't start one set each. Started on a build's first page and
 * ended once every module is transformed ({@link closeRenderPool}).
 */
let renderPool: RenderPool | undefined;

/** Ends the build's render processes; a later render starts them again. */
export async function closeRenderPool() {
  await renderPool?.close();
  renderPool = undefined;
}

/**
 * Renders a plugin's pages: in the build's shared render processes in a
 * build, in this one in dev, where a page renders on its own. Call
 * `configResolved` from the plugin's hook of that name, and
 * {@link closeRenderPool} from its `buildEnd`.
 */
export function makePageRenderer(
  cacheOptions: TwoslashCacheOptions | undefined,
) {
  const twoslashCache = cacheOptions && makeTwoslashCache(cacheOptions);
  let building = false;
  return {
    configResolved: (config: ResolvedConfig) => {
      building = config.command === 'build';
    },
    render: (
      markdown: string,
      options: Omit<RenderOptions, 'twoslashCache'>,
    ) => {
      if (!building) {
        return renderMarkdown(markdown, { ...options, twoslashCache });
      }
      renderPool ??= makeRenderPool();
      return Effect.map(
        renderPool.render(markdown, options, cacheOptions),
        (output) => {
          if (twoslashCache) {
            twoslashCache.stats.hits += output.stats.hits;
            twoslashCache.stats.misses += output.stats.misses;
          }
          return output.rendered;
        },
      );
    },
    /** Blocks read from the cache and blocks compiled, in this process or the build's render processes. */
    stats: twoslashCache?.stats,
  };
}
