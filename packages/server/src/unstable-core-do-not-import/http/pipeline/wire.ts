/**
 * What a client and a server agree on about a pipelined batch.
 *
 * A pipelined batch is an ordinary batch of independent calls, `?batch=tree`,
 * where each call can carry a tree of follow-up calls that read its data. A
 * follow-up call sits under the data it reads, and one that runs once per
 * item sits under the list it runs over. The server runs a follow-up call as
 * soon as the data it reads is there, so queries that nest cost one round
 * trip.
 *
 * The client's half is in `./client`, the server's in `./server`. Both are
 * tested against each other, over HTTP, in `./pipeline.test.ts`.
 *
 * ## The request
 *
 * The paths and inputs are those of the top-level calls, as in any batch.
 * The tree is in the `tree` search param of a request without a body, and
 * beside the inputs in the body of one with a body:
 *
 * ```json
 * {
 *   "0": { "cursor": 10 },
 *   "tree": {
 *     "0": {
 *       "items[]": {
 *         "author.byId": {
 *           "path": "author.byId",
 *           "input": {},
 *           "reads": [{ "to": ["id"], "item": ["authorId"] }]
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * - The tree has the children of each top-level call that has any, by the
 *   call's index.
 * - **Children** are an object. A key that ends in `[]` is a list: a path
 *   into the data of the parent, with children of its own that run once for
 *   every item of the list. Any other key names a node.
 * - A **node** is a follow-up call: `path`, `input` (as a top-level call's
 *   input, through the transformer), `reads`, and `children` if it has any.
 * - A **read** fills a part of the node's input: `to` is where it goes in
 *   the input, and `item` or `data` is where it comes from. See
 *   {@link PipeRead}.
 *
 * ### Keys
 *
 * A list key is a path of segments separated by `.`, and `[]` after a
 * segment means every item of the list there: `items[]`, `data.items[]`,
 * `pages[].items[]`. In a segment, `\` escapes `.`, `[`, `]` and `\`, so a
 * property named `a.b` is `a\.b`. The key is resolved in the data of the
 * call the children belong to, or, under a list, in the item.
 *
 * A node's key is a name the client picks, taken as it is, such as
 * `author.byId`. It can be anything that doesn't end in `[]`.
 *
 * Keys are strings, not arrays of segments, because children are an object:
 * the response has the same keys in the same places, so a node's result is
 * found by the same path it was sent at.
 *
 * ## The response
 *
 * A list of the top-level calls' outcomes, as in any batch. A call that had
 * children has `children` next to its outcome, with the same keys:
 *
 * ```json
 * [
 *   {
 *     "result": { "data": { "items": [{ "authorId": "ada" }] } },
 *     "children": {
 *       "items[]": [
 *         { "author.byId": { "result": { "data": { "id": "ada" } } } }
 *       ]
 *     }
 *   }
 * ]
 * ```
 *
 * - A list key has a list with the children of every item, in the order of
 *   the items, one level of lists for each `[]`. What isn't a list has no
 *   items: `[]`.
 * - A node key has the node's outcome, `{ result }` or `{ error }`, as a
 *   top-level call's, with its own `children` if it had any.
 * - A node that fails, or doesn't run, gives each key of its children an
 *   `{ error }` with the code `PRECONDITION_FAILED`, and runs none of them.
 *   A run for one item fails by itself.
 *
 * ## The response, streamed
 *
 * `httpBatchStreamLink`'s response is the JSON Lines stream that tRPC
 * streams every batch with: a first line with the shape, where every value
 * that isn't ready yet is a placeholder, and a line for each one as it gets
 * ready. A node's outcome is a placeholder of its own, so each node arrives
 * as soon as it is ready, and a node's children are one more, ready as soon
 * as the node's data is there. A list's items are an object by index there,
 * not an array, as the stream only has placeholders in objects. A subtree
 * is complete once every placeholder in it is.
 */

/**
 * The value of a pipelined batch's `batch` search param, where an ordinary
 * batch has `1`.
 */
export const pipelineBatch = 'tree';

/**
 * Where a value is: the keys to follow. `null` stands for every item of a
 * list, so `['items', null, 'id']` is the list of the items' ids.
 */
export type PipelinePath = (string | null)[];

/**
 * A read as it is in a request: it fills the part of a node's input at `to`,
 * which is empty for the whole input. It reads from one of the calls on the
 * node's way to the root, by how many calls up it is, so it can't read a
 * sibling, a sibling's descendants or a later call.
 *
 * - `item` is a path into the item that a run is for. `up` counts from the
 *   node itself, 0, which is the default.
 * - `data` is a path into the data of a call above. `up` counts from the
 *   node's parent, 1, which is the default.
 */
export type PipeRead =
  | { to: string[]; item: PipelinePath; up?: number }
  | { to: string[]; data: PipelinePath; up?: number };

/** A follow-up call as it is in a request */
export interface PipeNode {
  /** The procedure's path */
  path: string;
  /** The input as the client sent it, with what the server fills in left out */
  input?: unknown;
  reads: PipeRead[];
  children?: PipeChildren;
}

/** The children of a call: nodes, and lists of children for every item */
export interface PipeChildren {
  [key: string]: PipeNode | PipeChildren;
}

/** A request's tree: the children of each top-level call, by its index */
export type PipeTree = Record<string, PipeChildren>;

/** The outcome of a call, as it is in a response */
export type PipeOutcome<TError> =
  | { result: { data: unknown }; children?: PipeChildrenResponse<TError> }
  | { error: TError; children?: PipeChildrenResponse<TError> };

/**
 * The children of a call, as they are in a response: the outcome of each
 * node, and the children of every item of each list
 */
export interface PipeChildrenResponse<TError> {
  [key: string]:
    | PipeOutcome<TError>
    | PipeListResponse<TError>
    | { error: TError };
}

/** A list's items in a response, one level of lists for each `[]` */
export type PipeListResponse<TError> = (
  | PipeChildrenResponse<TError>
  | PipeListResponse<TError>
)[];

/**
 * What the server lets a pipelined batch make it do. Each value a call reads
 * is copied into its input, so these keep what a small request can make the
 * server do in proportion to it. A call that goes over one is refused, and the
 * rest of the batch runs.
 */
export interface PipelineLimits {
  /** The longest value a call reads, in characters of JSON */
  maxValueLength: number;
  /** The most values one call reads */
  maxReadsPerCall: number;
  /**
   * The most a batch fills in, in characters of JSON: every value written
   * into an input, and the whole input of every run of a call for every item
   */
  maxFillSize: number;
  /** How deep queries nest: a top-level call is 1 */
  maxDepth: number;
  /** Whether a value a call reads can be an object or an array */
  allowWholeValues: boolean;
}

/**
 * The limits of a server whose `experimental_allowPipelining` is `true`.
 * Pipelining normally reads small values, such as ids, slugs and cursors.
 */
export const pipelineLimitDefaults: PipelineLimits = {
  maxValueLength: 1024,
  maxReadsPerCall: 16,
  maxFillSize: 100_000,
  maxDepth: 3,
  allowWholeValues: false,
};

/** A key that names a list: the path to follow for each level of lists */
export interface PipelineListKey {
  kind: 'list';
  /** For each `[]`, the segments before it */
  levels: string[][];
}

/** A key of children: a list, or a node's name */
export type PipelineKey = PipelineListKey | { kind: 'node'; name: string };

const escapable = new Set(['\\', '.', '[', ']']);

/** The key of children that `key` is, or `null` if it is none */
export function parsePipelineKey(key: string): PipelineKey | null {
  if (!key.endsWith('[]')) {
    return key === '' ? null : { kind: 'node', name: key };
  }
  const levels: string[][] = [];
  let segments: string[] = [];
  let segment = '';
  let at = 0;
  while (at < key.length) {
    const char = key.charAt(at);
    if (char === '\\') {
      const next = key.charAt(at + 1);
      if (!escapable.has(next)) {
        return null;
      }
      segment += next;
      at += 2;
      continue;
    }
    if (char === '.' || char === '[') {
      // No empty segment: `a..b`, `.a`, `[]` or `a.[]`
      if (segment === '') {
        return null;
      }
      segments.push(segment);
      segment = '';
      at += 1;
      if (char === '.') {
        continue;
      }
      if (key.charAt(at) !== ']') {
        return null;
      }
      levels.push(segments);
      segments = [];
      at += 1;
      // After `[]`, the end, or a `.` and more
      if (
        at < key.length &&
        (key.charAt(at) !== '.' || at + 1 === key.length)
      ) {
        return null;
      }
      at += 1;
      continue;
    }
    if (char === ']') {
      return null;
    }
    segment += char;
    at += 1;
  }
  return { kind: 'list', levels };
}

/** The key of a list, with what needs it escaped */
export function formatPipelineListKey(levels: readonly string[][]): string {
  return levels
    .map(
      (segments) =>
        `${segments
          .map((segment) => segment.replace(/[\\.[\]]/g, (char) => `\\${char}`))
          .join('.')}[]`,
    )
    .join('.');
}

/** Whether `value` is an object or an array with `key` as its own property */
export function hasOwn(value: unknown, key: string) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

/**
 * Reads `path` in `value`, through own properties of objects and arrays only.
 * The client and the server read with this, so both get the same value.
 */
export function readPipelinePath(
  value: unknown,
  path: readonly (string | null)[],
): unknown {
  let current = value;
  for (const [index, segment] of path.entries()) {
    if (segment === null) {
      const rest = path.slice(index + 1);
      return Array.isArray(current)
        ? current.map((item) => readPipelinePath(item, rest))
        : undefined;
    }
    if (!hasOwn(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * The items of a list key in `value`, a list for each level. What isn't a
 * list has no items.
 */
export function readPipelineList(
  value: unknown,
  levels: readonly (readonly string[])[],
): unknown[] {
  const [first = [], ...rest] = levels;
  const list = readPipelinePath(value, first);
  if (!Array.isArray(list)) {
    return [];
  }
  // By index: a list with holes has an item for each of them too
  return Array.from(list.keys(), (index) =>
    rest.length === 0 ? list[index] : readPipelineList(list[index], rest),
  );
}

/**
 * The path of one item's value: `path` with its first `null`, every item,
 * replaced by the item's index. For a client that reads what the server read
 * for one run.
 */
export function bindPipelinePath(
  path: readonly (string | null)[],
  index: number,
): PipelinePath {
  const position = path.indexOf(null);
  return path.map((segment, at) => (at === position ? String(index) : segment));
}
