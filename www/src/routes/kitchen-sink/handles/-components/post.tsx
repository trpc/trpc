import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  type inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';

import { type TRPC, useTRPC } from '../-trpc.ts';

/**
 * Reads the post the loader loaded, by its handle: it never names the
 * procedure's input. Refetching sends one request, for this query alone.
 */
export function Post(props: {
  readonly post: inferQueryHandle<TRPC['post']['byId']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return (
    <article className="grid gap-2 rounded-lg border p-4">
      <h2 className="text-xl font-semibold">{postQuery.data.title}</h2>
      <p>{postQuery.data.body}</p>
      <button
        className="justify-self-start rounded-md border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
        disabled={postQuery.isFetching}
        onClick={() => {
          void postQuery.refetch();
        }}
        type="button"
      >
        {postQuery.isFetching ? 'Refetching…' : 'Refetch the post'}
      </button>
    </article>
  );
}
