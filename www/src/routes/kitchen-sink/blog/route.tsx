import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  retainSearchParams,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';

import { pageHead } from '~/seo.ts';
import { site } from '~/site.ts';

import { RequestMeter } from './-components/request-meter.tsx';
import {
  BlogPreloadProvider,
  BlogSettingsBar,
} from './-components/settings.tsx';
import { meter } from './-request-meter.ts';
import {
  blogSearchKeys,
  blogSearchOf,
  blogSearchSchema,
  blogSettingsOf,
  setSlowQueries,
} from './-settings.ts';
import { showcase } from './-showcase.ts';
import { getQueryClient, TRPCProvider, trpcClient, useTRPC } from './-trpc.ts';

/**
 * The showcase's own query client, for its pages alone: the rest of the
 * site has none. Its pages hydrate it from their loaders' data. The
 * settings and the request meter sit above every page of the blog.
 */
export const Route = createFileRoute('/kitchen-sink/blog')({
  head: () => pageHead({ ...showcase, noindex: true }),
  // `?slow=true&preload=intent`; an unknown value is left out.
  validateSearch: blogSearchSchema,
  // Every link inside the blog keeps its settings
  search: { middlewares: [retainSearchParams([...blogSearchKeys])] },
  // Runs before the loaders below it start their queries, so those queries,
  // and the ones a preload starts, ask for the speed in the URL they load
  beforeLoad: (opts) => {
    setSlowQueries(opts.search.slow === true);
    // Each navigation into or inside the blog is a new run of the request
    // meter. Not run when the page hydrates: the first run is the page load
    if (!opts.preload && typeof window !== 'undefined') {
      meter.start();
    }
  },
  component: BlogLayout,
});

/**
 * The commit this build is from, so the links show the code that runs. It
 * changes this route's own chunk on each deploy, and no other.
 */
const source = `${site.github}/blob/${__TRPC_SENTRY_RELEASE__ || 'main'}/www/src/routes/kitchen-sink/blog`;

function BlogLayout() {
  const [queryClient] = useState(getQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <BlogFrame />
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function BlogFrame() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const settings = blogSettingsOf(Route.useSearch());
  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight">
        {showcase.title}
      </h1>
      <p className="text-muted-foreground">
        A post, its author, and the posts of the author’s team: each needs the
        one before. The loaders start them all with <code>loadHandles</code> and{' '}
        <code>experimental_dataOf</code>, and wait for none. The link pipelines,
        so the browser sends them in one request, and the server fills in each
        input from the data before it.{' '}
        <a className="underline" href={`${source}/-entries.ts`}>
          How it works
        </a>{' '}
        ·{' '}
        <a className="underline" href={`${source}/-trpc.ts`}>
          The link
        </a>{' '}
        ·{' '}
        <a className="underline" href={`${source}/-server/router.ts`}>
          The router
        </a>
      </p>
      <BlogSettingsBar
        value={settings}
        onChange={(next) => {
          const slowChanged = next.slowQueries !== settings.slowQueries;
          if (slowChanged) {
            // Forget what the blog has loaded: the page loads again at the
            // new speed, and its loader starts its queries, in one request
            queryClient.removeQueries(trpc.blog.pathFilter());
          }
          void navigate({
            replace: true,
            search: (prev) => ({ ...prev, ...blogSearchOf(next) }),
            to: '.',
          }).then(() => (slowChanged ? router.invalidate() : undefined));
        }}
      />
      <RequestMeter />
      <BlogPreloadProvider value={settings.preload}>
        <Outlet />
      </BlogPreloadProvider>
    </>
  );
}
