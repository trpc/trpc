'use client';

import { Button } from '@shared/ui/components/button';
import { Input } from '@shared/ui/components/input';
import { testAction } from './_actions';

export function RawFormExample() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Check the network tab and the server console to see that we called this.
        If you don&apos;t pass an input, it will fail validation and not reach
        the procedure.
      </p>
      <form action={testAction as any} className="flex max-w-md gap-2">
        <Input type="text" name="text" aria-label="Text" />
        <Button type="submit">Run server action raw debugging</Button>
      </form>
    </div>
  );
}
