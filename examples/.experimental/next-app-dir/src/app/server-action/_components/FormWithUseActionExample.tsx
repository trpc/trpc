'use client';

import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { JsonPreTag } from '~/components/json-pretag';
import { useAction } from 'trpc-api';
import { testAction } from '../_actions';

export function FormWithUseActionExample() {
  const mutation = useAction(testAction);
  return (
    <div className="space-y-2">
      <p>Check the console for the logger output.</p>
      <form
        action={testAction}
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          mutation.mutate(formData);
        }}
        className="space-y-2"
      >
        <Input type="text" name="text" />
        <Button type="submit">Run server action raw debugging</Button>

        <JsonPreTag object={mutation} />
      </form>
    </div>
  );
}
