import { useServerInsertedHTML } from 'next/navigation';
import {
  createContext,
  useCallback,
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

interface TypedDataTransformer<TData> {
  serialize: (obj: TData) => Serialized<TData>;
  deserialize: (obj: Serialized<TData>) => TData;
}

interface HydrationStreamContext<TShape> {
  id: string;
  stream: {
    /**
     * **Server method**
     * Push a new entry to the stream
     * Will be ignored on the client
     */
    push: (...shape: TShape[]) => void;
  };
}

export function createDataStream<TShape>() {
  const context = createContext<HydrationStreamContext<TShape>>(null as any);
  /**
   *
   * Server:
   * 1. `useServerInsertedHTML()` is called **on the server** whenever a `Suspense`-boundary completes
   *    - This means that we might have some new entries in the cache that needs to be flushed
   *    - We pass these to the client by inserting a `<script>`-tag where we do `window.[windowKey][id].push(serializedVersionOfCache)`
   *
   * Client:
   * 2. In `useEffect()`:
   *   - We check if `window.__stream[id]` is set to an array and call `push()` on all the entries
   *   -
   **/
  function UseClientHydrationStreamProvider(props: {
    children: React.ReactNode;
    /**
     * Optional transformer to serialize/deserialize the data
     * Example devalue, superjson et al
     */
    transformer?: DataTransformer;
    /**
     * **Client method**
     * Called in the browser when new entries are received
     */
    onEntries: (entries: TShape[]) => void;
    /**
     * **Server method**
     * onFlush is called on the server when the cache is flushed
     */
    onFlush?: () => TShape[];
  }) {
    // unique id for the cache provider
    const id = `_${useId()}`;
    const idJSON = JSON.stringify(id);

    const [transformer] = useState(
      () =>
        (props.transformer ?? {
          // noop
          serialize: (obj: any) => obj,
          deserialize: (obj: any) => obj,
        }) as unknown as TypedDataTransformer<TShape>,
    );

    // <server stuff>
    const [stream] = useState<TShape[]>(() => {
      if (typeof window !== 'undefined') {
        return {
          push() {
            // no-op on the client
          },
        } as unknown as TShape[];
      }
      return [];
    });
    const count = useRef(0);
    const onDehydrateRef = useRef(props.onFlush);
    onDehydrateRef.current = props.onFlush;
    useServerInsertedHTML(() => {
      // This only happens on the server
      const _stream = [...stream, ...(onDehydrateRef.current?.() ?? [])];

      if (!_stream.length) {
        return null;
      }
      console.log(`pushing ${_stream.length} entries`);
      const serializedCacheArgs = _stream
        .map((entry) => transformer.serialize(entry))
        .map((entry) => JSON.stringify(entry))
        .join(',');

      // Flush stream
      stream.length = 0;

      const html: string[] = [
        `window[${idJSON}] = window[${idJSON}] || [];`,
        `window[${idJSON}].push(${serializedCacheArgs});`,
      ];
      return (
        <script
          key={count.current++}
          dangerouslySetInnerHTML={{
            __html: html.join(''),
          }}
        />
      );
    });
    // </server stuff>

    // <client stuff>
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
      const win = window as any;
      // Register cache consumer
      const stream: Array<Serialized<TShape>> = win[id] ?? [];

      if (!Array.isArray(stream)) {
        throw new Error(`${id} seem to have been registered twice`);
      }
      push(...stream);

      // Register our own consumer
      win[id] = {
        push,
      };

      return () => {
        // Cleanup after unmount
        win[id] = {
          push() {
            // no-op
          },
        };
      };
    }, [id, push]);
    // </client stuff>

    return (
      <context.Provider value={{ stream, id }}>
        {props.children}
      </context.Provider>
    );
  }

  return {
    Provider: UseClientHydrationStreamProvider,
    context,
  };
}
