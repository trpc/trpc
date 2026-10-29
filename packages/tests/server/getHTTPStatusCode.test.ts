import { initTRPC, TRPCError } from '@trpc/server';
import { getHTTPStatusCode } from '@trpc/server/unstable-core-do-not-import';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';

test('uses the error code when the formatted error has no `data` object', () => {
  expect(
    getHTTPStatusCode({
      id: null,
      error: {
        code: -32004,
        message: 'Not found',
      },
    } as any),
  ).toBe(404);
});

test('uses the error code when the formatted `data` is not an object', () => {
  expect(
    getHTTPStatusCode({
      id: null,
      error: {
        code: -32001,
        message: 'Unauthorized',
        data: 'redacted',
      },
    } as any),
  ).toBe(401);
});

test('prefers an explicit `httpStatus` in the error data', () => {
  expect(
    getHTTPStatusCode({
      id: null,
      error: {
        code: -32603,
        message: 'Teapot',
        data: { httpStatus: 418 },
      },
    } as any),
  ).toBe(418);
});

test('returns 207 for a batch with mixed statuses', () => {
  expect(
    getHTTPStatusCode([
      { id: 0, result: { type: 'data', data: 'ok' } },
      { id: 1, error: { code: -32004, message: 'Not found' } },
    ] as any),
  ).toBe(207);
});

test('serves the mapped status when a custom formatter omits the error data', async () => {
  const t = initTRPC.create({
    errorFormatter({ shape }) {
      return { ...shape, data: undefined };
    },
  });

  const router = t.router({
    missing: t.procedure.query(() => {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const res = await fetch(`${ctx.httpUrl}/missing`);

  expect(res.status).toBe(404);
});
