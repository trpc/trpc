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
 * The format is positional, for machines rather than people: a node is a
 * tuple, children are a list, and a response has its results at the
 * positions the request had its children at.
 *
 * The client's half is in `./client`, the server's in `./server`. Both are
 * tested against each other, over HTTP, in `./pipeline.test.ts`.
 *
 * ## The request
 *
 * The paths and inputs are those of the top-level calls, as in any batch.
 * The tree is in the `tree` search param of a request without a body, and
 * beside the inputs in the body of one with a body. Here, the author of
 * every item of call 0's data, and the posts of each author's team:
 *
 * ```json
 * {
 *   "0": { "cursor": 10 },
 *   "tree": {
 *     "0": [
 *       [[["items"]], [
 *         ["author.byId", [[["id"], ["authorId"], 0]], [
 *           ["post.byTeam", [[["teamId"], ["teamId"]]]]
 *         ]]
 *       ]]
 *     ]
 *   }
 * }
 * ```
 *
 * - The tree has the children of each top-level call that has any, by the
 *   call's index.
 * - **Children** are a list of nodes and lists, in an order the response
 *   keeps.
 * - A **node** is a follow-up call: `[path, reads, children?, input?]`.
 *   `input` is as a top-level call's input, through the transformer, with
 *   what the server fills in left out. No children is `[]`.
 * - A **list** is `[levels, nodes]`: its nodes run once for every item of a
 *   list in the data of the call they are under. `levels` has the path to
 *   each level of lists, so `[["pages"], ["items"]]` is every item of every
 *   page, and `[[]]` every item of data that is a list. A list's children
 *   are nodes.
 * - A **read** fills a part of a node's input: `[to, from, up?]`. See
 *   {@link PipeRead}.
 *
 * ## The response
 *
 * A list of the top-level calls' outcomes, as in any batch. A call that had
 * children has `children` next to its outcome, a list with a result at the
 * position of each of its children:
 *
 * ```json
 * [
 *   {
 *     "result": { "data": { "items": [{ "authorId": "ada" }] } },
 *     "children": [
 *       [
 *         [{ "result": { "data": { "teamId": 1 } }, "children": [...] }]
 *       ]
 *     ]
 *   }
 * ]
 * ```
 *
 * - A list has the children of every item, in the order of the items, one
 *   level of lists for each level. What isn't a list has no items: `[]`.
 * - A node has its outcome, `{ result }` or `{ error }`, as a top-level
 *   call's, with its own `children` if it had any.
 * - A node that fails, or doesn't run, gives each of its children an
 *   `{ error }` with the code `PRECONDITION_FAILED`, and runs none of them.
 *   A run for one item fails by itself. A list that can't run has an
 *   `{ error }` in place of its items.
 *
 * ## The response, streamed
 *
 * `httpBatchStreamLink`'s response is the JSON Lines stream that tRPC
 * streams every batch with: a first line with the shape, where every value
 * that isn't ready yet is a placeholder, and a line for each one as it gets
 * ready. A node's outcome is a placeholder of its own, so each node arrives
 * as soon as it is ready, and a node's children are one more, ready as soon
 * as the node's data is there. Children and a list's items are objects by
 * position there, not lists, as the stream only has placeholders in
 * objects. A subtree is complete once every placeholder in it is.
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
 * A read as it is in a request, `[to, from, up?]`: it fills the part of a
 * node's input at `to`, which is empty for the whole input, with the value
 * at `from`. It reads from one of the calls on the node's way to the root,
 * so it can't read a sibling, a sibling's descendants or a later call. `up`
 * says which:
 *
 * - 1, the default, is the data of the call the node is under, 2 the data
 *   of the call above that, and so on.
 * - 0 is the item the node runs for, under a list, -1 the item the call it
 *   is under runs for, and so on.
 */
export type PipeRead =
  | [to: string[], from: PipelinePath]
  | [to: string[], from: PipelinePath, up: number];

/**
 * A follow-up call as it is in a request: `[path, reads, children?,
 * input?]`. No children is `[]`, and no input is left out.
 */
export type PipeNode =
  | [path: string, reads: PipeRead[]]
  | [path: string, reads: PipeRead[], children: PipeChild[]]
  | [path: string, reads: PipeRead[], children: PipeChild[], input: unknown];

/**
 * A list as it is in a request, `[levels, nodes]`: the nodes run once for
 * every item of the list, which is at `levels` in the data of the call they
 * are under, one path for each level of lists
 */
export type PipeList = [levels: string[][], nodes: PipeNode[]];

/** A call's child: a node, whose path is a string, or a list */
export type PipeChild = PipeNode | PipeList;

/** A request's tree: the children of each top-level call, by its index */
export type PipeTree = Record<string, PipeChild[]>;

/** The outcome of a call, as it is in a response */
export type PipeOutcome<TError> =
  | { result: { data: unknown }; children?: PipeChildResponse<TError>[] }
  | { error: TError; children?: PipeChildResponse<TError>[] };

/**
 * What a response has for a child: a node's outcome, a list's items, or an
 * error in place of either
 */
export type PipeChildResponse<TError> =
  | PipeOutcome<TError>
  | PipeListResponse<TError>
  | { error: TError };

/**
 * A list's items in a response, one level of lists for each level: the
 * children of each item, at the positions of the list's nodes
 */
export type PipeListResponse<TError> = (
  | PipeChildResponse<TError>[]
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
  /**
   * The most runs a batch has: each of its calls, and a call for every item
   * once for each item. `maxBatchSize` caps them too, if it is lower
   */
  maxRuns: number;
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
  maxRuns: 100,
};

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
 * The items of a list in `value`, at `levels`, a list for each level. What isn't a
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
