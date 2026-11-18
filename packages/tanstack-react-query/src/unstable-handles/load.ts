import type {
  QueryClient,
  QueryFunction,
  QueryFunctionContext,
} from '@tanstack/react-query';
import { hashKey, isCancelledError, skipToken } from '@tanstack/react-query';
import type {
  OperationPipeline,
  PipelineSource,
  PipelinedCall,
} from '@trpc/client/unstable-internals';
import {
  createOperationPipeline,
  pipeCall,
} from '@trpc/client/unstable-internals';
import type {
  PipelineCallReads,
  PipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import { readPipelinePath } from '@trpc/server/unstable-core-do-not-import';
import type { EntryDataRef, EntryInputRef } from './dataRef';
import { blankInput } from './dataRef';
import type { EntryState } from './entry';
import { entryCause, TRPCEntryError } from './entryError';
import { toHandle } from './handle';
import {
  itemPathOf,
  itemsAt,
  listOfElements,
  requestPath,
  serverList,
} from './list';
import type { ListItem } from './list';
import type { DataPath, RequestPath } from './path';
import {
  dataOfCall,
  resultOfItem,
  sameCursor,
  withPipelinedResult,
} from './pipelined';
import type { EntryLeaf, EntryTree } from './plan';
import { leavesOf, mapEntryTree, readEntries, waitedByHandle } from './plan';
import { nothing } from './utils';

export function startEntry(opts: {
  queryClient: QueryClient;
  state: EntryState;
  options: any;
}) {
  const { queryClient, options } = opts;
  // A `skipToken` input: its query is disabled, and nothing starts
  if (options.queryFn === skipToken) {
    return Promise.resolve(undefined);
  }
  if (opts.state.type === 'infinite') {
    switch (opts.state.kind) {
      case 'prefetch':
        return queryClient.prefetchInfiniteQuery(options);
      case 'ensure':
        return queryClient.ensureInfiniteQueryData({
          ...options,
          revalidateIfStale: true,
        });
      case 'fetch':
        return queryClient.fetchInfiniteQuery(options);
    }
  }
  switch (opts.state.kind) {
    case 'prefetch':
      return queryClient.prefetchQuery(options);
    case 'ensure':
      return queryClient.ensureQueryData({
        ...options,
        revalidateIfStale: true,
      });
    case 'fetch':
      return queryClient.fetchQuery(options);
  }
}

/**
 * Next.js signals control flow, such as `headers()` in a static render, by
 * throwing an error with a `digest`, and reads it off the error the page throws.
 */
export function hasDigest(error: unknown): error is Error & { digest: string } {
  return (
    error instanceof Error &&
    typeof (error as { digest?: unknown }).digest === 'string'
  );
}

export function toEntryError(key: string, state: EntryState, error: unknown) {
  // Not failures of the entry: pass them on as they are
  if (isCancelledError(error) || hasDigest(error)) {
    return error;
  }
  return new TRPCEntryError({
    key,
    path: state.path.join('.'),
    ...entryCause(error),
  });
}

export function settleLoad(promise: Promise<unknown>) {
  return promise.then(
    (data) => ({ status: 'success', data }),
    (error: unknown) => {
      if (error instanceof TRPCEntryError) {
        return { status: 'error', error };
      }
      throw error;
    },
  );
}

export interface EntryLoad {
  leaf: EntryLeaf;
  /**
   * What the entries that read this one's data have the server read: the
   * pipeline that goes with the query's request, which a link that pipelines
   * opens, or the call the server makes for this entry in another's request.
   */
  pipeline: OperationPipeline | PipelinedCall | null;
  /**
   * The result of that request or call, in the shape of the query's data. It
   * is what the server read for the entries that read this one
   */
  requestData: Promise<unknown> | null;
  /**
   * The entry's handle. It waits for the data that the handle's input has:
   * all that the entry reads with `experimental_dataOf()`, but for an entry
   * per item or from another's data, not the item or that data
   */
  handle: Promise<Record<string, unknown>>;
  /**
   * The handle without the data that `handle` waits for. It is whole if
   * that is none, which a load that can't wait checks before it starts
   */
  handleNow: () => Record<string, unknown>;
  /** Settles like the `QueryClient` method the entry is named after */
  promise: Promise<unknown>;
  /** The query's data, also for a prefetch entry */
  data: Promise<unknown>;
  /** The query's data, from the step in which it is known */
  published: Published;
}

/**
 * An entry's data or failure, for the entries that read it. They are told in
 * the same step as the `QueryClient` gets the data, so that their queries
 * exist before a component can read that data and ask for them itself.
 */
export interface Published {
  settled: { ok: true; data: unknown } | { ok: false; error: unknown } | null;
  listeners: (() => void)[];
}

export function publish(published: Published, settled: Published['settled']) {
  if (published.settled) {
    return;
  }
  published.settled = settled;
  for (const listener of published.listeners.splice(0)) {
    listener();
  }
}

/**
 * Calls `run` once, in the step in which the last of the entries has data, or
 * the first of them has failed.
 */
export function whenPublished(
  sources: Map<object, EntryLoad>,
  run: (
    result:
      | { ok: true; data: Map<object, unknown> }
      | { ok: false; error: unknown },
  ) => void,
) {
  let done = false;
  const check = () => {
    if (done) {
      return;
    }
    const data = new Map<object, unknown>();
    let pending = false;
    for (const [entry, source] of sources) {
      const { settled } = source.published;
      if (!settled) {
        pending = true;
      } else if (!settled.ok) {
        done = true;
        run(settled);
        return;
      } else {
        data.set(entry, settled.data);
      }
    }
    if (!pending) {
      done = true;
      run({ ok: true, data });
    }
  };
  // Nothing has settled when a load builds its entries
  for (const source of sources.values()) {
    source.published.listeners.push(check);
  }
}

/** In place of the options of an entry that couldn't start */
export const notStarted = Symbol('trpc.handleEntryNotStarted');

/**
 * Starts every entry. Nothing waits here: each entry's load says what it
 * settles to.
 */
export function beginEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /** Resolve each waited entry to a `TRPCEntryResult` instead of rejecting */
  settle: boolean;
  /**
   * The name of the hook that needs every handle at once, without the data
   * of any entry. `null` for a load that waits
   */
  now: string | null;
}) {
  const { queryClient } = opts;
  const tree = readEntries({ queryClient, entries: opts.entries, keys: [] });
  const leaves = leavesOf(tree);
  const leafOfEntry = new Map(leaves.map((leaf) => [leaf.entry, leaf]));
  // Checked for every entry before any query starts
  for (const leaf of leaves) {
    const sourceOf = (ref: EntryDataRef) => {
      const source = leafOfEntry.get(ref.entry);
      if (!source) {
        throw new Error(
          `The entry for "${leaf.key}" reads the data of an entry with \`experimental_dataOf()\` that isn't in this load. Add that entry to the load`,
        );
      }
      return source;
    };
    leaf.reads = leaf.state.refs.map((ref) => ({ ref, source: sourceOf(ref) }));
    leaf.list = leaf.each
      ? { ref: leaf.each, source: sourceOf(leaf.each) }
      : null;
  }
  const readLeaves = new Set(
    leaves.flatMap((leaf) => [
      ...leaf.reads.map((read) => read.source),
      ...(leaf.list ? [leaf.list.source] : []),
    ]),
  );
  if (opts.now) {
    for (const leaf of leaves) {
      if (waitedByHandle(leaf).size > 0) {
        throw new Error(
          `The handle of the entry for "${leaf.key}" has another entry's data in its input, and \`${opts.now}()\` doesn't wait for data. ${
            leaf.each
              ? 'Make the entry of its list a prefetch entry, and read nothing else of the list in its input'
              : 'Build the entry from that data, with `experimental_dataOf(entry, (data) => entry)`'
          }, or wait in a loader with \`loadHandles()\``,
        );
      }
    }
  }
  /** The entry each failure is of, by the error. Not by its key: `card.post` can be a key, or two */
  const failedLeafOf = new WeakMap<object, EntryLeaf>();
  /** An entry's failure, as a load reports it */
  const failureOf = (leaf: EntryLeaf, error: unknown) => {
    const failure = toEntryError(leaf.key, leaf.state, error);
    if (failure instanceof TRPCEntryError) {
      failedLeafOf.set(failure, leaf);
    }
    return failure;
  };
  /**
   * Whether an entry couldn't start because an entry it reads failed, and
   * `loadHandlesSettled()` has that failure in its results. The entry then
   * has no handle. A failed prefetch entry has no result, so it still rejects
   */
  const isSettledFailure = (error: unknown) => {
    const failed =
      typeof error === 'object' && error !== null
        ? failedLeafOf.get(error)
        : undefined;
    return (
      opts.settle && failed !== undefined && failed.state.kind !== 'prefetch'
    );
  };

  /** The data of the entries an entry reads, by entry */
  const dataOfSources = (
    sources: Map<object, EntryLoad>,
    read: (source: EntryLoad, entry: object) => Promise<unknown> | null,
  ) =>
    Promise.all(
      [...sources].map(async ([entry, source]) => {
        return [entry, await read(source, entry)] as const;
      }),
    ).then((resolved) => new Map(resolved));

  /**
   * Has the server make an entry's request in the request of the entries it
   * reads, if those just went to a link that pipelines. The server fills in
   * its input
   */
  function sendPipelined(pipelined: {
    state: EntryState;
    /** What the entry's input reads, and the load of the entry of each */
    reads: { ref: EntryInputRef; source: EntryLoad }[];
    /**
     * For an entry for every item: the list, the load of its entry, and the
     * path of the list in the result of that entry's request
     */
    list: { ref: EntryDataRef; source: EntryLoad; path: RequestPath } | null;
  }) {
    const { state, list } = pipelined;
    const { request } = state;
    if (!request.pipelines) {
      return null;
    }
    const read = pipelined.reads.filter(({ ref }) =>
      request.serverReads.has(ref),
    );
    // Not by its path: the whole list, read with `.map()`, has the same one
    const readsItem = (ref: EntryDataRef) => !!list && ref.itemOf === list.ref;
    const reads = read.flatMap(
      ({ ref, source }): PipelineCallReads<PipelineSource>['reads'] => {
        if (list && readsItem(ref)) {
          return [
            {
              kind: 'item',
              to: ref.to,
              // From the server's item: the element of its list
              path: ref.path.slice(itemPathOf(list.ref).lastIndexOf(null) + 1),
            },
          ];
        }
        const path = requestPath({
          type: source.leaf.state.type,
          path: ref.path,
          item: false,
        });
        return source.pipeline && path
          ? [{ kind: 'whole', to: ref.to, from: source.pipeline, path }]
          : [];
      },
    );
    const each = list?.source.pipeline
      ? { from: list.source.pipeline, path: list.path }
      : null;
    if (reads.length !== read.length || (list && !each)) {
      return null;
    }
    return pipeCall({
      path: request.path,
      input: request.input,
      reads: { each, reads },
    });
  }

  /** The prefetch entries whose data another entry reads, by their query's hash */
  const watched = new Map<string, Published[]>();
  let unwatch: (() => void) | null = null;
  /**
   * Tells the entries that read a prefetch entry's data in the step in which
   * the `QueryClient` gets it. A fetch or ensure entry's data is what its
   * `QueryClient` method resolves to, which the load waits for anyway
   */
  function watch(options: any, published: Published) {
    const { queryHash } = queryClient.defaultQueryOptions(options);
    watched.set(queryHash, [...(watched.get(queryHash) ?? []), published]);
    unwatch ??= queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        for (const published of watched.get(event.query.queryHash) ?? []) {
          publish(published, { ok: true, data: event.query.state.data });
        }
      }
    });
  }

  const loads = new Map<EntryLeaf, EntryLoad>();
  // An entry only reads entries built before it, so this can't loop
  function loadOf(leaf: EntryLeaf): EntryLoad {
    const existing = loads.get(leaf);
    if (existing) {
      return existing;
    }
    const { state } = leaf;
    const reads = leaf.reads.map((read) => ({
      ref: read.ref,
      source: loadOf(read.source),
    }));
    const sources = new Map(reads.map((read) => [read.ref.entry, read.source]));
    if (leaf.list) {
      sources.set(leaf.list.ref.entry, loadOf(leaf.list.source));
      const load = loadPerItem({ leaf, list: leaf.list.ref, sources, reads });
      loads.set(leaf, load);
      return load;
    }

    const published: Published = { settled: null, listeners: [] };
    const start = (options: any) => {
      if (options.queryFn === skipToken) {
        // Nothing starts: an entry that reads this one's data has none to
        // read. Not in this step, in which the load still builds its entries
        void Promise.resolve().then(() =>
          publish(published, {
            ok: false,
            error: new Error(
              `"${leaf.key}" has \`skipToken\` as its input, so it has no data for the entries that read it`,
            ),
          }),
        );
      } else if (state.kind === 'prefetch' && readLeaves.has(leaf)) {
        watch(options, published);
      }
      return startEntry({ queryClient, state, options }).catch(
        (error: unknown) => {
          throw failureOf(leaf, error);
        },
      );
    };
    let pipeline: OperationPipeline | PipelinedCall | null = null;
    let requestData: Promise<unknown> | null = null;
    let options: Promise<any>;
    let promise: Promise<unknown>;
    if (sources.size === 0) {
      let built = state.options({ dataOfRef: nothing, pipeline: null });
      if (
        readLeaves.has(leaf) &&
        state.request.pipelines &&
        typeof built.queryFn === 'function'
      ) {
        // Another entry reads this one: its request can take part in pipelining
        const sent = createOperationPipeline();
        pipeline = sent;
        built = state.options({ dataOfRef: nothing, pipeline: sent });
        const queryFn: QueryFunction<any, any, any> = built.queryFn;
        let first: Promise<unknown> | null = null;
        const request = new Promise<unknown>((resolve) => {
          built = {
            ...built,
            queryFn: (context: QueryFunctionContext<any, any>) => {
              const result = Promise.resolve(queryFn(context));
              if (!first) {
                // Its first request is the one a link takes into a batch. For
                // an infinite query, it is the first page
                first = result;
                resolve(
                  state.type === 'infinite'
                    ? result.then((page) => ({
                        pages: [page],
                        pageParams: [context.pageParam],
                      }))
                    : result,
                );
              }
              return result;
            },
          };
        });
        request.catch(nothing);
        requestData = request;
      }
      options = Promise.resolve(built);
      // The query starts now, not a tick later
      promise = start(built);
    } else {
      const call = sendPipelined({ state, reads, list: null });
      if (call && state.type === 'query') {
        // An infinite query's data is its pages, which no one request returns,
        // so the server can't read it for the entries that read this one
        pipeline = call;
        requestData = dataOfCall(call);
      }
      const fill = (dataOfEntry: Map<object, unknown>) =>
        state.options({
          dataOfRef: (ref) =>
            readPipelinePath(dataOfEntry.get(ref.entry), ref.path, null),
          pipeline: null,
        });
      // The query starts in the step in which the last of the entries it reads
      // has data. When one of them fails, its error is this entry's too: it
      // never started
      const started = new Promise<{ options: any; promise: Promise<unknown> }>(
        (resolve, reject) => {
          whenPublished(sources, (result) => {
            if (!result.ok) {
              reject(result.error);
              return;
            }
            try {
              const filled = fill(result.data);
              const built = call
                ? withPipelinedResult({
                    options: filled,
                    result: dataOfCall(call),
                    unresolved: () => call.status === 'unresolved',
                    sameInput: async (context) => {
                      if (
                        state.type === 'infinite' &&
                        // The call was for the first page
                        !(
                          context.direction === 'forward' &&
                          Object.is(context.pageParam, filled.initialPageParam)
                        )
                      ) {
                        return false;
                      }
                      // What the server read. What it didn't fill in is the
                      // client's, and an entry the cache had made no request
                      const serverRead = new Set(
                        reads
                          .filter(({ ref }) =>
                            state.request.serverReads.has(ref),
                          )
                          .map(({ ref }) => ref.entry),
                      );
                      const sent = fill(
                        await dataOfSources(sources, (source, entry) =>
                          serverRead.has(entry)
                            ? source.requestData
                            : Promise.resolve(result.data.get(entry)),
                        ),
                      );
                      return (
                        hashKey(filled.queryKey) === hashKey(sent.queryKey) &&
                        // An infinite query's cursor isn't in its key
                        sameCursor(
                          filled.initialPageParam,
                          sent.initialPageParam,
                        )
                      );
                    },
                  })
                : filled;
              resolve({ options: built, promise: start(built) });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      options = started.then((entry) => entry.options);
      promise = started.then((entry) => entry.promise);
    }
    // Nothing waits for the options of an entry from another's data
    options.catch(nothing);
    const data =
      state.kind === 'prefetch'
        ? promise.then(async () => {
            // A prefetch resolves to nothing and never rejects
            const query = queryClient.getQueryState((await options).queryKey);
            if (query?.data === undefined) {
              throw failureOf(leaf, query?.error);
            }
            return query.data;
          })
        : promise;
    // Only an entry that reads it with `experimental_dataOf()` waits for it
    data.then(
      (loaded) => publish(published, { ok: true, data: loaded }),
      (error: unknown) => publish(published, { ok: false, error }),
    );
    const { from } = leaf;
    /** The input without the data it is built from, and where that data goes */
    const unfinished = (dataOfEntry: Map<object, unknown>) => ({
      ...toHandle(
        state.options({
          dataOfRef: (ref) =>
            ref.entry === from
              ? blankInput
              : readPipelinePath(dataOfEntry.get(ref.entry), ref.path, null),
          pipeline: null,
        }),
        state.type,
      ),
      itemInputs: state.refs
        .filter((ref) => ref.entry === from)
        .map((ref) => ({ to: ref.to, path: ref.path })),
    });
    const waitedEntries = waitedByHandle(leaf);
    const waited = new Map(
      [...sources].filter(([entry]) => waitedEntries.has(entry)),
    );
    const load: EntryLoad = {
      leaf,
      pipeline,
      requestData,
      handle:
        from === null
          ? options.then((built) => toHandle(built, state.type))
          : dataOfSources(waited, (source) => source.data).then(unfinished),
      handleNow: () =>
        from === null
          ? toHandle(
              state.options({ dataOfRef: nothing, pipeline: null }),
              state.type,
            )
          : unfinished(new Map()),
      promise,
      data,
      published,
    };
    loads.set(leaf, load);
    return load;
  }

  /** Loads an entry from `experimental_entryPerItem()`: a query for every item of a list */
  function loadPerItem(perItem: {
    leaf: EntryLeaf;
    list: EntryDataRef;
    sources: Map<object, EntryLoad>;
    reads: { ref: EntryInputRef; source: EntryLoad }[];
  }): EntryLoad {
    const { leaf, list, sources } = perItem;
    const { state } = leaf;
    const itemPath = itemPathOf(list);
    // Not by its path: the whole list, read with `.map()`, has the same one
    const readsItem = (ref: EntryDataRef) => ref.itemOf === list;
    /** The items of the list in an entry's data, as the server walks them */
    const itemsOf = (dataOfEntry: Map<object, unknown>) =>
      itemsAt(dataOfEntry.get(list.entry), itemPath);
    /** Where a value read from the item's stand-in is, for one item */
    const pathOfItem = (path: DataPath, listItem: ListItem) => [
      ...listItem.path,
      ...path.slice(itemPath.length),
    ];
    const optionsOfItem = (
      dataOfEntry: Map<object, unknown>,
      listItem: ListItem,
    ) =>
      state.options({
        dataOfRef: (ref) =>
          readPipelinePath(
            dataOfEntry.get(ref.entry),
            readsItem(ref) ? pathOfItem(ref.path, listItem) : ref.path,
            null,
          ),
        pipeline: null,
      });

    // One call, which the server runs once for every item. Its result is a
    // `{ result }` or an `{ error }` for every item. An entry that reads
    // nothing of its item has no call for every item: its query is an ordinary one
    const listSource = sources.get(list.entry);
    /** The list in the result of its entry's request: the first page's, of an infinite query */
    const listPath =
      listSource &&
      requestPath({
        type: listSource.leaf.state.type,
        path: serverList(itemPath).each,
        item: true,
      });
    const call =
      listSource && listPath && perItem.reads.some(({ ref }) => readsItem(ref))
        ? sendPipelined({
            state,
            reads: perItem.reads,
            list: { ref: list, source: listSource, path: listPath },
          })
        : null;
    /**
     * Where the server ran an item, in its levels of lists: the item's own
     * indexes without the levels the request has no list for, such as the
     * pages of an infinite query, where it has the first. `null` for an item
     * it ran none for
     */
    const serverIndexes = (listItem: ListItem) => {
      const levels = (path: PipelinePath) =>
        path.filter((segment) => segment === null).length;
      const skipped = levels(itemPath) - (levels(listPath ?? []) + 1);
      return listItem.indexes.slice(0, skipped).every((index) => index === 0)
        ? listItem.indexes.slice(skipped)
        : null;
    };

    /** Where an item is in the list, as a key */
    const placeOf = (listItem: ListItem) => listItem.indexes.join(',');

    /** The input without the item's parts, and where they go */
    const unfinished = (dataOfEntry: Map<object, unknown>) => ({
      ...toHandle(
        state.options({
          dataOfRef: (ref) =>
            readsItem(ref)
              ? blankInput
              : readPipelinePath(dataOfEntry.get(ref.entry), ref.path, null),
          pipeline: null,
        }),
        state.type,
      ),
      itemInputs: state.refs
        .filter(readsItem)
        .map((ref) => ({ to: ref.to, path: ref.path.slice(itemPath.length) })),
    });
    const waitedEntries = waitedByHandle(leaf);
    const handle = dataOfSources(
      new Map([...sources].filter(([entry]) => waitedEntries.has(entry))),
      (source) => source.data,
    ).then(unfinished);

    // The items' queries start in the step in which the list has data
    const started = new Promise<Promise<unknown>[]>((resolve, reject) => {
      whenPublished(sources, (result) => {
        if (!result.ok) {
          reject(result.error);
          return;
        }
        try {
          const { data } = result;
          /**
           * The key of every item's query, with the input the server filled
           * in, by where the item is: the place it reads its result from
           */
          const serverKeys = call
            ? dataOfSources(sources, (source) => source.requestData).then(
                (serverData) =>
                  new Map(
                    itemsOf(serverData).map((listItem) => [
                      placeOf(listItem),
                      hashKey(optionsOfItem(serverData, listItem).queryKey),
                    ]),
                  ),
              )
            : null;
          serverKeys?.catch(nothing);

          resolve(
            itemsOf(data).map((listItem, index) => {
              const place = placeOf(listItem);
              let options = optionsOfItem(data, listItem);
              if (call && serverKeys) {
                const key = hashKey(options.queryKey);
                const item = resultOfItem(
                  dataOfCall(call),
                  serverIndexes(listItem),
                );
                options = withPipelinedResult({
                  options,
                  result: item.result,
                  unresolved: () =>
                    call.status === 'unresolved' || item.missing(),
                  // The server ran the same query at the item's place
                  sameInput: async () => (await serverKeys).get(place) === key,
                });
              }
              const itemKey = `${leaf.key}.${index}`;
              return startEntry({ queryClient, state, options }).catch(
                (error: unknown) => {
                  throw toEntryError(itemKey, state, error);
                },
              );
            }),
          );
        } catch (error) {
          reject(error);
        }
      });
    });
    const promise = started.then(
      (items) =>
        Promise.all(
          items.map((itemPromise) =>
            opts.settle ? settleLoad(itemPromise) : itemPromise,
          ),
        ),
      (error: unknown) => {
        if (isSettledFailure(error)) {
          // Without the list, there are no items to have results
          return [];
        }
        throw error;
      },
    );
    // A prefetch entry's load isn't waited for
    promise.catch(nothing);
    return {
      leaf,
      // Nothing reads the data of an entry that is a list of queries
      pipeline: null,
      requestData: null,
      handle,
      handleNow: () => unfinished(new Map()),
      promise,
      data: promise,
      published: { settled: null, listeners: [] },
    };
  }

  const allLoads = leaves.map(loadOf);
  // Until every entry has settled. An entry that starts later can watch too
  void Promise.allSettled(allLoads.map((load) => load.promise)).then(() =>
    unwatch?.(),
  );
  return { tree, leafOfEntry, allLoads, isSettledFailure };
}

/** The handles of a load's entries, in the shape of the entries */
export function handlesOfLoads(opts: {
  tree: EntryTree;
  leafOfEntry: Map<object, EntryLeaf>;
  /** An entry that couldn't start has none */
  handleOfLeaf: Map<EntryLeaf, Record<string, unknown>>;
}) {
  const { handleOfLeaf } = opts;
  // A list's handle says what its items load, so that a later fetch of the
  // list, such as the next page, can load that in the same request
  for (const [leaf, handle] of handleOfLeaf) {
    const source = leaf.each && opts.leafOfEntry.get(leaf.each.entry);
    const sourceHandle = source && handleOfLeaf.get(source);
    if (
      !leaf.each ||
      !source ||
      !sourceHandle ||
      !leaf.state.request.pipelines
    ) {
      continue;
    }
    // The items in one request's result: a query's data, or any page
    const itemPath = itemPathOf(leaf.each);
    const inRequest = requestPath({
      type: source.state.type,
      path: itemPath,
      item: true,
    });
    // A later fetch reads the items there
    const list = inRequest ? listOfElements(inRequest) : null;
    if (list) {
      sourceHandle['experimental_perItem'] = [
        ...((sourceHandle['experimental_perItem'] as unknown[] | undefined) ??
          []),
        { ...handle, list },
      ];
    }
  }
  return mapEntryTree(opts.tree, (leaf) => {
    const handle = handleOfLeaf.get(leaf);
    return handle ? [handle] : [];
  });
}

export async function startEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /** Resolve each waited entry to a `TRPCEntryResult` instead of rejecting */
  settle: boolean;
}) {
  const { tree, leafOfEntry, allLoads, isSettledFailure } = beginEntries({
    ...opts,
    now: null,
  });
  const waited = allLoads.filter((load) => load.leaf.state.kind !== 'prefetch');
  const [results, loadedHandles] = await Promise.all([
    Promise.all(
      waited.map((load) =>
        // An entry per item settles every item itself
        opts.settle && !load.leaf.each
          ? settleLoad(load.promise)
          : load.promise,
      ),
    ),
    // A handle needs its input, so also wait for the data that prefetch
    // entries read into theirs
    Promise.all(
      allLoads.map((load) =>
        load.handle.catch((error: unknown) => {
          if (isSettledFailure(error)) {
            return notStarted;
          }
          throw error;
        }),
      ),
    ),
  ]);

  const resultOfLeaf = new Map(
    waited.map((load, index) => [load.leaf, results[index]]),
  );
  const handles = handlesOfLoads({
    tree,
    leafOfEntry,
    handleOfLeaf: new Map(
      allLoads.flatMap((load, index) => {
        const handle = loadedHandles[index];
        // An entry that couldn't start has none
        return handle === undefined || typeof handle === 'symbol'
          ? []
          : [[load.leaf, handle] as const];
      }),
    ),
  });
  const data = mapEntryTree(tree, (leaf) =>
    resultOfLeaf.has(leaf) ? [resultOfLeaf.get(leaf)] : [],
  );
  return [handles, data] as const;
}
