/* eslint-disable @typescript-eslint/ban-types */
import { router } from '../src';
import * as z from 'zod';

test('types', async () => {
  const r = router<{}>().queries({
    test: () => {
      return {
        hello: 'test',
      };
    },
  });

  {
    const res = await r.invokeQuery({})('test');

    expect(res.hello).toBe('test');
  }
  {
    const res: {
      hello: string;
    } = await r.invokeQuery({})('test');
    expect(res.hello).toBe('test');
  }
});

describe('input validation', () => {
  test('basic', async () => {
    type Context = {
      user?: {
        name: string;
      };
    };
    const r = router<Context>().query('test', {
      input: z
        .object({
          who: z.string(),
        })
        .optional(),
      resolve({ ctx, input }) {
        return { text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}` };
      },
    });

    {
      const res = await r.invokeQuery({})('test', undefined);

      expect(res.text).toBe('hello world');
    }

    {
      const res = await r.invokeQuery({})('test', { who: 'katt' });

      expect(res.text).toBe('hello katt');
    }
    {
      const res = await r.invokeQuery({
        user: {
          name: 'katt',
        },
      })('test', undefined);

      expect(res.text).toBe('hello katt');
    }
    {
      await expect(() => r.invokeQuery({})('test', { who: false as any }))
        .rejects.toMatchInlineSnapshot(`
              [Error: 1 validation issue(s)

                Issue #0: invalid_union at 
                Invalid input
              ]
            `);
    }
  });
});
