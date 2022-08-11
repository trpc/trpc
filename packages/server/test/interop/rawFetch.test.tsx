/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import fetch from 'node-fetch';
import { z } from 'zod';
import * as trpc from '../../src';

const factory = () =>
  legacyRouterToServerAndClient(
    trpc
      .router()
      .query('myQuery', {
        input: z
          .object({
            name: z.string(),
          })
          .optional(),
        resolve({ input }) {
          return input?.name ?? 'default';
        },
      })
      .mutation('myMutation', {
        input: z.object({
          name: z.string(),
        }),
        async resolve({ input }) {
          return { input };
        },
      }),
  );

test('batching with raw batch', async () => {
  const { close, httpUrl } = factory();

  {
    const res = await fetch(
      `${httpUrl}/myQuery?batch=1&input=${JSON.stringify({
        '0': { name: 'alexdotjs' },
      })}`,
    );
    const json = await res.json();

    expect(json[0]).toHaveProperty('result');
    expect(json[0].result).toMatchInlineSnapshot(`
Object {
  "data": "alexdotjs",
}
`);
  }

  close();
});
