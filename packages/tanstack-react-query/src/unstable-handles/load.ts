import type {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  QueryClient,
  QueryFunction,
  QueryFunctionContext,
} from '@tanstack/react-query';
import { hashKey, isCancelledError, skipToken } from '@tanstack/react-query';
import type {
  PipelinedCall,
  PipelineSource,
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
import type { EntryQueryOptions, EntryState } from './entry';
import { entryCause, TRPCEntryError } from './entryError';
import { toHandle } from './handle';
import { itemPathOf, itemsAt, requestPath } from './list';
import type { ListItem } from './list';
import type { Outcome, Unit } from './outcome';
import {
  allOf,
  attempt,
  attemptNow,
  createUnit,
  failed,
  ok,
  unitOf,
  whenAll,
} from './outcome';
import type { RequestPath } from './path';
import {
  dataOfCall,
  outcomeOfCall,
  outcomeOfItem,
  sameCursor,
  withPipelinedResult,
} from './pipelined';
import type { EntryTree, LinkedLeaf } from './plan';
import { linkEntries, mapEntryTree, readEntries } from './plan';
import { nothing } from './utils';

export function startEntry(opts: {
  queryClient: QueryClient;
  state: EntryState;
  options: EntryQueryOptions;
}) {
  const { queryClient, options } = opts;
  // A `skipToken` input: its query is disabled, and nothing starts
  if (options.queryFn === skipToken) {
    return Promise.resolve(undefined);
  }
  // The options proxy built them for the query's type, as the `QueryClient`
  // methods for that type take them
  if (opts.state.type === 'infinite') {
    const infinite = options as unknown as FetchInfiniteQueryOptions;
    switch (opts.state.kind) {
      case 'prefetch':
        return queryClient.prefetchInfiniteQuery(infinite);
      case 'ensure':
        return queryClient.ensureInfiniteQueryData({
          ...infinite,
          revalidateIfStale: true,
        });
      case 'fetch':
        return queryClient.fetchInfiniteQuery(infinite);
    }
  }
  const query = options as unknown as FetchQueryOptions;
  switch (opts.state.kind) {
    case 'prefetch':
      return queryClient.prefetchQuery(query);
    case 'ensure':
      return queryClient.ensureQueryData({
        ...query,
        revalidateIfStale: true,
      });
    case 'fetch':
      return queryClient.fetchQuery(query);
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

/** Why an entry, or one item's query of it, has no data of its own */
export type OwnFailure =
  /** Its request failed, or its query couldn't start */
  | { readonly kind: 'failed'; readonly error: TRPCEntryError }
  /**
   * Not a failure of the entry, such as a cancelled query or Next.js's
   * control flow: passed on as it is
   */
  | { readonly kind: 'interrupted'; readonly error: unknown }
  /** Its input is `skipToken`: it has no data for the entries that read it */
  | { readonly kind: 'skipped'; readonly error: Error };

/** Why an entry has no data */
export type EntryFailure =
  | OwnFailure
  /**
   * An entry it reads has none, so it never started. `origin` is the entry
   * whose own failure it is, also through entries that read each other
   */
  | {
      readonly kind: 'blocked';
      readonly origin: LinkedLeaf;
      readonly cause: OwnFailure;
    };

/** An entry's own failure, as a load reports it under `key` */
export function ownFailure(
  key: string,
  state: EntryState,
  error: unknown,
): OwnFailure {
  if (isCancelledError(error) || hasDigest(error)) {
    return { kind: 'interrupted', error };
  }
  return {
    kind: 'failed',
    error: new TRPCEntryError({
      key,
      path: state.path.join('.'),
      ...entryCause(error),
    }),
  };
}

/** What a load rejects with for a failure */
export function errorOf(failure: EntryFailure): unknown {
  return failure.kind === 'blocked' ? failure.cause.error : failure.error;
}

/**
 * Whether `loadHandlesSettled()` has a failure of `leaf` in its results
 * rather than rejecting with it: the failure of a fetch or ensure entry,
 * also when `leaf` never started because of it. Such an entry then has no
 * handle. A prefetch entry has no result, so its failure still rejects
 */
export function isReported(leaf: LinkedLeaf, failure: EntryFailure) {
  const origin = failure.kind === 'blocked' ? failure.origin : leaf;
  const cause = failure.kind === 'blocked' ? failure.cause : failure;
  return cause.kind === 'failed' && origin.state.kind !== 'prefetch';
}

type Handle = Record<string, unknown>;

/** The data of the entries an entry reads, by entry, as they were in one step */
type SourceData = ReadonlyMap<object, unknown>;

const noData: SourceData = new Map();

/**
 * The one place an entry's options are built from the data of the entries
 * it reads. `item` is the item of an entry per item to build them for, and
 * `holes` leaves out what its handle doesn't have: the values that
 * `experimental_handleOfItem()` fills in.
 */
function optionsFrom(
  leaf: LinkedLeaf,
  view: { data: SourceData; item: ListItem | null; holes: boolean },
) {
  return leaf.state.options({
    dataOfRef: (ref) => {
      const fromItem = leaf.fromItem(ref);
      if (fromItem && view.holes) {
        return blankInput;
      }
      const path =
        fromItem && view.item
          ? [...view.item.path, ...ref.path.slice(leaf.itemDepth)]
          : ref.path;
      return readPipelinePath(view.data.get(ref.entry), path, null);
    },
    pipeline: null,
  });
}

/**
 * The handle of an entry per item or from another's data: its input without
 * what comes from the item or that data, and where each of those goes
 */
function unfinishedHandle(leaf: LinkedLeaf, data: SourceData) {
  return {
    ...toHandle(
      optionsFrom(leaf, { data, item: null, holes: true }),
      leaf.state.type,
    ),
    itemInputs: leaf.state.refs.filter(leaf.fromItem).map((ref) => ({
      to: ref.to,
      path: ref.path.slice(leaf.itemDepth),
    })),
  };
}

/**
 * What the server read of an entry, for the entries that read its data: the
 * pipeline of its request, which a link that pipelines opens, or the call
 * the server makes for it in another's request; and what that returned, in
 * the shape of the query's data. That is only ever compared with the
 * client's data: what an entry's input is filled in with is the cache's.
 */
interface ServerSide {
  source: PipelineSource;
  sent: Unit<unknown>;
}

/** The load of an entry that is one query */
interface OneLoad {
  shape: 'one';
  leaf: LinkedLeaf;
  server: ServerSide | null;
  /**
   * The query's data as the cache got it from the load's own fetch, or as
   * the cache had it if the load fetched nothing. The one source of what the
   * entries that read it fill in, and of its result.
   */
  data: Unit<unknown, EntryFailure>;
  /** `data`, with a failure as the entries that read it see it: blocked by this one */
  forReaders: Unit<unknown, EntryFailure>;
  /**
   * The entry's handle. It waits for the data that the handle's input has:
   * all that the entry reads with `experimental_dataOf()`, but for an entry
   * per item or from another's data, not the item or that data
   */
  handle: Promise<Outcome<Handle, EntryFailure>>;
  /**
   * The handle without the data that `handle` waits for. It is whole if
   * that is none, which a load that can't wait checks before it starts
   */
  handleNow: () => Handle;
}

/** The load of an entry from `experimental_entryPerItem()`: a query for every item */
interface PerItemLoad {
  shape: 'perItem';
  leaf: LinkedLeaf;
  handle: Promise<Outcome<Handle, EntryFailure>>;
  handleNow: () => Handle;
  /**
   * Once the list has data: each item's outcome, which is that item's own.
   * Blocked if the list, or another entry it reads, has no data
   */
  items: Promise<ItemsOutcome>;
}

/** Each item's own outcome, once the list has data */
type ItemsOutcome = Outcome<
  Promise<Outcome<unknown, EntryFailure>>[],
  EntryFailure
>;

export type EntryLoad = OneLoad | PerItemLoad;

/** Resolves once every part of the entry's load has settled. Never rejects */
export function settledOf(load: EntryLoad): Promise<unknown> {
  return load.shape === 'one'
    ? load.data.outcome
    : load.items.then((items) => (items.ok ? Promise.all(items.data) : null));
}

/** A call the server makes in another's request, and what it read */
interface PipelinedSend {
  call: PipelinedCall;
  /** What the server read of each entry the call reads, by entry */
  sent: ReadonlyMap<object, Unit<unknown>>;
}

/**
 * What the server read of an entry's sources: what their requests returned
 * for those the call read, and the client's data for the rest, which the
 * client filled in itself. Never rejects
 */
function serverData(
  send: PipelinedSend,
  clientData: SourceData,
): Promise<Outcome<SourceData>> {
  return allOf(send.sent).then((sent) =>
    sent.ok ? ok(new Map([...clientData, ...sent.data])) : sent,
  );
}

/**
 * Whether a load still starts what its entries need: open until each
 * entry has settled, or until it throws while it starts them. Only an open
 * load listens to the query cache.
 */
type LoadState =
  | { status: 'open'; unwatch: (() => void) | null }
  | { status: 'closed' };

/**
 * Starts every entry. Nothing waits here: each entry's load says what it
 * settles to.
 */
export function beginEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /**
   * The name of the hook that needs every handle at once, without the data
   * of any entry. `null` for a load that waits
   */
  now: string | null;
}) {
  const { queryClient } = opts;
  const linked = linkEntries(
    readEntries({ queryClient, entries: opts.entries, keys: [] }),
  );
  if (opts.now) {
    for (const leaf of linked.leaves) {
      if (leaf.waited.size > 0) {
        throw new Error(
          `The handle of the entry for "${leaf.label}" has another entry's data in its input, and \`${opts.now}()\` doesn't wait for data. ${
            leaf.built.by === 'entryPerItem'
              ? 'Make the entry of its list a prefetch entry, and read nothing else of the list in its input'
              : 'Build the entry from that data, with `experimental_dataOf(entry, (data) => entry)`'
          }, or wait in a loader with \`loadHandles()\``,
        );
      }
    }
  }

  let state: LoadState = { status: 'open', unwatch: null };
  function close() {
    if (state.status === 'open') {
      state.unwatch?.();
    }
    state = { status: 'closed' };
  }

  /** The prefetch entries whose data another entry reads, by their query's hash */
  const watched = new Map<
    string,
    { leaf: LinkedLeaf; data: Unit<unknown, EntryFailure> }[]
  >();
  /**
   * Settles a prefetch entry's data from its fetch, in the step in which the
   * `QueryClient` gets it. A fetch or ensure entry's data is what its
   * `QueryClient` method resolves to, which the load waits for anyway
   */
  function watch(
    leaf: LinkedLeaf,
    options: EntryQueryOptions,
    data: Unit<unknown, EntryFailure>,
  ) {
    if (state.status === 'closed') {
      return;
    }
    const { queryHash } = queryClient.defaultQueryOptions(options);
    watched.set(queryHash, [...(watched.get(queryHash) ?? []), { leaf, data }]);
    state.unwatch ??= queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') {
        return;
      }
      const { action } = event;
      for (const one of watched.get(event.query.queryHash) ?? []) {
        // Not a write, such as `setQueryData()`, while the request runs:
        // what the entries read is what the request returns, or its failure.
        // The action's data, not the query's: a listener told before this
        // one may have written to the query since
        if (action.type === 'success' && !action.manual) {
          one.data.settle(ok(action.data));
        } else if (action.type === 'error') {
          one.data.settle(
            failed(ownFailure(one.leaf.label, one.leaf.state, action.error)),
          );
        }
      }
    });
  }

  /**
   * Has the server make an entry's request in the request of the entries it
   * reads, if those just went to a link that pipelines. The server fills in
   * its input
   */
  function sendPipelined(pipelined: {
    leaf: LinkedLeaf;
    /** What the entry's input reads, and the load of the entry of each */
    reads: { ref: EntryInputRef; source: OneLoad }[];
    /**
     * For an entry for every item: the list, the load of its entry, and the
     * path of the list in the result of that entry's request
     */
    list: { ref: EntryDataRef; source: OneLoad; path: RequestPath } | null;
  }): PipelinedSend | null {
    const { leaf, list } = pipelined;
    const { request } = leaf.state;
    if (request.kind !== 'pipelined') {
      return null;
    }
    const read = pipelined.reads.filter(({ ref }) =>
      request.serverReads.has(ref),
    );
    const sent = new Map<object, Unit<unknown>>();
    const reads = read.flatMap(
      ({ ref, source }): PipelineCallReads<PipelineSource>['reads'] => {
        if (list && leaf.fromItem(ref)) {
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
        if (!source.server || !path) {
          return [];
        }
        sent.set(ref.entry, source.server.sent);
        return [
          { kind: 'whole', to: ref.to, from: source.server.source, path },
        ];
      },
    );
    if (reads.length !== read.length) {
      return null;
    }
    let each: PipelineCallReads<PipelineSource>['each'] = null;
    if (list) {
      if (!list.source.server) {
        return null;
      }
      each = { from: list.source.server.source, path: list.path };
      sent.set(list.ref.entry, list.source.server.sent);
    }
    const call = pipeCall({
      path: request.path,
      input: request.input,
      reads: { each, reads },
    });
    return call && { call, sent };
  }

  /** The units the data of an entry's sources is read from, by entry */
  const readersOf = (sources: ReadonlyMap<object, OneLoad>) =>
    new Map([...sources].map(([entry, source]) => [entry, source.forReaders]));

  /** The data of the sources an entry's handle has in its input */
  const handleData = (
    leaf: LinkedLeaf,
    sources: ReadonlyMap<object, OneLoad>,
  ) =>
    allOf(
      readersOf(
        new Map([...sources].filter(([entry]) => leaf.waited.has(entry))),
      ),
    );

  /** An entry's handle that is built from the data it waits for */
  const unfinishedOf = (
    leaf: LinkedLeaf,
    sources: ReadonlyMap<object, OneLoad>,
  ): Promise<Outcome<Handle, EntryFailure>> =>
    handleData(leaf, sources).then((data) => {
      if (!data.ok) {
        return data;
      }
      const handle = attemptNow(() => unfinishedHandle(leaf, data.data));
      return handle.ok
        ? handle
        : failed(ownFailure(leaf.label, leaf.state, handle.error));
    });

  const oneLoads = new Map<LinkedLeaf, OneLoad>();
  /**
   * The load of an entry that is one query, also as an entry that others
   * read: `experimental_dataOf()` takes no entry per item. An entry only
   * reads entries built before it, so this can't loop
   */
  function sourceOf(leaf: LinkedLeaf): OneLoad {
    const existing = oneLoads.get(leaf);
    if (existing) {
      return existing;
    }
    const load = loadOne(leaf);
    oneLoads.set(leaf, load);
    return load;
  }

  function readsOf(leaf: LinkedLeaf) {
    const reads = leaf.reads.map((read) => ({
      ref: read.ref,
      source: sourceOf(read.source),
    }));
    const sources = new Map(reads.map((read) => [read.ref.entry, read.source]));
    return { reads, sources };
  }

  function loadOne(leaf: LinkedLeaf): OneLoad {
    const { state } = leaf;
    const own = (error: unknown) =>
      failed(ownFailure(leaf.label, state, error));
    const { reads, sources } = readsOf(leaf);
    const data = createUnit<unknown, EntryFailure>();
    const forReaders = createUnit<unknown, EntryFailure>();
    data.onSettled((outcome) =>
      forReaders.settle(
        outcome.ok || outcome.error.kind === 'blocked'
          ? outcome
          : failed({ kind: 'blocked', origin: leaf, cause: outcome.error }),
      ),
    );
    const isRead = linked.read.has(leaf);

    /** Starts the query. A throw is the caller's */
    const start = (options: EntryQueryOptions) => {
      if (state.kind === 'prefetch' && isRead) {
        watch(leaf, options, data);
      }
      return startEntry({ queryClient, state, options });
    };

    let server: ServerSide | null = null;
    /** The options the query starts with, once the data they read is in */
    const options = createUnit<EntryQueryOptions, EntryFailure>();
    /** What the `QueryClient` method the entry is named after settled to */
    const started = createUnit<unknown, EntryFailure>();
    if (sources.size === 0) {
      let built = optionsFrom(leaf, { data: noData, item: null, holes: false });
      if (isRead && state.request.kind === 'pipelined') {
        // Another entry reads this one: its request can take part in pipelining
        const pipeline = createOperationPipeline();
        const withPipeline = state.options({ dataOfRef: nothing, pipeline });
        // The same input as without the pipeline, so not `skipToken` either
        const queryFn = withPipeline.queryFn as QueryFunction<
          unknown,
          any,
          any
        >;
        const sent = createUnit<unknown>();
        let first = true;
        built = {
          ...withPipeline,
          queryFn: (context: QueryFunctionContext<any, any>) => {
            const result = Promise.resolve(queryFn(context));
            if (first) {
              // Its first request is the one a link takes into a batch. For
              // an infinite query, it is the first page
              first = false;
              void attempt(() =>
                state.type === 'infinite'
                  ? result.then((page) => ({
                      pages: [page],
                      pageParams: [context.pageParam],
                    }))
                  : result,
              ).then(sent.settle);
            }
            return result;
          },
        };
        server = { source: pipeline, sent };
      }
      options.settle(ok(built));
      // The query starts now, not a tick later. A throw here is the load's:
      // it starts no entry after this one
      void start(built).then(ok, own).then(started.settle);
    } else {
      const send = sendPipelined({ leaf, reads, list: null });
      if (send && state.type === 'query') {
        // An infinite query's data is its pages, which no one request returns,
        // so the server can't read it for the entries that read this one
        server = { source: send.call, sent: unitOf(dataOfCall(send.call)) };
      }
      // The query starts in the step in which the last of the entries it reads
      // has data. When one of them has none, this entry never starts
      whenAll(readersOf(sources), (sourceData) => {
        if (!sourceData.ok) {
          options.settle(sourceData);
          started.settle(sourceData);
          return;
        }
        const filled = attemptNow(() =>
          optionsFrom(leaf, {
            data: sourceData.data,
            item: null,
            holes: false,
          }),
        );
        if (!filled.ok) {
          options.settle(own(filled.error));
          started.settle(own(filled.error));
          return;
        }
        const built = send
          ? withPipelinedResult({
              options: filled.data,
              result: outcomeOfCall(send.call),
              sameInput: async (context) => {
                if (
                  state.type === 'infinite' &&
                  // The call was for the first page
                  !(
                    context.direction === 'forward' &&
                    Object.is(context.pageParam, filled.data.initialPageParam)
                  )
                ) {
                  return false;
                }
                const server = await serverData(send, sourceData.data);
                if (!server.ok) {
                  return false;
                }
                const same = attemptNow(() => {
                  const sent = optionsFrom(leaf, {
                    data: server.data,
                    item: null,
                    holes: false,
                  });
                  return (
                    hashKey(filled.data.queryKey) === hashKey(sent.queryKey) &&
                    // An infinite query's cursor isn't in its key
                    sameCursor(
                      filled.data.initialPageParam,
                      sent.initialPageParam,
                    )
                  );
                });
                return same.ok && same.data;
              },
            })
          : filled.data;
        options.settle(ok(built));
        void attempt(() => start(built)).then((outcome) =>
          started.settle(outcome.ok ? outcome : own(outcome.error)),
        );
      });
    }
    started.onSettled((outcome) => {
      if (state.request.kind === 'skipped') {
        // Nothing started: an entry that reads this one's data has none to read
        data.settle(
          failed({
            kind: 'skipped',
            error: new Error(
              `"${leaf.label}" has \`skipToken\` as its input, so it has no data for the entries that read it`,
            ),
          }),
        );
        return;
      }
      if (!outcome.ok || state.kind !== 'prefetch') {
        data.settle(outcome);
        return;
      }
      // A prefetch resolves to nothing and never rejects. What it fetched
      // settled `data` as the cache got it; else the cache had fresh data
      // and the load fetched nothing
      const built = options.state();
      const query =
        built.status === 'settled' && built.outcome.ok
          ? queryClient.getQueryState(built.outcome.data.queryKey)
          : undefined;
      data.settle(
        query?.data !== undefined ? ok(query.data) : own(query?.error),
      );
    });

    const from = leaf.built.by === 'dataOf';
    return {
      shape: 'one',
      leaf,
      server,
      data,
      forReaders,
      handle: from
        ? unfinishedOf(leaf, sources)
        : options.outcome.then((built) =>
            built.ok ? ok(toHandle(built.data, state.type)) : built,
          ),
      handleNow: () =>
        from
          ? unfinishedHandle(leaf, noData)
          : toHandle(
              optionsFrom(leaf, { data: noData, item: null, holes: false }),
              state.type,
            ),
    };
  }

  /** Loads an entry from `experimental_entryPerItem()`: a query for every item of a list */
  function loadPerItem(
    leaf: LinkedLeaf,
    list: NonNullable<LinkedLeaf['list']>,
  ): PerItemLoad {
    const { state } = leaf;
    const { itemPath } = list.plan;
    const { reads, sources } = readsOf(leaf);
    const listSource = sourceOf(list.source);
    sources.set(list.ref.entry, listSource);
    /** The items of the list in the data of the entries it reads, as the server walks them */
    const itemsOf = (data: SourceData) =>
      itemsAt(data.get(list.ref.entry), itemPath);

    // One call, which the server runs once for every item. Its result is a
    // `{ result }` or an `{ error }` for every item. An entry that reads
    // nothing of its item has no call for every item: its query is an ordinary one
    /** The list in the result of its entry's request: the first page's, of an infinite query */
    const listPath = list.plan.first;
    const send =
      listPath && reads.some(({ ref }) => leaf.fromItem(ref))
        ? sendPipelined({
            leaf,
            reads,
            list: { ref: list.ref, source: listSource, path: listPath },
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

    // The items' queries start in the step in which the list has data
    const items = new Promise<ItemsOutcome>((resolve) => {
      whenAll(readersOf(sources), (sourceData) => {
        if (!sourceData.ok) {
          resolve(sourceData);
          return;
        }
        const { data } = sourceData;
        /**
         * The key of every item's query, with the input the server filled
         * in, by where the item is: the place it reads its result from.
         * Each item's own: `null` for one whose key can't be held
         */
        const serverKeys = send
          ? serverData(send, data).then(
              (server) =>
                new Map(
                  server.ok
                    ? itemsOf(server.data).map((listItem) => {
                        const key = attemptNow(() =>
                          hashKey(
                            optionsFrom(leaf, {
                              data: server.data,
                              item: listItem,
                              holes: false,
                            }).queryKey,
                          ),
                        );
                        return [placeOf(listItem), key.ok ? key.data : null];
                      })
                    : [],
                ),
            )
          : null;
        resolve(
          ok(
            itemsOf(data).map((listItem, index) =>
              // Each item starts by itself: what it throws is its own
              attempt(() => {
                let options = optionsFrom(leaf, {
                  data,
                  item: listItem,
                  holes: false,
                });
                if (send && serverKeys) {
                  const key = hashKey(options.queryKey);
                  const place = placeOf(listItem);
                  options = withPipelinedResult({
                    options,
                    result: outcomeOfItem(send.call, serverIndexes(listItem)),
                    // The server ran the same query at the item's place
                    sameInput: async () =>
                      (await serverKeys).get(place) === key,
                  });
                }
                return startEntry({ queryClient, state, options });
              }).then((outcome) =>
                outcome.ok
                  ? outcome
                  : failed(
                      ownFailure(
                        `${leaf.label}.${index}`,
                        state,
                        outcome.error,
                      ),
                    ),
              ),
            ),
          ),
        );
      });
    });
    return {
      shape: 'perItem',
      leaf,
      handle: unfinishedOf(leaf, sources),
      handleNow: () => unfinishedHandle(leaf, noData),
      items,
    };
  }

  let allLoads: EntryLoad[];
  try {
    allLoads = linked.leaves.map((leaf): EntryLoad =>
      leaf.list ? loadPerItem(leaf, leaf.list) : sourceOf(leaf),
    );
  } catch (error) {
    // An entry that threw as it started: nothing waits for the ones before
    // it, so nothing would stop listening for them
    close();
    throw error;
  }
  // Until every entry has settled. An entry that starts later can watch too
  void Promise.all(allLoads.map(settledOf)).then(close);
  return { tree: linked.tree, allLoads };
}

/** The handles of a load's entries, in the shape of the entries */
export function handlesOfLoads(opts: {
  tree: EntryTree<LinkedLeaf>;
  /** An entry that couldn't start has none */
  handleOfLeaf: Map<LinkedLeaf, Handle>;
}) {
  const { handleOfLeaf } = opts;
  // A list's handle says what its items load, so that a later fetch of the
  // list, such as the next page, can load that in the same request
  for (const [leaf, handle] of handleOfLeaf) {
    const later = leaf.list?.plan.later;
    const sourceHandle = leaf.list && handleOfLeaf.get(leaf.list.source);
    if (!later || !sourceHandle) {
      continue;
    }
    sourceHandle['experimental_perItem'] = [
      ...((sourceHandle['experimental_perItem'] as unknown[] | undefined) ??
        []),
      { ...handle, ...later },
    ];
  }
  return mapEntryTree(opts.tree, (leaf) => {
    const handle = handleOfLeaf.get(leaf);
    return handle ? [handle] : [];
  });
}

/**
 * What a public load resolves to for an entry, from its outcome: with
 * `settle`, a `TRPCEntryResult`, else its data. A failure it doesn't report
 * rejects. This is where an outcome becomes a rejection, and nowhere before
 */
function resultOf(load: EntryLoad, settle: boolean): Promise<unknown> {
  const resultOfOutcome = (outcome: Outcome<unknown, EntryFailure>) => {
    if (outcome.ok) {
      return settle ? { status: 'success', data: outcome.data } : outcome.data;
    }
    if (settle && isReported(load.leaf, outcome.error)) {
      return { status: 'error', error: errorOf(outcome.error) };
    }
    throw errorOf(outcome.error);
  };
  if (load.shape === 'one') {
    return load.data.outcome.then(resultOfOutcome);
  }
  return load.items.then((items) => {
    if (!items.ok) {
      if (settle && isReported(load.leaf, items.error)) {
        // Without the list, there are no items to have results
        return [];
      }
      throw errorOf(items.error);
    }
    return Promise.all(items.data.map((item) => item.then(resultOfOutcome)));
  });
}

export async function startEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /** Resolve each waited entry to a `TRPCEntryResult` instead of rejecting */
  settle: boolean;
}) {
  const { tree, allLoads } = beginEntries({
    queryClient: opts.queryClient,
    entries: opts.entries,
    now: null,
  });
  const waited = allLoads.filter((load) => load.leaf.state.kind !== 'prefetch');
  const [results, loadedHandles] = await Promise.all([
    Promise.all(waited.map((load) => resultOf(load, opts.settle))),
    // A handle needs its input, so also wait for the data that prefetch
    // entries read into theirs
    Promise.all(
      allLoads.map((load) =>
        load.handle.then((handle) => {
          if (handle.ok) {
            return handle.data;
          }
          // An entry that couldn't start has none
          if (opts.settle && isReported(load.leaf, handle.error)) {
            return null;
          }
          throw errorOf(handle.error);
        }),
      ),
    ),
  ]);

  const resultOfLeaf = new Map(
    waited.map((load, index) => [load.leaf, results[index]]),
  );
  const handles = handlesOfLoads({
    tree,
    handleOfLeaf: new Map(
      allLoads.flatMap((load, index) => {
        const handle = loadedHandles[index];
        return handle ? [[load.leaf, handle] as const] : [];
      }),
    ),
  });
  const data = mapEntryTree(tree, (leaf) =>
    resultOfLeaf.has(leaf) ? [resultOfLeaf.get(leaf)] : [],
  );
  return [handles, data] as const;
}
