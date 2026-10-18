import {
  QueryClientProvider,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router.ts';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function App(props: {
  client: TRPCClient<AppRouter>;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={props.queryClient}>
      <TRPCProvider trpcClient={props.client} queryClient={props.queryClient}>
        <Posts />
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function Posts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const posts = useSuspenseQuery(trpc.post.list.queryOptions());
  const first = useSuspenseQuery(trpc.post.byId.queryOptions({ id: '1' }));
  const add = useMutation(
    trpc.post.add.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.post.pathKey() }),
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
