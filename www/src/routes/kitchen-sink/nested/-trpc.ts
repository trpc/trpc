/**
 * The showcase's tRPC setup: a plain `@trpc/client`, no TanStack Query. The
 * browser loads the posts, their authors and the authors' teams from the
 * endpoint (`api.$.ts`), in one pipelined POST or, to compare, without
 * pipelining.
 */
import {
  createTRPCClient,
  experimental_dataOf,
  experimental_load,
  experimental_perItem,
  experimental_pipelining,
  experimental_query,
  httpBatchStreamLink,
} from '@trpc/client';

import type { Fetch, Mode } from './-meter.ts';
import type { AppRouter } from './-server/router.ts';

export const endpoint = '/kitchen-sink/nested/api';

/** A client of its own for each load, so its requests count in its run. */
function createClient(opts: { readonly fetch: Fetch; readonly mode: Mode }) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        // Only for the live bar: it counts the requests.
        fetch: (url, init) =>
          opts.fetch(url, { ...init, signal: init?.signal ?? null }),
        // Queries go as a POST, with the calls the server makes in its body,
        // instead of in the URL.
        methodOverride: 'POST',
        // Without it, each query that reads another's data waits for it, and
        // asks by itself.
        ...(opts.mode === 'pipelined'
          ? { experimental_pipelining: experimental_pipelining() }
          : {}),
        url: endpoint,
      }),
    ],
  });
}

/**
 * The posts, the author of each post and each author's team, in one request.
 * The posts resolve first; each author and team is a promise of its own.
 */
export function loadPosts(opts: {
  readonly fetch: Fetch;
  readonly mode: Mode;
  /** Stops every query of the load, those still to be sent too */
  readonly signal: AbortSignal;
}) {
  const client = createClient(opts);
  // What to load: plain values, so nothing is sent yet
  const posts = experimental_query(client.post.list);
  const res = experimental_load(
    client,
    {
      posts,
      // The callback runs once, on a stand-in for every post
      rows: experimental_perItem(experimental_dataOf(posts).items, (post) => {
        const author = experimental_query(client.author.byId, {
          id: post.authorId,
        });
        return {
          author,
          team: experimental_query(client.team.byId, {
            id: experimental_dataOf(author).teamId,
          }),
        };
      }),
    },
    { signal: opts.signal },
  );
  // A row for each post, with its author and team as promises of their own
  return Promise.all([res.posts, res.rows]).then(([list, rows]) =>
    list.items.map((post, index) => {
      const row = rows[index];
      if (!row) {
        throw new Error(`No row for post ${index}`);
      }
      return { post, ...row };
    }),
  );
}

export type Posts = Awaited<ReturnType<typeof loadPosts>>;
export type Author = Awaited<Posts[number]['author']>;
export type Team = Awaited<Posts[number]['team']>;
