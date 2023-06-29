'use client';

import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { testAction } from '../_actions';

export function RawFormExample() {
  return (
    <div className="space-y-2">
      <p>
        Check the network tab and the server console to see that we called this.
        If you don not pass an input, it will fail validation and not reach the
        procedure.
      </p>
      <form action={testAction} className="space-y-2">
        <Input type="text" name="text" />
        <Button type="submit">Run server action raw debugging</Button>
      </form>
    </div>
  );
}
