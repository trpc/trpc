import type { inferRouterInputs } from '@trpc/server';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import {
  useFateClient,
  useListView,
  useRequest,
  useView,
  type ViewRef,
  view,
} from 'react-fate';
import type { Feed, Post } from '~/server/routers/_app';
import type { NextPageWithLayout } from './_app';

type AppRouter = import('~/server/routers/_app').AppRouter;
type AddPostInput = Omit<inferRouterInputs<AppRouter>['post']['add'], 'select'>;

const PostListItemView = view<Post>()({
  id: true,
  title: true,
});

const FeedPostsConnection = {
  args: {
    first: 5,
  },
  items: {
    cursor: true,
    node: PostListItemView,
  },
  pagination: {
    hasNext: true,
    hasPrevious: true,
    nextCursor: true,
    previousCursor: true,
  },
} as const;

const FeedView = view<Feed>()({
  id: true,
  posts: FeedPostsConnection,
});

function PostListItem({ postRef }: { postRef: ViewRef<'Post'> }) {
  const post = useView(PostListItemView, postRef);

  if (!post) {
    return null;
  }

  return (
    <article>
      <h3 className="text-2xl font-semibold">{post.title}</h3>
      <Link className="text-gray-400" href={`/post/${post.id}`}>
        View more
      </Link>
    </article>
  );
}

function IndexContent() {
  const fate = useFateClient();
  const [isAddingPost, setIsAddingPost] = useState(false);
  const [addPostError, setAddPostError] = useState<string | null>(null);
  const { feed } = useRequest({
    feed: {
      view: FeedView,
    },
  });
  const feedData = useView(FeedView, feed);
  const [posts, loadNext] = useListView(FeedPostsConnection, feedData.posts);

  return (
    <div className="flex flex-col bg-gray-800 py-8">
      <h1 className="text-4xl font-bold">
        Welcome to your tRPC with Prisma starter!
      </h1>
      <p className="text-gray-400">
        If you get stuck, check{' '}
        <Link className="underline" href="https://trpc.io">
          the docs
        </Link>
        , write a message in our{' '}
        <Link className="underline" href="https://trpc.io/discord">
          Discord-channel
        </Link>
        , or write a message in{' '}
        <Link
          className="underline"
          href="https://github.com/trpc/trpc/discussions"
        >
          GitHub Discussions
        </Link>
        .
      </p>

      <div className="flex flex-col py-8 items-start gap-y-2">
        <div className="flex flex-col"></div>
        <h2 className="text-3xl font-semibold">Latest Posts</h2>

        <button
          className="bg-gray-900 p-2 rounded-md font-semibold disabled:bg-gray-700 disabled:text-gray-400"
          onClick={() => {
            if (!loadNext) {
              return;
            }
            void loadNext();
          }}
          disabled={!loadNext}
        >
          {loadNext ? 'Load More' : 'Nothing more to load'}
        </button>

        {posts.map(({ cursor, node }) => (
          <PostListItem key={cursor ?? node.id} postRef={node} />
        ))}
      </div>

      <hr />

      <div className="flex flex-col py-8 items-center">
        <h2 className="text-3xl font-semibold pb-2">Add a Post</h2>

        <form
          className="py-2 w-4/6"
          onSubmit={async (e) => {
            /**
             * In a real app you probably don't want to use this manually
             * Checkout React Hook Form - it works great with tRPC
             * @see https://react-hook-form.com/
             * @see https://kitchen-sink.trpc.io/react-hook-form
             */
            e.preventDefault();
            const $form = e.currentTarget;
            const values = Object.fromEntries(new FormData($form));
            const input: AddPostInput = {
              title: values.title as string,
              text: values.text as string,
            };
            try {
              setIsAddingPost(true);
              setAddPostError(null);
              const result = await fate.mutations.post.add({
                input,
                insert: 'before',
                view: PostListItemView,
              });

              if (result.error) {
                setAddPostError(result.error.message);
                return;
              }

              $form.reset();
            } catch (cause) {
              console.error({ cause }, 'Failed to add post');
              setAddPostError('Failed to add post');
            } finally {
              setIsAddingPost(false);
            }
          }}
        >
          <div className="flex flex-col gap-y-4 font-semibold">
            <input
              className="focus-visible:outline-dashed outline-offset-4 outline-2 outline-gray-700 rounded-xl px-4 py-3 bg-gray-900"
              id="title"
              name="title"
              type="text"
              placeholder="Title"
              disabled={isAddingPost}
            />
            <textarea
              className="resize-none focus-visible:outline-dashed outline-offset-4 outline-2 outline-gray-700 rounded-xl px-4 py-3 bg-gray-900"
              id="text"
              name="text"
              placeholder="Text"
              disabled={isAddingPost}
              rows={6}
            />

            <div className="flex justify-center">
              <input
                className="cursor-pointer bg-gray-900 p-2 rounded-md px-16"
                type="submit"
                disabled={isAddingPost}
              />
              {addPostError && <p style={{ color: 'red' }}>{addPostError}</p>}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function IndexFallback() {
  return (
    <div className="flex flex-col bg-gray-800 py-8">
      <h1 className="text-4xl font-bold">Welcome to your tRPC with Prisma starter!</h1>
      <div className="flex flex-col py-8 items-start gap-y-4">
        <div className="h-10 w-48 rounded-md bg-zinc-900/70 animate-pulse"></div>
        <div className="h-20 w-full rounded-md bg-zinc-900/70 animate-pulse"></div>
        <div className="h-20 w-full rounded-md bg-zinc-900/70 animate-pulse"></div>
      </div>
    </div>
  );
}

const IndexPage: NextPageWithLayout = () => {
  return (
    <ErrorBoundary fallback={<IndexFallback />}>
      <Suspense fallback={<IndexFallback />}>
        <IndexContent />
      </Suspense>
    </ErrorBoundary>
  );
};

export default IndexPage;

/**
 * If you want to statically render this page
 * - Export `appRouter` & `createContext` from [trpc].ts
 * - Make the `opts` object optional on `createContext()`
 *
 * @see https://trpc.io/docs/v11/ssg
 */
// export const getStaticProps = async (
//   context: GetStaticPropsContext<{ filter: string }>,
// ) => {
//   const ssg = createServerSideHelpers({
//     router: appRouter,
//     ctx: await createContext(),
//   });
//
//   await ssg.post.all.fetch();
//
//   return {
//     props: {
//       trpcState: ssg.dehydrate(),
//       filter: context.params?.filter ?? 'all',
//     },
//     revalidate: 1,
//   };
// };
