import {
  experimental_createOpenApiHandler,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { ran: (input: unknown) => void } }>().concat(
  experimental_openapi(),
);

const router = t.router({
  save: t.procedure
    .meta({ route: { method: 'POST', path: '/notes' } })
    .input(z.object({ text: z.string() }).optional())
    .mutation((opts) => {
      opts.ctx.ran(opts.input);
      return 'saved';
    }),
  edit: t.procedure
    .meta({ route: { method: 'PATCH', path: '/notes/{id}' } })
    .input(z.object({ id: z.string() }))
    .mutation(() => 'edited'),
  remove: t.procedure
    .meta({ route: { method: 'DELETE', path: '/notes/{id}' } })
    .input(z.object({ id: z.string() }))
    .mutation(() => 'removed'),
  list: t.procedure
    .meta({ route: { method: 'GET', path: '/notes' } })
    .query(() => 'listed'),
});

const make = (
  opts: Partial<
    Parameters<typeof experimental_createOpenApiHandler<typeof router>>[0]
  > = {},
) => {
  const ran = vi.fn<(input: unknown) => void>();
  const createContext = vi.fn<() => { ran: typeof ran }>(() => ({ ran }));
  const handler = experimental_createOpenApiHandler({
    router,
    createContext,
    ...opts,
  });
  const call = (
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
  ) => handler.fetch(new Request(`https://api.example.com/api${path}`, init));
  return { handler, call, ran, createContext };
};

const form = () => new URLSearchParams({ text: 'hi' });
const multipart = () => {
  const data = new FormData();
  data.set('text', 'hi');
  return data;
};
const crossSite: Record<string, string> = { 'sec-fetch-site': 'cross-site' };

test('a cross-site form, multipart, text or untyped mutation body is a 403, before createContext or the resolver', async () => {
  const api = make();
  const bodies: ReadonlyArray<[BodyInit | null, Record<string, string>]> = [
    [form(), {}],
    [multipart(), {}],
    ['{"text":"hi"}', { 'content-type': 'text/plain' }],
    [new Blob(['{"text":"hi"}']), {}],
    [null, {}],
  ];
  for (const [body, headers] of bodies) {
    const res = await api.call('/notes', {
      method: 'POST',
      body,
      headers: { ...crossSite, ...headers },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      defined: false,
      code: 'FORBIDDEN',
      message:
        'Cross-origin POST requests must send content-type: application/json',
    });
  }
  expect(api.createContext).not.toHaveBeenCalled();
  expect(api.ran).not.toHaveBeenCalled();
  await api.handler.dispose();
});

test('a sibling subdomain is another origin, and every method but GET, HEAD and OPTIONS is checked', async () => {
  const api = make();
  const post = await api.call('/notes', {
    method: 'POST',
    body: form(),
    headers: { 'sec-fetch-site': 'same-site' },
  });
  expect(post.status).toBe(403);
  for (const method of ['PATCH', 'DELETE']) {
    const res = await api.call('/notes/1', {
      method,
      body: form(),
      headers: crossSite,
    });
    expect(res.status).toBe(403);
  }
  const list = await api.call('/notes', { headers: crossSite });
  expect(await list.json()).toBe('listed');
  await api.handler.dispose();
});

test('JSON bodies pass, since another origin can only send them after a CORS preflight', async () => {
  const api = make();
  const res = await api.call('/notes', {
    method: 'POST',
    body: '{"text":"hi"}',
    headers: {
      ...crossSite,
      origin: 'https://evil.example',
      'content-type': 'application/json; charset=utf-8',
    },
  });
  expect(await res.json()).toBe('saved');
  expect(api.ran).toHaveBeenCalledWith({ text: 'hi' });
  await api.handler.dispose();
});

test('forms from the same origin, the browser itself or a non-browser client pass', async () => {
  const api = make();
  for (const headers of [
    { 'sec-fetch-site': 'same-origin' },
    { 'sec-fetch-site': 'none' },
    { origin: 'https://api.example.com' },
    {},
  ]) {
    const res = await api.call('/notes', {
      method: 'POST',
      body: form(),
      headers,
    });
    expect(await res.json()).toBe('saved');
  }
  expect(api.ran).toHaveBeenCalledTimes(4);
  await api.handler.dispose();
});

test('without Sec-Fetch-Site, an Origin on another host or an opaque one is refused', async () => {
  const api = make();
  for (const origin of [
    'https://evil.example',
    'https://www.example.com',
    'null',
  ]) {
    const res = await api.call('/notes', {
      method: 'POST',
      body: form(),
      headers: { origin },
    });
    expect(res.status).toBe(403);
  }
  // Sec-Fetch-Site decides when both are sent.
  const both = await api.call('/notes', {
    method: 'POST',
    body: form(),
    headers: {
      'sec-fetch-site': 'cross-site',
      origin: 'https://api.example.com',
    },
  });
  expect(both.status).toBe(403);
  await api.handler.dispose();
});

test('trustedOrigins lets listed origins send forms, and takes only origins', async () => {
  const api = make({
    csrf: { trustedOrigins: ['https://WWW.example.com/'] },
  });
  const trusted = await api.call('/notes', {
    method: 'POST',
    body: multipart(),
    headers: { ...crossSite, origin: 'https://www.example.com' },
  });
  expect(await trusted.json()).toBe('saved');
  const other = await api.call('/notes', {
    method: 'POST',
    body: multipart(),
    headers: { ...crossSite, origin: 'https://shop.example.com' },
  });
  expect(other.status).toBe(403);
  await api.handler.dispose();

  for (const origin of ['https://www.example.com/app', 'www.example.com']) {
    expect(() => make({ csrf: { trustedOrigins: [origin] } })).toThrow(
      `csrf.trustedOrigins takes origins like "https://app.example.com", not "${origin}"`,
    );
  }
});

test('csrf: false turns the guard off; true and {} keep it on', async () => {
  for (const [csrf, status] of [
    [false, 200],
    [true, 403],
    [{}, 403],
  ] as const) {
    const api = make({ csrf });
    const res = await api.call('/notes', {
      method: 'POST',
      body: form(),
      headers: { ...crossSite, origin: 'https://evil.example' },
    });
    expect(res.status).toBe(status);
    await api.handler.dispose();
  }
});

test('serve() checks the request too', async () => {
  const api = make();
  const res = await api.handler.serve(
    new Request('https://api.example.com/notes', {
      method: 'POST',
      body: form(),
      headers: crossSite,
    }),
    { path: 'save', procedure: router.save },
  );
  expect(res.status).toBe(403);
  expect(api.ran).not.toHaveBeenCalled();
  await api.handler.dispose();
});
