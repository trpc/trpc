import { TRPCError } from '../../error/TRPCError';
import { isPromise } from '../../stream/jsonl';
import type { CombinedDataTransformer } from '../../transformer';
import { emptyObject, isAsyncIterable, isObject } from '../../utils';
import type { experimental_PipeliningOptions } from '../types';
import type {
  PipeChildrenResponse,
  PipelineLimits,
  PipelinePath,
  PipeListResponse,
  PipeOutcome,
} from './wire';
import {
  parsePipelineKey,
  pipelineLimitDefaults,
  readPipelineList,
  readPipelinePath,
} from './wire';

/**
 * The limits a handler's `experimental_allowPipelining` sets, or `null` if it
 * doesn't accept pipelined batches
 */
export function pipelineLimitsOf(
  option: boolean | experimental_PipeliningOptions | undefined,
): PipelineLimits | null {
  if (!option) {
    return null;
  }
  if (option === true) {
    return pipelineLimitDefaults;
  }
  return {
    maxValueLength:
      option.maxValueLength ?? pipelineLimitDefaults.maxValueLength,
    maxReadsPerCall:
      option.maxReadsPerCall ?? pipelineLimitDefaults.maxReadsPerCall,
    maxFillSize: option.maxFillSize ?? pipelineLimitDefaults.maxFillSize,
    maxDepth: option.maxDepth ?? pipelineLimitDefaults.maxDepth,
    allowWholeValues:
      option.allowWholeValues ?? pipelineLimitDefaults.allowWholeValues,
    maxRuns: option.maxRuns ?? pipelineLimitDefaults.maxRuns,
  };
}

/** The `tree` of a request that has no body, not yet checked */
export function treeOfSearchParams(searchParams: URLSearchParams) {
  return searchParams.get('tree') ?? undefined;
}

/** The `tree` beside the inputs in a request's body, not yet checked */
export function treeOfBody(body: unknown): unknown {
  return isObject(body) ? body['tree'] : undefined;
}

function invalidTree(message: string) {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: `Invalid "tree": ${message}`,
  });
}

function isKeys(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((segment) => typeof segment === 'string')
  );
}

function isPath(value: unknown): value is PipelinePath {
  return (
    Array.isArray(value) &&
    value.every((segment) => segment === null || typeof segment === 'string')
  );
}

/** A plain object, not an array */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

/** Whether an object has only the keys it may have */
function hasOnly(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

// ---------- a request's tree, checked ----------

/** A read, checked: where it comes from, as how many calls up */
export interface PipelinePlanRead {
  to: string[];
  /** The item a run is for, or the data of a call */
  from: 'item' | 'data';
  /** How many calls up: 0 is the node itself, 1 its parent */
  up: number;
  path: PipelinePath;
}

/** A node, checked */
export interface PipelinePlanNode {
  key: string;
  /** The procedure's path */
  path: string;
  /** The input as the client sent it */
  input: unknown;
  reads: PipelinePlanRead[];
  /** How deep it is: a top-level call is 1 */
  depth: number;
  /** Whether it runs once for every item of a list in its parent's data */
  perItem: boolean;
  /**
   * Whether it can run at more than one place: for every item, or under a
   * node that does. Each of its runs then gets a copy of its input
   */
  repeated: boolean;
  /** The keys of its children, in order, which the response has too */
  childKeys: string[];
  /**
   * Its children, or `null` if it has none, or if it is deeper than the
   * server goes: it is refused then, and what it has under it doesn't matter
   */
  children: PipelinePlanChildren | null;
}

/** Children, checked, in the order of their keys */
export type PipelinePlanChildren = (
  | { kind: 'node'; node: PipelinePlanNode }
  | {
      kind: 'list';
      key: string;
      levels: string[][];
      children: PipelinePlanChildren;
    }
)[];

/**
 * The children of a top-level call, checked, or why none of them runs: the
 * batch would run more times than `maxRuns` allows, if all of them ran once
 */
export type PipelinePlanTree =
  | { ok: true; children: PipelinePlanChildren }
  | { ok: false; keys: string[]; error: TRPCError };

/** The keys of children, in order */
function keysOf(children: PipelinePlanChildren) {
  return children.map((child) =>
    child.kind === 'node' ? child.node.key : child.key,
  );
}

/** What a call has above it, for what its reads can reach */
interface PlanFrame {
  /** Whether it runs for the item of a list */
  hasItem: boolean;
}

/**
 * Checks the `tree` of a request: the children of each top-level call, by
 * its index. A string is the search param's JSON. A request without one has
 * no children. Nothing after this checks it again: a read that comes out of
 * this reaches what it names.
 */
export function parsePipelineTree(opts: {
  tree: unknown;
  /** How many top-level calls the batch has */
  calls: number;
  /** How deep the server goes: what is deeper isn't looked at */
  maxDepth: number;
  /**
   * The most runs the batch may have. Each node runs at least once, so the
   * children of a top-level call that would take the nodes over it don't
   * run: a response then has a result for every node of no more trees than
   * can run.
   */
  maxRuns: number;
}): Map<number, PipelinePlanTree> {
  const { maxDepth } = opts;
  /** The nodes of the tree being parsed, and the keys under too deep ones */
  let nodes = 0;
  let parsed = opts.tree;
  if (parsed === undefined) {
    return new Map();
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw invalidTree('not JSON');
    }
  }
  if (!isRecord(parsed)) {
    throw invalidTree('expected an object');
  }

  function parseRead(
    read: unknown,
    /** The node, then the calls above it, nearest first */
    frames: readonly PlanFrame[],
    where: string,
  ): PipelinePlanRead {
    if (
      !isRecord(read) ||
      !isKeys(read['to']) ||
      !hasOnly(read, ['to', 'item', 'data', 'up'])
    ) {
      throw invalidTree(`expected a read with "to" at ${where}`);
    }
    const hasItem = read['item'] !== undefined;
    const hasData = read['data'] !== undefined;
    const path = hasItem ? read['item'] : read['data'];
    if (hasItem === hasData || !isPath(path)) {
      throw invalidTree(`expected "item" or "data" at ${where}`);
    }
    const from = hasItem ? 'item' : 'data';
    const up = read['up'] ?? (from === 'item' ? 0 : 1);
    if (typeof up !== 'number' || !Number.isInteger(up) || up < 0) {
      throw invalidTree(`expected "up" to be a whole number at ${where}`);
    }
    const frame = frames[up];
    // The node itself has no data yet, and only a run for an item has one
    if (!frame || (from === 'data' ? up === 0 : !frame.hasItem)) {
      throw invalidTree(
        `a read at ${where} reaches no ${from === 'item' ? 'item' : 'call'} above it`,
      );
    }
    return { to: read['to'], from, up, path };
  }

  function parseNode(opts: {
    key: string;
    value: unknown;
    /** The calls above it, nearest first */
    above: readonly PlanFrame[];
    perItem: boolean;
    /** Whether a node above it runs at more than one place */
    repeated: boolean;
    where: string;
  }): PipelinePlanNode {
    const { value, where } = opts;
    if (
      !isRecord(value) ||
      typeof value['path'] !== 'string' ||
      value['path'] === '' ||
      !Array.isArray(value['reads']) ||
      !hasOnly(value, ['path', 'input', 'reads', 'children']) ||
      (value['children'] !== undefined && !isRecord(value['children']))
    ) {
      throw invalidTree(`expected a node with "path" and "reads" at ${where}`);
    }
    const frames = [{ hasItem: opts.perItem }, ...opts.above];
    const depth = frames.length;
    const children = value['children'];
    const childKeys = children ? Object.keys(children) : [];
    const goesDeeper = depth <= maxDepth;
    // What isn't parsed still gets a result for each of its keys
    nodes += 1 + (goesDeeper ? 0 : childKeys.length);
    const repeated = opts.perItem || opts.repeated;
    return {
      key: opts.key,
      path: value['path'],
      input: value['input'],
      reads: value['reads'].map((read, index) =>
        parseRead(read, frames, `${where}.reads.${index}`),
      ),
      depth,
      perItem: opts.perItem,
      repeated,
      childKeys,
      children:
        children && goesDeeper
          ? parseChildren({
              value: children,
              above: frames,
              perItem: false,
              repeated,
              where,
            })
          : null,
    };
  }

  function parseChildren(opts: {
    value: Record<string, unknown>;
    /** The call they are the children of, then the calls above it */
    above: readonly PlanFrame[];
    /** Whether they are under a list */
    perItem: boolean;
    /** Whether the call they are under runs at more than one place */
    repeated: boolean;
    where: string;
  }): PipelinePlanChildren {
    return Object.entries(opts.value).map(([key, value]) => {
      const where = `${opts.where} ${JSON.stringify(key)}`;
      const parsedKey = parsePipelineKey(key);
      if (!parsedKey) {
        throw invalidTree(`no such key: ${JSON.stringify(key)}`);
      }
      if (parsedKey.kind === 'node') {
        return {
          kind: 'node' as const,
          node: parseNode({
            key,
            value,
            above: opts.above,
            perItem: opts.perItem,
            repeated: opts.repeated,
            where,
          }),
        };
      }
      if (opts.perItem) {
        // One way to write a list of lists, which also keeps how deep a tree
        // can go to what `maxDepth` allows
        throw invalidTree(
          `a list at ${where} is right under another: write them as one key, such as "pages[].items[]"`,
        );
      }
      if (!isRecord(value)) {
        throw invalidTree(`expected children at ${where}`);
      }
      return {
        kind: 'list' as const,
        key,
        levels: parsedKey.levels,
        children: parseChildren({
          value,
          above: opts.above,
          perItem: true,
          repeated: true,
          where,
        }),
      };
    });
  }

  /** The nodes of the trees that run, which start with a run each */
  let taken = opts.calls;
  return new Map(
    // Integer keys come in order, so which trees run doesn't depend on how
    // the request lists them
    Object.entries(parsed).map(
      ([key, children]): [number, PipelinePlanTree] => {
        const index = Number(key);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= opts.calls ||
          // One key per call: `01` is not another way to write `1`
          String(index) !== key
        ) {
          throw invalidTree(`no call at index ${key}`);
        }
        if (!isRecord(children)) {
          throw invalidTree(`expected children at ${key}`);
        }
        nodes = 0;
        const parsedChildren = parseChildren({
          value: children,
          above: [{ hasItem: false }],
          perItem: false,
          repeated: false,
          where: key,
        });
        if (taken + nodes > opts.maxRuns) {
          return [
            index,
            {
              ok: false,
              keys: Object.keys(children),
              error: overLimit(
                `The follow-ups of this call would make the batch run at least ${taken + nodes} times, more than \`maxRuns\` (${opts.maxRuns}) allows`,
              ),
            },
          ];
        }
        taken += nodes;
        return [index, { ok: true, children: parsedChildren }];
      },
    ),
  );
}

/**
 * Whether a value can be copied with one of its properties replaced: an
 * array, a plain object or an instance of a class. Not what keeps its state
 * out of its properties, such as a `Map` or a `Date`, or a class that names
 * itself with `Symbol.toStringTag`: it can't be told from one of those.
 */
function isRecordLike(value: object) {
  return (
    Array.isArray(value) ||
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * `input` with `value` at `to`. It copies what is on the way there and
 * changes nothing in place: an input can be data that another call reads too.
 */
function writePipelinePath(opts: {
  input: unknown;
  to: readonly string[];
  value: unknown;
}): unknown {
  const write = (target: unknown, depth: number): unknown => {
    const key = opts.to[depth];
    if (key === undefined) {
      return opts.value;
    }
    if (
      typeof target !== 'object' ||
      target === null ||
      // In an array, only an item it has: not its `length`
      (Array.isArray(target) &&
        !(
          /^(0|[1-9]\d*)$/.test(key) &&
          Object.prototype.hasOwnProperty.call(target, key)
        ))
    ) {
      throw invalidTree(`the input has nothing at "${opts.to.join('.')}"`);
    }
    if (!isRecordLike(target)) {
      throw invalidTree(
        `the input has a value on the way to "${opts.to.join('.')}" that can't be written to`,
      );
    }
    // With its prototype: an input's transformer can make it a class instance
    const copy: object = Array.isArray(target)
      ? [...target]
      : Object.create(
          Object.getPrototypeOf(target),
          Object.getOwnPropertyDescriptors(target),
        );
    // Not an assignment, which would set the prototype for a `__proto__` key
    Object.defineProperty(copy, key, {
      value: write(
        Object.prototype.hasOwnProperty.call(target, key)
          ? (target as Record<string, unknown>)[key]
          : undefined,
        depth + 1,
      ),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return copy;
  };
  return write(opts.input, 0);
}

/** A value as it is after a trip over the wire. What JSON can't carry is left out */
function overTheWire(
  transformer: CombinedDataTransformer['input' | 'output'],
  value: unknown,
) {
  const json = JSON.stringify(transformer.serialize(value));
  return json === undefined
    ? undefined
    : transformer.deserialize(JSON.parse(json));
}

/** What the children of a call that failed, or that can't be read, get */
function sourceFailed(cause: unknown) {
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'The call this call reads its input from failed',
    cause,
  });
}

/** Thrown inside `readableData` for a part of the data that is still to come */
class StillToCome extends Error {}

/**
 * A call's data as the client gets it, for the calls under it, or why it
 * can't be read: some of it is still to come, as a stream sends it, and what
 * JSON makes of that is `{}`, which isn't what the client gets. Data that
 * can't go over the wire at all fails the call itself, so what is under it
 * gets what it gets for a failed call.
 */
function readableData(
  transformer: CombinedDataTransformer['output'],
  data: unknown,
): { ok: true; data: unknown } | { ok: false; error: TRPCError } {
  try {
    const json = JSON.stringify(
      transformer.serialize(data),
      (_key, value: unknown) => {
        if (isPromise(value) || isAsyncIterable(value)) {
          throw new StillToCome();
        }
        return value;
      },
    );
    return {
      ok: true,
      data:
        json === undefined
          ? undefined
          : transformer.deserialize(JSON.parse(json)),
    };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof StillToCome
          ? new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message: 'Cannot read the data of a stream-like response',
            })
          : sourceFailed(cause),
    };
  }
}

/** A call refused for going over one of the server's limits */
function overLimit(message: string) {
  return new TRPCError({ code: 'BAD_REQUEST', message });
}

/** How many items a list of `depth` levels of lists has, as `shape` makes them */
function countItems(items: unknown[], depth: number): number {
  if (depth <= 1) {
    return items.length;
  }
  let count = 0;
  for (const item of items) {
    count += countItems(item as unknown[], depth - 1);
  }
  return count;
}

/**
 * Measures about how long values are as JSON, for the limits on how long a
 * value is and on what a batch fills in. It stops once a value is longer than `room`, and gives a length
 * over `room` then: what is that long isn't filled in, so its exact length
 * doesn't matter, and it reads no more of it than the room there is. Only
 * listing an object's keys takes as long as the object. That is once for
 * each object, or again for a call with more room, and the data calls read is
 * the server's own, which went over the wire whole already. It remembers what
 * it measured, so what many runs or calls read is measured once.
 */
export function createPipelineSizeOf() {
  /** An object's length, or how long it is at least if `exact` is false */
  const objects = new WeakMap<object, { size: number; exact: boolean }>();
  const strings = new Map<string, number>();
  const sizeOf = (value: unknown, room: number): number => {
    if (typeof value === 'string') {
      // Its length, with its quotes, is as long as it can be at least
      if (value.length + 2 > room) {
        return value.length + 2;
      }
      // With its escapes, which are up to six characters for one
      let size = strings.get(value);
      if (size === undefined) {
        size = JSON.stringify(value).length;
        strings.set(value, size);
      }
      return size;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      typeof value === 'boolean'
    ) {
      return String(value).length;
    }
    if (typeof value !== 'object' || value === null) {
      return 4;
    }
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      // As JSON has it, such as a `Date`'s string
      return sizeOf(value.toJSON(), room);
    }
    const known = objects.get(value);
    if (known && (known.exact || known.size > room)) {
      return known.size;
    }
    // A value inside itself counts once
    objects.set(value, { size: 0, exact: true });
    let size = 2;
    /** Adds a part. Whether the value is longer than the room then */
    const add = (part: unknown) => {
      size += sizeOf(part, room - size);
      return size > room;
    };
    let over = false;
    if (Symbol.iterator in value) {
      // An array, or what a transformer makes, such as a `Map` or a `Set`
      let index = 0;
      for (const part of value as Iterable<unknown>) {
        // A `,` before each but the first
        size += index++ === 0 ? 0 : 1;
        if ((over = add(part))) {
          break;
        }
      }
    } else {
      // A property is read once the room is known to have what is before it
      for (const [index, key] of Object.keys(value).entries()) {
        // A `,` before each but the first, and a `:` after its key
        size += (index === 0 ? 0 : 1) + 1;
        if ((over = add(key) || add((value as Record<string, unknown>)[key]))) {
          break;
        }
      }
    }
    if (over) {
      objects.set(value, { size, exact: false });
      return size;
    }
    objects.set(value, { size, exact: true });
    return size;
  };
  return sizeOf;
}

// ---------- running a tree ----------

/** How a node went, as a response has it, with its data as it really is */
export type PipelineNodeOutcome<TError> =
  | { ok: true; data: unknown }
  | { ok: false; error: TError };

/** A node's outcome, and its children once its data is there */
export interface PipelineNodeResult<TError> {
  outcome: PipelineNodeOutcome<TError>;
  /** `null` if it has no children */
  children: Promise<PipelineChildrenResult<TError>> | null;
}

/** The items of a list, a list for each level */
export type PipelineListResult<TError> = (
  | PipelineChildrenResult<TError>
  | PipelineListResult<TError>
)[];

/** The children of a call, by their keys, in order */
export interface PipelineChildrenResult<TError> {
  entries: [
    key: string,
    value:
      | { kind: 'node'; result: Promise<PipelineNodeResult<TError>> }
      | { kind: 'list'; items: PipelineListResult<TError> }
      /** Its call failed: it has no node or items */
      | { kind: 'failed'; error: TError },
  ][];
}

/** What a call is to the calls under it */
interface Frame {
  /** Its data, as the client gets it */
  data: unknown;
  /** The item it runs for, if it runs for one */
  item: unknown;
}

/** Where children run: once for each item of their lists, or once */
interface Place<TError> {
  /** The index of the top-level call they are under */
  index: number;
  /** The call they are the children of, then the calls above it */
  above: readonly Frame[];
  /** What their keys are resolved in: the call's data, or the item */
  value: unknown;
  /** The item they run for, under a list */
  item: unknown;
  /** Their results, filled in as they start */
  out: PipelineChildrenResult<TError>;
}

/**
 * Runs the follow-up calls of a batch's top-level calls, as their `tree`
 * says. Throws if the `tree` is invalid.
 */
export function pipelineTree(opts: {
  /** The request's `tree`, not yet checked. `undefined` if it has none */
  tree: unknown;
  /** How many top-level calls the batch has */
  calls: number;
  transformer: CombinedDataTransformer;
  limits: PipelineLimits;
  /**
   * The most runs of calls the batch may have, top-level calls included, or
   * `null` for any number. A node runs once for every item it is under. A
   * node whose runs would go over it is refused.
   */
  maxRuns: number | null;
}) {
  const { limits } = opts;
  const plan = parsePipelineTree({
    tree: opts.tree,
    calls: opts.calls,
    maxDepth: limits.maxDepth,
    maxRuns: limits.maxRuns,
  });
  const sizeOf = createPipelineSizeOf();
  let runs = opts.calls;
  let filledSize = 0;

  /**
   * A call's data as the client gets it, which is what a path refers to, or
   * why it can't be read
   */
  function asRead(data: unknown) {
    return readableData(opts.transformer.output, data);
  }
  /** Why `count` more runs can't be taken, if they can't */
  function overRuns(count: number, what: string) {
    const total = runs + count;
    if (opts.maxRuns !== null && total > opts.maxRuns) {
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `A call for every item exceeds the maximum batch size`,
      });
    }
    if (total > limits.maxRuns) {
      return overLimit(
        `${what} would make the batch run ${total} times, more than \`maxRuns\` (${limits.maxRuns}) allows`,
      );
    }
    return null;
  }
  /**
   * A filled-in input as a call gets it when a client fills it in and sends
   * it: through the transformer of inputs, all of it, so what is not there
   * is `null` in a list and left out of an object where JSON makes it so. It
   * is a value of its own too, so a call that changes its input in place
   * changes nothing that another call, or another run, reads.
   */
  function asSent(input: unknown) {
    return overTheWire(opts.transformer.input, input);
  }

  /** Why a node is refused before it reads anything, if it is */
  function refusalOf(node: PipelinePlanNode) {
    if (node.reads.length > limits.maxReadsPerCall) {
      return overLimit(
        `This call reads ${node.reads.length} values, more than \`maxReadsPerCall\` (${limits.maxReadsPerCall}) allows`,
      );
    }
    if (node.depth > limits.maxDepth) {
      return overLimit(
        `This call is nested ${node.depth} deep, more than \`maxDepth\` (${limits.maxDepth}) allows`,
      );
    }
    return null;
  }
  /** Checks a value before it is written into an input */
  function checkValue(value: unknown) {
    if (
      !limits.allowWholeValues &&
      typeof value === 'object' &&
      value !== null
    ) {
      throw overLimit(
        `A value this call reads is an object or an array, and \`allowWholeValues\` is false`,
      );
    }
    if (sizeOf(value, limits.maxValueLength) > limits.maxValueLength) {
      throw overLimit(
        `A value this call reads is longer than \`maxValueLength\` (${limits.maxValueLength} characters of JSON) allows`,
      );
    }
  }

  return {
    /**
     * Runs the children of each top-level call once it has an outcome.
     * Gives what `children` gives each call that has any.
     */
    run<TError>(run: {
      /** Runs a node with its filled-in input. Never rejects */
      node: (node: {
        path: string;
        input: unknown;
        /** The index of the top-level call it is under */
        index: number;
      }) => Promise<PipelineNodeOutcome<TError>>;
      /** What a node that doesn't run, or children whose call failed, get */
      fail: (
        error: TRPCError,
        node: { path: string; input: unknown } | null,
      ) => TError;
    }) {
      /** Children that don't run, with `cause` as each one's error */
      const failed = (keys: readonly string[], cause: TRPCError) => {
        const error = run.fail(cause, null);
        return {
          entries: keys.map(
            (key): PipelineChildrenResult<TError>['entries'][number] => [
              key,
              { kind: 'failed', error },
            ],
          ),
        };
      };

      /** Starts the children of a call that ran, at each place they run at */
      function startChildren(
        children: PipelinePlanChildren,
        places: readonly Place<TError>[],
      ) {
        for (const child of children) {
          if (child.kind === 'node') {
            runNode(child.node, places);
            continue;
          }
          const lists = places.map((place) => ({
            place,
            items: readPipelineList(place.value, child.levels),
          }));
          // Every node under the list runs for every item: if they would be
          // too many, the list has an error in place of its items
          let items = 0;
          for (const list of lists) {
            items += countItems(list.items, child.levels.length);
          }
          const tooMany = overRuns(items * child.children.length, 'This list');
          if (tooMany) {
            const error = run.fail(tooMany, null);
            for (const place of places) {
              place.out.entries.push([child.key, { kind: 'failed', error }]);
            }
            continue;
          }
          // The places the items make, a level of lists for each `[]`
          const inner: Place<TError>[] = [];
          const shape = (
            items: unknown[],
            depth: number,
            place: Place<TError>,
          ): PipelineListResult<TError> =>
            items.map((item) => {
              if (depth > 1) {
                return shape(item as unknown[], depth - 1, place);
              }
              const itemPlace: Place<TError> = {
                index: place.index,
                above: place.above,
                value: item,
                item,
                out: { entries: [] },
              };
              inner.push(itemPlace);
              return itemPlace.out;
            });
          for (const list of lists) {
            list.place.out.entries.push([
              child.key,
              {
                kind: 'list',
                items: shape(list.items, child.levels.length, list.place),
              },
            ]);
          }
          startChildren(child.children, inner);
        }
      }
      /** The children of a call, once it has an outcome */
      function childrenOf(of: {
        children: PipelinePlanChildren;
        index: number;
        frame:
          | { ok: true; frame: Frame; above: readonly Frame[] }
          | { ok: false; error: TRPCError };
      }): PipelineChildrenResult<TError> {
        const { frame } = of;
        if (!frame.ok) {
          return failed(keysOf(of.children), frame.error);
        }
        const place: Place<TError> = {
          index: of.index,
          above: [frame.frame, ...frame.above],
          value: frame.frame.data,
          item: undefined,
          out: { entries: [] },
        };
        startChildren(of.children, [place]);
        return place.out;
      }

      /** Starts a node's runs, one at each place */
      function runNode(
        node: PipelinePlanNode,
        places: readonly Place<TError>[],
      ) {
        const start = (
          run: (
            place: Place<TError>,
            at: number,
          ) => Promise<PipelineNodeResult<TError>>,
        ) => {
          for (const [at, place] of places.entries()) {
            place.out.entries.push([
              node.key,
              { kind: 'node', result: run(place, at) },
            ]);
          }
        };
        const refuse = (error: TRPCError) => {
          const outcome: PipelineNodeOutcome<TError> = {
            ok: false,
            error: run.fail(error, { path: node.path, input: node.input }),
          };
          start(async () => ({
            outcome,
            children:
              node.childKeys.length === 0
                ? null
                : Promise.resolve(failed(node.childKeys, sourceFailed(error))),
          }));
        };
        const refusal = refusalOf(node);
        if (refusal) {
          refuse(refusal);
          return;
        }
        let inputs: unknown[];
        try {
          const base =
            node.input === undefined
              ? undefined
              : opts.transformer.input.deserialize(node.input);
          let size = 0;
          const add = (value: unknown) => {
            size += sizeOf(value, limits.maxFillSize - filledSize - size);
            if (filledSize + size > limits.maxFillSize) {
              throw overLimit(
                `What this call fills in goes over \`maxFillSize\` (${limits.maxFillSize} characters of JSON for the batch)`,
              );
            }
          };
          inputs = places.map((place) => {
            const input = asSent(
              node.reads.reduce((input, read) => {
                const value = readPipelinePath(
                  read.from === 'item'
                    ? read.up === 0
                      ? place.item
                      : place.above[read.up - 1]?.item
                    : place.above[read.up - 1]?.data,
                  read.path,
                );
                checkValue(value);
                // A node that runs once copies only its values: the rest of
                // its input is what the client sent
                if (!node.repeated) {
                  add(value);
                }
                return writePipelinePath({ input, to: read.to, value });
              }, base),
            );
            // Every run of a node that runs at more than one place gets a
            // copy of its whole input. All of it counts, with the keys its
            // values are written under, before the next is made
            if (node.repeated) {
              add(input);
            }
            return input;
          });
          const tooMany = overRuns(places.length, 'This call');
          if (tooMany) {
            throw tooMany;
          }
          // Taken only once its inputs are made: a refused node takes none
          runs += places.length;
          filledSize += size;
        } catch (cause) {
          refuse(
            cause instanceof TRPCError
              ? cause
              : new TRPCError({ code: 'BAD_REQUEST', cause }),
          );
          return;
        }
        const { children } = node;
        start(async (place, at) => {
          const input = inputs[at];
          const outcome = await run.node({
            path: node.path,
            input,
            index: place.index,
          });
          if (!children) {
            return { outcome, children: null };
          }
          let frame:
            | { ok: true; frame: Frame; above: readonly Frame[] }
            | { ok: false; error: TRPCError };
          if (outcome.ok) {
            const read = asRead(outcome.data);
            frame = read.ok
              ? {
                  ok: true,
                  frame: { data: read.data, item: place.item },
                  above: place.above,
                }
              : read;
          } else {
            frame = { ok: false, error: sourceFailed(null) };
          }
          return {
            outcome,
            children: Promise.resolve(
              childrenOf({ children, index: place.index, frame }),
            ),
          };
        });
      }

      return {
        /**
         * The children of the top-level call at `index`, once it has an
         * outcome, or `null` if it has none
         */
        children: (
          index: number,
          outcome: Promise<{ ok: true; data: unknown } | { ok: false }>,
        ): Promise<PipelineChildrenResult<TError>> | null => {
          const tree = plan.get(index);
          if (!tree) {
            return null;
          }
          if (!tree.ok) {
            return Promise.resolve(failed(tree.keys, tree.error));
          }
          const { children } = tree;
          const keys = keysOf(children);
          return outcome.then((it) => {
            if (!it.ok) {
              return failed(keys, sourceFailed(null));
            }
            const read = asRead(it.data);
            if (!read.ok) {
              return failed(keys, read.error);
            }
            return childrenOf({
              children,
              index,
              frame: {
                ok: true,
                frame: { data: read.data, item: undefined },
                above: [],
              },
            });
          });
        },
      };
    },
  };
}

// ---------- a tree's results in a response ----------

/**
 * The children of a call in a response that isn't streamed: every node's
 * outcome, with `serialize` making each what the response has
 */
export async function pipelineChildrenJSON<TError>(
  children: Promise<PipelineChildrenResult<TError>>,
  serialize: (outcome: PipelineNodeOutcome<TError>) => PipeOutcome<TError>,
): Promise<PipeChildrenResponse<TError>> {
  const response: PipeChildrenResponse<TError> = emptyObject();
  const listJSON = async (
    items: PipelineListResult<TError>,
  ): Promise<PipeListResponse<TError>> =>
    Promise.all(
      items.map((item) =>
        Array.isArray(item)
          ? listJSON(item)
          : pipelineChildrenJSON(Promise.resolve(item), serialize),
      ),
    );
  for (const [key, value] of (await children).entries) {
    switch (value.kind) {
      case 'failed':
        // Through the transformer, as every error the response has
        response[key] = serialize({ ok: false, error: value.error });
        break;
      case 'list':
        response[key] = await listJSON(value.items);
        break;
      case 'node': {
        const result = await value.result;
        const outcome = serialize(result.outcome);
        response[key] = result.children
          ? {
              ...outcome,
              children: await pipelineChildrenJSON(result.children, serialize),
            }
          : outcome;
        break;
      }
    }
  }
  return response;
}

/**
 * The children of a call in a streamed response: each node's outcome, the
 * items of each list and the children of each item are values of their own,
 * which the stream sends when each is ready. `envelope` makes a node's
 * outcome what the stream has for it.
 */
export function pipelineChildrenStream<TError>(
  children: Promise<PipelineChildrenResult<TError>>,
  envelope: (outcome: PipelineNodeOutcome<TError>) => object,
): Promise<Record<string, Promise<unknown>>> {
  // The stream has values of their own only in objects, not in arrays
  const listStream = (items: PipelineListResult<TError>) => {
    const byIndex: Record<string, Promise<unknown>> = emptyObject();
    for (const [index, item] of items.entries()) {
      byIndex[index] = Array.isArray(item)
        ? Promise.resolve(listStream(item))
        : pipelineChildrenStream(Promise.resolve(item), envelope);
    }
    return byIndex;
  };
  return children.then(({ entries }) => {
    const stream: Record<string, Promise<unknown>> = emptyObject();
    for (const [key, value] of entries) {
      switch (value.kind) {
        case 'failed':
          stream[key] = Promise.resolve({ error: value.error });
          break;
        case 'list':
          stream[key] = Promise.resolve(listStream(value.items));
          break;
        case 'node':
          stream[key] = value.result.then((result) => ({
            ...envelope(result.outcome),
            ...(result.children && {
              children: pipelineChildrenStream(result.children, envelope),
            }),
          }));
          break;
      }
    }
    return stream;
  });
}
