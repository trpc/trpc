import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTRPC } from './withInvalidate.trpc';

export function Component() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const mutation = useMutation(
    trpc.post.create.mutationOptions({
      onSettled: () => {
        queryClient.invalidateQueries(trpc.post.pathFilter());
        queryClient.invalidateQueries(trpc.post.list.pathFilter());
        queryClient.invalidateQueries(
          trpc.post.x.y.z.longPropName.pathFilter(),
        );

        // eslint-disable-next-line @typescript-eslint/dot-notation
        queryClient.invalidateQueries(trpc['post'].pathFilter());

        queryClient.invalidateQueries(trpc.post.byId.queryFilter({ id: 1 }));

        queryClient.invalidateQueries(
          trpc.post.list.infiniteQueryFilter({ cursor: 1 }),
        );

        queryClient.invalidateQueries(trpc.post.list.pathFilter({}));

        queryClient.invalidateQueries(
          trpc.post.pathFilter({
            predicate: (query) => query.state.status !== 'pending',
          }),
        );
      },
    }),
  );

  return (
    <button data-testid="mutate" onClick={() => mutation.mutate({ id: 1 })} />
  );
}
