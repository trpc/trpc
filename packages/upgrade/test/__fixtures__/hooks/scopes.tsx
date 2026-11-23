import { useQueryClient as useQC } from '@tanstack/react-query';
import * as React from 'react';
import { trpc } from './basic.trpc';

export function Component(props: { queryClient: unknown }) {
  const utils = trpc.useUtils();
  const refresh = React.useCallback(() => {
    void utils.post.list.invalidate();
  }, [utils]);
  {
    const utils = { post: { list: { getData: () => [] } } };
    utils.post.list.getData();
  }
  return [props, refresh, useQC];
}

export function Component2({ queryClient }: { queryClient: unknown }) {
  const utils = trpc.useUtils();
  void utils.post.list.invalidate();
  return queryClient;
}

export function Component3({ flag }: { flag: boolean }) {
  {
    // Declared in a block: its own declaration doesn't shadow it
    const utils = trpc.useUtils();
    void utils.post.list.invalidate();
  }
  if (flag) {
    // `utils` is a key here, not a binding
    const { utils: other } = { utils: 1 };
    void other;
  }
  return null;
}

export function Component4() {
  const utils = trpc.useUtils();
  if (Math.random() > 0.5) {
    // `utils` is a key here, not a binding
    const { utils: other } = { utils: 1 };
    void other;
    void utils.post.list.invalidate();
  }
  return null;
}

export function Component5() {
  // Unused: removed, not turned into an unused `useQueryClient()`
  const utils = trpc.useUtils();
  return trpc.post.list.useQuery().data;
}

export function Component6(clients: unknown[], other: unknown) {
  {
    // An outer `utils` doesn't hide the inner one
    const utils = other;
    {
      const utils = trpc.useUtils();
      void utils.post.list.invalidate();
    }
    void utils;
  }
  return null;
}

export function Component7(clients: unknown[]) {
  const utils = trpc.useUtils();
  // The loop's own `utils` is something else
  for (const utils of clients) {
    void utils;
  }
  void utils.post.list.invalidate();
  return null;
}
