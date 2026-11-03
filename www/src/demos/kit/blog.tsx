import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { ChevronRight, MessageSquare, UserRound } from 'lucide-react';
import { type ReactNode, Suspense, useId, useState } from 'react';

import { Button } from '@shared/ui/components/button';
import { Skeleton } from '@shared/ui/components/skeleton';

import { DemoLink } from './browser.tsx';
import { type TRPC, useNetwork, useTRPC } from './session.tsx';

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
function PostCard(props: { readonly post: PostSummary }) {
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
        <span className="text-[0.7rem] text-muted-foreground">
          {post.author} · {post.minutes} min read
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link motion-reduce:transition-none"
      />
    </DemoLink>
  );
}

function PostCards(props: { readonly posts: ReadonlyArray<PostSummary> }) {
  return (
    <ul className="grid gap-2">
      {props.posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}

export function PostList(props: {
  readonly posts: unstable_inferQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.posts));
  return <PostCards posts={postsQuery.data} />;
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

function AuthorPosts(props: {
  readonly posts: unstable_inferQueryHandle<TRPC['post']['byAuthor']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.posts));
  return <PostCards posts={postsQuery.data} />;
}

/**
 * The author's other posts, on demand. Hovering or focusing the button
 * starts the query, and clicking it keeps the handle and reads it, so the
 * list is often ready by the click.
 */
export function MoreByAuthor(props: {
  readonly post: unstable_inferQueryHandle<TRPC['post']['byId']>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const network = useNetwork();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  const [morePosts, setMorePosts] = useState<unstable_inferQueryHandle<
    TRPC['post']['byAuthor']
  > | null>(null);
  const heading = useId();
  const author = postQuery.data.author;
  const input = {
    authorId: postQuery.data.authorId,
    exclude: postQuery.data.id,
  };
  const start = () => {
    if (
      queryClient.getQueryState(trpc.post.byAuthor.queryKey(input)) ===
      undefined
    ) {
      network.begin(`More by ${author}`);
    }
    return trpc.post.byAuthor.unstable_$prefetch(input);
  };

  return (
    <section aria-labelledby={heading} className="grid gap-2 border-t pt-3">
      <h4
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        id={heading}
      >
        <UserRound className="size-3.5" /> More by {author}
      </h4>
      {morePosts ? (
        <Suspense fallback={<PostListSkeleton count={2} />}>
          <AuthorPosts posts={morePosts} />
        </Suspense>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            onClick={() => setMorePosts(start())}
            onFocus={start}
            onPointerEnter={start}
            size="sm"
            variant="outline"
          >
            Show more by {author}
          </Button>
          <span className="text-xs text-muted-foreground">
            Hovering it calls{' '}
            <code className="font-mono">unstable_$prefetch</code>, so the
            request starts before you click. The click reads the handle.
          </span>
        </div>
      )}
    </section>
  );
}

export function NotFound() {
  return <p className="text-muted-foreground">Not found.</p>;
}
