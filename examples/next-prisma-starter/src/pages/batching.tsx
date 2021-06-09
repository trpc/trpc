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

  if (!postIndex0.data) {
    return postIndex0.isLoading ? (
      <>...</>
    ) : (
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
    );
  }
  return (
    <>
      <h3>Scaffolded posts</h3>
      <p>Check inspector for batching magic</p>
      <ul>
        <li>
          Will do exactly <strong>1</strong> HTTP call &amp; <strong>1</strong>{' '}
          DB query for fetching the posts
        </li>
        <li>
          Will do exactly <strong>1</strong> HTTP call &amp; <strong>1</strong>{' '}
          DB query when adding the posts.
        </li>
      </ul>
      <pre>
        {JSON.stringify(
          [postIndex0.data, postIndex1.data, postIndex2.data],
          null,
          2,
        )}
      </pre>
    </>
  );
}
