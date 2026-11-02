/**
 * A process of {@link makeRenderPool}: renders the pages it's sent, one at a
 * time, and replies with each page's markdown output or error.
 */
import { NodeServices } from '@effect/platform-node';
import { Cause, Effect, Exit } from 'effect';

import { messageOf } from './content-error.ts';
import { renderMarkdown } from './markdown.ts';
import type { RenderReply, RenderRequest, RenderStats } from './render-pool.ts';
import { makeTwoslashCache, type TwoslashCache } from './twoslash-cache.ts';

const caches = new Map<string, TwoslashCache>();

function cacheOf(request: RenderRequest) {
  const options = request.twoslashCache;
  if (options === undefined) {
    return undefined;
  }
  const id = JSON.stringify(options);
  let cache = caches.get(id);
  if (!cache) {
    cache = makeTwoslashCache(options);
    caches.set(id, cache);
  }
  return cache;
}

process.on('message', (request: RenderRequest) => {
  const cache = cacheOf(request);
  const before = { ...(cache?.stats ?? { hits: 0, misses: 0 }) };
  void Effect.runPromiseExit(
    Effect.provide(
      renderMarkdown(request.markdown, {
        ...request.options,
        twoslashCache: cache,
      }),
      NodeServices.layer,
    ),
  ).then((exit) => {
    const stats: RenderStats = {
      hits: (cache?.stats.hits ?? 0) - before.hits,
      misses: (cache?.stats.misses ?? 0) - before.misses,
    };
    const reply: RenderReply = Exit.isSuccess(exit)
      ? { id: request.id, rendered: exit.value, stats }
      : {
          error: messageOf(Cause.squash(exit.cause)),
          id: request.id,
          stats,
        };
    process.send?.(reply);
  });
});
