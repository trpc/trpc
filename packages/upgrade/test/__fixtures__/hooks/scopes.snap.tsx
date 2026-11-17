import { useQueryClient as useQC } from '@tanstack/react-query';
import * as React from 'react';
import { useTRPC } from './basic.trpc';

export function Component(props: { queryClient: unknown }) {
  const trpc = useTRPC();
  const queryClient = useQC();
  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries(trpc.post.list.pathFilter());
  }, [trpc, queryClient]);
  {
    const utils = { post: { list: { getData: () => [] } } };
    utils.post.list.getData();
  }
  return [props, refresh, useQC];
}

export function Component2({ queryClient }: { queryClient: unknown }) {
  const trpc = useTRPC();
  const queryClient2 = useQC();
  void queryClient2.invalidateQueries(trpc.post.list.pathFilter());
  return queryClient;
}
