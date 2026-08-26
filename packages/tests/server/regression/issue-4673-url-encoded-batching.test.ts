/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

test('handle URL encoded commas in URL.pathname', async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    a: t.procedure.query(() => 'a'),
    b: t.procedure.query(() => 'b'),
    withInput: t.procedure.input(z.string()).query((opts) => opts.input),
  });

  await using ctx = testServerAndClientResource(appRouter);
  const url = ctx.httpUrl;

  const normalResult = await (
    await fetch(`${url}/a,b?batch=1&input={}`)
  ).json();
  const uriEncodedResult = await (
    await fetch(`${url}/a%2Cb?batch=1&input={}`)
  ).json();

  expect(normalResult).toMatchInlineSnapshot(`
    Array [
      Object {
        "result": Object {
          "data": "a",
        },
      },
      Object {
        "result": Object {
          "data": "b",
        },
      },
    ]
  `);
  expect(normalResult).toEqual(uriEncodedResult);
});

test('handle URL encoded input in search params', async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    a: t.procedure.query(() => 'a'),
    b: t.procedure.query(() => 'b'),
    withInput: t.procedure.input(z.string()).query((opts) => opts.input),
  });

  await using ctx = testServerAndClientResource(appRouter);
  const url = ctx.httpUrl;

  const normalResult = await (
    await fetch(
      `${url}/withInput?batch=1&input=${JSON.stringify({ 0: 'hello' })}`,
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    )
  ).json();
  const uriEncodedResult = await (
    await fetch(
      `${url}/withInput?batch=1&input=${encodeURIComponent(
        JSON.stringify({ 0: 'hello' }),
      )}`,
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    )
  ).json();

  expect(normalResult).toMatchInlineSnapshot(`
    Array [
      Object {
        "result": Object {
          "data": "hello",
        },
      },
    ]
  `);

  expect(normalResult).toEqual(uriEncodedResult);
});
