import type {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  QueryClient,
  QueryFunction,
  QueryFunctionContext,
} from '@tanstack/react-query';
import { isCancelledError, skipToken } from '@tanstack/react-query';
import type { OperationPipeline } from '@trpc/client/unstable-internals';
import { createOperationPipeline } from '@trpc/client/unstable-internals';
import type {
  EntryDataRef,
  EntryInputRef,
} from '@trpc/client/unstable-internals';
import { blankInput } from '@trpc/client/unstable-internals';
import { itemPathOf } from '@trpc/client/unstable-internals';
import type { RequestPath } from '@trpc/client/unstable-internals';
import type {
  PipelineCallReads,
  PipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import { readPipelinePath } from '@trpc/server/unstable-core-do-not-import';
import { getClientArgs } from '../internals/utils';
import type { EntryQueryOptions, EntryState } from './entry';
import { entryCause, TRPCEntryError } from './entryError';
import { toHandle } from './handle';
import { itemsAt, requestPath } from './list';
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
import {
  outcomeOfItem,
  outcomeOfSend,
  sameValue,
  sendReading,
  withPipelinedResult,
} from './pipelined';
import type { ReadingSend } from './pipelined';
import type { EntryTree, LinkedLeaf } from './plan';
import { linkEntries, mapEntryTree, readEntries } from './plan';
import type { HandleType, TRPCEntryKind } from './types';
import { nothing } from './utils';

export function startEntry(opts: {
  queryClient: QueryClient;
  type: HandleType;
  /**
   * The `QueryClient` method to start it with. A prefetch entry whose data
   * another entry reads is fetched: a prefetch resolves to nothing, also
   * when the cache had fresh data, and absorbs a cancellation
   */
  kind: TRPCEntryKind;
  options: EntryQueryOptions;
  /**
   * Whether a query that failed, and isn't fetching, keeps its error rather
   * than fetching again. Rendering that starts a load does: a page whose
   * Suspense boundary is above it renders again from nothing once the query
   * fails, and would start it again, forever
   */
  keepFailed: boolean;
}) {
  const { queryClient, options } = opts;
  // A `skipToken` input: its query is disabled, and nothing starts
  if (options.queryFn === skipToken) {
    return Promise.resolve(undefined);
  }
  const failed = opts.keepFailed
    ? queryClient.getQueryState(options.queryKey)
    : undefined;
  if (failed?.status === 'error' && failed.fetchStatus === 'idle') {
    // A prefetch absorbs its error, as `prefetchQuery` does
    return opts.kind === 'prefetch'
      ? Promise.resolve(undefined)
      : Promise.reject(failed.error);
  }
  // The options proxy built them for the query's type, as the `QueryClient`
  // methods for that type take them
  if (opts.type === 'infinite') {
    const infinite = options as unknown as FetchInfiniteQueryOptions;
    switch (opts.kind) {
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
  switch (opts.kind) {
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
  const itemInputs = leaf.state.refs.filter(leaf.fromItem).map((ref) => ({
    to: ref.to,
    path: ref.path.slice(leaf.itemDepth),
  }));
  const { initialCursor, ...handle } = toHandle(
    optionsFrom(leaf, { data, item: null, holes: true }),
    leaf.state.type,
  );
  if (
    initialCursor === undefined ||
    leaf.state.cursorFromOptions ||
    !itemInputs.some((itemInput) => itemInput.to[0] === 'cursor')
  ) {
    return {
      ...handle,
      ...(initialCursor !== undefined && { initialCursor }),
      itemInputs,
    };
  }
  // A cursor partly from the item: what it has of it so far goes in the
  // input, for `experimental_handleOfItem()` to fill in the rest of
  return {
    ...handle,
    input: {
      ...(handle['input'] as object | undefined),
      cursor: initialCursor,
    },
    itemInputs,
  };
}

/**
 * What the server read of an entry, for the entries that read its data: the
 * pipeline of its operation, which a link that pipelines opens, or puts in
 * another's request; and what that returned, in the shape of the query's
 * data. That is only ever compared with the client's data: what an entry's
 * input is filled in with is the cache's.
 */
interface ServerSide {
  /** The pipeline of its operation, which an operation that reads it reads */
  source: OperationPipeline;
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

/** The load of an entry from `experimental_perItem()`: a query for every item */
interface PerItemLoad {
  shape: 'perItem';
  leaf: LinkedLeaf;
  handle: Promise<Outcome<Handle, EntryFailure>>;
  handleNow: () => Handle;
  /**
   * Once the list has data: each item's outcome, which is that item's own,
   * or blocked if another entry it reads has no data. Blocked as a whole if
   * the list has none
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

/**
 * The operation of an entry that the server runs in another's request, and
 * what it read
 */
interface PipelinedSend extends ReadingSend {
  /** What the server read of each entry the operation reads, by entry */
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

  /**
   * The entries whose data another entry reads, by their query's hash.
   * `armed` is whether a notification can be of the fetch the load started
   * or joined
   */
  const watched = new Map<
    string,
    {
      leaf: LinkedLeaf;
      data: Unit<unknown, EntryFailure>;
      armed: boolean;
      /**
       * Before it is armed, once the query has started: how many writes the
       * query had then, and the data of the first success after them that
       * isn't a write such as `setQueryData()`. That is a joined fetch's,
       * whose function had returned. `null` until the query has started
       */
      early: { writes: number; success: { data: unknown } | null } | null;
    }[]
  >();
  /**
   * Settles the data of an entry that another entry reads from the fetch the
   * load starts or joins, in the step in which the `QueryClient` gets it,
   * after its structural sharing. A prefetch resolves to nothing, and a fetch
   * to what it fetched rather than what the cache keeps. Returns what to call
   * with the `QueryClient` method's promise once the query has started
   */
  function watch(
    leaf: LinkedLeaf,
    options: EntryQueryOptions,
    data: Unit<unknown, EntryFailure>,
  ) {
    if (state.status === 'closed') {
      return (promise: Promise<unknown>) => promise;
    }
    const defaulted = queryClient.defaultQueryOptions(options);
    const { queryHash } = defaulted;
    // A fetch already running is the load's only if its call joins it, which
    // it does when the cache's data is stale to it. On a fresh hit, the data
    // is what the `QueryClient` method resolves to, not that fetch's
    const running = queryClient.getQueryCache().get(queryHash);
    const joins =
      !running ||
      running.state.fetchStatus === 'idle' ||
      running.isStaleByTime(
        typeof defaulted.staleTime === 'function'
          ? defaulted.staleTime(running)
          : defaulted.staleTime,
      );
    const one: NonNullable<ReturnType<typeof watched.get>>[number] = {
      leaf,
      data,
      armed: false,
      early: null,
    };
    watched.set(queryHash, [...(watched.get(queryHash) ?? []), one]);
    state.unwatch ??= queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') {
        return;
      }
      const { action } = event;
      for (const each of watched.get(event.query.queryHash) ?? []) {
        if (!each.armed) {
          // A notification of an action from before the load started has
          // no write after the query started, unless a listener told before
          // this one wrote since: then the load started a fetch, whose own
          // success comes once it is armed
          if (
            each.early?.success === null &&
            action.type === 'success' &&
            !action.manual &&
            event.query.state.dataUpdateCount > each.early.writes
          ) {
            each.early.success = { data: action.data };
          }
          continue;
        }
        // Not a write, such as `setQueryData()`, while the request runs:
        // what the entries read is what the request returns, or its failure.
        // The action's data, not the query's: a listener told before this
        // one may have written to the query since
        if (action.type === 'success' && !action.manual) {
          each.data.settle(ok(action.data));
        } else if (action.type === 'error') {
          each.data.settle(
            failed(ownFailure(each.leaf.label, each.leaf.state, action.error)),
          );
        }
      }
    });
    return (promise: Promise<unknown>) => {
      // Without a fetch, such as for a fresh hit, the data is what the
      // `QueryClient` method resolves to. A fetch that is paused, such as
      // one started offline, is still the load's: it runs once it can, and
      // its success is a write after structural sharing like any other
      const query = queryClient.getQueryCache().get(queryHash);
      if (!joins || !query || query.state.fetchStatus === 'idle') {
        return promise;
      }
      // From the next microtask. A notification in this step is of an
      // action dispatched before the load started the query: the listener
      // that started the load is told of it before this one. The fetch's
      // own success or failure can't come in this step, as the query awaits
      // what its function returns
      queueMicrotask(() => {
        one.armed = true;
      });
      // A joined fetch whose function had returned can write before then.
      // The `QueryClient` method resolves after that write, and the data is
      // what it wrote, also if a listener wrote after it
      const early: NonNullable<typeof one.early> = {
        writes: query.state.dataUpdateCount,
        success: null,
      };
      one.early = early;
      return promise.then((value) => (early.success ?? { data: value }).data);
    };
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
      ({ ref, source }): PipelineCallReads<OperationPipeline>['reads'] => {
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
        // Not in a request of another client's, which another server answers
        if (
          !source.server ||
          !path ||
          source.leaf.state.transport !== leaf.state.transport
        ) {
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
    let each: PipelineCallReads<OperationPipeline>['each'] = null;
    if (list) {
      if (!list.source.server) {
        return null;
      }
      each = { from: list.source.server.source, path: list.path };
      sent.set(list.ref.entry, list.source.server.sent);
    }
    const readers = readersOf(
      new Map([
        ...pipelined.reads.map(
          ({ ref, source }) => [ref.entry, source] as const,
        ),
        ...(list ? [[list.ref.entry, list.source] as const] : []),
      ]),
    );
    /**
     * Its input, filled in with the client's data, as the query's own
     * request has it. A query for every item has none: its runs each have an
     * input of their own
     */
    const inputFrom = (data: SourceData) => {
      if (list) {
        return undefined;
      }
      const options = optionsFrom(leaf, { data, item: null, holes: false });
      return getClientArgs(
        options.queryKey,
        undefined,
        leaf.state.type === 'infinite'
          ? { pageParam: options.initialPageParam, direction: 'forward' }
          : undefined,
      )[1];
    };
    // Through its own links: they may send it elsewhere than what it reads
    const sending = sendReading({
      transport: leaf.state.transport,
      path: request.path,
      input: request.input,
      reads: { each, reads },
      perItem: list !== null,
      resolve: () =>
        allOf(readers).then((data) =>
          data.ok ? inputFrom(data.data) : Promise.reject(data.error),
        ),
      known: () => {
        const data = new Map<object, unknown>();
        for (const [entry, reader] of readers) {
          const state = reader.state();
          if (state.status === 'pending' || !state.outcome.ok) {
            return null;
          }
          data.set(entry, state.outcome.data);
        }
        const input = attemptNow(() => inputFrom(data));
        return input.ok ? { input: input.data } : null;
      },
    });
    return sending && { ...sending, sent };
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

    /**
     * Starts the query. A throw is the caller's. If another entry reads this
     * one, its data is the cache's write of its fetch, or what its
     * `QueryClient` method resolves to, whichever is first
     */
    const start = (options: EntryQueryOptions) => {
      const started = isRead ? watch(leaf, options, data) : null;
      const promise = startEntry({
        queryClient,
        type: state.type,
        // A prefetch resolves to nothing, also when the cache had fresh data
        kind: isRead && state.kind === 'prefetch' ? 'fetch' : state.kind,
        options,
        keepFailed: opts.now !== null,
      });
      return started ? started(promise) : promise;
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
      /** Whether the server fills in an infinite entry's whole cursor */
      const serverFillsCursor =
        state.request.kind === 'pipelined' &&
        [...state.request.serverReads].some(
          (ref) => ref.to.length === 1 && ref.to[0] === 'cursor',
        );
      if (send && state.type === 'query') {
        // An infinite query's data is its pages, which no one request returns,
        // so the server can't read it for the entries that read this one
        server = {
          source: send.pipeline,
          sent: unitOf(send.settled),
        };
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
              result: outcomeOfSend(send),
              sameInput: async (context) => {
                if (
                  state.type === 'infinite' &&
                  // The call was for the first page
                  (!(
                    context.direction === 'forward' &&
                    Object.is(context.pageParam, filled.data.initialPageParam)
                  ) ||
                    // The server writes a cursor it fills in also when it is
                    // `undefined`, which the page's own request leaves out
                    (filled.data.initialPageParam === undefined &&
                      serverFillsCursor))
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
                    // Not their hashes: `-0` and `0` hash alike, and a
                    // transformer, such as superjson, can tell them apart
                    sameValue(filled.data.queryKey, sent.queryKey) &&
                    // An infinite query's cursor isn't in its key
                    sameValue(
                      filled.data.initialPageParam,
                      sent.initialPageParam,
                    )
                  );
                });
                return same.ok && same.data;
              },
            })
          : filled.data;
        // A query that couldn't start, such as for a key that can't be
        // hashed, has no handle: its options settle with the failure
        const starting = attemptNow(() => start(built));
        if (!starting.ok) {
          options.settle(own(starting.error));
          started.settle(own(starting.error));
          return;
        }
        options.settle(ok(built));
        void starting.data.then(ok, own).then(started.settle);
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
      // A prefetch that no entry reads resolves to nothing: its data is
      // only waited for to know that it settled
      data.settle(outcome);
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

  /** Loads an entry from `experimental_perItem()`: a query for every item of a list */
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
          // Without the list, there are no items. With it, every item is
          // blocked by the other entry that failed, and starts nothing
          resolve(
            listSource.forReaders.outcome.then((listData) =>
              listData.ok
                ? ok(
                    itemsOf(new Map([[list.ref.entry, listData.data]])).map(
                      () => Promise.resolve(sourceData),
                    ),
                  )
                : listData,
            ),
          );
          return;
        }
        const { data } = sourceData;
        /**
         * The key of every item's query, with the input the server filled
         * in, by where the item is: the place it reads its result from.
         * Each item's own: `null` for one whose key can't be built
         */
        const serverKeys = send
          ? serverData(send, data).then(
              (server) =>
                new Map(
                  server.ok
                    ? itemsOf(server.data).map((listItem) => {
                        const key = attemptNow(
                          () =>
                            optionsFrom(leaf, {
                              data: server.data,
                              item: listItem,
                              holes: false,
                            }).queryKey,
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
                  const { queryKey } = options;
                  const place = placeOf(listItem);
                  options = withPipelinedResult({
                    options,
                    result: outcomeOfItem(send, serverIndexes(listItem)),
                    // The server ran the same query at the item's place. Not
                    // by their hashes: `-0` and `0` hash alike, and a
                    // transformer, such as superjson, can tell them apart
                    sameInput: async () =>
                      sameValue((await serverKeys).get(place), queryKey),
                  });
                }
                return startEntry({
                  queryClient,
                  type: state.type,
                  kind: state.kind,
                  options,
                  keepFailed: opts.now !== null,
                });
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
        // Without the list, there are no items to have results. An item
        // blocked by another entry has its own result
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
