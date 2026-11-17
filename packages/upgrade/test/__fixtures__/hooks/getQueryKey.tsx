import { getQueryKey } from '@trpc/react-query';
import { trpc } from './getQueryKey.trpc';

export function useKeys() {
  return [
    getQueryKey(trpc.post.list),
    getQueryKey(trpc.post.byId, { id: 1 }),
    getQueryKey(trpc.post.byId, { id: 1 }, 'query'),
    getQueryKey(trpc.post.list, undefined, 'infinite'),
  ];
}
