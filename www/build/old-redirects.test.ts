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
  ['/docs/reactjs/getquerykey', '/docs/client/react/getQueryKey'],
  ['/docs/reactjs/usecontext', '/docs/client/react/useUtils'],
  ['/docs/reactjs/useinfinitequery', '/docs/client/react/useInfiniteQuery'],
  ['/docs/reactjs/usemutation', '/docs/client/react/useMutation'],
  ['/docs/reactjs/usequeries', '/docs/client/react/useQueries'],
  ['/docs/reactjs/usequery', '/docs/client/react/useQuery'],
  ['/docs/server/router', '/docs/server/routers'],
  [
    '/docs/v10/aborting-procedures',
    '/docs/v10/client/react/aborting-procedure-calls',
  ],
  ['/docs/v10/authorization', '/docs/v10/server/authorization'],
  ['/docs/v10/awesome-trpc', '/docs/v10/community/awesome-trpc'],
  ['/docs/v10/aws-lambda', '/docs/v10/server/adapters/aws-lambda'],
  ['/docs/v10/caching', '/docs/v10/server/caching'],
  ['/docs/v10/context', '/docs/v10/server/context'],
  ['/docs/v10/contributing', '/docs/v10/community/contributing'],
  ['/docs/v10/cors', '/docs/v10/client/cors'],
  ['/docs/v10/data-transformers', '/docs/v10/server/data-transformers'],
  ['/docs/v10/error-formatting', '/docs/v10/server/error-formatting'],
  ['/docs/v10/error-handling', '/docs/v10/server/error-handling'],
  ['/docs/v10/express', '/docs/v10/server/adapters/express'],
  ['/docs/v10/fastify', '/docs/v10/server/adapters/fastify'],
  ['/docs/v10/fetch', '/docs/v10/server/adapters/fetch'],
  ['/docs/v10/header', '/docs/v10/client/headers'],
  ['/docs/v10/infer-types', '/docs/v10/client/vanilla/infer-types'],
  ['/docs/v10/links', '/docs/v10/client/links'],
  ['/docs/v10/links/httpBatchLink', '/docs/v10/client/links/httpBatchLink'],
  ['/docs/v10/links/httpLink', '/docs/v10/client/links/httpLink'],
  ['/docs/v10/links/loggerLink', '/docs/v10/client/links/loggerLink'],
  ['/docs/v10/links/splitLink', '/docs/v10/client/links/splitLink'],
  ['/docs/v10/links/wsLink', '/docs/v10/client/links/wsLink'],
  ['/docs/v10/love', '/docs/v10/community/love'],
  ['/docs/v10/merging-routers', '/docs/v10/server/merging-routers'],
  ['/docs/v10/metadata', '/docs/v10/server/metadata'],
  ['/docs/v10/middlewares', '/docs/v10/server/middlewares'],
  ['/docs/v10/nextjs', '/docs/v10/client/nextjs/setup'],
  ['/docs/v10/output-validation', '/docs/v10/server/validators'],
  ['/docs/v10/procedures', '/docs/v10/server/procedures'],
  ['/docs/v10/react', '/docs/v10/client/react/setup'],
  ['/docs/v10/react-mutations', '/docs/v10/client/react/useMutation'],
  ['/docs/v10/react-queries', '/docs/v10/client/react/useQuery'],
  ['/docs/v10/router', '/docs/v10/server/routers'],
  ['/docs/v10/server-side-calls', '/docs/v10/server/server-side-calls'],
  ['/docs/v10/sponsors', '/docs/v10/community/sponsors'],
  ['/docs/v10/ssg', '/docs/v10/client/nextjs/ssg'],
  ['/docs/v10/ssg-helpers', '/docs/v10/client/nextjs/server-side-helpers'],
  ['/docs/v10/ssr', '/docs/v10/client/nextjs/ssr'],
  ['/docs/v10/starter-projects', '/docs/v10/client/nextjs/starter-projects'],
  ['/docs/v10/suspense', '/docs/v10/client/react/suspense'],
  ['/docs/v10/useContext', '/docs/v10/client/react/useUtils'],
  ['/docs/v10/useInfiniteQuery', '/docs/v10/client/react/useInfiniteQuery'],
  ['/docs/v10/vanilla', '/docs/v10/client/vanilla/setup'],
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
