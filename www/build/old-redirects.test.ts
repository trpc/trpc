/**
 * Old trpc.io pages, each with the page `vercel.json`'s redirects should land
 * it on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { land, type Redirect, redirectRoute } from './old-routes.ts';
import { routes } from './vercel-output.ts';

const { redirects } = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as { redirects: ReadonlyArray<Redirect> };

const oldPages = [
  ['/docs/reactjs/usecontext', '/docs/client/react/useUtils'],
  ['/docs/reactjs/useinfinitequery', '/docs/client/react/useInfiniteQuery'],
  ['/docs/server/router', '/docs/server/routers'],
  ['/docs/v10/context', '/docs/v10/server/context'],
  ['/docs/v10/data-transformers', '/docs/v10/server/data-transformers'],
  ['/docs/v10/error-formatting', '/docs/v10/server/error-formatting'],
  ['/docs/v10/error-handling', '/docs/v10/server/error-handling'],
  ['/docs/v10/fetch', '/docs/v10/server/adapters/fetch'],
  ['/docs/v10/header', '/docs/v10/client/headers'],
  ['/docs/v10/infer-types', '/docs/v10/client/vanilla/infer-types'],
  ['/docs/v10/links/loggerLink', '/docs/v10/client/links/loggerLink'],
  ['/docs/v10/merging-routers', '/docs/v10/server/merging-routers'],
  ['/docs/v10/metadata', '/docs/v10/server/metadata'],
  ['/docs/v10/middlewares', '/docs/v10/server/middlewares'],
  ['/docs/v10/procedures', '/docs/v10/server/procedures'],
  ['/docs/v10/react-queries', '/docs/v10/client/react/useQuery'],
] as const;

describe('old pages', () => {
  const all = routes(redirects.map(redirectRoute));
  const served = new Set(oldPages.map(([, destination]) => destination));

  it.each(oldPages)('%s lands on %s', (source, destination) => {
    expect(land(all, served, source).landed).toEqual({
      kind: 'file',
      path: destination,
    });
  });
});
