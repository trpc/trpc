type Unsubscribe = () => Promise<void>;
type Factory = () => Promise<Unsubscribe>;

export function registerAsyncGlobal(namespace: string, factory: Factory) {
  const globalAny = global as unknown as Record<
    string,
    Awaited<ReturnType<Factory>>
  >;

  // async iife
  (async () => {
    if (globalAny[namespace]) {
      // unsubsribe previous
      const unsub = globalAny[namespace];
      await unsub();
    }
    globalAny[namespace] = await factory();
  })().catch((error) => {
    console.error({ error, namespace }, 'Failed to register global');

    throw error;
  });
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
