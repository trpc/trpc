import { expect, test } from 'vite-plus/test';

const entries = {
  server: () => import('trpcdev/server'),
  middleware: () => import('trpcdev/middleware'),
  client: () => import('trpcdev/client'),
  actions: () => import('trpcdev/actions'),
  contract: () => import('trpcdev/contract'),
  serializer: () => import('trpcdev/serializer'),
  openapi: () => import('trpcdev/openapi'),
  'openapi/typescript': () => import('trpcdev/openapi/typescript'),
  effect: () => import('trpcdev/effect'),
  http: () => import('trpcdev/http'),
  cloudflare: () => import('trpcdev/cloudflare'),
  extend: () => import('trpcdev/extend'),
  internal: () => import('trpcdev/internal'),
  'internal/testing': () => import('trpcdev/internal/testing'),
};

test.each(Object.entries(entries))('trpcdev/%s resolves', async (_, load) => {
  expect(await load()).toBeTypeOf('object');
});
