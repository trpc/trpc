'use client';

import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { useAction } from '~/trpc/client';
import { createPostAction } from './_actions';

export function WithHook() {
  const action = useAction(createPostAction);

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await action.mutateAsync(new FormData(e.currentTarget));
        (e.target as HTMLFormElement).reset();
      }}
    >
      <Input type="text" name="title" placeholder="title" />
      <Input type="text" name="content" placeholder="content" />
      <Button type="submit">
        {action.status === 'loading' && (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-gray-900"></div>
        )}
        Create with useAction
      </Button>
    </form>
  );
}
