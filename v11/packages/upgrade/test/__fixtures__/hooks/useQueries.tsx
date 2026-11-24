import { trpc } from './useQueries.trpc';

export function Component() {
  const queries = trpc.useQueries((t) => [
    t.post.byId({ id: 1 }),
    t.num(2, { staleTime: 1000 }),
  ]);
  const ids = [1, 2];
  const byIds = trpc.useQueries((t) => ids.map((id) => t.post.byId({ id })));

  return [...queries, ...byIds].every((query) => query.data !== undefined)
    ? 'loaded'
    : 'loading';
}
