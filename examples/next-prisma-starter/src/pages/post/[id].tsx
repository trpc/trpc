import { useRouter } from 'next/router';
import { trpc } from 'utils/trpc';
import NextError from 'next/error';
import { Layout } from 'components/Layout';
import { ReactElement } from 'react';

export default function PostViewPage() {
  const id = useRouter().query.id as string;
  const postQuery = trpc.useQuery(['post.byId', { id }]);

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
  return (
    <>
      <h1>{data.title}</h1>
      <em>Created {data.createdAt.toLocaleDateString()}</em>

      <p>{data.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(data, null, 4)}</pre>
    </>
  );
}

PostViewPage.getLayout = (page: ReactElement) => <Layout>{page}</Layout>;
