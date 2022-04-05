import { useRouter } from 'next/router';
import { DefaultQueryCell } from '~/components/DefaultQueryCell';
import { NextPageWithLayout } from '~/pages/_app';
import { trpc } from '~/utils/trpc';

const PostViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const postQuery = trpc.useQuery(['post.byId', { id }]);

  return (
    <DefaultQueryCell
      query={postQuery}
      success={({ data }) => (
        <>
          <h1>{data.title}</h1>
          <em>Created {data.createdAt.toLocaleDateString()}</em>

          <p>{data.text}</p>

          <h2>Raw data:</h2>
          <pre>{JSON.stringify(data, null, 4)}</pre>
        </>
      )}
    />
  );
};

export default PostViewPage;
