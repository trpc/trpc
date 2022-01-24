import { useRouter } from 'next/router';
import { NextPageWithLayout } from 'pages/_app';
import { useSuspenseQuery } from 'utils/useSuspenseQuery';

const PostViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const [post] = useSuspenseQuery(['post.byId', { id }]);

  return (
    <>
      <h1>{post.title}</h1>
      <em>Created {post.createdAt.toLocaleDateString()}</em>

      <p>{post.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(post, null, 4)}</pre>
    </>
  );
};

export default PostViewPage;
