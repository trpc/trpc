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

test('prefers the original error code over an ambiguous formatted code', () => {
  expect(
    getHTTPStatusCode(
      { id: null, error: { code: -32603, message: 'Bad gateway' } } as any,
      [{ code: 'BAD_GATEWAY' } as any],
    ),
  ).toBe(502);
});

test('returns 207 when ambiguous formatted codes belong to distinct statuses', () => {
  expect(
    getHTTPStatusCode(
      [
        { id: 0, error: { code: -32603, message: 'Bad gateway' } },
        { id: 1, error: { code: -32603, message: 'Service unavailable' } },
      ] as any,
      [{ code: 'BAD_GATEWAY' } as any, { code: 'SERVICE_UNAVAILABLE' } as any],
    ),
  ).toBe(207);
});

test('serves 502/503 when a custom formatter strips statuses that share a JSON-RPC code', async () => {
  const t = initTRPC.create({
    errorFormatter({ shape }) {
      return { ...shape, data: undefined };
    },
  });

  const router = t.router({
    gateway: t.procedure.query(() => {
      throw new TRPCError({ code: 'BAD_GATEWAY' });
    }),
    unavailable: t.procedure.query(() => {
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    }),
  });

  await using ctx = testServerAndClientResource(router);

  expect((await fetch(`${ctx.httpUrl}/gateway`)).status).toBe(502);
  expect((await fetch(`${ctx.httpUrl}/unavailable`)).status).toBe(503);

  const batch = await fetch(`${ctx.httpUrl}/gateway,unavailable?batch=1`, {
    method: 'GET',
  });

  expect(batch.status).toBe(207);
});
