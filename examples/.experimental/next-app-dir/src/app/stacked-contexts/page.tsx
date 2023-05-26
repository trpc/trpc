'use client';

import * as React from 'react';
import { Deferred } from './Deferred';

interface Context {
  id: string;
  cache: Record<string, {}>;

  onSettled: Promise<void>;
  exec: (opts: { cacheKey: string; fn: () => Promise<unknown> }) => any;
}

const context = React.createContext<Context>(null as any);

function CacheProviderHydrator() {
  const ctx = React.useContext(context);
  React.use(ctx.onSettled);

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
            window.cache = window.cache || {};
            window.cache[${ctx.id}] = ${JSON.stringify(ctx.cache, null, 4)};
        `,
      }}
    />
  );
}

function CacheProvider(props: {
  children: React.ReactNode;
  fallback?: React.SuspenseProps['fallback'];
}) {
  const cacheRef = React.useRef<Record<string, {}>>({});
  const [onSettled, setOnSettled] = React.useState<Deferred<void>>(() => {
    const deferred = new Deferred<void>();
    deferred.resolve();
    return deferred;
  });
  let opCount = React.useRef(0);
  const cache = cacheRef.current;

  const id = React.useId();
  return (
    <context.Provider
      value={{
        id,
        // ...
        cache,
        onSettled,
        exec: (opts) => {
          if (opCount.current === 0) {
            setOnSettled(new Deferred<void>());
          }
          opCount.current++;

          opts
            .fn()
            .then((data) => {
              cache[opts.cacheKey] = {
                data,
              };
            })
            .catch((error) => {
              cache[opts.cacheKey] = {
                error,
              };
            })
            .finally(() => {
              opCount.current--;
              if (opCount.current === 0) {
                onSettled.resolve();
              }
            });
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

function ShowContext() {
  const ctx = React.use(context);
  return <pre>{JSON.stringify(ctx.cache, null, 4)}</pre>;
}

export default function DefaultPage() {
  return (
    <CacheProvider fallback="Loading page....">
      <ShowContext />
      <CacheProvider fallback="Loading child...">
        <ShowContext />
      </CacheProvider>
    </CacheProvider>
  );
}
