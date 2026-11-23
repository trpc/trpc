import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  type inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';

import { type TRPC, useTRPC } from '../-trpc.ts';

/**
 * Reads the comments, which the loader started but didn't wait for: they
 * stream in, inside the page's `<Suspense>`.
 */
export function Comments(props: {
  readonly comments: inferQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseQuery(fromHandle(trpc, props.comments));
  if (commentsQuery.data.length === 0) {
    return <p className="text-muted-foreground">No comments yet.</p>;
  }
  return (
    <ul className="grid gap-2">
      {commentsQuery.data.map((comment) => (
        <li className="rounded-md bg-muted px-3 py-2 text-sm" key={comment.id}>
          <span className="font-semibold">{comment.author}:</span>{' '}
          {comment.text}
        </li>
      ))}
    </ul>
  );
}
