import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { MessageSquare } from 'lucide-react';
import { type ReactNode, useId } from 'react';

import { Skeleton } from '@shared/ui/components/skeleton';

import { DemoLink } from './browser.tsx';
import { type TRPC, useTRPC } from './session.tsx';

/** The same components read the handles in every demo, as in an app. */
export function Post(props: {
  readonly post: unstable_inferQueryHandle<TRPC['post']['byId']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return (
    <article className="grid gap-1">
      <h3 className="text-base font-semibold">{postQuery.data.title}</h3>
      <p className="text-muted-foreground">{postQuery.data.body}</p>
      <p className="text-xs text-muted-foreground">
        Served at {postQuery.data.servedAt.toFixed(1)} s
      </p>
    </article>
  );
}

export function PostSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function CommentsSection(props: { readonly children: ReactNode }) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="grid gap-2 border-t pt-3">
      <h4
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        id={heading}
      >
        <MessageSquare className="size-3.5" /> Comments
      </h4>
      {props.children}
    </section>
  );
}

export function CommentList(props: {
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly id: number;
  }>;
}) {
  return (
    <ul className="grid gap-2">
      {props.comments.map((comment) => (
        <li className="flex gap-2" key={comment.id}>
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground"
          >
            {comment.author.charAt(0)}
          </span>
          <span>
            <span className="font-medium">{comment.author}</span>{' '}
            <span className="text-muted-foreground">{comment.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Comments(props: {
  readonly comments: unstable_inferQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseQuery(
    trpc.unstable_$fromHandle(props.comments),
  );
  return <CommentList comments={commentsQuery.data} />;
}

export function CommentsSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1].map((row) => (
        <div className="flex gap-2" key={row}>
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function PostList(props: {
  readonly posts: unstable_inferQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.posts));
  return (
    <ul className="grid gap-1">
      {postsQuery.data.map((post) => (
        <li key={post.id}>
          <DemoLink
            className="block rounded-md px-2 py-1.5 hover:bg-accent"
            href={`/posts/${post.id}`}
          >
            {post.title}
          </DemoLink>
        </li>
      ))}
    </ul>
  );
}

export function PostListSkeleton() {
  return (
    <div className="grid gap-1">
      {[0, 1, 2].map((row) => (
        <Skeleton className="h-8 w-full" key={row} />
      ))}
    </div>
  );
}

export function NotFound() {
  return <p className="text-muted-foreground">Not found.</p>;
}
