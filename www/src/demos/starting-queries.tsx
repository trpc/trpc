import {
  createRootRouteWithContext,
  createRoute,
} from '@tanstack/react-router';
import { type ReactNode, Suspense } from 'react';

import {
  Comments,
  CommentsSection,
  CommentsSkeleton,
  NotFound,
  Post,
  PostList,
  PostListSkeleton,
  PostSkeleton,
} from './kit/blog.tsx';
import {
  type DemoContext,
  DemoBrowser,
  DemoLink,
  useDemoLoaderData,
} from './kit/browser.tsx';
import { DemoFrame } from './kit/frame.tsx';
import { staleTime } from './kit/session.tsx';
import type { DemoProps } from './names.ts';

type Verb = 'ensure' | 'fetch' | 'prefetch';

/** A blog whose loaders start every query with `verb`. */
function createBlog(verb: Verb) {
  const loadList = async (args: { readonly context: DemoContext }) => {
    const trpc = args.context.trpc;
    switch (verb) {
      case 'prefetch':
        return { posts: trpc.post.list.unstable_$prefetch() };
      case 'ensure':
        return { posts: await trpc.post.list.unstable_$ensure() };
      case 'fetch':
        return { posts: await trpc.post.list.unstable_$fetch() };
    }
  };

  const loadPost = async (args: {
    readonly context: DemoContext;
    readonly params: { readonly id: string };
  }) => {
    const trpc = args.context.trpc;
    const id = Number(args.params.id);
    switch (verb) {
      case 'prefetch':
        return {
          comments: trpc.post.comments.unstable_$prefetch({ postId: id }),
          post: trpc.post.byId.unstable_$prefetch({ id }),
        };
      case 'ensure': {
        const [post, comments] = await Promise.all([
          trpc.post.byId.unstable_$ensure({ id }),
          trpc.post.comments.unstable_$ensure({ postId: id }),
        ]);
        return { comments, post };
      }
      case 'fetch': {
        const [post, comments] = await Promise.all([
          trpc.post.byId.unstable_$fetch({ id }),
          trpc.post.comments.unstable_$fetch({ postId: id }),
        ]);
        return { comments, post };
      }
    }
  };

  function ListPage(): ReactNode {
    const data = useDemoLoaderData<typeof loadList>();
    return (
      <div className="grid gap-2">
        <h3 className="text-base font-semibold">Posts</h3>
        <Suspense fallback={<PostListSkeleton />}>
          <PostList posts={data.posts} />
        </Suspense>
      </div>
    );
  }

  function PostPage(): ReactNode {
    const data = useDemoLoaderData<typeof loadPost>();
    return (
      <div className="grid gap-4">
        <DemoLink href="/posts">← All posts</DemoLink>
        <Suspense fallback={<PostSkeleton />}>
          <Post post={data.post} />
        </Suspense>
        <CommentsSection>
          <Suspense fallback={<CommentsSkeleton />}>
            <Comments comments={data.comments} />
          </Suspense>
        </CommentsSection>
      </div>
    );
  }

  const root = createRootRouteWithContext<DemoContext>()({
    notFoundComponent: NotFound,
  });
  return root.addChildren([
    createRoute({
      component: ListPage,
      getParentRoute: () => root,
      loader: loadList,
      path: '/posts',
    }),
    createRoute({
      component: PostPage,
      getParentRoute: () => root,
      loader: loadPost,
      path: '/posts/$id',
    }),
  ]);
}

const blogs = {
  ensure: createBlog('ensure'),
  fetch: createBlog('fetch'),
  prefetch: createBlog('prefetch'),
} satisfies Record<Verb, unknown>;

const code = (text: string) => <span className="font-mono">{text}</span>;

/** `unstable_$prefetch`, `$ensure` and `$fetch`, in the loaders of one blog. */
export function StartingQueries(props: DemoProps) {
  return (
    <DemoFrame
      hint={`Open a post, go back, and open it again. Within ${staleTime / 1000} seconds, all three use the cache. After that, the data is stale.`}
      initial={props.options['variant']}
      only={props.options['variants']}
      title="Start queries in a loader"
      variants={[
        {
          description:
            'The page shows at once, with skeletons until the data comes in. Stale data shows at once and refetches.',
          label: code('$prefetch'),
          value: 'prefetch',
        },
        {
          description:
            'The page waits for the data on the first visit. Stale data shows at once and refetches.',
          label: code('$ensure'),
          value: 'ensure',
        },
        {
          description:
            'The page waits for the data, and waits again for a refetch when the data is stale.',
          label: code('$fetch'),
          value: 'fetch',
        },
      ]}
      variantsLabel="The loaders use"
    >
      {(run) => (
        <DemoBrowser
          initial={run.location ?? '/posts'}
          reload={run.reload}
          routeTree={blogs[run.variant]}
          session={run.session}
        />
      )}
    </DemoFrame>
  );
}
