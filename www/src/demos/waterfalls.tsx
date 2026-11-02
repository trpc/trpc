import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import {
  createRootRouteWithContext,
  createRoute,
  useParams,
} from '@tanstack/react-router';
import { type ReactNode, Suspense } from 'react';

import { Skeleton } from '@shared/ui/components/skeleton';

import {
  CommentList,
  Comments,
  CommentsSection,
  CommentsSkeleton,
  NotFound,
  Post,
  PostSkeleton,
} from './kit/blog.tsx';
import {
  type DemoContext,
  DemoBrowser,
  DemoLink,
  useDemoLoaderData,
} from './kit/browser.tsx';
import { DemoFrame } from './kit/frame.tsx';
import { type TRPC, useTRPC } from './kit/session.tsx';
import type { DemoProps } from './names.ts';

type Strategy = 'loader' | 'reader' | 'top';

function AuthorSkeleton() {
  return <Skeleton className="h-4 w-28" />;
}

function Byline(props: { readonly name: string }) {
  return <p className="text-xs text-muted-foreground">By {props.name}</p>;
}

function Author(props: {
  readonly author: unstable_inferQueryHandle<TRPC['post']['author']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.author));
  return <Byline name={authorQuery.data.name} />;
}

function OtherPosts(props: { readonly id: number }) {
  return (
    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      Other posts:
      {[1, 2, 3]
        .filter((id) => id !== props.id)
        .map((id) => (
          <DemoLink href={`/posts/${id}`} key={id}>
            Post {id}
          </DemoLink>
        ))}
    </p>
  );
}

function PostLayout(props: {
  readonly author: ReactNode;
  readonly comments: ReactNode;
  readonly id: number;
  readonly post: ReactNode;
}) {
  return (
    <div className="grid gap-3">
      {props.post}
      {props.author}
      <CommentsSection>{props.comments}</CommentsSection>
      <OtherPosts id={props.id} />
    </div>
  );
}

/** Handles in, Suspense boundaries around each reader. */
function PostFromHandles(props: {
  readonly author: unstable_inferQueryHandle<TRPC['post']['author']>;
  readonly comments: unstable_inferQueryHandle<TRPC['post']['comments']>;
  readonly id: number;
  readonly post: unstable_inferQueryHandle<TRPC['post']['byId']>;
}) {
  return (
    <PostLayout
      author={
        <Suspense fallback={<AuthorSkeleton />}>
          <Author author={props.author} />
        </Suspense>
      }
      comments={
        <Suspense fallback={<CommentsSkeleton />}>
          <Comments comments={props.comments} />
        </Suspense>
      }
      id={props.id}
      post={
        <Suspense fallback={<PostSkeleton />}>
          <Post post={props.post} />
        </Suspense>
      }
    />
  );
}

const loadPost = (args: {
  readonly context: DemoContext;
  readonly params: { readonly id: string };
}) => {
  const trpc = args.context.trpc;
  const id = Number(args.params.id);
  return {
    author: trpc.post.author.unstable_$prefetch({ postId: id }),
    comments: trpc.post.comments.unstable_$prefetch({ postId: id }),
    id,
    post: trpc.post.byId.unstable_$prefetch({ id }),
  };
};

function LoaderPage(): ReactNode {
  const data = useDemoLoaderData<typeof loadPost>();
  return <PostFromHandles {...data} />;
}

function usePostId() {
  // The site's registered router doesn't know the demo's `$id`.
  const params: { readonly id?: string } = useParams({ strict: false });
  return Number(params.id);
}

function TopOfPage(): ReactNode {
  const trpc = useTRPC();
  const id = usePostId();
  return (
    <PostFromHandles
      author={trpc.post.author.unstable_$prefetch({ postId: id })}
      comments={trpc.post.comments.unstable_$prefetch({ postId: id })}
      id={id}
      post={trpc.post.byId.unstable_$prefetch({ id })}
    />
  );
}

function AuthorById(props: { readonly id: number }) {
  const trpc = useTRPC();
  const userQuery = useSuspenseQuery(
    trpc.user.byId.queryOptions({ id: props.id }),
  );
  return <Byline name={userQuery.data.name} />;
}

function CommentsByPost(props: { readonly postId: number }) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseQuery(
    trpc.post.comments.queryOptions({ postId: props.postId }),
  );
  return <CommentList comments={commentsQuery.data} />;
}

function PostThenTheRest(props: { readonly id: number }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(
    trpc.post.byId.queryOptions({ id: props.id }),
  );
  return (
    <PostLayout
      author={
        <Suspense fallback={<AuthorSkeleton />}>
          <AuthorById id={postQuery.data.authorId} />
        </Suspense>
      }
      comments={
        <Suspense fallback={<CommentsSkeleton />}>
          <CommentsByPost postId={props.id} />
        </Suspense>
      }
      id={props.id}
      post={
        <article className="grid gap-1">
          <h3 className="text-base font-semibold">{postQuery.data.title}</h3>
          <p className="text-muted-foreground">{postQuery.data.body}</p>
        </article>
      }
    />
  );
}

function ReaderPage(): ReactNode {
  const id = usePostId();
  return (
    <Suspense fallback={<PostSkeleton />}>
      <PostThenTheRest id={id} />
    </Suspense>
  );
}

function createBlog(strategy: Strategy) {
  const root = createRootRouteWithContext<DemoContext>()({
    notFoundComponent: NotFound,
  });
  const post =
    strategy === 'loader'
      ? createRoute({
          component: LoaderPage,
          getParentRoute: () => root,
          loader: loadPost,
          path: '/posts/$id',
        })
      : createRoute({
          component: strategy === 'top' ? TopOfPage : ReaderPage,
          getParentRoute: () => root,
          path: '/posts/$id',
        });
  return root.addChildren([post]);
}

const blogs = {
  loader: createBlog('loader'),
  reader: createBlog('reader'),
  top: createBlog('top'),
} satisfies Record<Strategy, unknown>;

/** Where queries start, and the waterfall you get if they start where they're read. */
export function Waterfalls(props: DemoProps) {
  return (
    <DemoFrame
      hint="Open the other posts, or reload, and watch when each request starts."
      initial={props.options['variant']}
      only={props.options['variants']}
      title="Where the queries start"
      variants={[
        {
          description:
            'The route loader starts all three queries from the URL. One round trip.',
          label: 'the loader',
          value: 'loader',
        },
        {
          description:
            'The page starts all three as it renders, and passes the handles down. One round trip, a little later.',
          label: 'the page',
          value: 'top',
        },
        {
          description:
            "Each component fetches what it shows. The author's id comes from the post, and the comments render inside it, so both wait for the post. Two round trips.",
          label: 'each component',
          value: 'reader',
        },
      ]}
      variantsLabel="Start the queries in"
    >
      {(run) => (
        <DemoBrowser
          initial={run.location ?? '/posts/1'}
          reload={run.reload}
          routeTree={blogs[run.variant]}
          session={run.session}
        />
      )}
    </DemoFrame>
  );
}
