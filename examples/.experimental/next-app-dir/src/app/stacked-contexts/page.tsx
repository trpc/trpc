'use client';

import * as React from 'react';
import { Deferred } from './Deferred';

interface Context {
  id: string;
  cache: Record<string, {}>;

  onSettled: Promise<void>;
  exec: <TData>(opts: {
    cacheKey: string;
    fn: () => Promise<TData>;
  }) => Promise<TData>;
}

const context = React.createContext<Context>(null as any);

function CacheProviderHydrator() {
  const ctx = React.useContext(context);
  React.use(ctx.onSettled);

  console.log('id', ctx.id, ctx.cache);
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
          const cached = cache[opts.cacheKey];
          if (cache[opts.cacheKey]) {
          }
          const promise = opts.fn();

          promise
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

async function fetchRandom() {
  return Math.random();
}
function ShowContext() {
  const ctx = React.use(context);

  const myData = React.use(
    ctx.exec({
      cacheKey: 'something',
      fn: () => fetchRandom(),
    }),
  );

  return <pre>{JSON.stringify(myData, null, 4)}</pre>;
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
