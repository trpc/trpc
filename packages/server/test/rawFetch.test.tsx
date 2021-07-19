/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import fetch from 'node-fetch';
test('call mutation with `input`-prop', async () => {
  const { close, httpUrl } = routerToServerAndClient(
    trpc.router().mutation('myMutation', {
      input: z.object({
        name: z.string(),
      }),
      async resolve({ input }) {
        return { input };
      },
    }),
  );

  const res = await fetch(`${httpUrl}/myMutation`, {
    method: 'POST',
    body: JSON.stringify({
      input: {
        name: 'alexdotjs',
      },
    }),
  });
  const json = await res.json();

  expect(json.result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "input": Object {
      "name": "alexdotjs",
    },
  },
  "type": "data",
}
`);

  close();
});
