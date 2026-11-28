import {
  HydrationBoundary,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  retainSearchParams,
  useMatch,
  useNavigate,
} from '@tanstack/react-router';
import {
  experimental_dataOf,
  experimental_perItem,
  experimental_handleOfItem,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
  type TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense, useState } from 'react';

import { pageHead } from '~/seo.ts';

import {
  AuthorName,
  PostList,
  PostListSkeleton,
} from './-components/post-list.tsx';
import { RequestMeter } from './-components/request-meter.tsx';
import {
  BlogPreloadProvider,
  BlogSettingsBar,
} from './-components/settings.tsx';
import { contentId } from './-links.ts';
import { meter } from './-request-meter.ts';
import {
  blogSearchKeys,
  blogSearchOf,
  blogSearchSchema,
  blogSettingsOf,
  setSlowQueries,
} from './-settings.ts';
import { showcaseFileUrl } from '../-source.ts';
import { showcase } from './-showcase.ts';
import {
  getQueryClient,
  loaderTRPC,
  TRPCProvider,
  type TRPC,
  trpcClient,
  useTRPC,
} from './-trpc.ts';

/**
 * Every query the post list needs, from the URL alone. The loader waits for
 * none of them: each part of the list shows when its query has loaded.
 */
function postListEntries(trpc: TRPC) {
  const posts = prefetchInfiniteEntry(
    trpc.blog.posts,
    { limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  return {
    posts,
    // An author for every post. The authors' ids are in the posts, which
    // haven't loaded yet, so the callback runs once on a stand-in for every
    // post. The server runs `blog.authorById` for every post it found, in the
    // same request: for this first page, and for each page the list loads later
    authors: experimental_perItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.blog.authorById, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}

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
  // The post list is on every page of the blog: beside the post on a wide
  // screen, and the index page on a narrow one. Its queries go in the same
  // request as the page's
  loader: async () => {
    const { dehydrated, trpc } = loaderTRPC();
    const [handles] = await loadHandles(trpc, postListEntries(trpc));
    // On the server, the queries go to the browser with the page. In the
    // browser, they're already in its query client.
    return { dehydrated: await dehydrated(), handles };
  },
  component: BlogLayout,
});

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
  const navigate = useNavigate();
  const data = Route.useLoaderData();
  const settings = blogSettingsOf(Route.useSearch());
  // On a narrow screen, a post's page shows the post alone
  const postOpen = useMatch({
    from: '/kitchen-sink/blog/$slug',
    shouldThrow: false,
  });
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
        <a className="underline" href={showcaseFileUrl(showcase, '$slug.tsx')}>
          How it works
        </a>{' '}
        ·{' '}
        <a className="underline" href={showcaseFileUrl(showcase, '-trpc.ts')}>
          The link
        </a>{' '}
        ·{' '}
        <a
          className="underline"
          href={showcaseFileUrl(showcase, '-server/router.ts')}
        >
          The router
        </a>
      </p>
      {/* Wider than the kitchen sink's column on a wide screen, for the list
          and the post side by side. `--blog-bar` is the sticky bar's
          height: what sits under it, and where a link lands, is below it */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 [--blog-bar:3rem] lg:mx-[calc((100%-min(72rem,100vw-3rem))/2)]">
        <div
          data-slot="blog-bar"
          className="sticky top-(--site-header) z-30 -mx-4 flex h-(--blog-bar) items-center justify-between gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-b-xl lg:border-x lg:px-3"
        >
          <BlogSettingsBar
            value={settings}
            onChange={(next) => {
              const slowChanged = next.slowQueries !== settings.slowQueries;
              // A setting is a search param, not a page: it stays where you
              // are, and doesn't add to the history
              void navigate({
                replace: true,
                resetScroll: false,
                search: (prev) => ({ ...prev, ...blogSearchOf(next) }),
                to: '.',
              }).then(() =>
                // The blog's queries load again at the new speed, in one
                // request. The page keeps showing their data meanwhile, so
                // nothing moves
                slowChanged
                  ? queryClient.invalidateQueries(trpc.blog.pathFilter())
                  : undefined,
              );
            }}
          />
          <RequestMeter />
        </div>
        <BlogPreloadProvider value={settings.preload}>
          <HydrationBoundary state={data.dehydrated}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <div
                // A page's content, where a link to the page lands: under the
                // sticky bar, as `html`'s `scroll-padding-top` keeps it under
                // the site's header
                className="grid min-w-0 scroll-mt-[calc(var(--blog-bar)-0.5rem)] gap-6 lg:col-start-2 lg:row-start-1"
                id={contentId}
              >
                <Outlet />
              </div>
              {/* On a wide screen, the list scrolls by itself, so opening a
                  post keeps your place in it */}
              <aside
                aria-label="Posts"
                className={`${postOpen ? 'hidden lg:block' : ''} lg:sticky lg:top-[calc(var(--site-header)+var(--blog-bar)+1rem)] lg:col-start-1 lg:row-start-1 lg:max-h-[calc(100dvh-var(--site-header)-var(--blog-bar)-2rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1`}
                data-scroll-restoration-id="blog-posts"
              >
                <Suspense fallback={<PostListSkeleton />}>
                  <PostList
                    posts={data.handles.posts}
                    // The post gives the handle of its author's query, also
                    // for a post on a page that loaded after the loader ran
                    author={(post) => (
                      <AuthorName
                        author={experimental_handleOfItem(
                          data.handles.authors,
                          post,
                        )}
                      />
                    )}
                  />
                </Suspense>
              </aside>
            </div>
          </HydrationBoundary>
        </BlogPreloadProvider>
      </div>
    </>
  );
}
