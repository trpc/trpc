/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import fetch from 'node-fetch';

const factory = () =>
  routerToServerAndClient(
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

/**
 * @deprecated TODO delete in next major
 **/
test('call mutation with `input`-prop', async () => {
  const { close, httpUrl } = factory();

  const res = await fetch(`${httpUrl}/myMutation`, {
    method: 'POST',
    body: JSON.stringify({
      input: {
        name: 'alexdotjs',
      },
    }),
  });
  const json = await res.json();

  expect(json).toHaveProperty('result');
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

test('batching with raw batch', async () => {
  const { close, httpUrl } = factory();

  {
    /**
     * @deprecated TODO delete in next major
     **/
    const res = await fetch(
      `${httpUrl}/myQuery?batch=1&input=${JSON.stringify([])}`,
    );
    const json = await res.json();

    expect(json[0]).toHaveProperty('result');
    expect(json[0].result).toMatchInlineSnapshot(`
Object {
  "data": "default",
  "type": "data",
}
`);
  }

  {
    /**
     * @deprecated TODO - remove in next major
     **/
    const res = await fetch(
      `${httpUrl}/myQuery?batch=1&input=${JSON.stringify([
        { name: 'alexdotjs' },
      ])}`,
    );
    const json = await res.json();

    expect(json[0]).toHaveProperty('result');
    expect(json[0].result).toMatchInlineSnapshot(`
Object {
  "data": "alexdotjs",
  "type": "data",
}
`);
  }

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
  "type": "data",
}
`);
  }

  close();
});
