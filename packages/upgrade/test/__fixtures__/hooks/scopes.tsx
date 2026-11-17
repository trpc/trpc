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
