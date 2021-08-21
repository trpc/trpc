/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import fetch from 'node-fetch';
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
test('duplicate beforeEnd', () => {
  expect(() =>
    trpc
      .router()
      .beforeEnd(() => {})
      .beforeEnd(() => {}),
  ).toThrowErrorMatchingInlineSnapshot(
    `"You seem to have double \`transformer()\`-calls in your router tree"`,
  );
});

test('set custom headers in beforeEnd', async () => {
  const TEAPOT_ERROR_CODE = 418;
  const onError = jest.fn();
  const { close, httpUrl } = routerToServerAndClient(
    trpc
      .router<trpc.CreateHttpContextOptions>()
      //
      .query('q', {
        input: z.string(),
        resolve() {
          return null;
        },
      }),
    {
      server: {
        onError,
      },
    },
  );
  const res = await fetch(`${httpUrl}/q`);

  expect(res.ok).toBeFalsy();
  expect(res.status).toBe(TEAPOT_ERROR_CODE);

  close();
});
