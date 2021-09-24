import { useRouter } from 'next/dist/client/router';
import { trpc } from 'utils/trpc';

export default function PostViewPage() {
  const id = useRouter().query.id as string;
  const postQuery = trpc.useQuery(['post.byId', id]);

  const { data } = postQuery;
  if (!data) {
    return <>Imagine error/loading state handling here</>;
  }
  return (
    <>
      <h1>{data.title}</h1>
      <p>{data.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(data, null, 4)}</pre>
    </>
  );
}
