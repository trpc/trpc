import { useRouter } from 'next/router';
import { NextPageWithLayout } from '~/pages/_app';
import { RouterInput, trpc } from '~/utils/trpc';
import { ErrorBoundary } from '~/components/ErrorBoundary';
function PostItem(props: { id: string }) {
  const [post] = trpc.post.byId.useSuspenseQuery(props, {
    refetchOnMount: false,
    cacheTime: Infinity,
  });
  return (
    <>
      <h1>{post.title}</h1>
      <em>Created {post.createdAt.toLocaleDateString('en-us')}</em>

      <p>{post.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(post, null, 4)}</pre>
    </>
  );
}

const PostViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;

  return (
    <ErrorBoundary>
      <PostItem id={id} />
    </ErrorBoundary>
  );
};

export default PostViewPage;
