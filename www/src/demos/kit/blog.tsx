import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { ChevronRight, MessageSquare, UserRound } from 'lucide-react';
import { type ReactNode, Suspense, useId } from 'react';

import { Skeleton } from '@shared/ui/components/skeleton';

import { pageCount } from './backend.ts';
import { DemoLink } from './browser.tsx';
import { type TRPC, useTRPC } from './session.tsx';

/** The same components read the handles in every demo, as in an app. */
export function Post(props: {
  readonly post: unstable_inferQueryHandle<TRPC['post']['byId']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <PostArticle post={postQuery.data} />;
}

export function PostArticle(props: {
  readonly post: {
    readonly author: string;
    readonly body: string;
    readonly servedAt: number;
    readonly title: string;
  };
}) {
  return (
    <article className="grid gap-1">
      <h3 className="text-base font-semibold">{props.post.title}</h3>
      <p className="text-muted-foreground">{props.post.body}</p>
      <p className="text-xs text-muted-foreground">
        By {props.post.author} · served at {props.post.servedAt.toFixed(1)} s
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
  if (props.comments.length === 0) {
    return <p className="text-xs text-muted-foreground">No comments yet.</p>;
  }
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

interface PostSummary {
  readonly author: string;
  readonly excerpt: string;
  readonly id: number;
  readonly minutes: number;
  readonly title: string;
}

/** An article to open: the whole card is the link. */
function PostCard(props: {
  readonly commentCount?: ReactNode;
  readonly post: PostSummary;
}) {
  const post = props.post;
  return (
    <DemoLink
      className="group flex items-start gap-3 rounded-lg border bg-background p-3 outline-none transition-colors hover:border-link hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none"
      href={`/posts/${post.id}`}
    >
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="font-semibold underline-offset-2 group-hover:text-link group-hover:underline">
          {post.title}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {post.excerpt}
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[0.7rem] text-muted-foreground">
          <span>
            {post.author} · {post.minutes} min read
          </span>
          {props.commentCount}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link motion-reduce:transition-none"
      />
    </DemoLink>
  );
}

export function PostCards(props: {
  readonly commentCount?: (postId: number) => ReactNode;
  readonly posts: ReadonlyArray<PostSummary>;
}) {
  return (
    <ul className="grid gap-2">
      {props.posts.map((post) => (
        <li key={post.id}>
          <PostCard commentCount={props.commentCount?.(post.id)} post={post} />
        </li>
      ))}
    </ul>
  );
}

export function CommentCount(props: { readonly count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      · <MessageSquare aria-hidden className="size-3" />
      {props.count === 1 ? '1 comment' : `${props.count} comments`}
    </span>
  );
}

/** Waits inside the card, so the article shows before its count. */
export function CommentCountSlot(props: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-3 w-20" />}>
      {props.children}
    </Suspense>
  );
}

function CommentCountFromHandle(props: {
  readonly counts: unstable_inferQueryHandle<TRPC['post']['commentCounts']>;
  readonly postId: number;
}) {
  const trpc = useTRPC();
  const countsQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.counts));
  return <CommentCount count={countsQuery.data[props.postId] ?? 0} />;
}

export function PostList(props: {
  readonly counts: unstable_inferQueryHandle<TRPC['post']['commentCounts']>;
  readonly posts: unstable_inferQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.posts));
  return (
    <PostCards
      commentCount={(postId) => (
        <CommentCountSlot>
          <CommentCountFromHandle counts={props.counts} postId={postId} />
        </CommentCountSlot>
      )}
      posts={postsQuery.data}
    />
  );
}

export function PostListSkeleton(props: { readonly count?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: props.count ?? 3 }, (_, row) => (
        <Skeleton className="h-[4.75rem] w-full rounded-lg" key={row} />
      ))}
    </div>
  );
}

/** Links to each page of the list, so the page is in the URL. */
export function Pager(props: { readonly page: number }) {
  return (
    <nav aria-label="Pages" className="flex items-center gap-1 text-xs">
      <span className="mr-1 text-muted-foreground">Page</span>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map(
        (page) => (
          <DemoLink
            aria-current={page === props.page ? 'page' : undefined}
            className="grid size-7 place-items-center rounded-md border bg-background font-medium outline-none transition-colors hover:border-link hover:text-link focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current=page]:border-link aria-[current=page]:bg-accent aria-[current=page]:text-link motion-reduce:transition-none"
            href={`/posts?page=${page}`}
            key={page}
          >
            {page}
          </DemoLink>
        ),
      )}
    </nav>
  );
}

export function MoreByAuthorList(props: {
  readonly more: {
    readonly author: string;
    readonly posts: ReadonlyArray<PostSummary>;
  };
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="grid gap-2 border-t pt-3">
      <h4
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        id={heading}
      >
        <UserRound className="size-3.5" /> More by {props.more.author}
      </h4>
      <PostCards posts={props.more.posts} />
    </section>
  );
}

export function MoreByAuthorSkeleton() {
  return (
    <div className="grid gap-2 border-t pt-3">
      <Skeleton className="h-4 w-28" />
      <PostListSkeleton count={2} />
    </div>
  );
}

/** The author's other posts, as links. Its query starts from the URL too. */
export function MoreByAuthor(props: {
  readonly more: unstable_inferQueryHandle<TRPC['post']['moreByAuthor']>;
}) {
  const trpc = useTRPC();
  const moreQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.more));
  return <MoreByAuthorList more={moreQuery.data} />;
}

export function NotFound() {
  return <p className="text-muted-foreground">Not found.</p>;
}
