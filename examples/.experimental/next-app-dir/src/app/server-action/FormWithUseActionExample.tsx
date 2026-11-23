'use client';

import { Button } from '@shared/ui/components/button';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { useAction } from 'trpc-api';
import { JsonBlock } from '../_components/json-block';
import { testAction } from './_actions';

export function FormWithUseActionExample() {
  const testMutation = useAction(testAction);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Check the console for the logger output.
      </p>
      <form
        action={testAction as any}
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          testMutation.mutate(formData);
        }}
      >
        <Input type="text" name="text" aria-label="Text" />
        <Button type="submit" disabled={testMutation.status === 'loading'}>
          {testMutation.status === 'loading' && <Spinner />}
          Run server action raw debugging
        </Button>
      </form>
      <JsonBlock label="useAction state" value={testMutation} />
    </div>
  );
}
