import * as React from 'react';
import { trpc } from './withInvalidate.trpc';

export function Component() {
  const utils = trpc.useUtils();

  const mutation = trpc.post.create.useMutation({
    onSettled: () => {
      utils.post.invalidate();
      utils.post.list.invalidate();
      utils.post.x.y.z.longPropName.invalidate();

      // eslint-disable-next-line @typescript-eslint/dot-notation
      utils['post'].invalidate();

      utils.post.byId.invalidate({ id: 1 });

      utils.post.list.invalidate({ cursor: 1 });

      utils.post.list.invalidate(undefined, {});

      utils.post.invalidate(undefined, {
        predicate: (query) => query.state.status !== 'pending',
      });
    },
  });

  return (
    <button data-testid="mutate" onClick={() => mutation.mutate({ id: 1 })} />
  );
}
