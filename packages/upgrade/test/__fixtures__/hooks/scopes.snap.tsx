import { useQueryClient as useQC, useQuery } from '@tanstack/react-query';
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

export function Component3({ flag }: { flag: boolean }) {
  const trpc = useTRPC();
  {
    // Declared in a block: its own declaration doesn't shadow it
    const queryClient = useQC();
    void queryClient.invalidateQueries(trpc.post.list.pathFilter());
  }
  if (flag) {
    // `utils` is a key here, not a binding
    const { utils: other } = { utils: 1 };
    void other;
  }
  return null;
}

export function Component4() {
  const trpc = useTRPC();
  const queryClient = useQC();
  if (Math.random() > 0.5) {
    // `utils` is a key here, not a binding
    const { utils: other } = { utils: 1 };
    void other;
    void queryClient.invalidateQueries(trpc.post.list.pathFilter());
  }
  return null;
}

export function Component5() {
  const trpc = useTRPC();
  return useQuery(trpc.post.list.queryOptions()).data;
}

export function Component6(clients: unknown[], other: unknown) {
  const trpc = useTRPC();
  {
    // An outer `utils` doesn't hide the inner one
    const utils = other;
    {
      const queryClient = useQC();
      void queryClient.invalidateQueries(trpc.post.list.pathFilter());
    }
    void utils;
  }
  return null;
}

export function Component7(clients: unknown[]) {
  const trpc = useTRPC();
  const queryClient = useQC();
  // The loop's own `utils` is something else
  for (const utils of clients) {
    void utils;
  }
  void queryClient.invalidateQueries(trpc.post.list.pathFilter());
  return null;
}
