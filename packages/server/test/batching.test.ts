/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import fetch from 'node-fetch';

test('batching basic', async () => {
  const createContext = jest.fn(() => ({}));
  const { url, close } = routerToServerAndClient(
    trpc
      .router()
      .query('hello', {
        resolve() {
          return {
            text: 'hello',
          };
        },
      })
      .query('bye', {
        resolve() {
          return {
            text: `bye`,
          };
        },
      }),
    {
      server: {
        createContext,
      },
    },
  );

  const res = await fetch(`${url}/hello,bye`);
  const json = await res.json();

  expect(json.batch).toBe(true);
  expect(json).toMatchInlineSnapshot(`
    Object {
      "batch": true,
      "data": Array [
        Object {
          "data": true,
          "ok": true,
          "statusCode": 200,
        },
        Object {
          "data": true,
          "ok": true,
          "statusCode": 200,
        },
      ],
      "statusCode": 200,
    }
  `);
  expect(createContext).toHaveBeenCalledTimes(1);

  close();
});
