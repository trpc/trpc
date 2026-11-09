import { expect, test } from 'vite-plus/test';

const entries = {
  server: () => import('@trpc12/trpc/server'),
  middleware: () => import('@trpc12/trpc/middleware'),
  client: () => import('@trpc12/trpc/client'),
  actions: () => import('@trpc12/trpc/actions'),
  contract: () => import('@trpc12/trpc/contract'),
  transformer: () => import('@trpc12/trpc/transformer'),
  openapi: () => import('@trpc12/trpc/openapi'),
  'openapi/typescript': () => import('@trpc12/trpc/openapi/typescript'),
  mcp: () => import('@trpc12/trpc/mcp'),
  interop: () => import('@trpc12/trpc/interop'),
  effect: () => import('@trpc12/trpc/effect'),
  http: () => import('@trpc12/trpc/http'),
  cloudflare: () => import('@trpc12/trpc/cloudflare'),
  extend: () => import('@trpc12/trpc/extend'),
  internal: () => import('@trpc12/trpc/internal'),
  'internal/testing': () => import('@trpc12/trpc/internal/testing'),
};

test.each(Object.entries(entries))(
  '@trpc12/trpc/%s resolves',
  async (_, load) => {
    expect(await load()).toBeTypeOf('object');
  },
);
