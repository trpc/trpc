import {
  useQuery as useRQQuery,
  useQueryClient,
  useSuspenseQueries,
} from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';

export function Component() {
  const trpc = useTRPC();
  const queries = ['a'];
  const queryClient = useQueryClient(),
    count = queries.length;

  const queries2 = useSuspenseQueries({
    queries: [trpc.num.queryOptions(1)],
  });

  const data = queries2.map((query) => query.data);
  // TODO(@trpc/upgrade): rewrite `trpc.useQueries` as `useQueries({ queries: [trpc.x.queryOptions(input)] })`, see https://trpc.io/docs/client/tanstack-react-query/migrating
  const passed = trpc.useQueries((t) => buildQueries(t));
  const list = useRQQuery(trpc.post.list.queryOptions());

  function refresh(utils: { post: { list: { invalidate: () => void } } }) {
    utils.post.list.invalidate();
  }

  return [
    queryClient.getQueryData(trpc.post.list.queryKey()),
    count,
    data,
    passed,
    list,
    refresh,
    useRQQuery,
  ];
}

declare function buildQueries(t: unknown): never[];
