'use client';

import { Skeleton } from '@shared/ui/components/skeleton';
import {
  createTRPCClient,
  experimental_nested,
  experimental_pipelining,
  httpBatchStreamLink,
} from '@trpc/client';
import { Suspense, use, useEffect, useState } from 'react';
import type { AppRouter } from '~/trpc/routers/_app';
import { LiveBar } from './live-bar';
import { meter, type Fetch, type Mode } from './meter';

/** A client of its own for each load, so its requests count in its run */
function createClient(mode: Mode, fetch: Fetch) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        url: '/api/trpc',
        // Only for the live bar: it counts the requests
        fetch,
        // Without it, each query that reads another's data waits for it, and
        // asks by itself
        experimental_pipelining:
          mode === 'pipelined' ? experimental_pipelining() : undefined,
      }),
    ],
  });
}

/**
 * The posts, the author of each post and each author's team, in one request.
 * The posts resolve first; each author and team is a promise of its own.
 */
function loadPosts(client: ReturnType<typeof createClient>) {
  return experimental_nested(client, (q) =>
    q.blog.posts.query().items.map((post) => ({
      author: q.blog.author
        .query({ id: post.authorId })
        .with((author) => ({ team: q.blog.team.query({ id: author.teamId }) })),
    })),
  );
}

type Posts = Awaited<ReturnType<typeof loadPosts>>;
type Author = Awaited<Posts[number]['edges']['author']>;

function load(mode: Mode) {
  return meter.track(mode, (fetch) => loadPosts(createClient(mode, fetch)));
}

/** Keeps the mode in `?mode=`, so a reload or a shared link uses it too */
function writeMode(mode: Mode) {
  const url = new URL(window.location.href);
  if (mode === 'pipelined') {
    url.searchParams.delete('mode');
  } else {
    url.searchParams.set('mode', mode);
  }
  // Next keeps `useSearchParams()` in step, without a request to the server
  window.history.replaceState(null, '', url);
}

export function NestedDemo(props: { initialMode: Mode }) {
  const [mode, setMode] = useState(props.initialMode);
  // Set once mounted: a promise made while rendering would be made again for
  // every render React throws away before the first commit, and on the server
  const [posts, setPosts] = useState<ReturnType<typeof loadPosts>>();
  useEffect(() => {
    setPosts(load(mode));
    // Only the first load: a switch or a reload starts the others
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4">
      <LiveBar
        mode={mode}
        onMode={(next) => {
          writeMode(next);
          setMode(next);
          // A new load: nothing of the other mode's is kept
          setPosts(load(next));
        }}
        onReload={() => setPosts(load(mode))}
      />
      {posts && (
        <Suspense fallback={<PostsSkeleton />}>
          <PostList posts={posts} />
        </Suspense>
      )}
    </div>
  );
}

function PostList(props: { posts: Promise<Posts> }) {
  const posts = use(props.posts);
  return (
    <ul className="grid gap-3">
      {posts.map((post) => (
        <li
          key={post.node.slug}
          className="animate-pop grid gap-2 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10"
        >
          <span className="font-medium">{post.node.title}</span>
          <Suspense fallback={<Skeleton className="h-6 w-40" />}>
            <AuthorLine author={post.edges.author} />
          </Suspense>
        </li>
      ))}
    </ul>
  );
}

function AuthorLine(props: { author: Promise<Author> }) {
  const author = use(props.author);
  return (
    <span className="animate-pop flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-sky-500" />
        {author.node.name}
      </span>
      <Suspense fallback={<Skeleton className="h-5 w-20" />}>
        <TeamName team={author.edges.team} />
      </Suspense>
    </span>
  );
}

function TeamName(props: { team: Author['edges']['team'] }) {
  const team = use(props.team);
  return (
    <span className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
      <span className="size-1.5 rounded-full bg-amber-500" />
      {team.name}
    </span>
  );
}

function PostsSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
