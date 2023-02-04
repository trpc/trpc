import { createTRPCProxyClient } from '@trpc/client';
import {
  DefaultNamespaceDelimiter,
  defaultNamespaceDelimiter,
  initTRPC,
} from '@trpc/server';
import { expectTypeOf } from './inferenceUtils';

test('works when unset', () => {
  const t = initTRPC.create({});
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(defaultNamespaceDelimiter);
  expectTypeOf<DefaultNamespaceDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(
    defaultNamespaceDelimiter,
  );
  expectTypeOf<DefaultNamespaceDelimiter>(
    router._def._config.namespaceDelimiter,
  );

  createTRPCProxyClient<typeof router>({
    links: [],
  });
});

test('works when set to default on server only', () => {
  const t = initTRPC.create({
    namespaceDelimiter: defaultNamespaceDelimiter,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(defaultNamespaceDelimiter);
  expectTypeOf<DefaultNamespaceDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(
    defaultNamespaceDelimiter,
  );
  expectTypeOf<DefaultNamespaceDelimiter>(
    router._def._config.namespaceDelimiter,
  );

  createTRPCProxyClient<typeof router>({
    links: [],
  });
});

test('works when set to default on client only', () => {
  const t = initTRPC.create({});
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(defaultNamespaceDelimiter);
  expectTypeOf<DefaultNamespaceDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(
    defaultNamespaceDelimiter,
  );
  expectTypeOf<DefaultNamespaceDelimiter>(
    router._def._config.namespaceDelimiter,
  );

  createTRPCProxyClient<typeof router>({
    links: [],
    namespaceDelimiter: defaultNamespaceDelimiter,
  });
});

test('works when set to default on both ends', () => {
  const t = initTRPC.create({
    namespaceDelimiter: defaultNamespaceDelimiter,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(defaultNamespaceDelimiter);
  expectTypeOf<DefaultNamespaceDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(
    defaultNamespaceDelimiter,
  );
  expectTypeOf<DefaultNamespaceDelimiter>(
    router._def._config.namespaceDelimiter,
  );

  createTRPCProxyClient<typeof router>({
    links: [],
    namespaceDelimiter: defaultNamespaceDelimiter,
  });
});

test('works when set to custom delimiter on both ends', () => {
  const customDelimiter = '/' as const;

  const t = initTRPC.create({
    namespaceDelimiter: customDelimiter,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(customDelimiter);
  expectTypeOf<typeof customDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(customDelimiter);
  expectTypeOf<typeof customDelimiter>(router._def._config.namespaceDelimiter);

  createTRPCProxyClient<typeof router>({
    links: [],
    namespaceDelimiter: customDelimiter,
  });
});

test('errors when set to custom delimiter on server only', () => {
  const customDelimiter = '/' as const;

  const t = initTRPC.create({
    namespaceDelimiter: customDelimiter,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(customDelimiter);
  expectTypeOf<typeof customDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(customDelimiter);
  expectTypeOf<typeof customDelimiter>(router._def._config.namespaceDelimiter);

  createTRPCProxyClient<typeof router>(
    // @ts-expect-error missing namespaceDelimiter on client
    {
      links: [],
    },
  );
});

test('errors when set to custom delimiter on client only', () => {
  const customDelimiter = '/' as const;

  const t = initTRPC.create({});
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(defaultNamespaceDelimiter);
  expectTypeOf<DefaultNamespaceDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(
    defaultNamespaceDelimiter,
  );
  expectTypeOf<DefaultNamespaceDelimiter>(
    router._def._config.namespaceDelimiter,
  );

  createTRPCProxyClient<typeof router>({
    links: [],
    // @ts-expect-error missing namespaceDelimiter on server
    namespaceDelimiter: customDelimiter,
  });
});

test('errors when set to default on server and custom delimiter on client', () => {
  const customDelimiter = '/' as const;

  const t = initTRPC.create({
    namespaceDelimiter: defaultNamespaceDelimiter,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(defaultNamespaceDelimiter);
  expectTypeOf<DefaultNamespaceDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(
    defaultNamespaceDelimiter,
  );
  expectTypeOf<DefaultNamespaceDelimiter>(
    router._def._config.namespaceDelimiter,
  );

  createTRPCProxyClient<typeof router>({
    links: [],
    // @ts-expect-error different namespaceDelimiter on client
    namespaceDelimiter: customDelimiter,
  });
});

test('errors when set to custom delimiter on server and default on client', () => {
  const customDelimiter = '/' as const;

  const t = initTRPC.create({
    namespaceDelimiter: customDelimiter,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(customDelimiter);
  expectTypeOf<typeof customDelimiter>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(customDelimiter);
  expectTypeOf<typeof customDelimiter>(router._def._config.namespaceDelimiter);

  createTRPCProxyClient<typeof router>({
    links: [],
    // @ts-expect-error different namespaceDelimiter on client
    namespaceDelimiter: defaultNamespaceDelimiter,
  });
});

test('errors when set to a different custom delimiter on each end', () => {
  const customDelimiter0 = '/' as const;
  const customDelimiter1 = ':' as const;

  const t = initTRPC.create({
    namespaceDelimiter: customDelimiter0,
  });
  const router = t.router({});

  expect(t._config.namespaceDelimiter).toBe(customDelimiter0);
  expectTypeOf<typeof customDelimiter0>(t._config.namespaceDelimiter);
  expect(router._def._config.namespaceDelimiter).toBe(customDelimiter0);
  expectTypeOf<typeof customDelimiter0>(router._def._config.namespaceDelimiter);

  createTRPCProxyClient<typeof router>({
    links: [],
    // @ts-expect-error different namespaceDelimiter on client
    namespaceDelimiter: customDelimiter1,
  });
});
