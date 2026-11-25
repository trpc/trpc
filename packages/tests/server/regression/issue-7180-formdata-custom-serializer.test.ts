// https://github.com/trpc/trpc/issues/7180
// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import { httpLink, retryLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { zfd } from 'zod-form-data';

function setup(
  opts: {
    allowMethodOverride?: boolean;
    methodOverride?: 'POST';
    retryDelayMs?: number;
  } = {},
) {
  const retryDelayMs = opts.retryDelayMs;
  const serialize = vi.fn((input: unknown) => {
    if (typeof input === 'object' && input !== null && 'text' in input) {
      const formData = new FormData();
      formData.set('text', String(input.text));
      return formData;
    }
    return input;
  });
  const transformer = {
    input: {
      serialize,
      deserialize: (input: unknown) => input,
    },
    output: {
      serialize: (output: unknown) => output,
      deserialize: (output: unknown) => output,
    },
  };
  const t = initTRPC.create({ transformer });
  const router = t.router({
    echo: t.procedure
      .input(zfd.formData({ text: zfd.text() }))
      .mutation(({ input }) => input),
    echoQuery: t.procedure
      .input(z.string().or(zfd.formData({ text: zfd.text() })))
      .query(({ input }) => input),
  });
  const fetchSpy = vi.fn<typeof fetch>((...args) => fetch(...args));
  const ctx = testServerAndClientResource(router, {
    server: {
      allowMethodOverride: opts.allowMethodOverride ?? false,
    },
    client: ({ httpUrl }) => ({
      links: [
        ...(retryDelayMs === undefined
          ? []
          : [
              retryLink({
                retry: ({ attempts }) => attempts < 2,
                retryDelayMs: () => retryDelayMs,
              }),
            ]),
        httpLink({
          url: httpUrl,
          fetch: fetchSpy,
          methodOverride: opts.methodOverride,
          transformer,
        }),
      ],
    }),
  });

  return { ctx, fetchSpy, serialize };
}

test('sends FormData returned by the input serializer as a multipart body', async () => {
  const { ctx, fetchSpy, serialize } = setup();
  await using _ctx = ctx;

  await expect(ctx.client.echo.mutate({ text: 'hello' })).resolves.toEqual({
    text: 'hello',
  });

  expect(serialize).toHaveBeenCalledTimes(1);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const call = fetchSpy.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const [, request] = call;
  expect(request?.body).toBeInstanceOf(FormData);
  expect(request?.headers).not.toHaveProperty('content-type');
});

test('still sends direct FormData without invoking the serializer', async () => {
  const { ctx, fetchSpy, serialize } = setup();
  await using _ctx = ctx;
  const formData = new FormData();
  formData.set('text', 'direct');

  await expect(ctx.client.echo.mutate(formData)).resolves.toEqual({
    text: 'direct',
  });

  expect(serialize).not.toHaveBeenCalled();
  const call = fetchSpy.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const [, request] = call;
  expect(request?.body).toBeInstanceOf(FormData);
  expect(request?.headers).not.toHaveProperty('content-type');
});

test('rejects serializer-produced FormData for query GET requests', async () => {
  const { ctx, fetchSpy } = setup();
  await using _ctx = ctx;

  await expect(ctx.client.echoQuery.query({ text: 'hello' })).rejects.toThrow(
    'FormData from serializer is only supported for mutations',
  );
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('keeps JSON query inputs in the URL without a body', async () => {
  const { ctx, fetchSpy, serialize } = setup();
  await using _ctx = ctx;

  await expect(ctx.client.echoQuery.query('hello')).resolves.toBe('hello');

  expect(serialize).toHaveBeenCalledTimes(1);
  const call = fetchSpy.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const [url, request] = call;
  expect(url).toContain('input=%22hello%22');
  expect(request?.method).toBe('GET');
  expect(request?.body).toBeUndefined();
  expect(request?.headers).not.toHaveProperty('content-type');
});

test('allows serializer-produced FormData for a query overridden to POST', async () => {
  const { ctx, fetchSpy, serialize } = setup({
    allowMethodOverride: true,
    methodOverride: 'POST',
  });
  await using _ctx = ctx;

  await expect(ctx.client.echoQuery.query({ text: 'hello' })).resolves.toEqual({
    text: 'hello',
  });

  expect(serialize).toHaveBeenCalledTimes(1);
  const call = fetchSpy.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const [, request] = call;
  expect(request?.method).toBe('POST');
  expect(request?.body).toBeInstanceOf(FormData);
  expect(request?.headers).not.toHaveProperty('content-type');
});

test.each([0, 25])(
  'serializer exceptions reach observer.error on retry with a %i ms delay',
  async (retryDelayMs) => {
    using timers = fakeTimersResource();
    const { ctx, fetchSpy, serialize } = setup({ retryDelayMs });
    await using _ctx = ctx;
    const formData = new FormData();
    formData.set('text', 'hello');
    serialize.mockReturnValueOnce(formData).mockImplementationOnce(() => {
      throw new Error('serializer failed on retry');
    });
    fetchSpy.mockRejectedValueOnce(new Error('first request failed'));

    const result = ctx.client.echo.mutate({ text: 'hello' });
    const rejection = expect(result).rejects.toThrow(
      'serializer failed on retry',
    );
    await timers.runAllTimersAsync();

    await rejection;
    expect(serialize).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  },
);
