import NextError from 'next/error';
import { useRouter } from 'next/router';
import { NextPageWithLayout } from '~/pages/_app';
import { RouterOutput, trpc } from '~/utils/trpc';

type PostByIdOutput = RouterOutput['post']['byId'];

function PostItem(props: { post: PostByIdOutput }) {
  const { post } = props;
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
  const postQuery = trpc.post.byId.useQuery({ id });

  if (postQuery.error) {
    return (
      <NextError
        title={postQuery.error.message}
        statusCode={postQuery.error.data?.httpStatus ?? 500}
      />
    );
  }

  if (postQuery.status !== 'success') {
    return <>Loading...</>;
  }
  const { data } = postQuery;
  return <PostItem post={data} />;
};

export default PostViewPage;
