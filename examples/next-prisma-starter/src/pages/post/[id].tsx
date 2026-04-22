import NextError from 'next/error';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Suspense } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useRequest, useView, view } from 'react-fate';
import type { NextPageWithLayout } from '~/pages/_app';
import type { Post } from '~/server/routers/_app';
import type { ViewRef } from 'react-fate';

const PostDetailView = view<Post>()({
  createdAt: true,
  id: true,
  text: true,
  title: true,
  updatedAt: true,
});

function PostItem(props: { postRef: ViewRef<'Post'> }) {
  const post = useView(PostDetailView, props.postRef);
  return (
    <div className="flex flex-col justify-center h-full px-8 ">
      <Link className="text-gray-300 underline mb-4" href="/">
        Home
      </Link>
      <h1 className="text-4xl font-bold">{post.title}</h1>
      <em className="text-gray-400">
        Created {new Date(post.createdAt).toLocaleDateString('en-us')}
      </em>

      <p className="py-4 break-all">{post.text}</p>

      <h2 className="text-2xl font-semibold py-2">Raw data:</h2>
      <pre className="bg-gray-900 p-4 rounded-xl overflow-x-scroll">
        {JSON.stringify(post, null, 4)}
      </pre>
    </div>
  );
}

function PostDetailContent({ id }: { id: string }) {
  const { post } = useRequest(
    {
      post: {
        id,
        view: PostDetailView,
      },
    },
    {
      mode: 'stale-while-revalidate',
    },
  );

  return <PostItem postRef={post} />;
}

function PostLoadingState() {
  return (
    <div className="flex flex-col justify-center h-full px-8 ">
      <div className="w-full bg-zinc-900/70 rounded-md h-10 animate-pulse mb-2"></div>
      <div className="w-2/6 bg-zinc-900/70 rounded-md h-5 animate-pulse mb-8"></div>

      <div className="w-full bg-zinc-900/70 rounded-md h-40 animate-pulse"></div>
    </div>
  );
}

function PostErrorBoundary({ error }: FallbackProps) {
  const message =
    error instanceof Error ? error.message : 'Something went wrong';
  const maybeStatus =
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'httpStatus' in error.data &&
    typeof error.data.httpStatus === 'number'
      ? error.data.httpStatus
      : 500;

  return <NextError statusCode={maybeStatus} title={message} />;
}

const PostViewPage: NextPageWithLayout = () => {
  const rawId = useRouter().query.id;
  const id = typeof rawId === 'string' ? rawId : '';

  if (!id) {
    return <PostLoadingState />;
  }

  return (
    <ErrorBoundary FallbackComponent={PostErrorBoundary}>
      <Suspense fallback={<PostLoadingState />}>
        <PostDetailContent id={id} />
      </Suspense>
    </ErrorBoundary>
  );
};

export default PostViewPage;
