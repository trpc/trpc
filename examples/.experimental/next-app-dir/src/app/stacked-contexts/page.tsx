'use client';

import { Deferred } from '@trpc/next/app-dir/client';
import * as React from 'react';

interface Context {
  id: string;
  cache: Record<
    string,
    {
      promise?: Promise<unknown>;
      error?: unknown;
      data?: unknown;
    }
  >;

  onSettled: () => Promise<void>;
  exec: <TData>(opts: {
    key: string;
    fn: () => Promise<TData>;
  }) => Promise<TData>;
}

function dehydrateCache(
  obj: Record<
    string,
    {
      promise?: unknown;
    }
  >,
) {
  const cache: Record<string, {}> = {};

  for (const [key, value] of Object.entries(obj)) {
    // omit promise
    const { promise, ...rest } = value;
    cache[key] = {
      ...rest,
    };

    if (!Object.keys(rest).length) {
      throw new Error(`No data for ${key}`);
    }
  }
  return cache;
}

const context = React.createContext<Context>(null as any);

function CacheProviderHydrator() {
  const ctx = React.useContext(context);
  console.log('[CacheProviderHydrator] to settle');
  React.use(ctx.onSettled());

  const dehydrated = JSON.stringify(dehydrateCache(ctx.cache), null, 4);

  console.log('[CacheProviderHydrator] dehydrating', dehydrated);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  if (mounted) {
    return null;
  }

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
            window._cache = window._cache || {};
            window._cache["_${ctx.id}"] = ${dehydrated};
        `,
      }}
    />
  );
}

const refCountZeroDeferred = new Deferred<void>();
refCountZeroDeferred.resolve();

function CacheProvider(props: {
  children: React.ReactNode;
  fallback?: React.SuspenseProps['fallback'];
}) {
  const id = React.useId();
  const [cache] = React.useState<Context['cache']>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    const cache = (window as any)._cache?.[`_${id}`];
    console.log('full cache', (window as any)._cache);
    console.log('cache for hydration', cache);

    return cache ?? {};
  });

  const onSettledRef = React.useRef<Deferred<void>>(refCountZeroDeferred);

  let refCount = React.useRef(0);
  const incRef = React.useCallback(() => {
    refCount.current++;
    console.log('REFCOUNT', refCount.current);
    if (refCount.current === 1) {
      console.log('REFCOUNT ONE --- recreating deferred');
      onSettledRef.current = new Deferred<void>();
    }
  }, []);
  const decRef = React.useCallback(() => {
    refCount.current--;
    if (refCount.current === 0) {
      console.log('[REFCOUNT ZERO]');
      onSettledRef.current.resolve();
    }
  }, []);
  return (
    <context.Provider
      value={{
        id,
        // ...
        cache,
        onSettled: () =>
          refCount.current === 0 ? refCountZeroDeferred : onSettledRef.current,
        exec(opts) {
          type $Output = ReturnType<typeof opts.fn>;
          let entry = cache[opts.key];
          console.log('[exec] key', opts.key);
          console.log('[exec] current cache', JSON.stringify(cache, null, 4));
          if (entry) {
            incRef();
            console.log('[exec] was cached', {
              promise: !!entry.promise,
            });
            if (entry.promise) {
              return entry.promise as $Output;
            }
            console.log('[DEHYDRATING]');
            // Turning hydrated JSON into a promise

            if (entry.data) {
              console.log('[DEHYDRATING]: hydrated data', entry.data);
              entry.promise = Promise.resolve(entry.data);
            } else if (entry.error) {
              console.log('[DEHYDRATING]: hydrated error', entry.error);
              entry.promise = Promise.reject(entry.error);
            } else {
              throw new Error('Failed dehydrating');
            }
            entry.promise.finally(() => {
              decRef();
            });
            return entry.promise as $Output;
          }
          const promise = opts.fn();
          cache[opts.key] = entry = {
            promise,
          };
          incRef();

          promise
            .then((data) => {
              console.log('got data', {
                key: opts.key,
                data,
              });
              entry.data = data;
            })
            .catch((error) => {
              entry.error = error;
            })
            .finally(() => {
              decRef();
            });

          return promise;
        },
      }}
    >
      <React.Suspense fallback={props.fallback}>
        {props.children}
        <CacheProviderHydrator />
      </React.Suspense>
    </context.Provider>
  );
}

async function fetchRandom(timeout: number) {
  console.log('[FETCHING]');
  await new Promise((resolve) => setTimeout(resolve, timeout));
  console.log('[FETCHED]');
  return Math.random();
}
function ShowContext(props: { timeout: number }) {
  const ctx = React.use(context);

  const myData = React.use(
    ctx.exec({
      key: 'something',
      fn: () => fetchRandom(props.timeout),
    }),
  );

  return <pre>{JSON.stringify(myData, null, 4)}</pre>;
}

export default function DefaultPage() {
  return (
    <CacheProvider fallback="Loading page....">
      <ShowContext timeout={300} />
      <CacheProvider fallback="Loading child...">
        <ShowContext timeout={1000} />
      </CacheProvider>
    </CacheProvider>
  );
}
