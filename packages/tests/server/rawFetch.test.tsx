import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const factory = () => {
  const t = initTRPC.context().create();

  const router = t.router({
    myQuery: t.procedure
      .input(
        z
          .object({
            name: z.string(),
          })
          .optional(),
      )
      .query(({ input }) => {
        return input?.name ?? 'default';
      }),

    myMutation: t.procedure
      .input(
        z.object({
          name: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return { input };
      }),
  });
  return testServerAndClientResource(router);
};
test('batching with raw batch', async () => {
  await using ctx = factory();
  const { httpUrl } = ctx;

  {
    const res = await fetch(
      `${httpUrl}/myQuery?batch=1&input=${JSON.stringify({
        '0': { name: 'alexdotjs' },
      })}`,
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );
    const json: any = await res.json();

    expect(json[0]).toHaveProperty('result');
    expect(json[0].result).toMatchInlineSnapshot(`
Object {
  "data": "alexdotjs",
}
`);
  }
});

test('errors thrown before the call runs are sent as json', async () => {
  await using ctx = factory();
  const { httpUrl } = ctx;

  const unsupported = await fetch(`${httpUrl}/myMutation`, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
    },
    body: JSON.stringify({ name: 'alexdotjs' }),
  });
  expect(unsupported.status).toBe(415);
  expect(unsupported.headers.get('content-type')).toBe('application/json');

  const mixed = await fetch(
    `${httpUrl}/myQuery,myMutation?batch=1&input=${JSON.stringify({
      '0': { name: 'alexdotjs' },
      '1': { name: 'alexdotjs' },
    })}`,
  );
  expect(mixed.status).toBe(400);
  expect(mixed.headers.get('content-type')).toBe('application/json');
});
