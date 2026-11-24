import { useQuery as useRQQuery } from '@tanstack/react-query';
import { trpc } from './basic.trpc';

export function Component() {
  const queries = ['a'];
  const utils = trpc.useUtils(),
    count = queries.length;
  const [data] = trpc.useSuspenseQueries((t) => [t.num(1)]);
  const passed = trpc.useQueries((t) => buildQueries(t));
  const list = trpc.post.list.useQuery();

  function refresh(utils: { post: { list: { invalidate: () => void } } }) {
    utils.post.list.invalidate();
  }

  return [
    utils.post.list.getData(),
    count,
    data,
    passed,
    list,
    refresh,
    useRQQuery,
  ];
}

declare function buildQueries(t: unknown): never[];
