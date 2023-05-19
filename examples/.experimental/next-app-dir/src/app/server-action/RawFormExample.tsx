'use client';

import { testAction } from './_actions';

export function RawFormExample() {
  return (
    <>
      <p>
        Check the network tab and the server console to see that we called this.
        If you don not pass an input, it will fail validation and not reach the
        procedure.
      </p>
      <form action={testAction}>
        <input type="text" name="text" />
        <button type="submit">Run server action raw debugging</button>
      </form>
    </>
  );
}
