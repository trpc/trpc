import type {
  AnyProcedure,
  AnyRouter,
  inferProcedureInput,
  InferrableClientTypes,
  inferTransformedProcedureOutput,
  PipelineCallReads,
  PipelinePath,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createRecursiveProxy,
  hasOwn,
  isObject,
  makeResource,
  readPipelinedItem,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClient } from './createTRPCClient';
import { getUntypedClient } from './createTRPCClient';
import type { TRPCRequestOptions } from './internals/TRPCUntypedClient';
import type { TRPCProcedureOptions } from './internals/types';
import type { PipelineSource } from './links/internals/pipeline';
import {
  createOperationPipeline,
  pipeCall,
  pipelineContext,
} from './links/internals/pipeline';
import { TRPCClientError } from './TRPCClientError';

/**
 * `experimental_nested()` records the queries its callback makes, then sends
 * them. The callback gets stand-ins for data that isn't there yet: what it
 * reads of them becomes a read in a pipelined batch, and the server fills it
 * in. What a link can't pipeline, a query asks for by itself, once the data
 * it reads is there.
 */

/** @internal */
export declare const nestedResult: unique symbol;
/** @internal */
export declare const standInOf: unique symbol;

/**
 * What a part of `experimental_nested()`'s callback resolves to: a stand-in,
 * or `.with()` or `.map()` of one.
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_NestedShape<TResult> {
  readonly [nestedResult]: TResult;
}

/**
 * A node of `experimental_nested()`'s result: the data of a query, or of an
 * item of a list, and an edge for each query that reads it.
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_Node<TNode, TEdges> {
  node: TNode;
  edges: TEdges;
}

type Edges = Record<string, experimental_NestedShape<unknown>>;

type ResultOf<TShape> =
  TShape extends experimental_NestedShape<infer TResult> ? TResult : never;

/** Each edge settles by itself, once its own query is done */
type EdgesOf<TEdges> = { [K in keyof TEdges]: Promise<ResultOf<TEdges[K]>> };

type MapItem<TItem, TReturn> =
  TReturn extends experimental_NestedShape<infer TResult>
    ? TResult
    : keyof TReturn extends never
      ? TItem
      : experimental_Node<TItem, EdgesOf<TReturn>>;

/** Data the client gets as a promise or a stream: no stand-in can read it */
type IsAsync<TValue> = [
  Extract<TValue, PromiseLike<unknown> | AsyncIterable<unknown>>,
] extends [never]
  ? false
  : true;

type StandInKeys<TValue> = [TValue] extends [readonly (infer TItem)[]]
  ? {
      /**
       * Runs a query for every item. Return the item's edges, `{}` for the
       * items as they are, or a `.map()` of a list in the item
       */
      map: <TReturn extends experimental_NestedShape<unknown> | Edges>(
        fn: (item: experimental_StandIn<TItem>) => TReturn,
      ) => experimental_NestedShape<MapItem<TItem, TReturn>[]>;
    }
  : [TValue] extends [object]
    ? {
        readonly [
          K in keyof TValue as K extends 'then'
            ? // A stand-in is no promise: it has no `then` to read
              never
            : K extends string
              ? IsAsync<TValue[K]> extends true
                ? never
                : K
              : never
        ]: experimental_StandIn<TValue[K]>;
      }
    : unknown;

/**
 * Data that isn't there yet, in `experimental_nested()`'s callback. Put it, or
 * a value in it, in a query's input. It has no methods, so nothing can be
 * computed from it. A value that can be `null` or `undefined` has no keys.
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_StandIn<TValue> = experimental_NestedShape<TValue> & {
  readonly [standInOf]: TValue;
} & StandInKeys<TValue>;

/** A query's data, in `experimental_nested()`'s callback */
type QueryStandIn<TValue> = experimental_StandIn<TValue> & {
  /** Runs queries that read this query's data, as the node's edges */
  with: <TEdges extends Edges>(
    fn: (node: experimental_StandIn<TValue>) => TEdges,
  ) => experimental_NestedShape<experimental_Node<TValue, EdgesOf<TEdges>>>;
};

/** An input in which any value can be a stand-in of the same type */
type WithStandIns<TInput> =
  | TInput
  | { readonly [standInOf]: TInput }
  | (TInput extends object
      ? TInput extends Date | ((...args: any[]) => unknown)
        ? never
        : { [K in keyof TInput]: WithStandIns<TInput[K]> }
      : never);

type NestedQueryRecord<
  TRoot extends InferrableClientTypes,
  TRecord extends RouterRecord,
> = {
  [
    K in keyof TRecord as TRecord[K] extends AnyProcedure
      ? TRecord[K]['_def']['type'] extends 'query'
        ? K
        : never
      : K
  ]: TRecord[K] extends AnyProcedure
    ? {
        query: (
          input: WithStandIns<inferProcedureInput<TRecord[K]>>,
        ) => QueryStandIn<inferTransformedProcedureOutput<TRoot, TRecord[K]>>;
      }
    : TRecord[K] extends RouterRecord
      ? NestedQueryRecord<TRoot, TRecord[K]>
      : never;
};

/**
 * The queries of a router, as `experimental_nested()`'s callback gets them.
 * There are no mutations or subscriptions.
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_NestedQueries<TRouter extends AnyRouter> =
  NestedQueryRecord<
    {
      transformer: TRouter['_def']['_config']['$types']['transformer'];
      errorShape: TRouter['_def']['_config']['$types']['errorShape'];
    },
    TRouter['_def']['record']
  >;

/**
 * `experimental_nested()`'s result, with every edge awaited.
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_Settled<TResult> =
  TResult extends experimental_Node<infer TNode, infer TEdges>
    ? experimental_Node<
        TNode,
        { [K in keyof TEdges]: experimental_Settled<Awaited<TEdges[K]>> }
      >
    : TResult extends readonly (infer TItem)[]
      ? experimental_Settled<TItem>[]
      : TResult;

/** A list's item, in a path: the item a run is for */
interface Scope {
  list: Ref;
}
type Segment = string | Scope;

/** Where a value is: the data of a call, and the keys to it */
interface Ref {
  call: Call;
  path: Segment[];
}

/** A value of an input that is a stand-in, and where it goes */
interface Hole {
  /** `null` in an array: the server can't write there */
  to: string[] | null;
  ref: Ref;
}

interface Call {
  path: string;
  /** With the stand-ins in it */
  input: unknown;
  /** With `undefined` for each stand-in, for the server to fill in */
  blanked: unknown;
  holes: Hole[];
  /** The lists it is in, outer first: it runs once for each item */
  scopes: Scope[];
  /**
   * What gets every run's data in a request that is already there: its own
   * operation, or a call the server makes in another's request. `null` if
   * each run makes a request of its own
   */
  source: PipelineSource | null;
  /** The lists of `source`'s runs */
  frame: Scope[];
  /** The request of a call that reads nothing */
  sent: Promise<unknown> | null;
  /** The data of each run, by its indexes */
  runs: Map<string, Promise<unknown>>;
}

type Shape =
  | { kind: 'value'; ref: Ref }
  | { kind: 'node'; ref: Ref; edges: Record<string, Shape> }
  | { kind: 'list'; scope: Scope; item: Shape };

/** The indexes of the items a run is for, by list */
type Items = Map<Scope, number>;

const shapes = /* @__PURE__ */ new WeakMap<object, Shape>();
/** What `experimental_settle()` awaits the edges of */
const nodes = /* @__PURE__ */ new WeakSet<object>();
const lists = /* @__PURE__ */ new WeakSet<object>();
const warned = /* @__PURE__ */ new WeakSet<object>();

/**
 * Written so that a bundler replaces `process.env.NODE_ENV`, and the warning
 * goes from a production build. Without `process`, it isn't development
 */
function isDev() {
  try {
    return (process.env as { NODE_ENV?: string }).NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

function nothing() {
  // For a promise that nothing may read
}

function shapeOf(value: unknown) {
  return isObject(value) || typeof value === 'function'
    ? (shapes.get(value) ?? null)
    : null;
}

function asShape(value: unknown, shape: Shape) {
  shapes.set(value as object, shape);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isScope(segment: Segment): segment is Scope {
  return typeof segment !== 'string';
}

function sameScopes(a: readonly Scope[], b: readonly Scope[]) {
  return a.length === b.length && a.every((scope, index) => scope === b[index]);
}

/** A path as the server reads it, with a `null` for each list's items */
function wirePath(path: readonly Segment[]): PipelinePath {
  return path.map((segment) => (isScope(segment) ? null : segment));
}

/** Sets a key as an own property, also one named `__proto__` */
function setOwn(record: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * A copy of an input, with each stand-in in it replaced. `to` is where a
 * value is in the input: `null` in an array, where the server can't write
 */
function mapInput(
  value: unknown,
  to: string[] | null,
  onStandIn: (standIn: unknown, hole: Hole) => unknown,
): unknown {
  const shape = shapeOf(value);
  if (shape) {
    if (shape.kind !== 'value') {
      throw new TypeError(
        'experimental_nested(): an input can have stand-ins in it, not `.with()` or `.map()`',
      );
    }
    return onStandIn(value, { to, ref: shape.ref });
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapInput(item, null, onStandIn));
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      setOwn(copy, key, mapInput(value[key], to && [...to, key], onStandIn));
    }
    return copy;
  }
  if (value instanceof Date) {
    // The time it holds, as `structuredClone()` reads it, not an override
    return new Date(Date.prototype.getTime.call(value));
  }
  return value;
}

/**
 * Sends the queries of `experimental_nested()`'s callback as one request
 * where the link pipelines, and resolves once the data at the root is there.
 * Each edge is a promise of its own that settles when its query is done, and
 * rejects by itself if it fails.
 *
 * The callback runs once, at once, before any data is there: it can read
 * values and pass them to inputs, but can't branch on them or compute with
 * them.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#without-tanstack-query
 *
 * @example
 * ```ts
 * const posts = await experimental_nested(client, (q) =>
 *   q.post.list.query({ limit: 20 }).items.map((post) => ({
 *     author: q.author.byId.query({ id: post.authorId }),
 *   })),
 * );
 * const author = await posts[0].edges.author;
 * ```
 */
export function experimental_nested<
  TRouter extends AnyRouter,
  TShape extends experimental_NestedShape<unknown>,
>(
  client: TRPCClient<TRouter>,
  build: (q: experimental_NestedQueries<TRouter>) => TShape,
  opts?: TRPCProcedureOptions,
): Promise<ResultOf<TShape>> {
  const untyped = getUntypedClient(client);
  const request = (pipeline: TRPCRequestOptions['context']) => ({
    signal: opts?.signal,
    context: { ...opts?.context, ...pipeline },
  });
  const calls: Call[] = [];
  /** The lists whose callback runs, outer first */
  const scopes: Scope[] = [];

  /** Whether a stand-in is of this call, and its lists are all in `active` */
  const checkScopes = (ref: Ref, active: readonly Scope[]) => {
    if (!calls.includes(ref.call)) {
      throw new TypeError(
        'experimental_nested(): a stand-in of another `experimental_nested()` call was used',
      );
    }
    if (
      !ref.call.scopes.every((scope) => active.includes(scope)) ||
      !ref.path.every(
        (segment) => !isScope(segment) || active.includes(segment),
      )
    ) {
      throw new TypeError(
        'experimental_nested(): a stand-in of an item was used outside the `.map()` callback it came from',
      );
    }
  };

  /**
   * Whether everything a shape reads, its edges and items too, is in `active`.
   * A list's items read its own list
   */
  const checkShape = (shape: Shape, active: readonly Scope[]): void => {
    switch (shape.kind) {
      case 'value':
        checkScopes(shape.ref, active);
        return;
      case 'node':
        checkScopes(shape.ref, active);
        for (const edge of Object.values(shape.edges)) {
          checkShape(edge, active);
        }
        return;
      case 'list':
        checkScopes(shape.scope.list, active);
        checkShape(shape.item, [...active, shape.scope]);
        return;
    }
  };

  const edgesOf = (value: unknown) => {
    const edges: Record<string, Shape> = {};
    if (!isPlainObject(value)) {
      throw new TypeError(
        'experimental_nested(): `.with()` and `.map()` callbacks return an object of edges',
      );
    }
    // Its type would have the edge, and the result would not
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(
        'experimental_nested(): the key of an edge is a string, not a symbol',
      );
    }
    for (const key of Object.keys(value)) {
      const edge = shapeOf(value[key]);
      if (!edge) {
        throw new TypeError(
          `experimental_nested(): the edge "${key}" is no query of \`q\`, stand-in, \`.with()\` or \`.map()\``,
        );
      }
      checkShape(edge, scopes);
      setOwn(edges, key, edge);
    }
    return edges;
  };

  const standIn = (ref: Ref): unknown =>
    asShape(
      new Proxy(nothing, {
        get: (_target, key) =>
          typeof key === 'string' && key !== 'then'
            ? standIn({ call: ref.call, path: [...ref.path, key] })
            : undefined,
        apply: (_target, _this, args: unknown[]) => {
          const method = ref.path[ref.path.length - 1];
          const of: Ref = { call: ref.call, path: ref.path.slice(0, -1) };
          const [fn] = args;
          if (method === 'map' && typeof fn === 'function') {
            const scope: Scope = { list: of };
            const item: Ref = { call: of.call, path: [...of.path, scope] };
            scopes.push(scope);
            // Also when the callback throws, and the builder goes on
            using _scope = makeResource({}, () => {
              scopes.pop();
            });
            const returned: unknown = fn(standIn(item));
            const shape = shapeOf(returned);
            if (shape) {
              checkShape(shape, scopes);
            }
            const edges = shape ? null : edgesOf(returned);
            return asShape(
              {},
              {
                kind: 'list',
                scope,
                item:
                  shape ??
                  (edges && Object.keys(edges).length > 0
                    ? { kind: 'node', ref: item, edges }
                    : { kind: 'value', ref: item }),
              },
            );
          }
          if (
            method === 'with' &&
            of.path.length === 0 &&
            typeof fn === 'function'
          ) {
            return asShape(
              {},
              { kind: 'node', ref: of, edges: edgesOf(fn(standIn(of))) },
            );
          }
          throw new TypeError(
            `experimental_nested(): \`${typeof method === 'string' ? method : ''}()\` was called on a stand-in. The callback runs once, before any data is there: pass values to inputs, without computing with them`,
          );
        },
      }),
      { kind: 'value', ref },
    );

  const q = createRecursiveProxy(({ path, args }) => {
    const procedure = path.slice(0, -1).join('.');
    if (path[path.length - 1] !== 'query') {
      throw new TypeError(
        `experimental_nested(): \`q.${path.join('.')}()\`: \`q\` has queries only, as \`.query()\``,
      );
    }
    // Read once, as it is now: a later change to the object doesn't change
    // the call, and the request and a query that asks by itself agree
    const input = mapInput(args[0], [], (it) => it);
    const holes: Hole[] = [];
    const blanked = mapInput(input, [], (_standIn, hole) => {
      checkScopes(hole.ref, scopes);
      holes.push(hole);
      return undefined;
    });
    const call: Call = {
      path: procedure,
      input,
      blanked,
      holes,
      scopes: [...scopes],
      source: null,
      frame: [],
      sent: null,
      runs: new Map(),
    };
    calls.push(call);
    return standIn({ call, path: [] });
  }) as experimental_NestedQueries<TRouter>;

  /**
   * Has the server make the call in the request of what it reads, if that
   * request hasn't gone and the link pipelines. Its input is filled in there.
   */
  function pipe(call: Call) {
    const inner = call.scopes[call.scopes.length - 1] ?? null;
    const reads: PipelineCallReads<PipelineSource>['reads'] = [];
    let frame: Scope[] = [];
    let readsItem = false;
    for (const { to, ref } of call.holes) {
      if (!to) {
        return;
      }
      const item = inner && [...inner.list.path, inner];
      if (
        inner &&
        item &&
        ref.call === inner.list.call &&
        item.every((segment, index) => ref.path[index] === segment)
      ) {
        const path = ref.path.slice(item.length);
        if (path.some(isScope)) {
          return;
        }
        reads.push({ kind: 'item', to, path: wirePath(path) });
        readsItem = true;
        continue;
      }
      // An item of an outer list: no request has it on its own
      if (!ref.call.source || ref.path.some(isScope)) {
        return;
      }
      reads.push({
        kind: 'whole',
        to,
        from: ref.call.source,
        path: wirePath(ref.path),
      });
      if (ref.call.frame.length > frame.length) {
        frame = ref.call.frame;
      }
    }
    let each: PipelineCallReads<PipelineSource>['each'] = null;
    // A call in a list runs for every item of it, unless what it reads does
    if (inner && (readsItem || !sameScopes(frame, call.scopes))) {
      const { list } = inner;
      if (!list.call.source) {
        return;
      }
      each = { from: list.call.source, path: wirePath(list.path) };
      frame = [...list.call.frame, ...list.path.filter(isScope), inner];
    }
    if (!sameScopes(frame, call.scopes)) {
      return;
    }
    const piped = pipeCall({
      path: call.path,
      input: call.blanked,
      reads: { each, reads },
    });
    if (piped) {
      call.source = piped;
      call.frame = frame;
    }
  }

  function runOf(call: Call, items: Items) {
    const key = call.scopes.map((scope) => items.get(scope)).join();
    let run = call.runs.get(key);
    if (!run) {
      run = startRun(call, items);
      run.catch(nothing);
      call.runs.set(key, run);
    }
    return run;
  }

  async function startRun(call: Call, items: Items): Promise<unknown> {
    if (call.sent) {
      return call.sent;
    }
    const { source } = call;
    if (source && 'owner' in source) {
      try {
        const { data } = await source.result;
        if (call.frame.length === 0) {
          return data;
        }
        const item = await readPipelinedItem(
          data,
          call.frame.map((scope) => items.get(scope) ?? -1),
        );
        if (item.kind === 'data') {
          return item.data;
        }
        if (item.kind === 'error') {
          throw TRPCClientError.from({ error: item.error } as any);
        }
      } catch (error) {
        if (source.status !== 'unresolved') {
          throw error;
        }
      }
    }
    // The server didn't run it: it asks by itself, with what it reads
    return untyped.query(
      call.path,
      await fill(call.input, items),
      request(undefined),
    );
  }

  async function valueOf(ref: Ref, items: Items) {
    let value = await runOf(ref.call, items);
    for (const segment of ref.path) {
      const key = isScope(segment) ? String(items.get(segment)) : segment;
      value = hasOwn(value, key)
        ? (value as Record<string, unknown>)[key]
        : undefined;
    }
    return value;
  }

  async function fill(value: unknown, items: Items): Promise<unknown> {
    const shape = shapeOf(value);
    if (shape?.kind === 'value') {
      return valueOf(shape.ref, items);
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => fill(item, items)));
    }
    if (isPlainObject(value)) {
      const keys = Object.keys(value);
      const values = await Promise.all(
        keys.map((key) => fill(value[key], items)),
      );
      const filled: Record<string, unknown> = {};
      keys.forEach((key, index) => {
        setOwn(filled, key, values[index]);
      });
      return filled;
    }
    return value;
  }

  async function resolve(shape: Shape, items: Items): Promise<unknown> {
    switch (shape.kind) {
      case 'value':
        return valueOf(shape.ref, items);
      case 'node': {
        const node = {
          node: await valueOf(shape.ref, items),
          edges: {} as Record<string, Promise<unknown>>,
        };
        for (const [key, edgeShape] of Object.entries(shape.edges)) {
          const edge = resolve(edgeShape, items);
          // An edge that nobody reads can fail
          edge.catch(nothing);
          setOwn(node.edges, key, edge);
        }
        nodes.add(node);
        return node;
      }
      case 'list': {
        const list = await valueOf(shape.scope.list, items);
        const resolved = await Promise.all(
          (Array.isArray(list) ? list : []).map((_item, index) =>
            resolve(shape.item, new Map(items).set(shape.scope, index)),
          ),
        );
        lists.add(resolved);
        return resolved;
      }
    }
  }

  const root = shapeOf(build(q));
  if (!root) {
    throw new TypeError(
      'experimental_nested(): the callback returns a query of `q`, or a stand-in, `.with()` or `.map()` of one',
    );
  }
  checkShape(root, []);
  // In one step: the link takes the queries that read nothing into a batch,
  // and the calls that read them go in its request
  for (const call of calls) {
    if (call.holes.length === 0 && call.scopes.length === 0) {
      const pipeline = createOperationPipeline();
      call.sent = untyped.query(
        call.path,
        call.blanked,
        request(pipelineContext(pipeline)),
      );
      call.sent.catch(nothing);
      call.source = pipeline;
    } else {
      pipe(call);
    }
  }
  if (
    isDev() &&
    !warned.has(untyped) &&
    calls.some((call) => call.source && 'owner' in call.source) &&
    calls.some(
      (call) =>
        call.source &&
        !('owner' in call.source) &&
        call.source.streams === false,
    )
  ) {
    warned.add(untyped);
    // oxlint-disable-next-line no-console
    console.warn(
      "experimental_nested(): the link doesn't stream its responses, so the edges in a request settle together, with the whole response. Use `httpBatchStreamLink` for each edge to settle when its query is done",
    );
  }
  return resolve(root, new Map()) as Promise<ResultOf<TShape>>;
}

async function settle(value: unknown): Promise<unknown> {
  if (nodes.has(value as object)) {
    const { node, edges } = value as experimental_Node<
      unknown,
      Record<string, Promise<unknown>>
    >;
    const keys = Object.keys(edges);
    const settled = await Promise.all(
      keys.map(async (key) => settle(await edges[key])),
    );
    const resolved: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      setOwn(resolved, key, settled[index]);
    });
    return { node, edges: resolved };
  }
  if (lists.has(value as object)) {
    return Promise.all((value as unknown[]).map(settle));
  }
  return value;
}

/**
 * Awaits every edge of `experimental_nested()`'s result, so that each is a
 * value. Rejects if an edge does.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#without-tanstack-query
 */
export async function experimental_settle<TResult>(
  result: TResult | Promise<TResult>,
): Promise<experimental_Settled<TResult>> {
  return (await settle(await result)) as experimental_Settled<TResult>;
}
