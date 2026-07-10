'use client';

import { useAction } from 'trpc-api';
import { testAction } from './_actions';

export function FormWithUseActionExample() {
  const mutation = useAction(testAction);
  return (
    <>
      <p>Check the console for the logger output.</p>
      <form
        action={testAction as any}
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          mutation.mutate(formData);
        }}
      >
        <input type="text" name="text" />
        <button type="submit">Run server action raw debugging</button>

        <pre
          style={{
            overflowX: 'scroll',
          }}
        >
          {JSON.stringify(mutation, null, 4)}
        </pre>
      </form>
    </>
  );
}
