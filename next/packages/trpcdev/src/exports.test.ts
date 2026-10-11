import { expect, test } from 'vite-plus/test';

const entries = {
  server: () => import('trpcdev/server'),
  client: () => import('trpcdev/client'),
  contract: () => import('trpcdev/contract'),
  serializer: () => import('trpcdev/serializer'),
  openapi: () => import('trpcdev/openapi'),
  effect: () => import('trpcdev/effect'),
  http: () => import('trpcdev/http'),
  testing: () => import('trpcdev/testing'),
  internal: () => import('trpcdev/internal'),
};

test.each(Object.entries(entries))('trpcdev/%s resolves', async (_, load) => {
  expect(await load()).toBeTypeOf('object');
});
