/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import '@testing-library/jest-dom';
import { expectTypeOf } from 'expect-type';
import * as z from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

describe('bulk add', () => {
  test('queries()', async () => {
    const router = trpc.router().queries({
      dogSays: {
        input: z.object({
          dogNoise: z.string(),
        }),
        resolve({ input }) {
          expectTypeOf(input).not.toBeAny();
          return {
            text: input.dogNoise,
          };
        },
      },
      kattSays: {
        input: z.object({
          catNoise: z.string(),
        }),
        resolve({ input }) {
          expectTypeOf(input).not.toBeAny();
          return {
            text: input.catNoise,
          };
        },
      },
    });
    const { client, close } = routerToServerAndClient(router);
    // 🙋‍♂️ `res.text` is `any` here
    const res1 = await client.query('dogSays', { dogNoise: 'woff' });
    expect(res1.text).toBe('woff');
    const res2 = await client.query('kattSays', { catNoise: 'meow' });
    expect(res2.text).toBe('meow');
    close();
  });
});
