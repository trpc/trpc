type Unsubscribe = () => Promise<void>;
type Factory = () => Promise<Unsubscribe>;

export function registerAsyncGlobal(namespace: string, factory: Factory) {
  const globalAny = global as unknown as Record<
    string,
    Awaited<ReturnType<Factory>>
  >;

  const cleanup = (reason: string) => () => {
    const current = globalAny[namespace];

    if (current) {
      console.log({ reason, namespace }, 'Cleaning up global');
      delete globalAny[namespace];
      current().catch((error) => {
        console.error({ error, namespace }, 'Failed to cleanup global');
      });
    }
  };

  // async iife
  (async () => {
    cleanup('Re-registering global')();
    globalAny[namespace] = await factory();
  })().catch((error) => {
    console.error({ error, namespace }, 'Failed to register global');

    throw error;
  });

  process.on('exit', cleanup('exit'));
  process.on('SIGINT', cleanup('SIGINT'));
  process.on('SIGTERM', cleanup('SIGTERM'));
}

export function registerGlobalValue<TValue>(
  namespace: string,
  factory: () => TValue,
) {
  const globalAny = global as unknown as Record<string, TValue>;

  if (globalAny[namespace]) {
    return globalAny[namespace];
  }

  globalAny[namespace] = factory();
  return globalAny[namespace];
}
