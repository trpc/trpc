import { trpc } from 'utils/trpc';

const batchingIds = [
  '00000000-0000-1000-a000-000000000000',
  '00000000-0000-1000-a000-000000000001',
  '00000000-0000-1000-a000-000000000002',
];
export default function Batching() {
  const postIndex0 = trpc.useQuery(['posts.byId', batchingIds[0]]);
  const postIndex1 = trpc.useQuery(['posts.byId', batchingIds[1]]);
  const postIndex2 = trpc.useQuery(['posts.byId', batchingIds[2]]);
  const utils = trpc.useContext();
  const scaffoldMutation = trpc.useMutation('posts.add', {
    onSuccess(data) {
      return utils.prefetchQuery(['posts.byId', data.id]);
    },
  });

  return (
    <>
      <h1>Illustrate batching in tRPC</h1>
      <p>❗ Check inspector and terminal for batching magic ❗</p>
      <ul>
        <li>
          Will do exactly <strong>one</strong> HTTP call &amp;{' '}
          <strong>one</strong> <code>SELECT</code> for fetching all the posts
          even if we have individual queries
        </li>
        <li>
          Will do exactly <strong>one</strong> HTTP call &amp; and{' '}
          <strong>one</strong> <code>INSERT</code> when adding the posts even if
          we have individual mutation calls.
        </li>
      </ul>
      {postIndex0.data && (
        <>
          <h2>Loaded posts</h2>
          <pre>
            {JSON.stringify(
              [postIndex0.data, postIndex1.data, postIndex2.data],
              null,
              2,
            )}
          </pre>
        </>
      )}
      {!postIndex0.data && !postIndex0.isLoading && (
        <>
          <button
            disabled={scaffoldMutation.isLoading}
            onClick={() => {
              batchingIds.map((id, index) => {
                scaffoldMutation.mutate({
                  id,
                  title: `Scaffoleded post ${index + 1}`,
                  text: 'n/a',
                });
              });
            }}
          >
            Scaffold some posts
          </button>
        </>
      )}
    </>
  );
}
