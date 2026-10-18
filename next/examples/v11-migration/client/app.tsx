import {
  QueryClientProvider,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import type { Client } from './client.ts';

export const [TrpcProvider, useTrpc] = createTrpcContext<Client>();

export function App(props: { client: Client; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={props.queryClient}>
      <TrpcProvider client={props.client}>
        <Posts />
      </TrpcProvider>
    </QueryClientProvider>
  );
}

function Posts() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const posts = useSuspenseQuery(trpc.post.list.queryOptions());
  const first = useSuspenseQuery(
    trpc.post.byId.queryOptions({ input: { id: '1' } }),
  );
  const add = useMutation(
    trpc.post.add.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
    }),
  );
  return (
    <main>
      <h1>{first.data.title}</h1>
      <ul>
        {posts.data.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <button onClick={() => add.mutate({ title: 'Another post' })}>Add</button>
    </main>
  );
}
