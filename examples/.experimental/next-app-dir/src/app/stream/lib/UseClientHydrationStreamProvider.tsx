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

interface DataTransformer {
  serialize(object: any): any;
  deserialize(object: any): any;
}

type Serialized<TData> = unknown & {
  [serializedSymbol]: TData;
};

type SerializedString<TData> = string & {
  [serializedSymbol]: TData;
};

interface TypedDataTransformer<TData> {
  serialize: (obj: TData) => Serialized<TData>;
  deserialize: (obj: Serialized<TData>) => TData;
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
   * @default Pass-through
   */
  transformer?: DataTransformer;
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

  const [transformer] = useState(
    () =>
      (props.transformer ?? {
        // noop
        serialize: (obj: any) => obj,
        deserialize: (obj: any) => obj,
      }) as unknown as TypedDataTransformer<TShape>,
  );
  const count = useRef(0);

  // Server: flush cache
  useServerInsertedHTML(() => {
    if (!stream.length || typeof window !== 'undefined') {
      return null;
    }
    console.log('pushing', stream.length, 'entries');
    const serializedCacheArgs = stream
      .map((entry) => transformer.serialize(entry))
      .map((entry) => JSON.stringify(entry))
      .join(',');

    // Flush stream
    stream.length = 0;

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
      const entries = serializedCacheEntryRecord.map((serialized) =>
        transformer.deserialize(serialized),
      );
      onEntriesRef.current(entries);
    },
    [transformer],
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
    push(...stream);

    // Register our own consumer
    win.__stream[id] = {
      push,
    };
  }, [id, push]);

  const ctx = context as Context<HydrationStreamContext<TShape>>;
  return <ctx.Provider value={{ stream }}>{props.children}</ctx.Provider>;
}
