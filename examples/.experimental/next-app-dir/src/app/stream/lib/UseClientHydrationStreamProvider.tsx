import { useServerInsertedHTML } from 'next/navigation';
import {
  Context,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

const serializedSymbol = Symbol('serialized');

interface Serializer {
  stringify: (obj: unknown) => string;
  parse: (str: string) => unknown;
}

type Serialized<TData> = string & {
  [serializedSymbol]: TData;
};

interface TypedSerializer {
  stringify: <TData>(obj: TData) => string & Serialized<TData>;
  parse: <TData>(str: string & Serialized<TData>) => TData;
}

interface HydrationStreamContext<TShape> {
  stream: {
    /**
     * Push a new entry to the stream
     * Only call this on the server
     */
    push: (...shape: TShape[]) => void;
  };
}

const context = createContext<HydrationStreamContext<unknown>>(null as any);

export function getHydrationStreamContext<TShape>() {
  return context as Context<HydrationStreamContext<TShape>>;
}

/**
 *
 * Server:
 * 1. `useServerInsertedHTML()` is called **on the server** whenever a `Suspense`-boundary completes
 *    - This means that we might have some new entries in the cache that needs to be flushed
 *    - We pass these to the client by inserting a `<script>`-tag where we do `window.__stream[id].push(serializedVersionOfCache)`
 *
 * Client:
 * 2. In `useEffect()`:
 *   - We check if `window.__stream[id]` is set to an array and call `push()` on all the entries
 *   -
 **/
export function UseClientHydrationStreamProvider<TShape>(props: {
  children: React.ReactNode;
  /**
   * @default JSON
   */
  serializer?: Serializer;
  onEntries: (entries: TShape[]) => void;
}) {
  // unique id for the cache provider
  const id = useId();
  const [stream, setStream] = useState<TShape[]>(() => {
    if (typeof window !== 'undefined') {
      return {
        push() {
          // no-op on the client
        },
      } as unknown as TShape[];
    }
    return [];
  });

  const [serializer] = useState(
    () => (props.serializer ?? JSON) as unknown as TypedSerializer,
  );
  const count = useRef(0);

  // Server: flush cache
  useServerInsertedHTML(() => {
    if (!stream.length) {
      return null;
    }
    const serializedCacheArgs = stream
      .map((entry) => serializer.stringify(entry))
      .map((entry) => JSON.stringify(entry))
      .join(',');

    console.log('serializedCacheArgs', serializedCacheArgs);

    // clear stream
    setStream([]);

    // Calling:
    // window.__stream[id].push()
    console.log(
      'calling',
      `window.__stream["${id}"]`,
      'with',
      serializedCacheArgs,
    );
    return (
      <script
        key={count.current++}
        dangerouslySetInnerHTML={{
          __html: `
              window.__stream = window.__stream || {};
              window.__stream["${id}"] = window.__stream["${id}"] || [];
              window.__stream["${id}"].push(${serializedCacheArgs});
          `.trim(),
        }}
      />
    );
  });

  const onEntriesRef = useRef(props.onEntries);
  onEntriesRef.current = props.onEntries;

  // Client: consume cache:
  const push = useCallback(
    (...serializedCacheEntryRecord: Serialized<TShape>[]) => {
      console.log('pushing', serializedCacheEntryRecord);
      const entries = serializedCacheEntryRecord.map((serialized) =>
        serializer.parse(serialized),
      );
      onEntriesRef.current(entries);
    },
    [serializer],
  );

  useEffect(() => {
    // Register cache consumer
    const win = window as any;
    win.__stream = win.__stream || {};

    win.__stream[id] = win.__stream[id] || [];
    const stream: Array<Serialized<TShape>> = win.__stream[id];
    console.log({ stream });

    if (!Array.isArray(win.__stream[id])) {
      throw new Error(`${id} seem to have been registered twice`);
    }
    stream.map((it) => push(it));

    // Register our own consumer
    win.__stream[id] = {
      push,
    };
  }, [id, push]);

  const ctx = context as Context<HydrationStreamContext<TShape>>;
  return <ctx.Provider value={{ stream }}>{props.children}</ctx.Provider>;
}
