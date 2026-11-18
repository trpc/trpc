import { emptyObject, isObject } from '../../utils';
import type { PipeChild, PipeNode, PipeRead, PipeTree } from './wire';
import { hasOwn, pipelineBatch } from './wire';

/** A step on the way from a top-level call to a node: a child's position */
export type PipelineStep =
  /** `depth` is how many levels of lists it has */
  { kind: 'list'; at: number; depth: number } | { kind: 'node'; at: number };

/** A call that a client puts under another, for the server to run */
export interface PipelineTreeCall {
  /** What it reads the data of: what the request has, or another call */
  parent: object;
  /**
   * The list in the parent's data it runs for every item of, as the path to
   * each level of lists, or `null` if it runs once
   */
  list: string[][] | null;
  /** The procedure's path */
  path: string;
  /** Its input, with what the server fills in left out */
  input: unknown;
  reads: PipeRead[];
}

/** Where a call is in a request */
export interface PipelinePlace {
  /** The index of the top-level call it is under */
  index: number;
  steps: PipelineStep[];
}

/** The calls a client puts in a request for the server to run */
export interface PipelineTreePlan<TCall> {
  /** The calls that go in the request */
  calls: TCall[];
  /** The request's `tree` */
  tree: PipeTree;
  places: Map<TCall, PipelinePlace>;
  /** The calls that don't go: they don't fit, or their parent doesn't go */
  left: TCall[];
}

/** A node as the client builds it, before it is written as a tuple */
interface PlannedNode {
  path: string;
  reads: PipeRead[];
  /** Its input, serialized, or `undefined` if it has none */
  input: unknown;
  children: PlannedChild[];
}

type PlannedChild =
  | { kind: 'node'; node: PlannedNode }
  | { kind: 'list'; levels: string[][]; nodes: PlannedNode[] };

/** Children as a request has them: tuples, with what is empty left out */
function wireChildren(children: readonly PlannedChild[]): PipeChild[] {
  const wireNode = (node: PlannedNode): PipeNode => {
    const kids = wireChildren(node.children);
    if (node.input !== undefined) {
      return [node.path, node.reads, kids, node.input];
    }
    return kids.length > 0
      ? [node.path, node.reads, kids]
      : [node.path, node.reads];
  };
  return children.map((child) =>
    child.kind === 'node'
      ? wireNode(child.node)
      : [child.levels, child.nodes.map(wireNode)],
  );
}

/** The tree of a request with these calls, each after its parent */
function treeOf<TCall extends PipelineTreeCall>(opts: {
  sent: readonly (object | null)[];
  calls: readonly TCall[];
  serialize: (input: unknown) => unknown;
}) {
  const roots = new Map<number, PlannedChild[]>();
  interface Where {
    place: PipelinePlace;
    children: () => PlannedChild[];
  }
  const where = new Map<object, Where>();
  for (const [index, sent] of opts.sent.entries()) {
    if (sent) {
      where.set(sent, {
        place: { index, steps: [] },
        children: () => {
          let children = roots.get(index);
          if (!children) {
            children = [];
            roots.set(index, children);
          }
          return children;
        },
      });
    }
  }
  const places = new Map<TCall, PipelinePlace>();
  for (const call of opts.calls) {
    const parent = where.get(call.parent);
    if (!parent) {
      continue;
    }
    const children = parent.children();
    const steps = [...parent.place.steps];
    const node: PlannedNode = {
      path: call.path,
      reads: call.reads,
      input: call.input === undefined ? undefined : opts.serialize(call.input),
      children: [],
    };
    if (call.list === null) {
      steps.push({ kind: 'node', at: children.length });
      children.push({ kind: 'node', node });
    } else {
      // The calls for every item of the same list share it
      const levels = JSON.stringify(call.list);
      let at = children.findIndex(
        (child) =>
          child.kind === 'list' && JSON.stringify(child.levels) === levels,
      );
      if (at === -1) {
        at = children.length;
        children.push({ kind: 'list', levels: call.list, nodes: [] });
      }
      const list = children[at] as Extract<PlannedChild, { kind: 'list' }>;
      steps.push({ kind: 'list', at, depth: call.list.length });
      steps.push({ kind: 'node', at: list.nodes.length });
      list.nodes.push(node);
    }
    const place = { index: parent.place.index, steps };
    places.set(call, place);
    where.set(call, { place, children: () => node.children });
  }
  const tree: PipeTree = emptyObject();
  for (const [index, children] of roots) {
    tree[index] = wireChildren(children);
  }
  return { tree, places };
}

/**
 * The calls that go in a request, each under the call it reads the data of.
 * What a call's parent is: something the request has already, or another
 * call before it.
 */
export function planPipelineTree<TCall extends PipelineTreeCall>(opts: {
  /** What the request has without the calls, in order. `null` for what no call reads */
  sent: readonly (object | null)[];
  /** The calls that want to go in it, each after its parent */
  calls: readonly TCall[];
  /** Serializes a call's input, as the request's inputs are */
  serialize: (input: unknown) => unknown;
  /** Whether a request with these calls is within the client's limits */
  fits: (plan: Pick<PipelineTreePlan<TCall>, 'calls' | 'tree'>) => boolean;
}): PipelineTreePlan<TCall> {
  const calls: TCall[] = [];
  const left: TCall[] = [];
  for (const call of opts.calls) {
    const next = [...calls, call];
    const tree = treeOf({ ...opts, calls: next });
    // Its parent isn't in the request, or it doesn't fit
    if (
      !tree.places.has(call) ||
      !opts.fits({ calls: next, tree: tree.tree })
    ) {
      left.push(call);
      continue;
    }
    calls.push(call);
  }
  return { calls, left, ...treeOf({ ...opts, calls }) };
}

/**
 * The URL of a batch, for the same batch with a tree. `tree` goes in it when
 * the request has no body to put it in.
 */
export function pipelinedBatchUrl(opts: {
  /** The URL of an ordinary batch: it has `batch=1` */
  url: string;
  tree: PipeTree | null;
}) {
  const url = opts.url.replace(
    /([?&])batch=1(?=&|$)/,
    `$1batch=${pipelineBatch}`,
  );
  return opts.tree
    ? `${url}&tree=${encodeURIComponent(JSON.stringify(opts.tree))}`
    : url;
}

/**
 * The body of a batch, for the same batch with a tree: its inputs by index,
 * with its `tree` beside them.
 */
export function pipelinedBatchBody(opts: {
  /** The body of an ordinary batch: the JSON of its inputs by index */
  body: string;
  tree: PipeTree;
}) {
  return JSON.stringify({ ...JSON.parse(opts.body), tree: opts.tree });
}

/** A call's outcome, as a response has it */
export type PipelineEnvelope =
  | { result: { data: unknown } }
  | { error: unknown };

/** What a response has for a call */
export type PipelineCallOutcome =
  | { kind: 'outcome'; outcome: PipelineEnvelope }
  /**
   * The outcome of each run, for a call that ran for every item of a list:
   * a list for each level of lists on its way, and `undefined` for a run
   * the response has nothing for
   */
  | { kind: 'items'; items: unknown[] }
  /** A call above it failed, so it didn't run */
  | { kind: 'failed'; error: unknown }
  /** The response has nothing for it */
  | { kind: 'missing' };

/**
 * An outcome as a response has it, streamed or not: a streamed one has its
 * result, and the result's data, as values of their own
 */
async function envelopeOf(value: unknown): Promise<PipelineEnvelope | null> {
  if (!isObject(value)) {
    return null;
  }
  if (hasOwn(value, 'error')) {
    return { error: value['error'] };
  }
  const result: unknown = await value['result'];
  return isObject(result) ? { result: { data: await result['data'] } } : null;
}

/** An object or an array */
function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A list's items, as a response has them: streamed, they are by index */
function itemsOf(list: Record<string, unknown>): unknown[] {
  return Array.isArray(list)
    ? list
    : Array.from({ length: Object.keys(list).length }, (_it, index) =>
        hasOwn(list, String(index)) ? list[index] : undefined,
      );
}

/**
 * What a response has for the call at `steps`, given the `children` of the
 * top-level call it is under, streamed or not. It waits only for what is on
 * the way to the call.
 */
export async function readPipelineCall(
  children: unknown,
  steps: readonly PipelineStep[],
): Promise<PipelineCallOutcome> {
  const [step, ...rest] = steps;
  const container: unknown = await children;
  // Children are a list, or an object by position in a stream
  const key = step ? String(step.at) : '';
  if (!step || !isContainer(container) || !hasOwn(container, key)) {
    return { kind: 'missing' };
  }
  const value: unknown = await container[key];
  if (!isContainer(value)) {
    return { kind: 'missing' };
  }
  if (step.kind === 'node') {
    if (rest.length === 0) {
      const outcome = await envelopeOf(value);
      return outcome ? { kind: 'outcome', outcome } : { kind: 'missing' };
    }
    // A node that failed has an error for each of its children
    if (hasOwn(value, 'children')) {
      return readPipelineCall(value['children'], rest);
    }
    return hasOwn(value, 'error')
      ? { kind: 'failed', error: value['error'] }
      : { kind: 'missing' };
  }
  if (hasOwn(value, 'error') && !Array.isArray(value)) {
    return { kind: 'failed', error: value['error'] };
  }
  const runs = async (items: unknown[], level: number): Promise<unknown[]> =>
    Promise.all(
      items.map(async (item) => {
        const resolved: unknown = await item;
        if (level > 1) {
          return isContainer(resolved)
            ? runs(itemsOf(resolved), level - 1)
            : [];
        }
        const outcome = await readPipelineCall(resolved, rest);
        switch (outcome.kind) {
          case 'outcome':
            return outcome.outcome;
          case 'items':
            return outcome.items;
          case 'failed':
            return { error: outcome.error };
          case 'missing':
            return undefined;
        }
      }),
    );
  return { kind: 'items', items: await runs(itemsOf(value), step.depth) };
}

/** One run's outcome of a call that the server ran for every item of a list */
export type PipelinedItem =
  | { kind: 'data'; data: unknown }
  | { kind: 'error'; error: unknown }
  /** The server sent nothing for the item */
  | { kind: 'missing' };

/**
 * Reads one item's outcome from the data of a call that ran once for every
 * item of a list: a `{ result }` or an `{ error }` for each.
 */
export function readPipelinedItem(data: unknown, index: number): PipelinedItem {
  const envelope: unknown = Array.isArray(data) ? data[index] : undefined;
  if (!isObject(envelope)) {
    return { kind: 'missing' };
  }
  if (hasOwn(envelope, 'error')) {
    return { kind: 'error', error: envelope['error'] };
  }
  const result = envelope['result'];
  return isObject(result)
    ? { kind: 'data', data: result['data'] }
    : { kind: 'missing' };
}
