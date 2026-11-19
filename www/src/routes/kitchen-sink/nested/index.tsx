import { createFileRoute } from '@tanstack/react-router';
import { Suspense, useEffect, useState } from 'react';

import { pageHead } from '~/seo.ts';
import { site } from '~/site.ts';

import { Note, SeeItYourself } from '../-components/note.tsx';
import { showcases } from '../-showcases.ts';
import { LiveBar } from './-components/live-bar.tsx';
import { Failed, PostList, PostsSkeleton } from './-components/posts.tsx';
import { meter, type Mode, searchSchema } from './-meter.ts';
import { loadPosts, type Posts } from './-trpc.ts';

const [, showcase] = showcases;

export const Route = createFileRoute('/kitchen-sink/nested/')({
  head: () => pageHead({ ...showcase, noindex: true }),
  // The mode comes from the URL, so a reload or a shared link uses it too.
  validateSearch: searchSchema,
  component: NestedPage,
});

/**
 * The commit this build is from, so the links show the code that runs. It
 * changes this route's own chunk on each deploy, and no other.
 */
const source = `${site.github}/blob/${__TRPC_SENTRY_RELEASE__ || 'main'}/www/src/routes/kitchen-sink/nested`;

/** Starts a load in `mode`, and counts its requests in the live bar. */
const load = (mode: Mode) =>
  meter.track(mode, (fetch) => loadPosts({ fetch, mode }));

function NestedPage() {
  const mode = Route.useSearch().mode ?? 'pipelined';
  const navigate = Route.useNavigate();
  // Set once mounted, in the browser: the server renders no load, and a
  // promise made while rendering would be made again for every render React
  // throws away before the first commit.
  const [run, setRun] = useState<{
    readonly id: number;
    readonly posts: Promise<Posts>;
  } | null>(null);
  /** Starts a load. Its `id` is new, so what failed in the last one is gone. */
  const start = (next: Mode) => {
    // Not in the updater, which React may call twice
    const posts = load(next);
    setRun((last) => ({ id: (last?.id ?? 0) + 1, posts }));
  };
  useEffect(() => {
    start(mode);
    // Only the first load: a switch or a reload starts the others.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight">
        {showcase.title}
      </h1>
      <p className="text-muted-foreground">
        Posts, their authors and the authors' teams, in one request with{' '}
        <code>experimental_nested()</code> and a plain <code>@trpc/client</code>
        . Each author's query reads the post's <code>authorId</code>, and each
        team's query reads the author's <code>teamId</code>: the server fills in
        those inputs itself, so nothing waits for a round trip.{' '}
        <a className="underline" href={`${source}/-trpc.ts`}>
          How it works
        </a>{' '}
        ·{' '}
        <a className="underline" href={`${source}/-server/router.ts`}>
          The router
        </a>
      </p>
      <SeeItYourself>
        <p>
          Open your browser's Network tab and reload. One POST to{' '}
          <code>api/post.list,author.byId,team.byId</code> carries every query,
          with what each one reads in its body, and its response streams each
          result as it's ready: the posts first, then each author and team.
        </p>
        <p>
          Then pick <em>Without pipelining</em>. Each query waits for the data
          it reads: one request for the posts, then one for their authors, then
          one for each author's team as that author arrives. The Requests
          counter reads 8, not 1.
        </p>
      </SeeItYourself>
      <section className="grid gap-2">
        <Note label="experimental_pipelining · the link">
          <code>httpBatchStreamLink</code> sends a query that reads another's
          data in the same request as the query it reads. The server, with{' '}
          <code>experimental_allowPipelining</code>, runs it once that data is
          there.
        </Note>
        <LiveBar
          mode={mode}
          onMode={(next) => {
            void navigate({
              replace: true,
              resetScroll: false,
              search: { mode: next === 'pipelined' ? undefined : next },
            });
            // A new load: nothing of the other mode's is kept.
            start(next);
          }}
          onReload={() => start(mode)}
        />
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Posts</h2>
        <Note label="experimental_nested · each edge a promise">
          Each post shows when <code>post.list</code> is back. Its author and
          the author's team are promises of their own, read with{' '}
          <code>use()</code> in their own <code>&lt;Suspense&gt;</code>, so each
          shows when its query is done.
        </Note>
        {/* A query that fails shows in its own place, and the bar stays to retry */}
        {run ? (
          <Failed fallback="The posts didn't load." key={run.id}>
            <Suspense fallback={<PostsSkeleton />}>
              <PostList posts={run.posts} />
            </Suspense>
          </Failed>
        ) : (
          <PostsSkeleton />
        )}
      </section>
    </>
  );
}
