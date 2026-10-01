import { QueryCache, QueryClient } from '@tanstack/react-query';

const FINITE_GC_TIME = 1_234;

async function importModule() {
  vi.resetModules();
  return import('../src/getQueryClientWithServerGcTimeInfinity');
}

async function runOnServer<T>(fn: () => Promise<T> | T): Promise<T> {
  const windowRef = (globalThis as any).window;
  delete (globalThis as any).window;
  try {
    return await fn();
  } finally {
    (globalThis as any).window = windowRef;
  }
}

async function runOnBrowser<T>(fn: () => Promise<T> | T): Promise<T> {
  const windowRef = (globalThis as any).window;
  (globalThis as any).window = {};
  try {
    return await fn();
  } finally {
    (globalThis as any).window = windowRef;
  }
}

async function createClientAndGetBuildGcTime(
  createQueryClient: () => QueryClient,
) {
  const seenGcTimes: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalBuild = QueryCache.prototype.build as any;
  const buildSpy = vi
    .spyOn(QueryCache.prototype as any, 'build')
    .mockImplementation(function (this: QueryCache, ...args: any[]) {
      seenGcTimes.push(args[1]?.gcTime ?? args[1]?.cacheTime);
      return originalBuild.apply(this, args);
    });

  try {
    const queryClient = createQueryClient();
    await queryClient.fetchQuery({
      queryKey: ['gc-check'],
      gcTime: FINITE_GC_TIME,
      queryFn: async () => 'ok',
    });
    return seenGcTimes.at(-1);
  } finally {
    buildSpy.mockRestore();
  }
}

test('forces Infinity on server for internally created QueryClient', async () => {
  await runOnServer(async () => {
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();
    const gcTime = await createClientAndGetBuildGcTime(() =>
      getQueryClientWithServerGcTimeInfinity({ queryClientConfig: {} }, true),
    );
    expect(gcTime).toBe(Infinity);
  });
});

test('keeps finite gcTime when feature flag is off', async () => {
  await runOnServer(async () => {
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();
    const gcTime = await createClientAndGetBuildGcTime(() =>
      getQueryClientWithServerGcTimeInfinity({ queryClientConfig: {} }, false),
    );
    expect(gcTime).toBe(FINITE_GC_TIME);
  });
});

test('keeps client behavior unchanged even when feature flag is on', async () => {
  await runOnBrowser(async () => {
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();
    const gcTime = await createClientAndGetBuildGcTime(() =>
      getQueryClientWithServerGcTimeInfinity({ queryClientConfig: {} }, true),
    );
    expect(gcTime).toBe(FINITE_GC_TIME);
  });
});

test('forces Infinity for externally provided QueryClient', async () => {
  await runOnServer(async () => {
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();
    const providedQueryClient = new QueryClient();
    const gcTime = await createClientAndGetBuildGcTime(() => {
      const wrapped = getQueryClientWithServerGcTimeInfinity(
        { queryClient: providedQueryClient },
        true,
      );
      expect(wrapped).toBe(providedQueryClient);
      return providedQueryClient;
    });

    expect(gcTime).toBe(Infinity);
  });
});

test('uses ServerSafeQueryCache when creating client internally', async () => {
  await runOnServer(async () => {
    const { getQueryClientWithServerGcTimeInfinity, ServerSafeQueryCache } =
      await importModule();
    const queryClient = getQueryClientWithServerGcTimeInfinity(
      { queryClientConfig: {} },
      true,
    );
    expect(queryClient.getQueryCache()).toBeInstanceOf(ServerSafeQueryCache);
  });
});

test('warns once in dev when external QueryCache cannot be patched', async () => {
  await runOnServer(async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();

    const queryCache = new QueryCache();
    const build = queryCache.build.bind(queryCache);
    Object.defineProperty(queryCache, 'build', {
      value: build,
      writable: false,
      configurable: true,
    });

    const queryClient = new QueryClient({ queryCache });

    const first = getQueryClientWithServerGcTimeInfinity({ queryClient }, true);
    const second = getQueryClientWithServerGcTimeInfinity(
      { queryClient },
      true,
    );
    expect(first).toBe(queryClient);
    expect(second).toBe(queryClient);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

test('does not warn in production when patch fails', async () => {
  await runOnServer(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();

    const queryCache = new QueryCache();
    const build = queryCache.build.bind(queryCache);
    Object.defineProperty(queryCache, 'build', {
      value: build,
      writable: false,
      configurable: true,
    });
    const queryClient = new QueryClient({ queryCache });

    getQueryClientWithServerGcTimeInfinity({ queryClient }, true);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});

test('does not double patch the same external QueryClient', async () => {
  await runOnServer(async () => {
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();
    const reflectSetSpy = vi.spyOn(Reflect, 'set');
    const queryClient = new QueryClient();

    getQueryClientWithServerGcTimeInfinity({ queryClient }, true);
    getQueryClientWithServerGcTimeInfinity({ queryClient }, true);

    expect(reflectSetSpy).toHaveBeenCalledTimes(1);
    reflectSetSpy.mockRestore();
  });
});

test('warns when QueryCache.build is not a function on provided queryClient', async () => {
  await runOnServer(async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();

    const queryCache = new QueryCache();
    Object.defineProperty(queryCache, 'build', {
      value: null,
      writable: true,
      configurable: true,
    });
    const queryClient = new QueryClient({ queryCache });

    const result = getQueryClientWithServerGcTimeInfinity(
      { queryClient },
      true,
    );
    expect(result).toBe(queryClient);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

test('warns when Reflect.set returns false while patching', async () => {
  await runOnServer(async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const reflectSetSpy = vi.spyOn(Reflect, 'set').mockReturnValue(false);
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();
    const queryClient = new QueryClient();

    const result = getQueryClientWithServerGcTimeInfinity(
      { queryClient },
      true,
    );
    expect(result).toBe(queryClient);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    reflectSetSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

test('warns when internal ServerSafeQueryCache cannot patch build', async () => {
  await runOnServer(async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const reflectSetSpy = vi.spyOn(Reflect, 'set').mockReturnValue(false);
    const { getQueryClientWithServerGcTimeInfinity } = await importModule();

    getQueryClientWithServerGcTimeInfinity({ queryClientConfig: {} }, true);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    reflectSetSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
