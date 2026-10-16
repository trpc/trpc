/**
 * Models relationships between indexed nodes and edges.
 *
 * This module provides immutable and scoped-mutable graph data structures. A
 * graph can be directed or undirected, and it can store user-defined data on
 * both nodes and edges. The module includes traversal, analysis, path-finding,
 * transformation, and diagram export utilities.
 *
 * @since 4.0.0
 */

import * as Data from "./Data.ts"
import * as Equal from "./Equal.ts"
import { dual } from "./Function.ts"
import * as Hash from "./Hash.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as internal from "./internal/graph.ts"
import * as csr from "./internal/graphCsr.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Covariant, Invariant } from "./Types.ts"

const TypeId = internal.TypeId

/**
 * Node index for node identification using plain numbers.
 *
 * **When to use**
 *
 * Use when storing or passing the stable identifier of a graph node between
 * `Graph` operations.
 *
 * **Details**
 *
 * `addNode` allocates node identifiers from the graph's next node index.
 *
 * **Gotchas**
 *
 * A `NodeIndex` is an identifier, not an array offset. Removed node identifiers
 * are not reused.
 *
 * @see {@link EdgeIndex} for edge identifiers instead of node identifiers
 *
 * @category models
 * @since 3.18.0
 */
export type NodeIndex = number

/**
 * Edge index for edge identification using plain numbers.
 *
 * **When to use**
 *
 * Use when you need to keep the identifier for a graph edge so you can later
 * read, update, remove, or compare that edge.
 *
 * **Gotchas**
 *
 * An `EdgeIndex` is an identifier, not an array offset. Removed edge
 * identifiers are not reused.
 *
 * @see {@link NodeIndex} for node identifiers instead of edge identifiers
 *
 * @category models
 * @since 3.18.0
 */
export type EdgeIndex = number

/**
 * Represents edge data containing source, target, and user data.
 *
 * **When to use**
 *
 * Use as the graph edge value that carries source node, target node, and stored
 * edge data together.
 *
 * @category models
 * @since 3.18.0
 */
export interface Edge<out E> {
  readonly source: NodeIndex
  readonly target: NodeIndex
  readonly data: E
}

/**
 * Graph type for distinguishing directed and undirected graphs.
 *
 * **When to use**
 *
 * Use when writing graph-polymorphic types or helpers that need to preserve
 * whether a graph is directed or undirected.
 *
 * @category models
 * @since 3.18.0
 */
export type Kind = "directed" | "undirected"

/**
 * A node and its stable index in a graph snapshot.
 *
 * @category models
 * @since 4.0.0
 */
export interface IndexedNode<out N> {
  readonly index: NodeIndex
  readonly data: N
}

/**
 * An edge and its stable index in a graph snapshot.
 *
 * @category models
 * @since 4.0.0
 */
export interface IndexedEdge<out E> extends Edge<E> {
  readonly index: EdgeIndex
}

/**
 * Active indexed structure used to reconstruct an immutable graph.
 *
 * **When to use**
 *
 * Use when serializing or importing graph structure while preserving active
 * node and edge identifiers.
 *
 * **Details**
 *
 * Node and edge indexes must be non-negative safe integers in strictly
 * increasing order. Every edge endpoint must reference an indexed node.
 *
 * **Gotchas**
 *
 * A snapshot records only active identifiers, not allocator history. After
 * reconstruction, new identifiers continue after the greatest active index.
 *
 * @see {@link fromSnapshot} for reconstructing a graph
 * @category models
 * @since 4.0.0
 */
export interface Snapshot<out N, out E, out T extends Kind> {
  readonly type: T
  readonly nodes: ReadonlyArray<IndexedNode<N>>
  readonly edges: ReadonlyArray<IndexedEdge<E>>
}

/**
 * Immutable graph interface.
 *
 * **When to use**
 *
 * Use as the immutable graph model for code that queries, traverses,
 * transforms, or analyzes graph structure without mutating it.
 *
 * **Gotchas**
 *
 * After a graph is hashed, its transitively contained node and edge payloads
 * used by hashing must remain immutable, as with other Effect values.
 *
 * @see {@link MutableGraph} for the mutable counterpart used inside mutation scopes
 *
 * @category models
 * @since 3.18.0
 */
export interface Graph<out N, out E, T extends Kind = "directed">
  extends Iterable<readonly [NodeIndex, N]>, Equal.Equal, Pipeable, Inspectable
{
  readonly [TypeId]: Graph.Variance<N, E>
  readonly type: T
  readonly mutable: false
}

/**
 * Companion namespace containing type-level metadata for immutable graphs.
 *
 * @category models
 * @since 4.0.0
 */
export declare namespace Graph {
  /**
   * Type-level variance marker for immutable graphs.
   *
   * @category utility types
   * @since 4.0.0
   */
  export interface Variance<out N, out E> {
    readonly _N: Covariant<N>
    readonly _E: Covariant<E>
  }
}

/**
 * Mutable graph interface.
 *
 * **When to use**
 *
 * Use when adding, removing, or updating nodes and edges inside a graph
 * mutation scope.
 *
 * **Gotchas**
 *
 * A callback invoked by another graph operation may query the same mutable
 * graph, but cannot mutate or finalize it. Mutation is allowed in callbacks
 * passed to graph constructors and `mutate`, where mutation is the purpose.
 *
 * @see {@link Graph} for the immutable graph interface
 * @see {@link mutate} for scoped mutation of an immutable graph
 *
 * @category models
 * @since 3.18.0
 */
export interface MutableGraph<in out N, in out E, T extends Kind = "directed">
  extends Iterable<readonly [NodeIndex, N]>, Equal.Equal, Pipeable, Inspectable
{
  readonly [TypeId]: MutableGraph.Variance<N, E>
  readonly type: T
  readonly mutable: true
}

/**
 * Companion namespace containing type-level metadata for scoped mutable graphs.
 *
 * @category models
 * @since 4.0.0
 */
export declare namespace MutableGraph {
  /**
   * Type-level variance marker for scoped mutable graphs.
   *
   * @category utility types
   * @since 4.0.0
   */
  export interface Variance<in out N, in out E> {
    readonly _N: Invariant<N>
    readonly _E: Invariant<E>
  }
}

/** @internal */
const copyEdge = <E>(edge: Edge<E>): Edge<E> => ({
  source: edge.source,
  target: edge.target,
  data: edge.data
})

/**
 * Immutable graph type for source-to-target relationships.
 *
 * **When to use**
 *
 * Use as the immutable graph type when edge direction is part of the model and
 * traversal or neighbor queries should follow source-to-target edges.
 *
 * **Details**
 *
 * `DirectedGraph<N, E>` is a `Graph<N, E, "directed">` with node data of type
 * `N` and edge data of type `E`.
 *
 * @see {@link directed} for constructing directed graphs
 * @see {@link UndirectedGraph} for graphs whose edges connect both endpoints
 *
 * @category models
 * @since 3.18.0
 */
export type DirectedGraph<N, E> = Graph<N, E, "directed">

/**
 * Immutable graph type for relationships without source-to-target direction.
 *
 * **When to use**
 *
 * Use when modeling relationships where each edge connects both endpoints
 * without a source-to-target direction.
 *
 * **Details**
 *
 * `UndirectedGraph<N, E>` is a `Graph<N, E, "undirected">`.
 *
 * @see {@link undirected} for constructing undirected graphs
 * @see {@link DirectedGraph} for graphs whose edges have source-to-target direction
 *
 * @category models
 * @since 3.18.0
 */
export type UndirectedGraph<N, E> = Graph<N, E, "undirected">

/**
 * Mutable directed graph type alias.
 *
 * **When to use**
 *
 * Use when annotating a temporary graph value that can be changed in place and
 * whose edges have source-to-target direction.
 *
 * @see {@link MutableGraph} for the generic mutable graph type
 * @see {@link MutableUndirectedGraph} for mutable graphs without edge direction
 *
 * @category models
 * @since 3.18.0
 */
export type MutableDirectedGraph<N, E> = MutableGraph<N, E, "directed">

/**
 * Mutable undirected graph type alias.
 *
 * **When to use**
 *
 * Use when annotating a temporary graph value that can be changed in place and
 * whose edges connect both endpoints without direction.
 *
 * @see {@link MutableDirectedGraph} for mutable graphs with directed edges
 * @see {@link MutableGraph} for the generic mutable graph type
 *
 * @category models
 * @since 3.18.0
 */
export type MutableUndirectedGraph<N, E> = MutableGraph<N, E, "undirected">

// =============================================================================
// Errors
// =============================================================================

// TODO: Do we need safe variants for these?

/**
 * Error thrown by graph operations when the requested graph structure is
 * invalid, such as referencing a missing node or using unsupported edge
 * weights.
 *
 * **When to use**
 *
 * Use when handling failures thrown by graph operations that reject invalid
 * graph structure or unsupported algorithm inputs.
 *
 * @category errors
 * @since 3.18.0
 */
export class GraphError extends Data.TaggedError("GraphError")<{
  readonly message: string
}> {}

/** @internal */
const missingNode = (node: number) => new GraphError({ message: `Node ${node} does not exist` })

/** @internal */
const traversalRadius = (radius: number | undefined, defaultRadius: number): number => {
  const value = radius ?? defaultRadius
  if (value !== Infinity && (!Number.isInteger(value) || value < 0)) {
    throw new GraphError({ message: "Traversal radius must be a non-negative integer or Infinity" })
  }
  return value
}

/** @internal */
function assertMutable<N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): asserts graph is MutableGraph<N, E, T> {
  if (!graph.mutable) {
    throw new GraphError({ message: "Graph is not mutable" })
  }
}

/** @internal */
const getMutableImplForMutation = <N, E, T extends Kind>(
  graph: MutableGraph<N, E, T>
): internal.GraphImpl<N, E, T> => {
  assertMutable(graph)
  if (internal.isTransforming(graph)) {
    throw new GraphError({ message: "Cannot mutate graph during a transformation" })
  }
  csr.invalidate(graph)
  return internal.toImpl(graph)
}

/** @internal */
const withMutationGuard = <N, E, T extends Kind, A>(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  evaluate: () => A
): A => graph.mutable ? internal.withTransformation(graph, evaluate) : evaluate()

// =============================================================================
// Constructors
// =============================================================================

/**
 * Returns `true` if a value has the graph runtime type identifier, narrowing
 * it to an immutable or mutable graph.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a graph value.
 *
 * **Gotchas**
 *
 * This guard checks the shared graph runtime type identifier and does not
 * distinguish immutable graphs from mutable graphs or directed graphs from
 * undirected graphs.
 *
 * @category guards
 * @since 4.0.0
 */
export const isGraph: <N = unknown, E = unknown, T extends Kind = Kind, U = never>(
  u: U | Graph<N, E, T> | MutableGraph<N, E, T>
) => u is Graph<N, E, T> | MutableGraph<N, E, T> = internal.isGraph

/**
 * Reconstructs an immutable graph from its indexed active structure.
 *
 * **When to use**
 *
 * Use when importing a snapshot or other externally indexed graph structure.
 * Prefer `directed` or `undirected` when creating a new graph without existing
 * identifiers.
 *
 * **Gotchas**
 *
 * The node and edge arrays must be ordered by strictly increasing,
 * non-negative safe integer indexes, and every edge endpoint must reference a
 * node in the snapshot. Invalid snapshots throw a `GraphError`. Historical
 * removed identifiers after the greatest active index are not retained.
 *
 * **Example** (Preserving graph indexes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.fromSnapshot({
 *   type: "directed",
 *   nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
 *   edges: [{ index: 3, source: 2, target: 5, data: 1 }]
 * })
 *
 * Graph.toSnapshot(graph).edges[0].index // => 3
 * ```
 *
 * @see {@link toSnapshot} for capturing a graph snapshot
 * @category constructors
 * @since 4.0.0
 */
export const fromSnapshot = <N, E, T extends Kind>(snapshot: Snapshot<N, E, T>): Graph<N, E, T> => {
  if (snapshot.type !== "directed" && snapshot.type !== "undirected") {
    throw new GraphError({ message: "Snapshot type must be directed or undirected" })
  }

  let previous = -1
  const nodeIndexes = new Set<NodeIndex>()
  for (let i = 0; i < snapshot.nodes.length; i++) {
    const node = snapshot.nodes[i]
    if (node === undefined || node === null) {
      throw new GraphError({ message: `Node at position ${i} must be defined` })
    }
    const index = node.index
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new GraphError({ message: `Node index at position ${i} must be a non-negative safe integer` })
    }
    if (index <= previous) {
      throw new GraphError({ message: "Node indexes must be strictly increasing" })
    }
    previous = index
    nodeIndexes.add(index)
  }

  previous = -1
  for (let i = 0; i < snapshot.edges.length; i++) {
    const edge = snapshot.edges[i]
    if (edge === undefined || edge === null) {
      throw new GraphError({ message: `Edge at position ${i} must be defined` })
    }
    if (!Number.isSafeInteger(edge.index) || edge.index < 0) {
      throw new GraphError({ message: `Edge index at position ${i} must be a non-negative safe integer` })
    }
    if (edge.index <= previous) {
      throw new GraphError({ message: "Edge indexes must be strictly increasing" })
    }
    previous = edge.index
    if (!Number.isSafeInteger(edge.source) || edge.source < 0) {
      throw new GraphError({ message: `Edge source at position ${i} must be a non-negative safe integer` })
    }
    if (!nodeIndexes.has(edge.source)) {
      throw new GraphError({ message: `Edge source ${edge.source} does not reference a node` })
    }
    if (!Number.isSafeInteger(edge.target) || edge.target < 0) {
      throw new GraphError({ message: `Edge target at position ${i} must be a non-negative safe integer` })
    }
    if (!nodeIndexes.has(edge.target)) {
      throw new GraphError({ message: `Edge target ${edge.target} does not reference a node` })
    }
  }

  return internal.hydrate(snapshot)
}

/**
 * Returns the active indexed structure of a graph.
 *
 * **When to use**
 *
 * Use when serializing a graph or passing its active structure across a
 * boundary where node and edge identifiers must be preserved.
 *
 * **Details**
 *
 * Nodes and edges are returned in graph order with their current indexes.
 * Undirected edges retain their stored endpoint orientation, and each returned
 * node and edge record is newly allocated. The operation runs in `O(V + E)`.
 *
 * **Gotchas**
 *
 * Node and edge payloads are not cloned. The snapshot also omits allocator
 * history for identifiers that are no longer active.
 *
 * **Example** (Round-tripping a graph snapshot)
 *
 * ```ts import.meta.vitest
 * import { Equal, Graph } from "effect"
 *
 * const graph = Graph.fromSnapshot({
 *   type: "undirected",
 *   nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
 *   edges: [{ index: 3, source: 5, target: 2, data: "A-B" }]
 * })
 *
 * Equal.equals(Graph.fromSnapshot(Graph.toSnapshot(graph)), graph) // => true
 * ```
 *
 * @see {@link fromSnapshot} for reconstructing an immutable graph
 * @category converting
 * @since 4.0.0
 */
export const toSnapshot = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): Snapshot<N, E, T> => {
  const impl = internal.toImpl(graph)
  return {
    type: graph.type,
    nodes: Array.from(impl.nodes, ([index, data]) => ({ index, data })),
    edges: Array.from(impl.edges, ([index, edge]) => ({
      index,
      source: edge.source,
      target: edge.target,
      data: edge.data
    }))
  }
}

/**
 * Creates a graph constructor for the specified graph kind.
 *
 * **When to use**
 *
 * Use when the graph kind is selected dynamically. Prefer `directed` or
 * `undirected` when the kind is known statically.
 *
 * **Example** (Constructing by kind)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const makeGraph = Graph.make("directed")
 * const graph = makeGraph<string, number>((mutable) => {
 *   Graph.addNode(mutable, "A")
 * })
 *
 * graph.type // => "directed"
 * ```
 *
 * @see {@link directed} for constructing a directed graph directly
 * @see {@link undirected} for constructing an undirected graph directly
 * @category constructors
 * @since 4.0.0
 */
export const make =
  <T extends Kind>(type: T) => <N, E>(mutate?: (mutable: MutableGraph<N, E, T>) => undefined): Graph<N, E, T> => {
    if (type !== "directed" && type !== "undirected") {
      throw new GraphError({ message: "Graph type must be directed or undirected" })
    }
    if (mutate === undefined) {
      return internal.make<N, E, T>(type, false) as unknown as Graph<N, E, T>
    }

    const graph = internal.make<N, E, T>(type, true)
    const mutable = Equal.byReferenceUnsafe(graph as unknown as MutableGraph<N, E, T>)
    return mutateScoped(mutable, mutate)
  }

/**
 * Creates a directed graph, optionally with initial mutations.
 *
 * **When to use**
 *
 * Use when relationships have a source-to-target direction, such as
 * dependencies, workflows, or routing links.
 *
 * **Gotchas**
 *
 * The mutable callback handle is finalized when the callback returns and must
 * not be retained for later mutation.
 *
 * **Example** (Creating a directed graph)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * // Directed graph with initial nodes and edges
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A->B")
 *   Graph.addEdge(mutable, b, c, "B->C")
 * })
 * Array.of(Graph.nodeCount(graph), Graph.edgeCount(graph)) // => [3, 2]
 * ```
 *
 * @category constructors
 * @since 3.18.0
 */
export const directed: <N, E>(
  mutate?: (mutable: MutableDirectedGraph<N, E>) => undefined
) => DirectedGraph<N, E> = make("directed")

/**
 * Creates an undirected graph, optionally with initial mutations.
 *
 * **When to use**
 *
 * Use when relationships connect both endpoints symmetrically, such as social
 * connections or physical links.
 *
 * **Gotchas**
 *
 * The mutable callback handle is finalized when the callback returns and must
 * not be retained for later mutation.
 *
 * **Example** (Creating an undirected graph)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * // Undirected graph with initial nodes and edges
 * const graph = Graph.undirected<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A-B")
 *   Graph.addEdge(mutable, b, c, "B-C")
 * })
 * Array.of(Graph.nodeCount(graph), Graph.edgeCount(graph)) // => [3, 2]
 * ```
 *
 * @category constructors
 * @since 3.18.0
 */
export const undirected: <N, E>(
  mutate?: (mutable: MutableUndirectedGraph<N, E>) => undefined
) => UndirectedGraph<N, E> = make("undirected")

// =============================================================================
// Scoped Mutable API
// =============================================================================

/**
 * Creates a mutable copy of an immutable graph for a manual mutation scope.
 *
 * **When to use**
 *
 * Use when a mutation scope must span code that cannot be expressed as one
 * `mutate` callback.
 *
 * **Gotchas**
 *
 * The graph structure is copied, but node and edge payload objects remain
 * shared by reference. Always finish the scope with `endMutation`; prefer
 * `mutate` when a callback is sufficient.
 *
 * **Example** (Beginning a mutation scope)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>()
 * const mutable = Graph.beginMutation(graph)
 * // Now mutable can be safely modified without affecting original graph
 * Array.of(Graph.nodeCount(mutable), Graph.nodeCount(graph)) // => [0, 0]
 * ```
 *
 * @see {@link endMutation} for finalizing the mutable graph
 * @see {@link mutate} for automatically scoped mutation
 * @category mutations
 * @since 3.18.0
 */
export const beginMutation = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T>
): MutableGraph<N, E, T> => {
  const source = internal.toImpl(graph)
  const mutable = internal.clone(source, true)
  return Equal.byReferenceUnsafe(mutable as unknown as MutableGraph<N, E, T>)
}

/**
 * Converts a mutable graph back to an immutable graph, ending the mutation scope.
 *
 * **When to use**
 *
 * Use to finish a mutation scope opened with `beginMutation`.
 *
 * **Gotchas**
 *
 * Finalization is terminal. Later public mutation operations on the same
 * mutable handle fail with a `GraphError`.
 *
 * **Example** (Ending a mutation scope)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>()
 * const mutable = Graph.beginMutation(graph)
 * // ... perform mutations on mutable ...
 * Graph.nodeCount(Graph.endMutation(mutable)) // => 0
 * ```
 *
 * @see {@link beginMutation} for opening a manual mutation scope
 * @see {@link mutate} for automatically scoped mutation
 * @category mutations
 * @since 3.18.0
 */
export const endMutation = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>
): Graph<N, E, T> => {
  assertMutable(mutable)
  if (internal.isTransforming(mutable)) {
    throw new GraphError({ message: "Cannot mutate graph during a transformation" })
  }
  const source = internal.toImpl(mutable)
  csr.invalidate(mutable)
  const graph = internal.finalize(source)
  source.mutable = false

  return graph as unknown as Graph<N, E, T>
}

/** @internal */
const mutateScoped = <N, E, T extends Kind>(
  mutable: MutableGraph<N, E, T>,
  f: (mutable: MutableGraph<N, E, T>) => undefined
): Graph<N, E, T> => {
  try {
    f(mutable)
  } catch (error) {
    if (mutable.mutable) {
      endMutation(mutable)
    }
    throw error
  }
  return endMutation(mutable)
}

/**
 * Returns an immutable graph after applying scoped mutations to a structural copy.
 *
 * **When to use**
 *
 * Use when several node or edge
 * mutations should be applied together.
 *
 * **Details**
 *
 * The original graph remains structurally unchanged. The mutable callback
 * handle is finalized whether the callback returns or throws.
 *
 * **Gotchas**
 *
 * Payload objects are shared unless the callback replaces them. A callback
 * failure is rethrown after the mutable handle is finalized, and the handle
 * must not escape for later mutation.
 *
 * **Example** (Applying scoped mutations)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>()
 * const newGraph = Graph.mutate(graph, (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "A")
 *   const nodeB = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, nodeA, nodeB, 1)
 * })
 *
 * Graph.nodeCount(newGraph) // => 2
 * Graph.edgeCount(newGraph) // => 1
 * ```
 *
 * @see {@link beginMutation} for opening a manual mutation scope
 * @see {@link endMutation} for finalizing a manual mutation scope
 * @category mutations
 * @since 3.18.0
 */
export const mutate: {
  <N, E, T extends Kind = "directed">(
    f: (mutable: MutableGraph<N, E, T>) => undefined
  ): (graph: Graph<N, E, T>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T>,
    f: (mutable: MutableGraph<N, E, T>) => undefined
  ): Graph<N, E, T>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T>,
  f: (mutable: MutableGraph<N, E, T>) => undefined
): Graph<N, E, T> => {
  const mutable = beginMutation(graph)
  return mutateScoped(mutable, f)
})

// =============================================================================
// Set Operations
// =============================================================================

/** @internal */
type NodeMaps<N, I> = {
  readonly byIdentity: MutableHashMap.MutableHashMap<I, N>
  readonly byIndex: Map<NodeIndex, I>
}

/** @internal */
class EdgeIdentity<NI, EI> implements Equal.Equal {
  readonly type: Kind
  readonly source: NI
  readonly target: NI
  readonly identity: EI

  constructor(
    type: Kind,
    source: NI,
    target: NI,
    identity: EI
  ) {
    this.type = type
    this.source = source
    this.target = target
    this.identity = identity
  }

  [Equal.symbol](that: Equal.Equal): boolean {
    if (!(that instanceof EdgeIdentity) || this.type !== that.type || !Equal.equals(this.identity, that.identity)) {
      return false
    }

    if (this.type === "directed") {
      return Equal.equals(this.source, that.source) && Equal.equals(this.target, that.target)
    }

    return (
      (Equal.equals(this.source, that.source) && Equal.equals(this.target, that.target)) ||
      (Equal.equals(this.source, that.target) && Equal.equals(this.target, that.source))
    )
  }

  [Hash.symbol](): number {
    const hash = Hash.hash(this.identity)
    if (this.type === "directed") {
      return Hash.optimize(Hash.combine(Hash.combine(hash, Hash.hash(this.source)), Hash.hash(this.target)))
    }
    return Hash.optimize(Hash.combine(hash, internal.endpointsHash(this.source, this.target)))
  }
}

/**
 * Configures node and edge identity for graph set operations.
 *
 * **When to use**
 *
 * Use when logical graph membership should be based on a stable key rather
 * than the complete node or edge payload.
 *
 * **Details**
 *
 * Both functions default to using the complete node or edge data. Edge identity
 * also includes the identities of its endpoint nodes and the graph kind.
 * Projected identities use Effect equality and hashing semantics.
 *
 * **Gotchas**
 *
 * Edge identity defines set membership, not edge multiplicity. Parallel edges
 * with the same endpoint identities and projected edge identity are treated as
 * the same member by graph set operations.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface IdentityOptions<N, E, NI = N, EI = E> {
  readonly nodeIdentity?: (node: N) => NI
  readonly edgeIdentity?: (edge: E) => EI
}

/** @internal */
const buildNodeMaps = <N, E, T extends Kind, I>(
  graph: Graph<N, E, T>,
  identity: (node: N) => I
): NodeMaps<N, I> => {
  const impl = internal.toImpl(graph)
  const byIdentity = MutableHashMap.empty<I, N>()
  const byIndex = new Map<NodeIndex, I>()

  for (const [index, data] of impl.nodes) {
    const nodeIdentity = identity(data)
    MutableHashMap.set(byIdentity, nodeIdentity, data)
    byIndex.set(index, nodeIdentity)
  }

  return { byIdentity, byIndex }
}

/** @internal */
const nodeIdentityAt = <N, I>(maps: NodeMaps<N, I>, index: NodeIndex): I => maps.byIndex.get(index) as I

/** @internal */
const buildEdgeMap = <N, E, T extends Kind, NI, EI>(
  graph: Graph<N, E, T>,
  nodeMaps: NodeMaps<N, NI>,
  identity: (edge: E) => EI
): MutableHashMap.MutableHashMap<EdgeIdentity<NI, EI>, E> => {
  const impl = internal.toImpl(graph)
  const edges = MutableHashMap.empty<EdgeIdentity<NI, EI>, E>()
  for (const edge of impl.edges.values()) {
    const sourceIdentity = nodeIdentityAt(nodeMaps, edge.source)
    const targetIdentity = nodeIdentityAt(nodeMaps, edge.target)
    MutableHashMap.set(
      edges,
      new EdgeIdentity(graph.type, sourceIdentity, targetIdentity, identity(edge.data)),
      edge.data
    )
  }
  return edges
}

/** @internal */
const addNodesByIdentity = <N, E, T extends Kind, NI>(
  mutable: MutableGraph<N, E, T>,
  nodes: Iterable<readonly [NI, N]>
): MutableHashMap.MutableHashMap<NI, NodeIndex> => {
  const indexByIdentity = MutableHashMap.empty<NI, NodeIndex>()
  for (const [identity, data] of nodes) {
    MutableHashMap.set(indexByIdentity, identity, addNode(mutable, data))
  }
  return indexByIdentity
}

/** @internal */
const addEdgeByIdentity = <N, E, T extends Kind, NI, EI>(
  mutable: MutableGraph<N, E, T>,
  indexByIdentity: MutableHashMap.MutableHashMap<NI, NodeIndex>,
  identity: EdgeIdentity<NI, EI>,
  data: E
): void => {
  const sourceIndex = Option.getOrUndefined(MutableHashMap.get(indexByIdentity, identity.source))
  const targetIndex = Option.getOrUndefined(MutableHashMap.get(indexByIdentity, identity.target))
  if (sourceIndex !== undefined && targetIndex !== undefined) {
    addEdge(mutable, sourceIndex, targetIndex, data)
  }
}

/** @internal */
const assertSameKind = <N, E>(self: Graph<N, E, Kind>, that: Graph<N, E, Kind>): void => {
  if (self.type !== that.type) {
    throw new GraphError({ message: `Cannot combine ${self.type} and ${that.type} graphs` })
  }
}

/**
 * Composes two graphs, merging nodes by identity.
 *
 * **When to use**
 *
 * Use when combining graphs that describe overlapping logical entities and
 * should merge those entities by payload or a projected identity.
 *
 * **Details**
 *
 * Nodes and edges present in both graphs use data from `that`. The result has
 * the same graph kind as `self`. Throws a `GraphError` when the graph kinds do
 * not match. `nodeIdentity` and `edgeIdentity` default to the complete node and
 * edge data. Edge identity also includes the endpoint identities.
 *
 * `G1 ∪ G2 = {V1 ∪ V2, E1 ∪ E2}`
 *
 * **Gotchas**
 *
 * Nodes with equal identities in one input graph are coalesced. The last node
 * supplies the data, and redirected edges can collapse or become self-loops.
 * Parallel edges with equal identities are also coalesced, with the last edge
 * supplying the data. The result allocates new node and edge identifiers.
 *
 * **Example** (Combining graphs)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const left = Graph.directed<{ id: string }, string>((mutable) => {
 *   const a = Graph.addNode(mutable, { id: "A" })
 *   const b = Graph.addNode(mutable, { id: "B" })
 *   Graph.addEdge(mutable, a, b, "A-B")
 * })
 *
 * const right = Graph.directed<{ id: string }, string>((mutable) => {
 *   const b = Graph.addNode(mutable, { id: "B" })
 *   const c = Graph.addNode(mutable, { id: "C" })
 *   Graph.addEdge(mutable, b, c, "B-C")
 * })
 *
 * const result = Graph.compose(left, right, {
 *   nodeIdentity: (node) => node.id
 * })
 *
 * Graph.nodeCount(result) // => 3
 * Graph.edgeCount(result) // => 2
 * ```
 *
 * @see {@link sum} for combining graphs without merging equal nodes
 * @category set operations
 * @since 4.0.0
 */
export const compose: {
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    that: Graph<N, E, T>,
    options?: IdentityOptions<N, E, NI, EI>
  ): (self: Graph<N, E, NoInfer<T>>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    self: Graph<N, E, T>,
    that: Graph<N, E, NoInfer<T>>,
    options?: IdentityOptions<N, E, NI, EI>
  ): Graph<N, E, T>
} = dual(
  (args) => isGraph(args[0]) && isGraph(args[1]),
  <N, E, T extends Kind, NI, EI>(
    self: Graph<N, E, T>,
    that: Graph<N, E, T>,
    options?: IdentityOptions<N, E, NI, EI>
  ): Graph<N, E, T> => {
    assertSameKind(self, that)
    const getNodeIdentity = options?.nodeIdentity ?? ((node: N) => node as unknown as NI)
    const getEdgeIdentity = options?.edgeIdentity ?? ((edge: E) => edge as unknown as EI)
    const selfMaps = buildNodeMaps(self, getNodeIdentity)
    const thatMaps = buildNodeMaps(that, getNodeIdentity)
    const nodes = MutableHashMap.empty<NI, N>()
    const edges = buildEdgeMap(self, selfMaps, getEdgeIdentity)

    for (const [identity, data] of selfMaps.byIdentity) {
      MutableHashMap.set(nodes, identity, data)
    }
    for (const [identity, data] of thatMaps.byIdentity) {
      MutableHashMap.set(nodes, identity, data)
    }

    for (const [identity, data] of buildEdgeMap(that, thatMaps, getEdgeIdentity)) {
      MutableHashMap.set(edges, identity, data)
    }

    return make(self.type)<N, E>((mutable) => {
      const indexByIdentity = addNodesByIdentity(mutable, nodes)

      for (const [identity, data] of edges) {
        addEdgeByIdentity(mutable, indexByIdentity, identity, data)
      }
    })
  }
)

/**
 * Returns the intersection of two graphs, matching nodes by identity.
 *
 * **When to use**
 *
 * Use when extracting nodes and edges that represent the same logical
 * structure in both graphs.
 *
 * **Details**
 *
 * Node data comes from `self`, and edge data comes from `that`. The result has
 * the same graph kind as `self`. Throws a `GraphError` when the graph kinds do
 * not match. `nodeIdentity` and `edgeIdentity` default to the complete node and
 * edge data. Edge identity also includes the endpoint identities.
 *
 * `G1 ∩ G2 = {V1 ∩ V2, E1 ∩ E2}`
 *
 * **Gotchas**
 *
 * Nodes with equal identities in one input graph are coalesced. The last node
 * supplies the data, and redirected edges can collapse or become self-loops.
 * The result contains at most one edge for each shared edge identity and
 * allocates new node and edge identifiers.
 *
 * **Example** (Finding shared structure)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const left = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, "shared")
 * })
 *
 * const right = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, "shared")
 * })
 *
 * const result = Graph.intersection(left, right)
 *
 * Graph.nodeCount(result) // => 2
 * Graph.edgeCount(result) // => 1
 * ```
 *
 * @see {@link compose} for identity-based graph union
 * @category set operations
 * @since 4.0.0
 */
export const intersection: {
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    that: Graph<N, E, T>,
    options?: IdentityOptions<N, E, NI, EI>
  ): (self: Graph<N, E, NoInfer<T>>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    self: Graph<N, E, T>,
    that: Graph<N, E, NoInfer<T>>,
    options?: IdentityOptions<N, E, NI, EI>
  ): Graph<N, E, T>
} = dual((args) => isGraph(args[0]) && isGraph(args[1]), <N, E, T extends Kind, NI, EI>(
  self: Graph<N, E, T>,
  that: Graph<N, E, T>,
  options?: IdentityOptions<N, E, NI, EI>
): Graph<N, E, T> => {
  assertSameKind(self, that)
  const thatImpl = internal.toImpl(that)
  const getNodeIdentity = options?.nodeIdentity ?? ((node: N) => node as unknown as NI)
  const getEdgeIdentity = options?.edgeIdentity ?? ((edge: E) => edge as unknown as EI)
  const selfMaps = buildNodeMaps(self, getNodeIdentity)
  const thatMaps = buildNodeMaps(that, getNodeIdentity)
  const nodes = MutableHashMap.empty<NI, N>()
  const selfEdges = buildEdgeMap(self, selfMaps, getEdgeIdentity)
  const thatEdges = MutableHashMap.empty<EdgeIdentity<NI, EI>, E>()

  for (const [identity, data] of selfMaps.byIdentity) {
    if (MutableHashMap.has(thatMaps.byIdentity, identity)) {
      MutableHashMap.set(nodes, identity, data)
    }
  }

  for (const edge of thatImpl.edges.values()) {
    const sourceIdentity = nodeIdentityAt(thatMaps, edge.source)
    const targetIdentity = nodeIdentityAt(thatMaps, edge.target)
    if (MutableHashMap.has(nodes, sourceIdentity) && MutableHashMap.has(nodes, targetIdentity)) {
      const edgeIdentity = new EdgeIdentity(that.type, sourceIdentity, targetIdentity, getEdgeIdentity(edge.data))
      MutableHashMap.set(thatEdges, edgeIdentity, edge.data)
    }
  }

  return make(self.type)<N, E>((mutable) => {
    const indexByIdentity = addNodesByIdentity(mutable, nodes)

    for (const [identity, data] of thatEdges) {
      if (MutableHashMap.has(selfEdges, identity)) {
        addEdgeByIdentity(mutable, indexByIdentity, identity, data)
      }
    }
  })
})

/**
 * Returns `self` without edges also present in `that`.
 *
 * **When to use**
 *
 * Use when retaining all logical nodes from one graph while removing edge
 * relationships also represented by another graph.
 *
 * **Details**
 *
 * All nodes from `self` are preserved. Edges are matched by endpoint and edge
 * identities. The result has the same graph kind as `self`. Throws a
 * `GraphError` when the graph kinds do not match. `nodeIdentity` and
 * `edgeIdentity` default to the complete node and edge data.
 *
 * `G1 \ G2 = {V1, E1 \ E2}`
 *
 * **Gotchas**
 *
 * Nodes with equal identities in one input graph are coalesced. The last node
 * supplies the data, and redirected edges can collapse or become self-loops.
 * If `that` contains an edge identity, every parallel edge with that identity
 * is removed from `self`. The result allocates new node and edge identifiers.
 *
 * **Example** (Removing shared edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const left = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A-B")
 *   Graph.addEdge(mutable, b, c, "B-C")
 * })
 *
 * const right = Graph.directed<string, string>((mutable) => {
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, b, c, "B-C")
 * })
 *
 * const result = Graph.difference(left, right)
 *
 * Graph.nodeCount(result) // => 3
 * Graph.edgeCount(result) // => 1
 * ```
 *
 * @see {@link symmetricDifference} for retaining edges unique to either graph
 * @category set operations
 * @since 4.0.0
 */
export const difference: {
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    that: Graph<N, E, T>,
    options?: IdentityOptions<N, E, NI, EI>
  ): (self: Graph<N, E, NoInfer<T>>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    self: Graph<N, E, T>,
    that: Graph<N, E, NoInfer<T>>,
    options?: IdentityOptions<N, E, NI, EI>
  ): Graph<N, E, T>
} = dual((args) => isGraph(args[0]) && isGraph(args[1]), <N, E, T extends Kind, NI, EI>(
  self: Graph<N, E, T>,
  that: Graph<N, E, T>,
  options?: IdentityOptions<N, E, NI, EI>
): Graph<N, E, T> => {
  assertSameKind(self, that)
  const selfImpl = internal.toImpl(self)
  const getNodeIdentity = options?.nodeIdentity ?? ((node: N) => node as unknown as NI)
  const getEdgeIdentity = options?.edgeIdentity ?? ((edge: E) => edge as unknown as EI)
  const selfMaps = buildNodeMaps(self, getNodeIdentity)
  const thatMaps = buildNodeMaps(that, getNodeIdentity)
  const thatEdges = buildEdgeMap(that, thatMaps, getEdgeIdentity)

  return make(self.type)<N, E>((mutable) => {
    const indexByIdentity = addNodesByIdentity(mutable, selfMaps.byIdentity)

    for (const edge of selfImpl.edges.values()) {
      const sourceIdentity = nodeIdentityAt(selfMaps, edge.source)
      const targetIdentity = nodeIdentityAt(selfMaps, edge.target)
      const edgeIdentity = new EdgeIdentity(self.type, sourceIdentity, targetIdentity, getEdgeIdentity(edge.data))
      if (!MutableHashMap.has(thatEdges, edgeIdentity)) {
        addEdgeByIdentity(mutable, indexByIdentity, edgeIdentity, edge.data)
      }
    }
  })
})

/**
 * Returns edges present in exactly one of two graphs.
 *
 * **When to use**
 *
 * Use when comparing graphs and retaining relationships unique to either one.
 *
 * **Details**
 *
 * Keeps nodes from both graphs. Overlapping nodes use data from `that`. The
 * result has the same graph kind as `self`. Throws a `GraphError` when the
 * graph kinds do not match. `nodeIdentity` and `edgeIdentity` default to the
 * complete node and edge data. Edge identity also includes the endpoint
 * identities.
 *
 * `G1 Δ G2 = {V1 ∪ V2, (E1 ∪ E2) \ (E1 ∩ E2)}`
 *
 * **Gotchas**
 *
 * Edges with different projected identities are distinct.
 * Nodes with equal identities in one input graph are coalesced. The last node
 * supplies the data, and redirected edges can collapse or become self-loops.
 * Parallel edges with equal identities are coalesced before the graphs are
 * compared. The result allocates new node and edge identifiers.
 *
 * **Example** (Finding differing edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const left = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A-B")
 *   Graph.addEdge(mutable, b, c, "B-C")
 * })
 *
 * const right = Graph.directed<string, string>((mutable) => {
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   const d = Graph.addNode(mutable, "D")
 *   Graph.addEdge(mutable, b, c, "B-C")
 *   Graph.addEdge(mutable, c, d, "C-D")
 * })
 *
 * const result = Graph.symmetricDifference(left, right)
 *
 * Graph.nodeCount(result) // => 4
 * Graph.edgeCount(result) // => 2
 * ```
 *
 * @see {@link difference} for removing only the edges found in another graph
 * @category set operations
 * @since 4.0.0
 */
export const symmetricDifference: {
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    that: Graph<N, E, T>,
    options?: IdentityOptions<N, E, NI, EI>
  ): (self: Graph<N, E, NoInfer<T>>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed", NI = N, EI = E>(
    self: Graph<N, E, T>,
    that: Graph<N, E, NoInfer<T>>,
    options?: IdentityOptions<N, E, NI, EI>
  ): Graph<N, E, T>
} = dual((args) => isGraph(args[0]) && isGraph(args[1]), <N, E, T extends Kind, NI, EI>(
  self: Graph<N, E, T>,
  that: Graph<N, E, T>,
  options?: IdentityOptions<N, E, NI, EI>
): Graph<N, E, T> => {
  assertSameKind(self, that)
  const getNodeIdentity = options?.nodeIdentity ?? ((node: N) => node as unknown as NI)
  const getEdgeIdentity = options?.edgeIdentity ?? ((edge: E) => edge as unknown as EI)
  const selfMaps = buildNodeMaps(self, getNodeIdentity)
  const thatMaps = buildNodeMaps(that, getNodeIdentity)
  const nodes = MutableHashMap.empty<NI, N>()
  const selfEdges = buildEdgeMap(self, selfMaps, getEdgeIdentity)
  const thatEdges = buildEdgeMap(that, thatMaps, getEdgeIdentity)

  for (const [identity, data] of selfMaps.byIdentity) {
    MutableHashMap.set(nodes, identity, data)
  }

  for (const [identity, data] of thatMaps.byIdentity) {
    MutableHashMap.set(nodes, identity, data)
  }

  return make(self.type)<N, E>((mutable) => {
    const indexByIdentity = addNodesByIdentity(mutable, nodes)

    for (const [identity, data] of selfEdges) {
      if (!MutableHashMap.has(thatEdges, identity)) {
        addEdgeByIdentity(mutable, indexByIdentity, identity, data)
      }
    }

    for (const [identity, data] of thatEdges) {
      if (!MutableHashMap.has(selfEdges, identity)) {
        addEdgeByIdentity(mutable, indexByIdentity, identity, data)
      }
    }
  })
})

/**
 * Returns the complement over the existing node set.
 *
 * **When to use**
 *
 * Use when materializing every relationship that is currently absent between
 * distinct nodes.
 *
 * **Details**
 *
 * Directed graphs add each missing ordered pair. Undirected graphs add each
 * missing unordered pair once. The `createEdge` function receives the source
 * and target node data for each added edge. The result has the same graph kind
 * as `self`.
 *
 * `G' = {V, ((V x V) without self-pairs) \ E}`
 *
 * **Gotchas**
 *
 * Self-loops are never created. If any edge already connects a pair, parallel
 * complement edges are not added. The result allocates new identifiers.
 *
 * **Example** (Finding missing relationships)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, "A-B")
 * })
 *
 * const result = Graph.complement(graph, (source, target) => `${source}-${target}`)
 *
 * Graph.edgeCount(result) // => 1
 * ```
 *
 * @see {@link hasEdge} for testing one relationship
 * @category set operations
 * @since 4.0.0
 */
export const complement: {
  <N, E>(
    createEdge: (source: N, target: N) => E
  ): <T extends Kind = "directed">(self: Graph<N, E, T>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed">(
    self: Graph<N, E, T>,
    createEdge: (source: N, target: N) => E
  ): Graph<N, E, T>
} = dual(2, <N, E, T extends Kind>(
  self: Graph<N, E, T>,
  createEdge: (source: N, target: N) => E
): Graph<N, E, T> => {
  const cache = csr.get(self)
  const outgoing = csr.getOutgoing(cache)
  const neighborMarks = new Uint32Array(cache.nodeIds.length)

  return make(self.type)<N, E>((mutable) => {
    const newIndices = new Uint32Array(cache.nodeIds.length)

    for (let i = 0; i < cache.nodeIds.length; i++) {
      newIndices[i] = addNode(mutable, cache.nodeData[i] as N)
    }

    for (let i = 0; i < cache.nodeIds.length; i++) {
      const generation = i + 1
      for (let edge = outgoing.rowOffsets[i]; edge < outgoing.rowOffsets[i + 1]; edge++) {
        neighborMarks[outgoing.columnIndices[edge]] = generation
      }
      const start = self.type === "undirected" ? i + 1 : 0

      for (let j = start; j < cache.nodeIds.length; j++) {
        if (i === j || neighborMarks[j] === generation) {
          continue
        }
        addEdge(mutable, newIndices[i], newIndices[j], createEdge(cache.nodeData[i] as N, cache.nodeData[j] as N))
      }
    }
  })
})

/**
 * Configuration for selecting a graph neighborhood.
 *
 * **Details**
 *
 * `radius` limits the edge distance from the center node and defaults to `1`.
 * It accepts non-negative integers and `Infinity`.
 * `direction` controls how directed edges are traversed and defaults to
 * `"outgoing"`.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface NeighborhoodConfig {
  readonly radius?: number
  readonly direction?: TraversalDirection
}

/**
 * Returns the induced subgraph containing nodes within a radius of a node.
 *
 * **When to use**
 *
 * Use when extracting a local reachable region around one node.
 *
 * **Details**
 *
 * The `radius` option is the maximum edge distance from `nodeIndex`, accepts
 * non-negative integers and `Infinity`, and defaults to `1`. Invalid radii
 * throw a `GraphError`. The `direction` option controls directed graph
 * traversal and defaults to `"outgoing"`. The result has the same graph kind
 * as `self` and keeps all original edges whose endpoints are both reached.
 * `"undirected"` ignores edge direction while finding reachable nodes.
 *
 * **Gotchas**
 *
 * Traversal chooses the nodes, then all original edges between reached nodes
 * are retained. The result is not merely a traversal tree, and it allocates new
 * node and edge identifiers.
 *
 * **Example** (Getting a local neighborhood)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A-B")
 *   Graph.addEdge(mutable, b, c, "B-C")
 * })
 *
 * const result = Graph.neighborhood(graph, 1, { radius: 1 })
 *
 * Graph.nodeCount(result) // => 2
 * ```
 *
 * @see {@link inducedSubgraph} for selecting nodes while preserving identifiers
 * @category set operations
 * @since 4.0.0
 */
export const neighborhood: {
  (
    nodeIndex: NodeIndex,
    options?: NeighborhoodConfig
  ): <N, E, T extends Kind = "directed">(self: Graph<N, E, T>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed">(
    self: Graph<N, E, T>,
    nodeIndex: NodeIndex,
    options?: NeighborhoodConfig
  ): Graph<N, E, T>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind>(
  self: Graph<N, E, T>,
  nodeIndex: NodeIndex,
  options?: NeighborhoodConfig
): Graph<N, E, T> => {
  const selfImpl = internal.toImpl(self)
  const radius = traversalRadius(options?.radius, 1)
  const direction = options?.direction ?? "outgoing"
  const reached = new Set<NodeIndex>()

  for (const index of indices(bfs(self, { start: [nodeIndex], direction, radius }))) {
    reached.add(index)
  }

  return make(self.type)<N, E>((mutable) => {
    const newIndexMap = new Map<NodeIndex, NodeIndex>()

    for (const oldIndex of reached) {
      newIndexMap.set(oldIndex, addNode(mutable, Option.getOrThrow(getNode(self, oldIndex))))
    }

    for (const edge of selfImpl.edges.values()) {
      if (reached.has(edge.source) && reached.has(edge.target)) {
        const sourceIndex = newIndexMap.get(edge.source)
        const targetIndex = newIndexMap.get(edge.target)
        if (sourceIndex !== undefined && targetIndex !== undefined) {
          addEdge(mutable, sourceIndex, targetIndex, edge.data)
        }
      }
    }
  })
})

/**
 * Returns the subgraph induced by a collection of node indices.
 *
 * **When to use**
 *
 * Use when selecting an exact node set while preserving its active node and
 * edge identifiers.
 *
 * **Details**
 *
 * Node and edge indices are preserved. Duplicate input indices are ignored,
 * output ordering follows the original graph, and every edge whose endpoints
 * are both selected is retained.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when a selected node does not exist.
 *
 * @see {@link neighborhood} for selecting nodes by traversal distance
 *
 * @category set operations
 * @since 4.0.0
 */
export const inducedSubgraph: {
  (nodeIndices: Iterable<NodeIndex>): <N, E, T extends Kind = "directed">(self: Graph<N, E, T>) => Graph<N, E, T>
  <N, E, T extends Kind = "directed">(
    self: Graph<N, E, T>,
    nodeIndices: Iterable<NodeIndex>
  ): Graph<N, E, T>
} = dual(2, <N, E, T extends Kind>(
  self: Graph<N, E, T>,
  nodeIndices: Iterable<NodeIndex>
): Graph<N, E, T> => {
  const impl = internal.toImpl(self)
  const selected = new Set<NodeIndex>()
  for (const nodeIndex of nodeIndices) {
    if (!impl.nodes.has(nodeIndex)) {
      throw missingNode(nodeIndex)
    }
    selected.add(nodeIndex)
  }

  const nodes: Array<IndexedNode<N>> = []
  for (const [index, data] of impl.nodes) {
    if (selected.has(index)) {
      nodes.push({ index, data })
    }
  }
  const edges: Array<IndexedEdge<E>> = []
  for (const [index, edge] of impl.edges) {
    if (selected.has(edge.source) && selected.has(edge.target)) {
      edges.push({ index, source: edge.source, target: edge.target, data: edge.data })
    }
  }
  return fromSnapshot({ type: self.type, nodes, edges })
})

/**
 * Returns the disjoint union of two graphs.
 *
 * **When to use**
 *
 * Use when combining graphs while keeping every node distinct, even when node
 * payloads are equal.
 *
 * **Details**
 *
 * Copies all nodes and edges from both graphs without merging equal node data.
 * The result has the same graph kind as `self`. Throws a `GraphError` when the
 * graph kinds do not match.
 *
 * `G1 + G2 = {disjoint V1 + V2, disjoint E1 + E2}`
 *
 * **Gotchas**
 *
 * All node and edge identifiers are newly allocated.
 *
 * @see {@link compose} for merging overlapping logical nodes by identity
 *
 * @category set operations
 * @since 4.0.0
 */
export const sum: {
  <N, E, T extends Kind>(that: Graph<N, E, T>): (self: Graph<N, E, NoInfer<T>>) => Graph<N, E, T>
  <N, E, T extends Kind>(self: Graph<N, E, T>, that: Graph<N, E, NoInfer<T>>): Graph<N, E, T>
} = dual(2, <N, E, T extends Kind>(self: Graph<N, E, T>, that: Graph<N, E, T>): Graph<N, E, T> => {
  assertSameKind(self, that)
  return make(self.type)<N, E>((mutable) => {
    const copyInto = (graph: Graph<N, E, T>) => {
      const impl = internal.toImpl(graph)
      const indexMap = new Map<NodeIndex, NodeIndex>()

      for (const [oldIndex, data] of impl.nodes) {
        indexMap.set(oldIndex, addNode(mutable, data))
      }

      for (const edge of impl.edges.values()) {
        const sourceIndex = indexMap.get(edge.source)
        const targetIndex = indexMap.get(edge.target)
        if (sourceIndex !== undefined && targetIndex !== undefined) {
          addEdge(mutable, sourceIndex, targetIndex, edge.data)
        }
      }
    }

    copyInto(self)
    copyInto(that)
  })
})

// =============================================================================
// Basic Node Operations
// =============================================================================

/**
 * Adds a new node to a mutable graph and returns its index.
 *
 * **When to use**
 *
 * Use to allocate a new node in a mutable graph before storing edges or
 * querying it by index.
 *
 * **Details**
 *
 * The returned index is allocated from the graph's next node index. The mutable
 * graph stores the node data and initializes empty incoming and outgoing edge
 * indexes for the new node.
 *
 * **Gotchas**
 *
 * `NodeIndex` values are identifiers and are not reused after removals.
 *
 * **Example** (Adding nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   Graph.addNode(mutable, "Node A") // => 0
 *   Graph.addNode(mutable, "Node B") // => 1
 * })
 * ```
 *
 * @see {@link mutate} for obtaining a mutable graph from an immutable graph
 * @see {@link addEdge} for connecting existing nodes
 *
 * @category mutations
 * @since 3.18.0
 */
export const addNode = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  data: N
): NodeIndex => {
  const impl = getMutableImplForMutation(mutable)
  const nodeIndex = impl.nextNodeIndex
  if (!Number.isSafeInteger(nodeIndex)) {
    throw new GraphError({ message: "Graph has exhausted safe node indexes" })
  }

  // Add node data
  impl.nodes.set(nodeIndex, data)

  // Initialize empty adjacency lists
  impl.adjacency.set(nodeIndex, [])
  impl.reverseAdjacency.set(nodeIndex, [])

  // Update graph allocators
  impl.nextNodeIndex = impl.nextNodeIndex + 1

  return nodeIndex
}

/**
 * Gets the data associated with a node index safely, if it exists.
 *
 * **Example** (Getting node data)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   Graph.addNode(mutable, "Node A")
 * })
 *
 * Graph.getNode(graph, 0) // => Option.some("Node A")
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const getNode: {
  (nodeIndex: NodeIndex): <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => Option.Option<N>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    nodeIndex: NodeIndex
  ): Option.Option<N>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Option.Option<N> => {
  const impl = internal.toImpl(graph)
  return impl.nodes.has(nodeIndex) ? Option.some(impl.nodes.get(nodeIndex)!) : Option.none()
})

/**
 * Checks whether a node with the given index exists in the graph.
 *
 * **Example** (Checking node existence)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   Graph.addNode(mutable, "Node A")
 * })
 *
 * Graph.hasNode(graph, 0) // => true
 * Graph.hasNode(graph, 999) // => false
 * ```
 *
 * @category predicates
 * @since 3.18.0
 */
export const hasNode: {
  (nodeIndex: NodeIndex): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => boolean
  <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>, nodeIndex: NodeIndex): boolean
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): boolean => internal.toImpl(graph).nodes.has(nodeIndex))

/**
 * Returns the number of nodes in the graph.
 *
 * **Example** (Counting nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const emptyGraph = Graph.directed<string, number>()
 * Graph.nodeCount(emptyGraph) // => 0
 *
 * const graphWithNodes = Graph.mutate(emptyGraph, (mutable) => {
 *   Graph.addNode(mutable, "Node A")
 *   Graph.addNode(mutable, "Node B")
 *   Graph.addNode(mutable, "Node C")
 * })
 *
 * Graph.nodeCount(graphWithNodes) // => 3
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const nodeCount = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): number => internal.toImpl(graph).nodes.size

/**
 * Finds the first node that matches the given predicate.
 *
 * **Example** (Finding the first matching node)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   Graph.addNode(mutable, "Node A")
 *   Graph.addNode(mutable, "Node B")
 *   Graph.addNode(mutable, "Node C")
 * })
 *
 * Graph.findNode(graph, (data) => data.startsWith("Node B")) // => Option.some(1)
 * Graph.findNode(graph, (data) => data === "Node D") // => Option.none()
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const findNode: {
  <N>(
    predicate: (data: N) => boolean
  ): <E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Option.Option<NodeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    predicate: (data: N) => boolean
  ): Option.Option<NodeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  predicate: (data: N) => boolean
): Option.Option<NodeIndex> => {
  const impl = internal.toImpl(graph)
  return withMutationGuard(graph, () => {
    for (const [index, data] of impl.nodes) {
      if (predicate(data)) {
        return Option.some(index)
      }
    }
    return Option.none()
  })
})

/**
 * Finds all nodes that match the given predicate.
 *
 * **Example** (Finding matching nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   Graph.addNode(mutable, "Start A")
 *   Graph.addNode(mutable, "Node B")
 *   Graph.addNode(mutable, "Start C")
 * })
 *
 * Graph.findNodes(graph, (data) => data.startsWith("Start")) // => [0, 2]
 * Graph.findNodes(graph, (data) => data === "Not Found") // => []
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const findNodes: {
  <N>(
    predicate: (data: N) => boolean
  ): <E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Array<NodeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    predicate: (data: N) => boolean
  ): Array<NodeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  predicate: (data: N) => boolean
): Array<NodeIndex> => {
  const impl = internal.toImpl(graph)
  return withMutationGuard(graph, () => {
    const results: Array<NodeIndex> = []
    for (const [index, data] of impl.nodes) {
      if (predicate(data)) {
        results.push(index)
      }
    }
    return results
  })
})

/**
 * Finds the first edge that matches the given predicate.
 *
 * **Example** (Finding the first matching edge)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const nodeC = Graph.addNode(mutable, "Node C")
 *   Graph.addEdge(mutable, nodeA, nodeB, 10)
 *   Graph.addEdge(mutable, nodeB, nodeC, 20)
 * })
 *
 * Graph.findEdge(graph, (data) => data > 15) // => Option.some(1)
 * Graph.findEdge(graph, (data) => data > 100) // => Option.none()
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const findEdge: {
  <E>(
    predicate: (data: E, source: NodeIndex, target: NodeIndex) => boolean
  ): <N, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Option.Option<EdgeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    predicate: (data: E, source: NodeIndex, target: NodeIndex) => boolean
  ): Option.Option<EdgeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  predicate: (data: E, source: NodeIndex, target: NodeIndex) => boolean
): Option.Option<EdgeIndex> => {
  const impl = internal.toImpl(graph)
  return withMutationGuard(graph, () => {
    for (const [edgeIndex, edgeData] of impl.edges) {
      if (predicate(edgeData.data, edgeData.source, edgeData.target)) {
        return Option.some(edgeIndex)
      }
    }
    return Option.none()
  })
})

/**
 * Finds all edges that match the given predicate.
 *
 * **Example** (Finding matching edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const nodeC = Graph.addNode(mutable, "Node C")
 *   Graph.addEdge(mutable, nodeA, nodeB, 10)
 *   Graph.addEdge(mutable, nodeB, nodeC, 20)
 *   Graph.addEdge(mutable, nodeC, nodeA, 30)
 * })
 *
 * Graph.findEdges(graph, (data) => data >= 20) // => [1, 2]
 * Graph.findEdges(graph, (data) => data > 100) // => []
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const findEdges: {
  <E>(
    predicate: (data: E, source: NodeIndex, target: NodeIndex) => boolean
  ): <N, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Array<EdgeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    predicate: (data: E, source: NodeIndex, target: NodeIndex) => boolean
  ): Array<EdgeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  predicate: (data: E, source: NodeIndex, target: NodeIndex) => boolean
): Array<EdgeIndex> => {
  const impl = internal.toImpl(graph)
  return withMutationGuard(graph, () => {
    const results: Array<EdgeIndex> = []
    for (const [edgeIndex, edgeData] of impl.edges) {
      if (predicate(edgeData.data, edgeData.source, edgeData.target)) {
        results.push(edgeIndex)
      }
    }
    return results
  })
})

/**
 * Updates a single node's data by applying a transformation function.
 *
 * **When to use**
 *
 * Use when replacing one node payload while preserving its identifier and
 * incident edges.
 *
 * **Gotchas**
 *
 * A missing node index is ignored. The transformation may query the graph, but
 * cannot mutate or finalize the same graph while it runs.
 *
 * **Example** (Updating node data)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   Graph.addNode(mutable, "Node A")
 *   Graph.addNode(mutable, "Node B")
 *   Graph.updateNode(mutable, 0, (data) => data.toUpperCase())
 * })
 *
 * Graph.getNode(graph, 0) // => Option.some("NODE A")
 * ```
 *
 * @category transforming
 * @since 3.18.0
 */
export const updateNode = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  index: NodeIndex,
  f: (data: N) => N
): void => {
  const impl = getMutableImplForMutation(mutable)
  internal.withTransformation(mutable, () => {
    if (!impl.nodes.has(index)) {
      return
    }

    const currentData = impl.nodes.get(index)!
    const newData = f(currentData)
    impl.nodes.set(index, newData)
  })
}

/**
 * Updates a single edge's data by applying a transformation function.
 *
 * **When to use**
 *
 * Use when replacing one edge payload while preserving its identifier and
 * endpoints.
 *
 * **Gotchas**
 *
 * A missing edge index is ignored. The transformation may query the graph, but
 * cannot mutate or finalize the same graph while it runs.
 *
 * **Example** (Updating edge data)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const result = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const edgeIndex = Graph.addEdge(mutable, nodeA, nodeB, 10)
 *   Graph.updateEdge(mutable, edgeIndex, (data) => data * 2)
 * })
 *
 * Option.map(Graph.getEdge(result, 0), (edge) => edge.data) // => Option.some(20)
 * ```
 *
 * @category transforming
 * @since 3.18.0
 */
export const updateEdge = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  edgeIndex: EdgeIndex,
  f: (data: E) => E
): void => {
  const impl = getMutableImplForMutation(mutable)
  internal.withTransformation(mutable, () => {
    if (!impl.edges.has(edgeIndex)) {
      return
    }

    const currentEdge = impl.edges.get(edgeIndex)!
    const newData = f(currentEdge.data)
    impl.edges.set(edgeIndex, {
      source: currentEdge.source,
      target: currentEdge.target,
      data: newData
    })
  })
}

/**
 * Transforms every node's data in a mutable graph in place using the provided
 * mapping function.
 *
 * **When to use**
 *
 * Use when updating every node payload without changing graph structure.
 *
 * **Details**
 *
 * Node indices and edges are preserved; only the stored node data is replaced.
 *
 * **Gotchas**
 *
 * This function mutates in place, returns `void`, and cannot change the node
 * payload type. The mapping function may query the graph, but cannot mutate or
 * finalize the same graph while it runs.
 *
 * **Example** (Mapping node data)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   Graph.addNode(mutable, "node a")
 *   Graph.addNode(mutable, "node b")
 *   Graph.addNode(mutable, "node c")
 *   Graph.mapNodes(mutable, (data) => data.toUpperCase())
 * })
 *
 * Graph.getNode(graph, 0) // => Option.some("NODE A")
 * ```
 *
 * @see {@link updateNode} for updating one node
 * @see {@link filterMapNodes} for mapping while removing nodes
 * @category mapping
 * @since 3.18.0
 */
export const mapNodes = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  f: (data: N) => N
): void => {
  const impl = getMutableImplForMutation(mutable)
  internal.withTransformation(mutable, () => {
    // Transform existing node data in place
    for (const [index, data] of impl.nodes) {
      const newData = f(data)
      impl.nodes.set(index, newData)
    }
  })
}

/**
 * Transforms every edge payload in a mutable graph in place.
 *
 * **When to use**
 *
 * Use when updating every edge payload without changing graph structure.
 *
 * **Details**
 *
 * Edge identifiers and endpoints are preserved.
 *
 * **Gotchas**
 *
 * This function mutates in place, returns `void`, and cannot change the edge
 * payload type. The mapping function may query the graph, but cannot mutate or
 * finalize the same graph while it runs.
 *
 * **Example** (Mapping edge data)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 10)
 *   Graph.addEdge(mutable, b, c, 20)
 *   Graph.mapEdges(mutable, (data) => data * 2)
 * })
 *
 * Option.map(Graph.getEdge(graph, 0), (edge) => edge.data) // => Option.some(20)
 * ```
 *
 * @see {@link updateEdge} for updating one edge
 * @see {@link filterMapEdges} for mapping while removing edges
 * @category mapping
 * @since 3.18.0
 */
export const mapEdges = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  f: (data: E) => E
): void => {
  const impl = getMutableImplForMutation(mutable)
  internal.withTransformation(mutable, () => {
    // Transform existing edge data in place
    for (const [index, edgeData] of impl.edges) {
      const newData = f(edgeData.data)
      impl.edges.set(index, {
        source: edgeData.source,
        target: edgeData.target,
        data: newData
      })
    }
  })
}

/**
 * Swaps source and target nodes for every edge in a mutable graph.
 *
 * **When to use**
 *
 * Use when reversing every relationship in a directed graph, such as creating
 * a dependency transpose.
 *
 * **Details**
 *
 * Edge identifiers and payloads are preserved.
 *
 * **Gotchas**
 *
 * This operation is a no-op for undirected graphs.
 *
 * **Example** (Reversing edge directions)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 1) // A -> B
 *   Graph.addEdge(mutable, b, c, 2) // B -> C
 *   Graph.reverse(mutable) // Now B -> A, C -> B
 * })
 *
 * Option.map(Graph.getEdge(graph, 0), (edge) => edge.source) // => Option.some(1)
 * ```
 *
 * @category transforming
 * @since 3.18.0
 */
export const reverse = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>
): void => {
  const impl = getMutableImplForMutation(mutable)
  if (impl.type === "undirected") {
    return
  }

  // Reverse all edges by swapping source and target
  for (const [index, edgeData] of impl.edges) {
    impl.edges.set(index, {
      source: edgeData.target,
      target: edgeData.source,
      data: edgeData.data
    })
  }

  const adjacency = impl.adjacency
  impl.adjacency = impl.reverseAdjacency
  impl.reverseAdjacency = adjacency

  // Invalidate cycle flag since edge directions changed
  impl.acyclic = Option.none()
}

/**
 * Filters and optionally transforms nodes in a mutable graph using a predicate function.
 * Nodes that return Option.none are removed along with all their connected edges.
 *
 * **Gotchas**
 *
 * The function may query the graph, but cannot mutate or finalize the same
 * graph while it runs. Retained payloads must remain the same node type.
 *
 * **Example** (Filtering and mapping nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "active")
 *   const b = Graph.addNode(mutable, "inactive")
 *   const c = Graph.addNode(mutable, "active")
 *   Graph.addEdge(mutable, a, b, 1)
 *   Graph.addEdge(mutable, b, c, 2)
 *
 *   // Keep only "active" nodes and transform to uppercase
 *   Graph.filterMapNodes(
 *     mutable,
 *     (data) =>
 *       data === "active" ? Option.some(data.toUpperCase()) : Option.none()
 *   )
 * })
 *
 * Graph.nodeCount(graph) // => 2
 * ```
 *
 * @category filtering
 * @since 3.18.0
 */
export const filterMapNodes = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  f: (data: N) => Option.Option<N>
): void => {
  const impl = getMutableImplForMutation(mutable)
  const remove: Array<NodeIndex> = []
  internal.withTransformation(mutable, () => {
    // First pass: identify nodes to remove and transform data for nodes to keep
    for (const [index, data] of impl.nodes) {
      const result = f(data)
      if (Option.isSome(result)) {
        // Transform node data
        impl.nodes.set(index, result.value)
      } else {
        // Mark for removal
        remove.push(index)
      }
    }
  })

  // Second pass: remove filtered out nodes and their edges
  removeNodes(mutable, remove)
}

/**
 * Filters and optionally transforms edges in a mutable graph using a predicate function.
 * Edges that return Option.none are removed from the graph.
 *
 * **Gotchas**
 *
 * The function may query the graph, but cannot mutate or finalize the same
 * graph while it runs. Retained payloads must remain the same edge type.
 *
 * **Example** (Filtering and mapping edges)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 5)
 *   Graph.addEdge(mutable, b, c, 15)
 *   Graph.addEdge(mutable, c, a, 25)
 *
 *   // Keep only edges with weight >= 10 and double their weight
 *   Graph.filterMapEdges(
 *     mutable,
 *     (data) => data >= 10 ? Option.some(data * 2) : Option.none()
 *   )
 * })
 *
 * Graph.edgeCount(graph) // => 2
 * ```
 *
 * @category filtering
 * @since 3.18.0
 */
export const filterMapEdges = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  f: (data: E) => Option.Option<E>
): void => {
  const impl = getMutableImplForMutation(mutable)
  const remove: Array<EdgeIndex> = []
  internal.withTransformation(mutable, () => {
    // First pass: identify edges to remove and transform data for edges to keep
    for (const [index, edgeData] of impl.edges) {
      const result = f(edgeData.data)
      if (Option.isSome(result)) {
        // Transform edge data
        impl.edges.set(index, {
          source: edgeData.source,
          target: edgeData.target,
          data: result.value
        })
      } else {
        // Mark for removal
        remove.push(index)
      }
    }
  })

  // Second pass: remove filtered out edges
  removeEdges(mutable, remove)
}

/**
 * Filters nodes by removing those that don't match the predicate.
 * This function modifies the mutable graph in place.
 * Removed nodes also remove all incident edges; retained node identifiers are
 * preserved.
 *
 * **Gotchas**
 *
 * The predicate may query the graph, but cannot mutate or finalize the same
 * graph while it runs.
 *
 * **Example** (Filtering nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   Graph.addNode(mutable, "active")
 *   Graph.addNode(mutable, "inactive")
 *   Graph.addNode(mutable, "pending")
 *   Graph.addNode(mutable, "active")
 *
 *   // Keep only "active" nodes
 *   Graph.filterNodes(mutable, (data) => data === "active")
 * })
 *
 * Graph.nodeCount(graph) // => 2
 * ```
 *
 * @category filtering
 * @since 3.18.0
 */
export const filterNodes = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  predicate: (data: N) => boolean
): void => {
  const impl = getMutableImplForMutation(mutable)
  const remove: Array<NodeIndex> = []

  internal.withTransformation(mutable, () => {
    // Identify nodes to remove
    for (const [index, data] of impl.nodes) {
      if (!predicate(data)) {
        remove.push(index)
      }
    }
  })

  // Remove filtered out nodes (this also removes connected edges)
  removeNodes(mutable, remove)
}

/**
 * Filters edges by removing those that don't match the predicate.
 * This function modifies the mutable graph in place.
 * Nodes are retained even when removing edges leaves them isolated.
 *
 * **Gotchas**
 *
 * The predicate may query the graph, but cannot mutate or finalize the same
 * graph while it runs.
 *
 * **Example** (Filtering edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *
 *   Graph.addEdge(mutable, a, b, 5)
 *   Graph.addEdge(mutable, b, c, 15)
 *   Graph.addEdge(mutable, c, a, 25)
 *
 *   // Keep only edges with weight >= 10
 *   Graph.filterEdges(mutable, (data) => data >= 10)
 * })
 *
 * Graph.edgeCount(graph) // => 2
 * ```
 *
 * @category filtering
 * @since 3.18.0
 */
export const filterEdges = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  predicate: (data: E) => boolean
): void => {
  const impl = getMutableImplForMutation(mutable)
  const remove: Array<EdgeIndex> = []

  internal.withTransformation(mutable, () => {
    // Identify edges to remove
    for (const [index, edgeData] of impl.edges) {
      if (!predicate(edgeData.data)) {
        remove.push(index)
      }
    }
  })

  // Remove filtered out edges
  removeEdges(mutable, remove)
}

// =============================================================================
// Cycle Flag Management (Internal)
// =============================================================================

/** @internal */
const invalidateCycleFlagOnRemoval = <N, E, T extends Kind = "directed">(
  mutable: internal.GraphImpl<N, E, T>
): void => {
  // Only invalidate if the graph had cycles (removing edges/nodes cannot introduce cycles in acyclic graphs).
  if (Option.isSome(mutable.acyclic) && mutable.acyclic.value === false) {
    mutable.acyclic = Option.none()
  }
}

/** @internal */
const invalidateCycleFlagOnAddition = <N, E, T extends Kind = "directed">(
  mutable: internal.GraphImpl<N, E, T>
): void => {
  // Only invalidate if the graph was acyclic (adding edges cannot remove cycles from cyclic graphs).
  if (Option.isSome(mutable.acyclic) && mutable.acyclic.value === true) {
    mutable.acyclic = Option.none()
  }
}

// =============================================================================
// Edge Operations
// =============================================================================

/**
 * Adds a new edge to a mutable graph and returns its index.
 *
 * **When to use**
 *
 * Use to connect two existing nodes in a mutable graph while storing edge data
 * and receiving the new edge identifier.
 *
 * **Details**
 *
 * Self-loops and parallel edges are allowed. Undirected graphs retain the
 * supplied source and target orientation in the stored `Edge`, while traversal
 * and neighbor queries treat the connection as bidirectional.
 *
 * **Gotchas**
 *
 * The source and target nodes must already exist in the mutable graph; missing
 * endpoints throw a `GraphError`.
 *
 * **Example** (Adding edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   Graph.addEdge(mutable, nodeA, nodeB, 42) // => 0
 * })
 * ```
 *
 * @see {@link mutate} for obtaining a mutable graph from an immutable graph
 * @see {@link addNode} for creating node indexes before connecting them
 *
 * @category mutations
 * @since 3.18.0
 */
export const addEdge = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  source: NodeIndex,
  target: NodeIndex,
  data: E
): EdgeIndex => {
  const impl = getMutableImplForMutation(mutable)

  // Validate that both nodes exist
  if (!impl.nodes.has(source)) {
    throw missingNode(source)
  }
  if (!impl.nodes.has(target)) {
    throw missingNode(target)
  }

  const edgeIndex = impl.nextEdgeIndex
  if (!Number.isSafeInteger(edgeIndex)) {
    throw new GraphError({ message: "Graph has exhausted safe edge indexes" })
  }

  // Create edge data
  const edgeData: Edge<E> = { source, target, data }
  impl.edges.set(edgeIndex, edgeData)

  // Update adjacency lists
  const sourceAdjacency = impl.adjacency.get(source)
  if (sourceAdjacency !== undefined) {
    sourceAdjacency.push(edgeIndex)
  }

  const targetReverseAdjacency = impl.reverseAdjacency.get(target)
  if (targetReverseAdjacency !== undefined) {
    targetReverseAdjacency.push(edgeIndex)
  }

  // For undirected graphs, add reverse connections
  if (impl.type === "undirected") {
    const targetAdjacency = impl.adjacency.get(target)
    if (targetAdjacency !== undefined) {
      targetAdjacency.push(edgeIndex)
    }

    const sourceReverseAdjacency = impl.reverseAdjacency.get(source)
    if (sourceReverseAdjacency !== undefined) {
      sourceReverseAdjacency.push(edgeIndex)
    }
  }

  // Update allocators
  impl.nextEdgeIndex = impl.nextEdgeIndex + 1

  // Only invalidate cycle flag if the graph was acyclic
  // Adding edges cannot remove cycles from cyclic graphs
  invalidateCycleFlagOnAddition(impl)

  return edgeIndex
}

/**
 * Removes a node and all its incident edges from a mutable graph.
 *
 * **Gotchas**
 *
 * A missing node index is ignored.
 *
 * **Example** (Removing a node)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const result = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   Graph.addEdge(mutable, nodeA, nodeB, 42)
 *
 *   // Remove nodeA and all edges connected to it
 *   Graph.removeNode(mutable, nodeA)
 * })
 * Array.of(Graph.nodeCount(result), Graph.edgeCount(result)) // => [1, 0]
 * ```
 *
 * @category mutations
 * @since 3.18.0
 */
export const removeNode = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): void => {
  const impl = getMutableImplForMutation(mutable)
  if (removeNodeInternal(impl, nodeIndex)) {
    invalidateCycleFlagOnRemoval(impl)
  }
}

/**
 * Removes multiple nodes and all their incident edges from a mutable graph.
 *
 * **When to use**
 *
 * Use when deleting a collection of nodes in one mutation pass.
 *
 * **Details**
 *
 * The input is collected before mutation, so it may be backed by an iterator
 * over the same graph.
 *
 * **Gotchas**
 *
 * Missing and duplicate node indices are ignored. Removing a node also removes
 * all of its incident edges.
 *
 * @see {@link removeNode} for removing one node
 *
 * @category mutations
 * @since 4.0.0
 */
export const removeNodes = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  nodeIndices: Iterable<NodeIndex>
): void => {
  assertMutable(mutable)
  if (internal.isTransforming(mutable)) {
    throw new GraphError({ message: "Cannot mutate graph during a transformation" })
  }
  const indices = internal.withTransformation(mutable, () => Array.from(nodeIndices))
  const impl = getMutableImplForMutation(mutable)

  let removed = false
  for (const nodeIndex of indices) {
    if (removeNodeInternal(impl, nodeIndex)) {
      removed = true
    }
  }

  if (removed) {
    invalidateCycleFlagOnRemoval(impl)
  }
}

/** @internal */
const removeNodeInternal = <N, E, T extends Kind = "directed">(
  impl: internal.GraphImpl<N, E, T>,
  nodeIndex: NodeIndex
): boolean => {
  // Check if node exists
  if (!impl.nodes.has(nodeIndex)) {
    return false // Node doesn't exist, nothing to remove
  }

  const edgesToRemove = new Set(impl.adjacency.get(nodeIndex)!)
  for (const edgeIndex of impl.reverseAdjacency.get(nodeIndex)!) {
    edgesToRemove.add(edgeIndex)
  }

  for (const edgeIndex of edgesToRemove) {
    const edge = impl.edges.get(edgeIndex)!
    if (edge.source !== nodeIndex) {
      const adjacency = impl.adjacency.get(edge.source)!
      adjacency.splice(adjacency.indexOf(edgeIndex), 1)
      if (impl.type === "undirected") {
        const reverseAdjacency = impl.reverseAdjacency.get(edge.source)!
        reverseAdjacency.splice(reverseAdjacency.indexOf(edgeIndex), 1)
      }
    }
    if (edge.target !== nodeIndex) {
      const reverseAdjacency = impl.reverseAdjacency.get(edge.target)!
      reverseAdjacency.splice(reverseAdjacency.indexOf(edgeIndex), 1)
      if (impl.type === "undirected") {
        const adjacency = impl.adjacency.get(edge.target)!
        adjacency.splice(adjacency.indexOf(edgeIndex), 1)
      }
    }
    impl.edges.delete(edgeIndex)
  }

  // Remove the node itself
  impl.nodes.delete(nodeIndex)
  impl.adjacency.delete(nodeIndex)
  impl.reverseAdjacency.delete(nodeIndex)

  return true
}

/**
 * Removes an edge from a mutable graph.
 *
 * **Gotchas**
 *
 * A missing edge index is ignored.
 *
 * **Example** (Removing an edge)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const result = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const edge = Graph.addEdge(mutable, nodeA, nodeB, 42)
 *
 *   // Remove the edge
 *   Graph.removeEdge(mutable, edge)
 * })
 * Array.of(Graph.nodeCount(result), Graph.edgeCount(result)) // => [2, 0]
 * ```
 *
 * @category mutations
 * @since 3.18.0
 */
export const removeEdge = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  edgeIndex: EdgeIndex
): void => {
  const impl = getMutableImplForMutation(mutable)
  // Only invalidate cycle flag if an edge was actually removed
  // and only if the graph wasn't already known to be acyclic
  if (removeEdgeInternal(impl, edgeIndex)) {
    invalidateCycleFlagOnRemoval(impl)
  }
}

/**
 * Removes multiple edges from a mutable graph.
 *
 * **When to use**
 *
 * Use when deleting a collection of edges in one mutation pass.
 *
 * **Details**
 *
 * The input is collected before mutation, so it may be backed by an iterator
 * over the same graph.
 *
 * **Gotchas**
 *
 * Missing and duplicate edge indices are ignored. Nodes are never removed.
 *
 * @see {@link removeEdge} for removing one edge
 *
 * @category mutations
 * @since 4.0.0
 */
export const removeEdges = <N, E, T extends Kind = "directed">(
  mutable: MutableGraph<N, E, T>,
  edgeIndices: Iterable<EdgeIndex>
): void => {
  assertMutable(mutable)
  if (internal.isTransforming(mutable)) {
    throw new GraphError({ message: "Cannot mutate graph during a transformation" })
  }
  const indices = internal.withTransformation(mutable, () => Array.from(edgeIndices))
  const impl = getMutableImplForMutation(mutable)

  let removed = false
  for (const edgeIndex of indices) {
    if (removeEdgeInternal(impl, edgeIndex)) {
      removed = true
    }
  }

  if (removed) {
    invalidateCycleFlagOnRemoval(impl)
  }
}

/** @internal */
const removeEdgeInternal = <N, E, T extends Kind = "directed">(
  mutable: internal.GraphImpl<N, E, T>,
  edgeIndex: EdgeIndex
): boolean => {
  // Get edge data
  const edge = mutable.edges.get(edgeIndex)
  if (edge === undefined) {
    return false // Edge doesn't exist, no mutation occurred
  }

  const { source, target } = edge

  // Remove from adjacency lists
  const sourceAdjacency = mutable.adjacency.get(source)
  if (sourceAdjacency !== undefined) {
    const index = sourceAdjacency.indexOf(edgeIndex)
    if (index !== -1) {
      sourceAdjacency.splice(index, 1)
    }
  }

  const targetReverseAdjacency = mutable.reverseAdjacency.get(target)
  if (targetReverseAdjacency !== undefined) {
    const index = targetReverseAdjacency.indexOf(edgeIndex)
    if (index !== -1) {
      targetReverseAdjacency.splice(index, 1)
    }
  }

  // For undirected graphs, remove reverse connections
  if (mutable.type === "undirected") {
    const targetAdjacency = mutable.adjacency.get(target)
    if (targetAdjacency !== undefined) {
      const index = targetAdjacency.indexOf(edgeIndex)
      if (index !== -1) {
        targetAdjacency.splice(index, 1)
      }
    }

    const sourceReverseAdjacency = mutable.reverseAdjacency.get(source)
    if (sourceReverseAdjacency !== undefined) {
      const index = sourceReverseAdjacency.indexOf(edgeIndex)
      if (index !== -1) {
        sourceReverseAdjacency.splice(index, 1)
      }
    }
  }

  // Remove edge data
  mutable.edges.delete(edgeIndex)

  return true // Edge was successfully removed
}

// =============================================================================
// Edge Query Operations
// =============================================================================

/**
 * Gets the edge data associated with an edge index safely, if it exists.
 *
 * **Example** (Getting edge data)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   Graph.addEdge(mutable, nodeA, nodeB, 42)
 * })
 *
 * Graph.getEdge(graph, 0) // => Option.some({ source: 0, target: 1, data: 42 })
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const getEdge: {
  (edgeIndex: EdgeIndex): <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => Option.Option<Edge<E>>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    edgeIndex: EdgeIndex
  ): Option.Option<Edge<E>>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  edgeIndex: EdgeIndex
): Option.Option<Edge<E>> => {
  const edge = internal.toImpl(graph).edges.get(edgeIndex)
  return edge === undefined ? Option.none() : Option.some(copyEdge(edge))
})

/**
 * Checks whether an edge exists between two nodes in the graph.
 *
 * **Details**
 *
 * Directed graphs test only `source` to `target`; undirected graphs accept
 * either stored orientation. Parallel edges still produce one boolean result.
 *
 * **Gotchas**
 *
 * Returns `false` when either node does not exist.
 *
 * **Example** (Checking edge existence)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const nodeC = Graph.addNode(mutable, "Node C")
 *   Graph.addEdge(mutable, nodeA, nodeB, 42)
 * })
 *
 * Graph.hasEdge(graph, 0, 1) // => true
 * Graph.hasEdge(graph, 0, 2) // => false
 * ```
 *
 * @see {@link edgesBetween} for all matching edge identifiers
 * @category predicates
 * @since 3.18.0
 */
export const hasEdge: {
  (
    source: NodeIndex,
    target: NodeIndex
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => boolean
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    source: NodeIndex,
    target: NodeIndex
  ): boolean
} = dual(3, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  source: NodeIndex,
  target: NodeIndex
): boolean => {
  const impl = internal.toImpl(graph)
  const adjacencyList = impl.adjacency.get(source)
  if (adjacencyList === undefined) {
    return false
  }

  // Check if any edge in the adjacency list connects to the target
  for (const edgeIndex of adjacencyList) {
    const edge = impl.edges.get(edgeIndex)
    if (edge !== undefined) {
      const neighbor = graph.type === "undirected" && edge.target === source ? edge.source : edge.target
      if (neighbor === target) {
        return true
      }
    }
  }

  return false
})

/**
 * Returns the number of edges in the graph.
 *
 * **Example** (Counting edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const emptyGraph = Graph.directed<string, number>()
 * Graph.edgeCount(emptyGraph) // => 0
 *
 * const graphWithEdges = Graph.mutate(emptyGraph, (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const nodeC = Graph.addNode(mutable, "Node C")
 *   Graph.addEdge(mutable, nodeA, nodeB, 1)
 *   Graph.addEdge(mutable, nodeB, nodeC, 2)
 *   Graph.addEdge(mutable, nodeC, nodeA, 3)
 * })
 *
 * Graph.edgeCount(graphWithEdges) // => 3
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const edgeCount = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): number => internal.toImpl(graph).edges.size

/**
 * Returns the indices of all edges incident to a node.
 *
 * **Details**
 *
 * Each edge is returned once in graph edge order, including self-loops.
 * Throws a `GraphError` when the node does not exist.
 *
 * @category getters
 * @since 4.0.0
 */
export const incidentEdges: {
  (
    nodeIndex: NodeIndex
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Array<EdgeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    nodeIndex: NodeIndex
  ): Array<EdgeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Array<EdgeIndex> => {
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(nodeIndex)) {
    throw missingNode(nodeIndex)
  }
  const outgoing = impl.adjacency.get(nodeIndex)!
  if (graph.type === "undirected") {
    const result: Array<EdgeIndex> = []
    let previous = -1
    for (const edgeIndex of outgoing) {
      if (edgeIndex !== previous) {
        result.push(edgeIndex)
        previous = edgeIndex
      }
    }
    return result
  }

  const incoming = impl.reverseAdjacency.get(nodeIndex)!
  const result: Array<EdgeIndex> = []
  let outgoingPosition = 0
  let incomingPosition = 0
  while (outgoingPosition < outgoing.length && incomingPosition < incoming.length) {
    const outgoingEdge = outgoing[outgoingPosition]
    const incomingEdge = incoming[incomingPosition]
    if (outgoingEdge < incomingEdge) {
      result.push(outgoingEdge)
      outgoingPosition++
    } else if (incomingEdge < outgoingEdge) {
      result.push(incomingEdge)
      incomingPosition++
    } else {
      result.push(outgoingEdge)
      outgoingPosition++
      incomingPosition++
    }
  }
  while (outgoingPosition < outgoing.length) result.push(outgoing[outgoingPosition++])
  while (incomingPosition < incoming.length) result.push(incoming[incomingPosition++])
  return result
})

/**
 * Returns the indices of outgoing edges for a node in a directed graph.
 *
 * **Details**
 *
 * Parallel edges and self-loops are returned separately in adjacency order.
 * Throws a `GraphError` for an undirected graph or missing node.
 *
 * @category getters
 * @since 4.0.0
 */
export const outgoingEdges: {
  (nodeIndex: NodeIndex): <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
  ) => Array<EdgeIndex>
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    nodeIndex: NodeIndex
  ): Array<EdgeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Array<EdgeIndex> => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get outgoing edges of undirected graph" })
  }
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(nodeIndex)) {
    throw missingNode(nodeIndex)
  }
  return Array.from(impl.adjacency.get(nodeIndex)!)
})

/**
 * Returns the indices of incoming edges for a node in a directed graph.
 *
 * **Details**
 *
 * Parallel edges and self-loops are returned separately in reverse-adjacency
 * order. Throws a `GraphError` for an undirected graph or missing node.
 *
 * @category getters
 * @since 4.0.0
 */
export const incomingEdges: {
  (nodeIndex: NodeIndex): <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
  ) => Array<EdgeIndex>
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    nodeIndex: NodeIndex
  ): Array<EdgeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Array<EdgeIndex> => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get incoming edges of undirected graph" })
  }
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(nodeIndex)) {
    throw missingNode(nodeIndex)
  }
  return Array.from(impl.reverseAdjacency.get(nodeIndex)!)
})

/**
 * Returns all edge indices connecting the supplied nodes.
 *
 * **Details**
 *
 * Directed graphs only include edges from `source` to `target`; undirected
 * graphs include either stored orientation. Parallel edges are retained.
 * Throws a `GraphError` when either node does not exist.
 *
 * @category getters
 * @since 4.0.0
 */
export const edgesBetween: {
  (source: NodeIndex, target: NodeIndex): <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => Array<EdgeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    source: NodeIndex,
    target: NodeIndex
  ): Array<EdgeIndex>
} = dual(3, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  source: NodeIndex,
  target: NodeIndex
): Array<EdgeIndex> => {
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(source)) {
    throw missingNode(source)
  }
  if (!impl.nodes.has(target)) {
    throw missingNode(target)
  }
  const result: Array<EdgeIndex> = []
  let previous = -1
  for (const edgeIndex of impl.adjacency.get(source)!) {
    if (edgeIndex === previous) {
      continue
    }
    previous = edgeIndex
    const edge = impl.edges.get(edgeIndex)!
    const neighbor = graph.type === "undirected" && edge.target === source ? edge.source : edge.target
    if (neighbor === target) {
      result.push(edgeIndex)
    }
  }
  return result
})

/**
 * Returns the degree of a node in an undirected graph.
 *
 * **Details**
 *
 * Parallel edges count separately and a self-loop contributes two. Throws a
 * `GraphError` for a directed graph or missing node.
 *
 * @category getters
 * @since 4.0.0
 */
export const degree: {
  (nodeIndex: NodeIndex): <N, E>(
    graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
  ) => number
  <N, E>(graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">, nodeIndex: NodeIndex): number
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): number => {
  if (graph.type === "directed") {
    throw new GraphError({ message: "Cannot get degree of directed graph" })
  }
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(nodeIndex)) {
    throw missingNode(nodeIndex)
  }
  return impl.adjacency.get(nodeIndex)!.length
})

/**
 * Returns the out-degree of a node in a directed graph.
 *
 * **Details**
 *
 * Parallel edges count separately and a self-loop contributes one. Throws a
 * `GraphError` for an undirected graph or missing node.
 *
 * @category getters
 * @since 4.0.0
 */
export const outDegree: {
  (nodeIndex: NodeIndex): <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
  ) => number
  <N, E>(graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">, nodeIndex: NodeIndex): number
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): number => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get outgoing edges of undirected graph" })
  }
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(nodeIndex)) {
    throw missingNode(nodeIndex)
  }
  return impl.adjacency.get(nodeIndex)!.length
})

/**
 * Returns the in-degree of a node in a directed graph.
 *
 * **Details**
 *
 * Parallel edges count separately and a self-loop contributes one. Throws a
 * `GraphError` for an undirected graph or missing node.
 *
 * @category getters
 * @since 4.0.0
 */
export const inDegree: {
  (nodeIndex: NodeIndex): <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
  ) => number
  <N, E>(graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">, nodeIndex: NodeIndex): number
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): number => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get incoming edges of undirected graph" })
  }
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(nodeIndex)) {
    throw missingNode(nodeIndex)
  }
  return impl.reverseAdjacency.get(nodeIndex)!.length
})

const getDirectedNeighbors = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
  nodeIndex: NodeIndex,
  direction: Direction
): Array<NodeIndex> => {
  const impl = internal.toImpl(graph)

  if (!graph.mutable) {
    const cache = csr.peek(graph)
    if (cache !== undefined) {
      const node = csr.getNodeIndex(cache, nodeIndex)
      if (node === undefined) {
        return []
      }

      const adjacency = direction === "incoming"
        ? csr.getIncoming(cache)
        : csr.getOutgoing(cache)

      const start = adjacency.rowOffsets[node]
      const result = new Array<NodeIndex>(adjacency.rowOffsets[node + 1] - start)
      for (let i = 0; i < result.length; i++) {
        result[i] = cache.nodeIds[adjacency.columnIndices[start + i]]
      }

      return result
    }
  }

  const adjacencyMap = direction === "incoming"
    ? impl.reverseAdjacency
    : impl.adjacency

  const adjacencyList = adjacencyMap.get(nodeIndex)
  if (adjacencyList === undefined) {
    return []
  }

  const result: Array<NodeIndex> = []
  for (const edgeIndex of adjacencyList) {
    const edge = impl.edges.get(edgeIndex)
    if (edge !== undefined) {
      result.push(direction === "incoming" ? edge.source : edge.target)
    }
  }

  return result
}

const getUniqueDirectedNeighbors = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
  nodeIndex: NodeIndex,
  direction: Direction
): Array<NodeIndex> => {
  const neighbors = getDirectedNeighbors(graph, nodeIndex, direction)
  if (neighbors.length > ScanDegreeLimit) {
    return Array.from(new Set(neighbors))
  }
  // getDirectedNeighbors returns a fresh array, so duplicates are compacted in place
  let length = 0
  for (let i = 0; i < neighbors.length; i++) {
    const neighbor = neighbors[i]
    let j = 0
    while (j < length && neighbors[j] !== neighbor) j++
    if (j === length) neighbors[length++] = neighbor
  }
  neighbors.length = length
  return neighbors
}

const ScanDegreeLimit = 32

/**
 * Returns the neighboring node indices for a node.
 *
 * **Details**
 *
 * For directed graphs, neighbors are the targets of outgoing edges. For
 * undirected graphs, neighbors are the other endpoints of incident edges.
 * Each neighbor appears once in first edge occurrence order, including the
 * queried node when it has a self-loop.
 *
 * **Gotchas**
 *
 * Returns an empty array when the node does not exist. For directed graphs,
 * use `predecessors` when incoming neighbors are required.
 *
 * **Example** (Getting outgoing neighbors)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const nodeC = Graph.addNode(mutable, "Node C")
 *   Graph.addEdge(mutable, nodeA, nodeB, 1)
 *   Graph.addEdge(mutable, nodeA, nodeC, 2)
 * })
 *
 * Graph.neighbors(graph, 0) // => [1, 2]
 * Graph.neighbors(graph, 1) // => []
 * ```
 *
 * @category getters
 * @since 3.18.0
 */
export const neighbors: {
  (
    nodeIndex: NodeIndex
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Array<NodeIndex>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    nodeIndex: NodeIndex
  ): Array<NodeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Array<NodeIndex> => {
  // For undirected graphs, use the specialized helper that returns the other endpoint
  if (graph.type === "undirected") {
    return getUndirectedNeighbors(graph as any, nodeIndex)
  }

  return getUniqueDirectedNeighbors(graph as any, nodeIndex, "outgoing")
})

/**
 * Returns the outgoing neighbor node indices for a node in a directed graph.
 *
 * **When to use**
 *
 * Use when you need the nodes reached by following outgoing edges from a node in
 * a directed graph.
 *
 * Each node appears once in first outgoing edge occurrence order. A self-loop
 * contributes the queried node once.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with an undirected graph. A missing node
 * returns an empty array.
 *
 * @see {@link predecessors} for incoming neighbors in a directed graph
 * @see {@link neighbors} for generic neighbor lookup across graph kinds
 *
 * @category getters
 * @since 4.0.0
 */
export const successors: {
  (
    nodeIndex: NodeIndex
  ): <N, E>(graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">) => Array<NodeIndex>
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    nodeIndex: NodeIndex
  ): Array<NodeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Array<NodeIndex> => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get successors of undirected graph" })
  }
  return getUniqueDirectedNeighbors(graph as any, nodeIndex, "outgoing")
})

/**
 * Returns the incoming neighbor node indices for a node in a directed graph.
 *
 * **When to use**
 *
 * Use when you need the nodes that reach a node by following incoming edges in a
 * directed graph.
 *
 * Each node appears once in first incoming edge occurrence order. A self-loop
 * contributes the queried node once.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with an undirected graph. A missing node
 * returns an empty array.
 *
 * @see {@link successors} for outgoing neighbors in a directed graph
 * @see {@link neighbors} for generic neighbor lookup across graph kinds
 *
 * @category getters
 * @since 4.0.0
 */
export const predecessors: {
  (
    nodeIndex: NodeIndex
  ): <N, E>(graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">) => Array<NodeIndex>
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    nodeIndex: NodeIndex
  ): Array<NodeIndex>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex
): Array<NodeIndex> => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get predecessors of undirected graph" })
  }
  return getUniqueDirectedNeighbors(graph as any, nodeIndex, "incoming")
})

/**
 * Gets directed neighbors of a node in a specific direction.
 *
 * **When to use**
 *
 * Use when maintaining existing code that already passes an explicit traversal
 * direction. New code should prefer `successors` or `predecessors`.
 * Results contain each node once in first edge occurrence order, and a self-loop
 * contributes the queried node once.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with an undirected graph.
 *
 * **Example** (Traversing directed neighbors)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, "A->B")
 * })
 *
 * const nodeA = 0
 * const nodeB = 1
 *
 * // Get outgoing neighbors (nodes that nodeA points to)
 * const outgoing = Graph.neighborsDirected(graph, nodeA, "outgoing")
 *
 * // Get incoming neighbors (nodes that point to nodeB)
 * const incoming = Graph.neighborsDirected(graph, nodeB, "incoming")
 * Array.of(outgoing, incoming) // => [[1], [0]]
 * ```
 *
 * @deprecated Use {@link successors} for outgoing neighbors or {@link predecessors} for incoming neighbors.
 * @see {@link successors} for outgoing neighbors in a directed graph
 * @see {@link predecessors} for incoming neighbors in a directed graph
 * @category getters
 * @since 3.18.0
 */
export const neighborsDirected: {
  (
    nodeIndex: NodeIndex,
    direction: Direction
  ): <N, E>(graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">) => Array<NodeIndex>
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    nodeIndex: NodeIndex,
    direction: Direction
  ): Array<NodeIndex>
} = dual(3, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  nodeIndex: NodeIndex,
  direction: Direction
): Array<NodeIndex> => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot get directed neighbors of undirected graph" })
  }
  return getUniqueDirectedNeighbors(graph as any, nodeIndex, direction)
})

// =============================================================================
// GraphViz Export
// =============================================================================

/**
 * Configuration options for GraphViz DOT format generation from graphs.
 *
 * **When to use**
 *
 * Use when customizing labels or the graph name produced by `toGraphViz`.
 *
 * **Details**
 *
 * These options customize node labels, edge labels, and graph naming in DOT
 * format compatible with GraphViz tools.
 *
 * **Example** (Configuring GraphViz labels)
 *
 * ```ts import.meta.vitest
 * import type { Graph } from "effect"
 *
 * // Basic options with custom labels
 * const basicOptions: Graph.GraphVizOptions<string, number> = {
 *   nodeLabel: (data) => `Node: ${data}`,
 *   edgeLabel: (data) => `Weight: ${data}`
 * }
 *
 * // Complete options with graph naming
 * const namedOptions: Graph.GraphVizOptions<string, string> = {
 *   nodeLabel: (data) => data.toUpperCase(),
 *   edgeLabel: (data) => data,
 *   graphName: "MyDependencyGraph"
 * }
 * Array.of(basicOptions.nodeLabel?.("A"), namedOptions.graphName) // => ["Node: A", "MyDependencyGraph"]
 * ```
 *
 * @see {@link toGraphViz} for generating DOT output
 * @category configuration
 * @since 3.18.0
 */
export interface GraphVizOptions<N, E> {
  /**
   * Function to generate custom labels for nodes.
   * Defaults to String(data) if not provided.
   */
  readonly nodeLabel?: (data: N) => string

  /**
   * Function to generate custom labels for edges.
   * Defaults to String(data) if not provided.
   */
  readonly edgeLabel?: (data: E) => string

  /**
   * Name for the DOT graph.
   * Defaults to "G" if not provided.
   */
  readonly graphName?: string
}

const escapeGraphVizString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r\n|\r|\n/g, "\\n")

/**
 * Exports a graph to GraphViz DOT format for visualization.
 *
 * **When to use**
 *
 * Use when sending graph structure to GraphViz-compatible visualization or
 * documentation tools.
 *
 * **Example** (Exporting GraphViz DOT)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.mutate(Graph.directed<string, number>(), (mutable) => {
 *   const nodeA = Graph.addNode(mutable, "Node A")
 *   const nodeB = Graph.addNode(mutable, "Node B")
 *   const nodeC = Graph.addNode(mutable, "Node C")
 *   Graph.addEdge(mutable, nodeA, nodeB, 1)
 *   Graph.addEdge(mutable, nodeB, nodeC, 2)
 *   Graph.addEdge(mutable, nodeC, nodeA, 3)
 * })
 *
 * Graph.toGraphViz(graph).split("\n") // => ['digraph "G" {', '  "0" [label="Node A"];', '  "1" [label="Node B"];', '  "2" [label="Node C"];', '  "0" -> "1" [label="1"];', '  "1" -> "2" [label="2"];', '  "2" -> "0" [label="3"];', "}"]
 * ```
 *
 * @see {@link toMermaid} for Mermaid diagram output
 * @category converting
 * @since 3.18.0
 */
export const toGraphViz: {
  <N, E>(
    options?: GraphVizOptions<N, E>
  ): <T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => string
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    options?: GraphVizOptions<N, E>
  ): string
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  options?: GraphVizOptions<N, E>
): string => {
  const impl = internal.toImpl(graph)
  const {
    edgeLabel = (data: E) => String(data),
    graphName = "G",
    nodeLabel = (data: N) => String(data)
  } = options ?? {}

  const isDirected = graph.type === "directed"
  const graphType = isDirected ? "digraph" : "graph"
  const edgeOperator = isDirected ? "->" : "--"
  const graphId = `"${escapeGraphVizString(graphName)}"`

  return withMutationGuard(graph, () => {
    const lines: Array<string> = []
    lines.push(`${graphType} ${graphId} {`)

    // Add nodes
    for (const [nodeIndex, nodeData] of impl.nodes) {
      const label = escapeGraphVizString(nodeLabel(nodeData))
      lines.push(`  "${nodeIndex}" [label="${label}"];`)
    }

    // Add edges
    for (const [, edgeData] of impl.edges) {
      const label = escapeGraphVizString(edgeLabel(edgeData.data))
      lines.push(`  "${edgeData.source}" ${edgeOperator} "${edgeData.target}" [label="${label}"];`)
    }

    lines.push("}")
    return lines.join("\n")
  })
})

// =============================================================================
// Mermaid Export
// =============================================================================

/**
 * Mermaid node shape types for diagram visualization.
 *
 * **Details**
 *
 * Each shape produces different visual representations in Mermaid diagrams:
 * - `rectangle`: Standard rectangular nodes `A["label"]`
 * - `rounded`: Rounded rectangular nodes `A("label")`
 * - `circle`: Circular nodes `A(("label"))`
 * - `diamond`: Diamond-shaped nodes `A{"label"}`
 * - `hexagon`: Hexagonal nodes `A{{"label"}}`
 * - `stadium`: Stadium-shaped nodes `A(["label"])`
 * - `subroutine`: Subroutine-style nodes `A[["label"]]`
 * - `cylindrical`: Cylindrical database-style nodes `A[("label")]`
 *
 * **Example** (Selecting Mermaid node shapes)
 *
 * ```ts import.meta.vitest
 * import type { Graph } from "effect"
 *
 * // Shape selector function for different node types
 * const shapeSelector = (nodeData: string): Graph.MermaidNodeShape => {
 *   if (nodeData.includes("start") || nodeData.includes("end")) return "circle"
 *   if (nodeData.includes("decision")) return "diamond"
 *   if (nodeData.includes("process")) return "rectangle"
 *   if (nodeData.includes("data")) return "cylindrical"
 *   return "rounded"
 * }
 *
 * const options: Graph.MermaidOptions<string, string> = {
 *   nodeShape: shapeSelector
 * }
 * options.nodeShape?.("decision") // => "diamond"
 * ```
 *
 * @category models
 * @since 3.18.0
 */
export type MermaidNodeShape =
  | "rectangle" // A["label"]
  | "rounded" // A("label")
  | "circle" // A(("label"))
  | "diamond" // A{"label"}
  | "hexagon" // A{{"label"}}
  | "stadium" // A(["label"])
  | "subroutine" // A[["label"]]
  | "cylindrical" // A[("label")]

/**
 * Mermaid diagram direction types for controlling layout orientation.
 *
 * **Details**
 *
 * Determines the flow direction of nodes and edges in the diagram:
 * - `TB`/`TD`: Top to Bottom (vertical layout, default)
 * - `BT`: Bottom to Top (reverse vertical)
 * - `LR`: Left to Right (horizontal layout)
 * - `RL`: Right to Left (reverse horizontal)
 *
 * **Example** (Configuring Mermaid directions)
 *
 * ```ts import.meta.vitest
 * import type { Graph } from "effect"
 *
 * // Horizontal workflow diagram
 * const horizontalOptions: Graph.MermaidOptions<string, string> = {
 *   direction: "LR"
 * }
 *
 * // Vertical hierarchy (default)
 * const verticalOptions: Graph.MermaidOptions<string, string> = {
 *   direction: "TB"
 * }
 *
 * // Bottom-up flow
 * const bottomUpOptions: Graph.MermaidOptions<string, string> = {
 *   direction: "BT"
 * }
 * Array.of(horizontalOptions.direction, verticalOptions.direction, bottomUpOptions.direction) // => ["LR", "TB", "BT"]
 * ```
 *
 * @category models
 * @since 3.18.0
 */
export type MermaidDirection =
  | "TB" // Top to Bottom (default)
  | "TD" // Top Down (same as TB)
  | "BT" // Bottom to Top
  | "RL" // Right to Left
  | "LR" // Left to Right

/**
 * Mermaid diagram types for different visualization formats.
 *
 * **Details**
 *
 * Specifies the Mermaid diagram syntax to use:
 * - `flowchart`: For directed graphs with arrows (`A --> B`)
 * - `graph`: For undirected graphs with lines (`A --- B`)
 *
 * When not specified, automatically selects based on graph type:
 * directed graphs use "flowchart", undirected graphs use "graph".
 *
 * **Example** (Selecting Mermaid diagram types)
 *
 * ```ts import.meta.vitest
 * import type { Graph } from "effect"
 *
 * // Force flowchart format (even for undirected graphs)
 * const flowchartOptions: Graph.MermaidOptions<string, string> = {
 *   diagramType: "flowchart"
 * }
 *
 * // Force graph format (shows undirected connections)
 * const graphOptions: Graph.MermaidOptions<string, string> = {
 *   diagramType: "graph"
 * }
 *
 * // Auto-detection (recommended, default behavior)
 * const autoOptions: Graph.MermaidOptions<string, string> = {}
 * Array.of(flowchartOptions.diagramType, graphOptions.diagramType, autoOptions.diagramType) // => ["flowchart", "graph", undefined]
 * ```
 *
 * @category models
 * @since 3.18.0
 */
export type MermaidDiagramType =
  | "flowchart" // For directed graphs
  | "graph" // For undirected graphs

/**
 * Configuration options for Mermaid diagram generation from graphs.
 *
 * **When to use**
 *
 * Use when customizing labels, layout, node shapes, or syntax emitted by
 * `toMermaid`.
 *
 * **Details**
 *
 * These options customize node labels, edge labels, diagram type, layout
 * direction and node shapes in Mermaid format.
 *
 * **Example** (Configuring Mermaid output)
 *
 * ```ts import.meta.vitest
 * import type { Graph } from "effect"
 *
 * // Basic options with custom labels
 * const basicOptions: Graph.MermaidOptions<string, number> = {
 *   nodeLabel: (data) => `Node: ${data}`,
 *   edgeLabel: (data) => `Weight: ${data}`
 * }
 *
 * // Advanced options with all features
 * const advancedOptions: Graph.MermaidOptions<string, string> = {
 *   nodeLabel: (data) => data.toUpperCase(),
 *   edgeLabel: (data) => data,
 *   diagramType: "flowchart",
 *   direction: "LR",
 *   nodeShape: (data) => data.includes("start") ? "circle" : "rectangle"
 * }
 * Array.of(basicOptions.nodeLabel?.("A"), advancedOptions.nodeShape?.("start")) // => ["Node: A", "circle"]
 * ```
 *
 * @see {@link toMermaid} for generating Mermaid output
 * @category configuration
 * @since 3.18.0
 */
export interface MermaidOptions<N, E> {
  /**
   * Function to generate custom labels for nodes.
   * Defaults to String(data) if not provided.
   */
  readonly nodeLabel?: (data: N) => string

  /**
   * Function to generate custom labels for edges.
   * Defaults to String(data) if not provided.
   */
  readonly edgeLabel?: (data: E) => string

  /**
   * Diagram type override. If not specified, automatically detects:
   * - "flowchart" for directed graphs
   * - "graph" for undirected graphs
   */
  readonly diagramType?: MermaidDiagramType

  /**
   * Direction for diagram layout.
   * Defaults to "TD" (Top Down) if not provided.
   */
  readonly direction?: MermaidDirection

  /**
   * Function to determine node shape for each node.
   * Defaults to "rectangle" for all nodes if not provided.
   */
  readonly nodeShape?: (data: N) => MermaidNodeShape
}

/**
 * Escapes special characters in labels for Mermaid syntax compatibility.
 */
const escapeMermaidLabel = (label: string): string => {
  // Escape special characters for Mermaid using HTML entity codes
  // According to: https://mermaid.js.org/syntax/flowchart.html#special-characters-that-break-syntax
  return label
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/&/g, "#amp;")
    .replace(/\[/g, "#91;")
    .replace(/\]/g, "#93;")
    .replace(/\{/g, "#123;")
    .replace(/\}/g, "#125;")
    .replace(/\(/g, "#40;")
    .replace(/\)/g, "#41;")
    .replace(/\|/g, "#124;")
    .replace(/\\/g, "#92;")
    .replace(/\r\n|\r|\n/g, "<br/>")
}

/**
 * Formats a Mermaid node with the specified shape and label.
 */
const formatMermaidNode = (
  nodeId: string,
  label: string,
  shape: MermaidNodeShape
): string => {
  switch (shape) {
    case "rectangle":
      return `${nodeId}["${label}"]`
    case "rounded":
      return `${nodeId}("${label}")`
    case "circle":
      return `${nodeId}(("${label}"))`
    case "diamond":
      return `${nodeId}{"${label}"}`
    case "hexagon":
      return `${nodeId}{{"${label}"}}`
    case "stadium":
      return `${nodeId}(["${label}"])`
    case "subroutine":
      return `${nodeId}[["${label}"]]`
    case "cylindrical":
      return `${nodeId}[("${label}")]`
    default:
      return `${nodeId}["${label}"]` // Default rectangle
  }
}

/**
 * Exports a graph to Mermaid diagram format for visualization.
 *
 * **When to use**
 *
 * Use when embedding graph diagrams in Markdown, documentation sites, or other
 * Mermaid-compatible tools.
 *
 * **Details**
 *
 * Directed graphs default to `flowchart` with arrow edges, while undirected
 * graphs default to `graph` with line edges. Labels and node shapes can be
 * customized with `MermaidOptions`.
 *
 * **Example** (Exporting a Mermaid diagram)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const app = Graph.addNode(mutable, "App")
 *   const database = Graph.addNode(mutable, "Database")
 *   Graph.addEdge(mutable, app, database, "queries")
 * })
 *
 * Graph.toMermaid(graph).split("\n") // => ["flowchart TD", '  0["App"]', '  1["Database"]', '  0 -->|"queries"| 1']
 * ```
 *
 * @see {@link toGraphViz} for GraphViz DOT output
 * @category converting
 * @since 3.18.0
 */
export const toMermaid: {
  <N, E>(
    options?: MermaidOptions<N, E>
  ): <T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => string
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    options?: MermaidOptions<N, E>
  ): string
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  options?: MermaidOptions<N, E>
): string => {
  const impl = internal.toImpl(graph)
  // Extract and validate options with defaults
  const {
    diagramType,
    direction = "TD",
    edgeLabel = (data: E) => String(data),
    nodeLabel = (data: N) => String(data),
    nodeShape = () => "rectangle" as const
  } = options ?? {}

  // Auto-detect diagram type if not specified
  const finalDiagramType = diagramType ??
    (graph.type === "directed" ? "flowchart" : "graph")

  return withMutationGuard(graph, () => {
    // Generate diagram header
    const lines: Array<string> = []
    lines.push(`${finalDiagramType} ${direction}`)

    // Add nodes
    for (const [nodeIndex, nodeData] of impl.nodes) {
      const nodeId = String(nodeIndex)
      const label = escapeMermaidLabel(nodeLabel(nodeData))
      const shape = nodeShape(nodeData)
      const formattedNode = formatMermaidNode(nodeId, label, shape)
      lines.push(`  ${formattedNode}`)
    }

    // Add edges
    const edgeOperator = finalDiagramType === "flowchart" ? "-->" : "---"
    for (const [, edgeData] of impl.edges) {
      const sourceId = String(edgeData.source)
      const targetId = String(edgeData.target)
      const label = escapeMermaidLabel(edgeLabel(edgeData.data))

      if (label) {
        lines.push(`  ${sourceId} ${edgeOperator}|"${label}"| ${targetId}`)
      } else {
        lines.push(`  ${sourceId} ${edgeOperator} ${targetId}`)
      }
    }

    return lines.join("\n")
  })
})

// =============================================================================
// Edge Direction Types
// =============================================================================

/**
 * Direction of directed edges relative to a node.
 *
 * **Details**
 *
 * `"outgoing"` selects edges whose source is the node, while `"incoming"`
 * selects edges whose target is the node.
 *
 * @category models
 * @since 3.18.0
 */
export type Direction = "outgoing" | "incoming"

/**
 * Controls how traversal follows directed edges.
 *
 * **Details**
 *
 * `"outgoing"` follows edges from source to target, `"incoming"` follows them
 * from target to source, and `"undirected"` allows traversal in either
 * direction.
 *
 * **Example** (Traversing by direction)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A-B")
 *   Graph.addEdge(mutable, a, c, "A-C")
 * })
 *
 * Array.from(Graph.indices(Graph.bfs(graph, { start: [0], direction: "outgoing" }))) // => [0, 1, 2]
 * Array.from(Graph.indices(Graph.bfs(graph, { start: [1], direction: "incoming" }))) // => [1, 0]
 * Array.from(Graph.indices(Graph.bfs(graph, { start: [1], direction: "undirected" }))) // => [1, 0, 2]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type TraversalDirection = Direction | "undirected"

// =============================================================================
// Graph Structure Analysis Algorithms
// =============================================================================

/**
 * A cycle witness containing a closed node path and its traversed edges.
 *
 * **Details**
 *
 * `path` repeats its first node at the end, so `edges.length` is always
 * `path.length - 1`.
 *
 * @category models
 * @since 4.0.0
 */
export interface CycleResult {
  readonly path: Array<NodeIndex>
  readonly edges: Array<EdgeIndex>
}

/**
 * Returns one cycle in a graph, if present.
 *
 * **When to use**
 *
 * Use when you need the nodes and edges of a concrete cycle for diagnostics or
 * reporting.
 *
 * **Details**
 *
 * Directed cycles respect edge orientation. A self-loop is represented as a
 * one-edge cycle, and two parallel undirected edges form a two-edge cycle.
 *
 * @see {@link isAcyclic} when only a boolean cycle check is needed
 * @category algorithms
 * @since 4.0.0
 */
export const findCycle = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): Option.Option<CycleResult> => {
  const impl = internal.toImpl(graph)
  const colors = new Map<NodeIndex, 0 | 1 | 2>()
  const parentNodes = new Map<NodeIndex, NodeIndex>()
  const parentEdges = new Map<NodeIndex, EdgeIndex>()

  const makeCycle = (ancestor: NodeIndex, current: NodeIndex, closingEdge: EdgeIndex): CycleResult => {
    const path = [current]
    const edges: Array<EdgeIndex> = []
    let cursor = current
    while (cursor !== ancestor) {
      edges.push(parentEdges.get(cursor)!)
      cursor = parentNodes.get(cursor)!
      path.push(cursor)
    }
    path.reverse()
    edges.reverse()
    path.push(ancestor)
    edges.push(closingEdge)
    return { path, edges }
  }

  for (const start of impl.nodes.keys()) {
    if ((colors.get(start) ?? 0) !== 0) {
      continue
    }
    colors.set(start, 1)
    const stack: Array<{ readonly node: NodeIndex; position: number }> = [{ node: start, position: 0 }]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const adjacency = impl.adjacency.get(frame.node)!
      if (frame.position >= adjacency.length) {
        colors.set(frame.node, 2)
        stack.pop()
        continue
      }

      const edgeIndex = adjacency[frame.position++]
      if (graph.type === "undirected" && parentEdges.get(frame.node) === edgeIndex) {
        continue
      }
      const edge = impl.edges.get(edgeIndex)!
      const neighbor = getTraversableNeighbor(graph, frame.node, edge)
      const color = colors.get(neighbor) ?? 0
      if (color === 1) {
        return Option.some(makeCycle(neighbor, frame.node, edgeIndex))
      }
      if (color === 0) {
        colors.set(neighbor, 1)
        parentNodes.set(neighbor, frame.node)
        parentEdges.set(neighbor, edgeIndex)
        stack.push({ node: neighbor, position: 0 })
      }
    }
  }
  return Option.none()
}

/**
 * Checks whether the graph is acyclic (contains no cycles).
 *
 * **When to use**
 *
 * Use when validating that a graph contains no cycle and a cycle witness is
 * not needed.
 *
 * **Details**
 *
 * Directed cycles respect edge orientation. Self-loops are cycles, and two
 * parallel edges form a cycle in an undirected graph.
 *
 * **Example** (Checking cycles)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * // Acyclic directed graph (DAG)
 * const dag = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A->B")
 *   Graph.addEdge(mutable, b, c, "B->C")
 * })
 * Graph.isAcyclic(dag) // => true
 *
 * // Cyclic directed graph
 * const cyclic = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, "A->B")
 *   Graph.addEdge(mutable, b, a, "B->A") // Creates cycle
 * })
 * Graph.isAcyclic(cyclic) // => false
 * ```
 *
 * @see {@link findCycle} for retrieving one cycle witness
 * @see {@link topo} for ordering a directed acyclic graph
 * @category algorithms
 * @since 3.18.0
 */
export const isAcyclic = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): boolean => {
  const impl = internal.toImpl(graph)
  // Use existing cycle flag if available
  if (Option.isSome(impl.acyclic)) {
    return impl.acyclic.value
  }

  const cache = csr.get(graph)
  const outgoing = csr.getOutgoingWithEdges(cache)
  if (graph.type === "undirected") {
    // Each undirected edge occurs in both endpoint rows; ignore only the edge used to enter the node.
    const visited = new Uint8Array(cache.nodeIds.length)
    const stack: Array<number> = []
    const parentEdges: Array<number> = []

    for (let start = 0; start < cache.nodeIds.length; start++) {
      if (visited[start] !== 0) {
        continue
      }
      visited[start] = 1
      stack.push(start)
      parentEdges.push(-1)

      while (stack.length > 0) {
        const node = stack.pop()!
        const parentEdge = parentEdges.pop()!
        for (let i = outgoing.rowOffsets[node]; i < outgoing.rowOffsets[node + 1]; i++) {
          const edge = outgoing.edgeIndices[i]
          if (edge === parentEdge) {
            continue
          }
          const neighbor = outgoing.columnIndices[i]
          if (visited[neighbor] !== 0) {
            impl.acyclic = Option.some(false)
            return false
          }
          visited[neighbor] = 1
          stack.push(neighbor)
          parentEdges.push(edge)
        }
      }
    }
  } else {
    // Colors encode unseen, active, and finished nodes; row positions make the recursive DFS stack explicit.
    const colors = new Uint8Array(cache.nodeIds.length)
    const stack: Array<number> = []
    const positions: Array<number> = []

    for (let start = 0; start < cache.nodeIds.length; start++) {
      if (colors[start] !== 0) {
        continue
      }
      colors[start] = 1
      stack.push(start)
      positions.push(outgoing.rowOffsets[start])

      while (stack.length > 0) {
        const frame = stack.length - 1
        const node = stack[frame]
        const position = positions[frame]
        if (position < outgoing.rowOffsets[node + 1]) {
          positions[frame] = position + 1
          const neighbor = outgoing.columnIndices[position]
          if (colors[neighbor] === 1) {
            impl.acyclic = Option.some(false)
            return false
          }
          if (colors[neighbor] === 0) {
            colors[neighbor] = 1
            stack.push(neighbor)
            positions.push(outgoing.rowOffsets[neighbor])
          }
        } else {
          colors[node] = 2
          stack.pop()
          positions.pop()
        }
      }
    }
  }

  impl.acyclic = Option.some(true)
  return true
}

/**
 * Checks whether an undirected graph is bipartite.
 *
 * **When to use**
 *
 * Use when validating that nodes can be divided into two groups with every
 * edge crossing between the groups.
 *
 * **Details**
 *
 * A bipartite graph is one whose vertices can be divided into two disjoint sets
 * such that no two vertices within the same set are adjacent.
 *
 * **Example** (Checking bipartite graphs)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * // Bipartite graph (alternating coloring possible)
 * const bipartite = Graph.undirected<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   const d = Graph.addNode(mutable, "D")
 *   Graph.addEdge(mutable, a, b, "edge") // Set 1: {A, C}, Set 2: {B, D}
 *   Graph.addEdge(mutable, b, c, "edge")
 *   Graph.addEdge(mutable, c, d, "edge")
 * })
 * Graph.isBipartite(bipartite) // => true
 *
 * // Non-bipartite graph (odd cycle)
 * const triangle = Graph.undirected<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "edge")
 *   Graph.addEdge(mutable, b, c, "edge")
 *   Graph.addEdge(mutable, c, a, "edge") // Triangle (3-cycle)
 * })
 * Graph.isBipartite(triangle) // => false
 * ```
 *
 * @see {@link maximumBipartiteMatching} for matching nodes after validation
 * @category algorithms
 * @since 3.18.0
 */
export const isBipartite = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): boolean => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot determine bipartite status of directed graph" })
  }
  const cache = csr.get(graph)
  const outgoing = csr.getOutgoing(cache)
  // -1 is uncolored; compact indices let coloring and the queue stay in typed arrays.
  const colors = new Int8Array(cache.nodeIds.length)
  const queue = new Uint32Array(cache.nodeIds.length)
  colors.fill(-1)
  let head = 0
  let tail = 0

  for (let start = 0; start < cache.nodeIds.length; start++) {
    if (colors[start] !== -1) {
      continue
    }
    colors[start] = 0
    queue[tail++] = start

    while (head < tail) {
      const current = queue[head++]
      const neighborColor = colors[current] === 0 ? 1 : 0
      for (let i = outgoing.rowOffsets[current]; i < outgoing.rowOffsets[current + 1]; i++) {
        const neighbor = outgoing.columnIndices[i]
        if (colors[neighbor] === -1) {
          colors[neighbor] = neighborColor
          queue[tail++] = neighbor
        } else if (colors[neighbor] === colors[current]) {
          return false
        }
      }
    }
  }

  return true
}

/**
 * A pair of matched nodes and the edge that realizes the match.
 *
 * **Details**
 *
 * `left` and `right` refer to the bipartition derived by
 * `maximumBipartiteMatching`, not to the stored edge orientation.
 *
 * @category models
 * @since 4.0.0
 */
export interface BipartiteMatch {
  readonly left: NodeIndex
  readonly right: NodeIndex
  readonly edge: EdgeIndex
}

/** @internal */
const bipartiteColors = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): { readonly cache: csr.Csr; readonly colors: Int8Array } => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot find bipartite matching of directed graph" })
  }
  const cache = csr.get(graph)
  const outgoing = csr.getOutgoing(cache)
  const colors = new Int8Array(cache.nodeIds.length)
  const queue = new Uint32Array(cache.nodeIds.length)
  colors.fill(-1)

  for (let start = 0; start < cache.nodeIds.length; start++) {
    if (colors[start] !== -1) {
      continue
    }
    let head = 0
    let tail = 1
    colors[start] = 0
    queue[0] = start
    while (head < tail) {
      const node = queue[head++]
      const color = colors[node] === 0 ? 1 : 0
      for (let i = outgoing.rowOffsets[node]; i < outgoing.rowOffsets[node + 1]; i++) {
        const neighbor = outgoing.columnIndices[i]
        if (colors[neighbor] === -1) {
          colors[neighbor] = color
          queue[tail++] = neighbor
        } else if (colors[neighbor] === colors[node]) {
          throw new GraphError({ message: "Cannot find bipartite matching of non-bipartite graph" })
        }
      }
    }
  }
  return { cache, colors }
}

/**
 * Returns a maximum-cardinality matching of an undirected bipartite graph.
 *
 * **When to use**
 *
 * Use when assigning as many disjoint pairs as possible between the two sides
 * of a bipartite graph, such as workers to jobs or users to resources.
 *
 * **Details**
 *
 * The bipartition is derived internally. Self-loops and odd cycles throw a
 * `GraphError`. Isolated nodes are allowed. Parallel edges do not change the
 * matching cardinality, and the first edge in graph order between each matched
 * pair is reported. Results follow left-partition graph order. Hopcroft-Karp
 * runs in `O(E * sqrt(V))` time.
 *
 * **Gotchas**
 *
 * The graph must be undirected and bipartite. The derived left and right sides
 * are not based on stored edge orientation.
 *
 * **Example** (Matching a bipartite graph)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.undirected<string, string>((mutable) => {
 *   for (const node of ["A", "B", "X", "Y"]) Graph.addNode(mutable, node)
 *   Graph.addEdge(mutable, 0, 2, "A-X")
 *   Graph.addEdge(mutable, 0, 3, "A-Y")
 *   Graph.addEdge(mutable, 1, 2, "B-X")
 * })
 *
 * Graph.maximumBipartiteMatching(graph) // => [{ left: 0, right: 3, edge: 1 }, { left: 1, right: 2, edge: 2 }]
 * ```
 *
 * @see {@link isBipartite} for validating the graph without computing a matching
 * @category algorithms
 * @since 4.0.0
 */
export const maximumBipartiteMatching = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): Array<BipartiteMatch> => {
  const { cache, colors } = bipartiteColors(graph)
  const endpoints = csr.getEdgeEndpoints(cache)
  const edgeIds = csr.getEdgeIds(cache)
  const adjacency: Array<Array<{ readonly right: number; readonly edge: number }>> = Array.from({
    length: cache.nodeIds.length
  }, () => [])
  const seen = Array.from({ length: cache.nodeIds.length }, () => new Set<number>())

  for (let edge = 0; edge < edgeIds.length; edge++) {
    const source = endpoints.sources[edge]
    const target = endpoints.targets[edge]
    const left = colors[source] === 0 ? source : target
    const right = colors[source] === 0 ? target : source
    if (!seen[left].has(right)) {
      seen[left].add(right)
      adjacency[left].push({ right, edge })
    }
  }

  const unmatched = -1
  const infinity = 0x7fffffff
  const matchLeft = new Int32Array(cache.nodeIds.length)
  const matchRight = new Int32Array(cache.nodeIds.length)
  const matchEdge = new Int32Array(cache.nodeIds.length)
  const distance = new Int32Array(cache.nodeIds.length)
  const queue = new Uint32Array(cache.nodeIds.length)
  matchLeft.fill(unmatched)
  matchRight.fill(unmatched)
  matchEdge.fill(unmatched)
  let shortestDistance = infinity

  const hasLayer = (): boolean => {
    let head = 0
    let tail = 0
    shortestDistance = infinity
    for (let left = 0; left < colors.length; left++) {
      if (colors[left] !== 0) {
        continue
      }
      if (matchLeft[left] === unmatched) {
        distance[left] = 0
        queue[tail++] = left
      } else {
        distance[left] = infinity
      }
    }
    while (head < tail) {
      const left = queue[head++]
      if (distance[left] >= shortestDistance) {
        continue
      }
      for (const arc of adjacency[left]) {
        const next = matchRight[arc.right]
        if (next === unmatched) {
          shortestDistance = distance[left] + 1
        } else if (distance[next] === infinity) {
          distance[next] = distance[left] + 1
          queue[tail++] = next
        }
      }
    }
    return shortestDistance !== infinity
  }

  const augment = (start: number): boolean => {
    const stack: Array<{
      readonly left: number
      position: number
      readonly viaRight: number
      readonly viaEdge: number
    }> = [{ left: start, position: 0, viaRight: unmatched, viaEdge: unmatched }]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const arcs = adjacency[frame.left]
      if (frame.position >= arcs.length) {
        distance[frame.left] = infinity
        stack.pop()
        continue
      }
      const arc = arcs[frame.position++]
      const next = matchRight[arc.right]
      if (next === unmatched && distance[frame.left] + 1 === shortestDistance) {
        matchLeft[frame.left] = arc.right
        matchRight[arc.right] = frame.left
        matchEdge[frame.left] = arc.edge
        for (let i = stack.length - 1; i > 0; i--) {
          const child = stack[i]
          const parent = stack[i - 1]
          matchLeft[parent.left] = child.viaRight
          matchRight[child.viaRight] = parent.left
          matchEdge[parent.left] = child.viaEdge
        }
        return true
      }
      if (next === unmatched) {
        continue
      }
      if (distance[next] === distance[frame.left] + 1) {
        stack.push({ left: next, position: 0, viaRight: arc.right, viaEdge: arc.edge })
      }
    }
    return false
  }

  while (hasLayer()) {
    for (let left = 0; left < colors.length; left++) {
      if (colors[left] === 0 && matchLeft[left] === unmatched) {
        augment(left)
      }
    }
  }

  const matches: Array<BipartiteMatch> = []
  for (let left = 0; left < colors.length; left++) {
    if (matchLeft[left] !== unmatched) {
      matches.push({
        left: cache.nodeIds[left],
        right: cache.nodeIds[matchLeft[left]],
        edge: edgeIds[matchEdge[left]]
      })
    }
  }
  return matches
}

/**
 * Get neighbors for undirected graphs by checking both adjacency and reverse adjacency.
 * For undirected graphs, we need to find the other endpoint of each edge incident to the node.
 */
const getUndirectedNeighbors = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">,
  nodeIndex: NodeIndex
): Array<NodeIndex> => {
  const impl = internal.toImpl(graph)
  const neighbors = new Set<NodeIndex>()

  // Check edges where this node is the source
  const adjacencyList = impl.adjacency.get(nodeIndex)
  if (adjacencyList !== undefined) {
    for (const edgeIndex of adjacencyList) {
      const edge = impl.edges.get(edgeIndex)
      if (edge !== undefined) {
        // For undirected graphs, the neighbor is the other endpoint
        const otherNode = edge.source === nodeIndex ? edge.target : edge.source
        neighbors.add(otherNode)
      }
    }
  }

  return Array.from(neighbors)
}

const getTraversableNeighbor = <N, E, T extends Kind>(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  current: NodeIndex,
  edge: Edge<E>
): NodeIndex => graph.type === "undirected" && edge.target === current ? edge.source : edge.target

/**
 * Configuration for unweighted reachability queries.
 *
 * **When to use**
 *
 * Use when controlling whether reachability follows outgoing edges, incoming
 * edges, or either direction.
 *
 * **Details**
 *
 * `direction` defaults to `"outgoing"` and is ignored for undirected graphs.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface ReachabilityConfig {
  readonly direction?: TraversalDirection
}

const getUnweightedDistances = <N, E, T extends Kind>(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  source: NodeIndex,
  direction: TraversalDirection
): Map<NodeIndex, number> => {
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(source)) {
    throw missingNode(source)
  }

  const cache = csr.get(graph)
  const sourceNode = csr.getNodeIndex(cache, source)!
  const adjacencies = csr.getAdjacencies(cache, graph.type === "undirected" ? "outgoing" : direction)
  const compactDistances = new Int32Array(cache.nodeIds.length)
  compactDistances.fill(-1)
  compactDistances[sourceNode] = 0
  const queue = new Uint32Array(cache.nodeIds.length)
  let head = 0
  let tail = 0
  queue[tail++] = sourceNode

  const visit = (adjacency: csr.Adjacency, current: number) => {
    for (let i = adjacency.rowOffsets[current]; i < adjacency.rowOffsets[current + 1]; i++) {
      const neighbor = adjacency.columnIndices[i]
      if (compactDistances[neighbor] === -1) {
        compactDistances[neighbor] = compactDistances[current] + 1
        queue[tail++] = neighbor
      }
    }
  }
  while (head < tail) {
    const current = queue[head++]
    visit(adjacencies.primary, current)
    if (adjacencies.secondary !== undefined) {
      visit(adjacencies.secondary, current)
    }
  }

  const result = new Map<NodeIndex, number>()
  for (let i = 0; i < cache.nodeIds.length; i++) {
    if (compactDistances[i] !== -1) {
      result.set(cache.nodeIds[i], compactDistances[i])
    }
  }
  return result
}

/**
 * Returns minimum unweighted distances from a source to every reachable node.
 *
 * **When to use**
 *
 * Use when every edge represents one step and you need hop counts from one
 * source.
 *
 * **Details**
 *
 * Directed traversal is outgoing by default and can be changed with
 * `direction`.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when the source does not exist.
 *
 * @see {@link hasPath} when only a reachability boolean is needed
 * @see {@link bfs} for lazy traversal in increasing hop distance
 * @see {@link dijkstra} for weighted shortest paths
 *
 * @category algorithms
 * @since 4.0.0
 */
export const unweightedDistances: {
  (source: NodeIndex, options?: ReachabilityConfig): <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => Map<NodeIndex, number>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    source: NodeIndex,
    options?: ReachabilityConfig
  ): Map<NodeIndex, number>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  source: NodeIndex,
  options?: ReachabilityConfig
): Map<NodeIndex, number> => getUnweightedDistances(graph, source, options?.direction ?? "outgoing"))

/**
 * Tests whether a target is reachable from a source.
 *
 * **When to use**
 *
 * Use when you only need a reachability boolean rather than distances or a
 * reconstructed path.
 *
 * **Details**
 *
 * Directed traversal is outgoing by default and can be changed with
 * `direction`. A node is reachable from itself.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when either endpoint does not exist.
 *
 * @see {@link unweightedDistances} for hop distances to all reachable nodes
 * @see {@link dijkstra} for a minimum-cost path
 *
 * @category predicates
 * @since 4.0.0
 */
export const hasPath: {
  (source: NodeIndex, target: NodeIndex, options?: ReachabilityConfig): <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => boolean
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    source: NodeIndex,
    target: NodeIndex,
    options?: ReachabilityConfig
  ): boolean
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  source: NodeIndex,
  target: NodeIndex,
  options?: ReachabilityConfig
): boolean => {
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(source)) {
    throw missingNode(source)
  }
  if (!impl.nodes.has(target)) {
    throw missingNode(target)
  }
  if (source === target) {
    return true
  }

  const cache = csr.get(graph)
  const sourceNode = csr.getNodeIndex(cache, source)!
  const targetNode = csr.getNodeIndex(cache, target)!
  const adjacencies = csr.getAdjacencies(
    cache,
    graph.type === "undirected" ? "outgoing" : options?.direction ?? "outgoing"
  )
  const visited = new Uint8Array(cache.nodeIds.length)
  const queue = new Uint32Array(cache.nodeIds.length)
  let head = 0
  let tail = 1
  visited[sourceNode] = 1
  queue[0] = sourceNode

  while (head < tail) {
    const current = queue[head++]
    const primary = adjacencies.primary
    for (let i = primary.rowOffsets[current]; i < primary.rowOffsets[current + 1]; i++) {
      const neighbor = primary.columnIndices[i]
      if (neighbor === targetNode) {
        return true
      }
      if (visited[neighbor] === 0) {
        visited[neighbor] = 1
        queue[tail++] = neighbor
      }
    }
    const secondary = adjacencies.secondary
    if (secondary !== undefined) {
      for (let i = secondary.rowOffsets[current]; i < secondary.rowOffsets[current + 1]; i++) {
        const neighbor = secondary.columnIndices[i]
        if (neighbor === targetNode) {
          return true
        }
        if (visited[neighbor] === 0) {
          visited[neighbor] = 1
          queue[tail++] = neighbor
        }
      }
    }
  }
  return false
})

/**
 * Returns the connected components of an undirected graph.
 *
 * **When to use**
 *
 * Use when partitioning an undirected graph into groups connected by paths.
 *
 * **Details**
 *
 * Each component is represented as an array of node indices. Isolated nodes
 * form singleton components.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with a directed graph.
 *
 * **Example** (Finding connected components)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.undirected<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   const d = Graph.addNode(mutable, "D")
 *   Graph.addEdge(mutable, a, b, "edge") // Component 1: A-B
 *   Graph.addEdge(mutable, c, d, "edge") // Component 2: C-D
 * })
 *
 * Graph.connectedComponents(graph) // => [[0, 1], [2, 3]]
 * ```
 *
 * @see {@link isConnected} when only a boolean connectivity check is needed
 * @see {@link weaklyConnectedComponents} for directed graphs with orientation ignored
 * @see {@link stronglyConnectedComponents} for mutual directed reachability
 * @category algorithms
 * @since 3.18.0
 */
export const connectedComponents = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): Array<Array<NodeIndex>> => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot find connected components of directed graph" })
  }
  const cache = csr.get(graph)
  const outgoing = csr.getOutgoing(cache)
  const visited = new Uint8Array(cache.nodeIds.length)
  const neighborMarks = new Uint32Array(cache.nodeIds.length)
  const components: Array<Array<NodeIndex>> = []
  let neighborGeneration = 0

  for (let start = 0; start < cache.nodeIds.length; start++) {
    if (visited[start] !== 0) {
      continue
    }
    const component: Array<NodeIndex> = []
    const stack: Array<number> = [start]

    while (stack.length > 0) {
      const current = stack.pop()!
      if (visited[current] !== 0) {
        continue
      }
      visited[current] = 1
      component.push(cache.nodeIds[current])

      // Generation marks deduplicate parallel-edge neighbors without clearing a full-sized array per node.
      neighborGeneration++
      for (let i = outgoing.rowOffsets[current]; i < outgoing.rowOffsets[current + 1]; i++) {
        const neighbor = outgoing.columnIndices[i]
        if (neighborMarks[neighbor] !== neighborGeneration) {
          neighborMarks[neighbor] = neighborGeneration
          if (visited[neighbor] === 0) {
            stack.push(neighbor)
          }
        }
      }
    }

    components.push(component)
  }

  return components
}

/** @internal */
interface LowLinkResult {
  readonly bridges: Array<EdgeIndex>
  readonly articulationPoints: Array<NodeIndex>
  readonly biconnectedComponents: Array<Array<NodeIndex>>
}

/** @internal */
const analyzeLowLinks = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): LowLinkResult => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot analyze undirected connectivity of directed graph" })
  }
  const cache = csr.get(graph)
  const outgoing = csr.getOutgoingWithEdges(cache)
  const edgeIds = csr.getEdgeIds(cache)
  const endpoints = csr.getEdgeEndpoints(cache)
  const discovered = new Int32Array(cache.nodeIds.length)
  const low = new Int32Array(cache.nodeIds.length)
  const parentNode = new Int32Array(cache.nodeIds.length)
  const parentEdge = new Int32Array(cache.nodeIds.length)
  const childCount = new Uint32Array(cache.nodeIds.length)
  const bridgeMarks = new Uint8Array(edgeIds.length)
  const articulationMarks = new Uint8Array(cache.nodeIds.length)
  const edgeStack: Array<number> = []
  const components: Array<Array<number>> = []
  const loopNodes = new Set<number>()
  discovered.fill(-1)
  parentNode.fill(-1)
  parentEdge.fill(-1)
  let time = 0

  const popComponent = (stopEdge: number): void => {
    const nodes = new Set<number>()
    while (edgeStack.length > 0) {
      const edge = edgeStack.pop()!
      nodes.add(endpoints.sources[edge])
      nodes.add(endpoints.targets[edge])
      if (edge === stopEdge) {
        break
      }
    }
    if (nodes.size > 0) {
      components.push(Array.from(nodes).sort((a, b) => a - b))
    }
  }

  for (let start = 0; start < cache.nodeIds.length; start++) {
    if (discovered[start] !== -1) {
      continue
    }
    discovered[start] = low[start] = time++
    const stack: Array<{ readonly node: number; position: number }> = [{
      node: start,
      position: outgoing.rowOffsets[start]
    }]

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const end = outgoing.rowOffsets[frame.node + 1]
      if (frame.position < end) {
        const position = frame.position++
        const edge = outgoing.edgeIndices[position]
        const neighbor = outgoing.columnIndices[position]
        if (neighbor === frame.node) {
          loopNodes.add(frame.node)
          continue
        }
        if (edge === parentEdge[frame.node]) {
          continue
        }
        if (discovered[neighbor] === -1) {
          childCount[frame.node]++
          parentNode[neighbor] = frame.node
          parentEdge[neighbor] = edge
          discovered[neighbor] = low[neighbor] = time++
          edgeStack.push(edge)
          stack.push({ node: neighbor, position: outgoing.rowOffsets[neighbor] })
        } else if (discovered[neighbor] < discovered[frame.node]) {
          low[frame.node] = Math.min(low[frame.node], discovered[neighbor])
          edgeStack.push(edge)
        }
        continue
      }

      stack.pop()
      const parent = parentNode[frame.node]
      if (parent === -1) {
        if (childCount[frame.node] > 1) {
          articulationMarks[frame.node] = 1
        }
      } else {
        low[parent] = Math.min(low[parent], low[frame.node])
        if (low[frame.node] > discovered[parent]) {
          bridgeMarks[parentEdge[frame.node]] = 1
        }
        if (low[frame.node] >= discovered[parent]) {
          if (parentNode[parent] !== -1) {
            articulationMarks[parent] = 1
          }
          popComponent(parentEdge[frame.node])
        }
      }
    }
  }

  for (const node of loopNodes) {
    components.push([node])
  }
  components.sort((left, right) => {
    const length = Math.min(left.length, right.length)
    for (let i = 0; i < length; i++) {
      if (left[i] !== right[i]) {
        return left[i] - right[i]
      }
    }
    return left.length - right.length
  })

  const resultBridges: Array<EdgeIndex> = []
  for (let edge = 0; edge < edgeIds.length; edge++) {
    if (bridgeMarks[edge] !== 0) {
      resultBridges.push(edgeIds[edge])
    }
  }
  const resultArticulationPoints: Array<NodeIndex> = []
  for (let node = 0; node < cache.nodeIds.length; node++) {
    if (articulationMarks[node] !== 0) {
      resultArticulationPoints.push(cache.nodeIds[node])
    }
  }
  return {
    bridges: resultBridges,
    articulationPoints: resultArticulationPoints,
    biconnectedComponents: components.map((component) => component.map((node) => cache.nodeIds[node]))
  }
}

/**
 * Returns the edges whose removal increases the number of connected components.
 *
 * **When to use**
 *
 * Use when locating single-edge failure points in an undirected network.
 *
 * **Details**
 *
 * Parent edges are tracked by edge index, so a parallel edge prevents either
 * edge from being a bridge. Self-loops are never bridges. Results follow graph
 * edge order. The iterative low-link traversal is stack-safe and runs in
 * `O(V + E)` time.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with a directed graph.
 *
 * **Example** (Finding bridge edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.undirected<void, void>((mutable) => {
 *   for (let i = 0; i < 3; i++) Graph.addNode(mutable, undefined)
 *   Graph.addEdge(mutable, 0, 1, undefined)
 *   Graph.addEdge(mutable, 1, 2, undefined)
 * })
 *
 * Graph.bridges(graph) // => [0, 1]
 * ```
 *
 * @see {@link articulationPoints} for single-node failure points
 * @see {@link biconnectedComponents} for maximal regions without an articulation split
 * @category algorithms
 * @since 4.0.0
 */
export const bridges = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): Array<EdgeIndex> => analyzeLowLinks(graph).bridges

/**
 * Returns the nodes whose removal increases the number of connected components.
 *
 * **When to use**
 *
 * Use when locating single-node failure points in an undirected network.
 *
 * **Details**
 *
 * Disconnected components, parallel edges, and self-loops are handled by an
 * iterative, stack-safe low-link traversal in `O(V + E)` time. Results follow
 * graph node order.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with a directed graph.
 *
 * **Example** (Finding articulation points)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.undirected<void, void>((mutable) => {
 *   for (let i = 0; i < 3; i++) Graph.addNode(mutable, undefined)
 *   Graph.addEdge(mutable, 0, 1, undefined)
 *   Graph.addEdge(mutable, 1, 2, undefined)
 * })
 *
 * Graph.articulationPoints(graph) // => [1]
 * ```
 *
 * @see {@link bridges} for single-edge failure points
 * @see {@link biconnectedComponents} for the regions joined at articulation points
 * @category algorithms
 * @since 4.0.0
 */
export const articulationPoints = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): Array<NodeIndex> => analyzeLowLinks(graph).articulationPoints

/**
 * Returns the maximal biconnected node components of an undirected graph.
 *
 * **When to use**
 *
 * Use when decomposing an undirected graph into maximal regions that remain
 * connected after removing any one node from the region.
 *
 * **Details**
 *
 * Articulation points can occur in more than one component. Isolated vertices
 * are excluded, while a vertex with a self-loop forms a singleton component.
 * Nodes within components and the components themselves follow graph order.
 * Parallel edges are treated independently. The iterative low-link traversal
 * is stack-safe and runs in `O(V + E)` time.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with a directed graph.
 *
 * **Example** (Finding biconnected components)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.undirected<void, void>((mutable) => {
 *   for (let i = 0; i < 5; i++) Graph.addNode(mutable, undefined)
 *   Graph.addEdge(mutable, 0, 1, undefined)
 *   Graph.addEdge(mutable, 1, 2, undefined)
 *   Graph.addEdge(mutable, 2, 0, undefined)
 *   Graph.addEdge(mutable, 2, 3, undefined)
 *   Graph.addEdge(mutable, 3, 4, undefined)
 *   Graph.addEdge(mutable, 4, 2, undefined)
 * })
 *
 * Graph.biconnectedComponents(graph) // => [[0, 1, 2], [2, 3, 4]]
 * ```
 *
 * @see {@link articulationPoints} for the nodes shared between components
 * @see {@link bridges} for edges whose removal disconnects the graph
 * @category algorithms
 * @since 4.0.0
 */
export const biconnectedComponents = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): Array<Array<NodeIndex>> => analyzeLowLinks(graph).biconnectedComponents

/**
 * Configuration for source-to-target flow algorithms.
 *
 * **When to use**
 *
 * Use when defining endpoints and edge capacities for `maximumFlow` or
 * `minimumCut`.
 *
 * **Details**
 *
 * `capacity` receives stored edge data and must return a finite,
 * non-negative number.
 *
 * **Gotchas**
 *
 * The source and target must be distinct existing nodes in a directed graph.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface MaximumFlowConfig<E> {
  readonly source: NodeIndex
  readonly target: NodeIndex
  readonly capacity: (edge: E) => number
}

/**
 * Maximum flow value, per-edge flows, and a corresponding minimum cut.
 *
 * **Details**
 *
 * `flows` contains every original edge, including zero-flow edges. `cut`
 * contains the crossing edge identifiers of the corresponding minimum cut.
 *
 * @category models
 * @since 4.0.0
 */
export interface MaximumFlowResult {
  readonly value: number
  readonly flows: Map<EdgeIndex, number>
  readonly cut: Array<EdgeIndex>
}

/**
 * Minimum cut value, crossing edges, and residual-reachability partitions.
 *
 * **Details**
 *
 * `source` contains nodes residual-reachable from the configured source and
 * `target` contains the remaining nodes.
 *
 * @category models
 * @since 4.0.0
 */
export interface MinimumCutResult {
  readonly value: number
  readonly edges: Array<EdgeIndex>
  readonly source: Array<NodeIndex>
  readonly target: Array<NodeIndex>
}

/** @internal */
interface FlowSolution extends MaximumFlowResult {
  readonly sourceSide: Uint8Array
  readonly nodeIds: Array<NodeIndex>
}

/** @internal */
interface ResidualArc {
  readonly from: number
  readonly to: number
  readonly capacity: number
  readonly edge: number
  flow: number
}

/** @internal */
const solveMaximumFlow = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
  config: MaximumFlowConfig<E>
): FlowSolution => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "undirected") {
    throw new GraphError({ message: "Cannot compute flow of undirected graph" })
  }
  const cache = csr.get(graph)
  const source = csr.getNodeIndex(cache, config.source)
  if (source === undefined) {
    throw missingNode(config.source)
  }
  const target = csr.getNodeIndex(cache, config.target)
  if (target === undefined) {
    throw missingNode(config.target)
  }
  if (source === target) {
    throw new GraphError({ message: "Flow source and target must be different nodes" })
  }

  const edges = csr.getEdges(cache) as Array<Edge<E>>
  const edgeIds = csr.getEdgeIds(cache)
  const endpoints = csr.getEdgeEndpoints(cache)
  const capacities = new Float64Array(edges.length)
  const arcs: Array<ResidualArc> = []
  const adjacency: Array<Array<number>> = Array.from({ length: cache.nodeIds.length }, () => [])
  const forwardArc = new Int32Array(edges.length)
  forwardArc.fill(-1)

  withMutationGuard(graph, () => {
    for (let edge = 0; edge < edges.length; edge++) {
      const capacity = config.capacity(edges[edge].data)
      if (!Number.isFinite(capacity) || capacity < 0) {
        throw new GraphError({ message: `Edge ${edgeIds[edge]} capacity must be a finite non-negative number` })
      }
      capacities[edge] = capacity
      const from = endpoints.sources[edge]
      const to = endpoints.targets[edge]
      if (from === to) {
        continue
      }
      const index = arcs.length
      forwardArc[edge] = index
      adjacency[from].push(index)
      arcs.push({ from, to, capacity, edge, flow: 0 })
      adjacency[to].push(index + 1)
      arcs.push({ from: to, to: from, capacity: 0, edge: -1, flow: 0 })
    }
  })

  const parentArc = new Int32Array(cache.nodeIds.length)
  const visited = new Uint8Array(cache.nodeIds.length)
  const queue = new Uint32Array(cache.nodeIds.length)
  let value = 0
  while (true) {
    parentArc.fill(-1)
    visited.fill(0)
    let head = 0
    let tail = 1
    queue[0] = source
    visited[source] = 1
    while (head < tail && visited[target] === 0) {
      const node = queue[head++]
      for (const arcIndex of adjacency[node]) {
        const arc = arcs[arcIndex]
        if (arc.capacity - arc.flow > 0 && visited[arc.to] === 0) {
          visited[arc.to] = 1
          parentArc[arc.to] = arcIndex
          queue[tail++] = arc.to
          if (arc.to === target) {
            break
          }
        }
      }
    }
    if (visited[target] === 0) {
      break
    }

    let amount = Infinity
    for (let node = target; node !== source;) {
      const arc = arcs[parentArc[node]]
      amount = Math.min(amount, arc.capacity - arc.flow)
      node = arc.from
    }
    if (!Number.isFinite(value + amount)) {
      throw new GraphError({ message: "Maximum flow exceeds the finite number range" })
    }
    for (let node = target; node !== source;) {
      const arcIndex = parentArc[node]
      const arc = arcs[arcIndex]
      arc.flow += amount
      arcs[arcIndex ^ 1].flow -= amount
      node = arc.from
    }
    value += amount
  }

  const flows = new Map<EdgeIndex, number>()
  for (let edge = 0; edge < edgeIds.length; edge++) {
    const arcIndex = forwardArc[edge]
    flows.set(edgeIds[edge], arcIndex === -1 ? 0 : arcs[arcIndex].flow)
  }

  visited.fill(0)
  let head = 0
  let tail = 1
  queue[0] = source
  visited[source] = 1
  while (head < tail) {
    const node = queue[head++]
    for (const arcIndex of adjacency[node]) {
      const arc = arcs[arcIndex]
      if (arc.capacity - arc.flow > 0 && visited[arc.to] === 0) {
        visited[arc.to] = 1
        queue[tail++] = arc.to
      }
    }
  }

  const cut: Array<EdgeIndex> = []
  for (let edge = 0; edge < edgeIds.length; edge++) {
    if (
      endpoints.sources[edge] !== endpoints.targets[edge] &&
      visited[endpoints.sources[edge]] !== 0 &&
      visited[endpoints.targets[edge]] === 0
    ) {
      cut.push(edgeIds[edge])
    }
  }
  return { value, flows, cut, sourceSide: visited, nodeIds: cache.nodeIds }
}

/**
 * Returns a maximum flow and corresponding minimum cut for a directed graph.
 *
 * **When to use**
 *
 * Use when computing the greatest transferable capacity from one node to
 * another and per-edge flow values are required.
 *
 * **Details**
 *
 * Parallel edges retain independent capacities, self-loops carry no
 * source-to-target flow, and the flow map includes every original edge in graph
 * order, including zero-flow edges. Edmonds-Karp runs in `O(V * E^2)` time.
 *
 * **Gotchas**
 *
 * The graph must be directed. Capacities must be finite and non-negative.
 * Missing or equal endpoints, invalid capacities, and a total flow outside the
 * finite number range throw a `GraphError`. Self-loops always carry zero flow.
 *
 * **Example** (Computing maximum flow)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   for (const node of ["source", "a", "target"]) Graph.addNode(mutable, node)
 *   Graph.addEdge(mutable, 0, 1, 3)
 *   Graph.addEdge(mutable, 1, 2, 2)
 *   Graph.addEdge(mutable, 0, 2, 1)
 * })
 *
 * Graph.maximumFlow(graph, { source: 0, target: 2, capacity: (edge) => edge }).value // => 3
 * ```
 *
 * @see {@link minimumCut} for the residual-reachability partition
 * @category algorithms
 * @since 4.0.0
 */
export const maximumFlow: {
  <E>(config: MaximumFlowConfig<E>): <N>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
  ) => MaximumFlowResult
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    config: MaximumFlowConfig<E>
  ): MaximumFlowResult
} = dual(2, <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
  config: MaximumFlowConfig<E>
): MaximumFlowResult => {
  const { cut, flows, value } = solveMaximumFlow(graph, config)
  return { value, flows, cut }
})

/**
 * Returns a minimum cut and its node partitions for a directed graph.
 *
 * **When to use**
 *
 * Use when identifying the minimum-capacity edges that separate a source from
 * a target, together with the resulting node partitions.
 *
 * **Details**
 *
 * The source partition contains nodes reachable from the source in the final
 * residual network; the target partition contains its complement. Both follow
 * graph node order. Cut edges follow graph edge order, and their total capacity
 * equals the returned maximum-flow value. Validation, parallel-edge,
 * self-loop, and `O(V * E^2)` complexity behavior match `maximumFlow`.
 *
 * **Gotchas**
 *
 * The graph must be directed. Invalid capacities, missing endpoints, or equal
 * source and target nodes throw a `GraphError`.
 *
 * **Example** (Partitioning a minimum cut)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   for (const node of ["source", "a", "target"]) Graph.addNode(mutable, node)
 *   Graph.addEdge(mutable, 0, 1, 2)
 *   Graph.addEdge(mutable, 1, 2, 1)
 * })
 *
 * Graph.minimumCut(graph, { source: 0, target: 2, capacity: (edge) => edge }).source // => [0, 1]
 * ```
 *
 * @see {@link maximumFlow} for per-edge flow values
 * @category algorithms
 * @since 4.0.0
 */
export const minimumCut: {
  <E>(config: MaximumFlowConfig<E>): <N>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
  ) => MinimumCutResult
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    config: MaximumFlowConfig<E>
  ): MinimumCutResult
} = dual(2, <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
  config: MaximumFlowConfig<E>
): MinimumCutResult => {
  const solution = solveMaximumFlow(graph, config)
  const source: Array<NodeIndex> = []
  const target: Array<NodeIndex> = []
  for (let node = 0; node < solution.nodeIds.length; node++) {
    ;(solution.sourceSide[node] === 0 ? target : source).push(solution.nodeIds[node])
  }
  return { value: solution.value, edges: solution.cut, source, target }
})

/**
 * Finds weakly connected components in a directed graph.
 *
 * **When to use**
 *
 * Use when grouping directed nodes by connectivity while ignoring edge
 * orientation.
 *
 * **Details**
 *
 * Edge direction is ignored while partitioning nodes. Isolated nodes form
 * singleton components.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with an undirected graph.
 *
 * @see {@link isWeaklyConnected} when only a boolean check is needed
 * @see {@link stronglyConnectedComponents} for mutual directed reachability
 *
 * @category algorithms
 * @since 4.0.0
 */
export const weaklyConnectedComponents = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
): Array<Array<NodeIndex>> => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "undirected") {
    throw new GraphError({ message: "Cannot find weakly connected components of undirected graph" })
  }

  const cache = csr.get(graph)
  const { primary, secondary } = csr.getAdjacencies(cache, "undirected")
  const nodeCount = cache.nodeIds.length
  const visited = new Uint8Array(nodeCount)
  const stack = new Uint32Array(primary.columnIndices.length + secondary!.columnIndices.length + 1)
  const components: Array<Array<NodeIndex>> = []
  for (let start = 0; start < nodeCount; start++) {
    if (visited[start] !== 0) {
      continue
    }
    const component: Array<NodeIndex> = []
    let stackSize = 1
    stack[0] = start
    while (stackSize > 0) {
      const current = stack[--stackSize]
      if (visited[current] !== 0) {
        continue
      }
      visited[current] = 1
      component.push(cache.nodeIds[current])

      for (let i = primary.rowOffsets[current]; i < primary.rowOffsets[current + 1]; i++) {
        const neighbor = primary.columnIndices[i]
        if (visited[neighbor] === 0) {
          stack[stackSize++] = neighbor
        }
      }
      for (let i = secondary!.rowOffsets[current]; i < secondary!.rowOffsets[current + 1]; i++) {
        const neighbor = secondary!.columnIndices[i]
        if (visited[neighbor] === 0) {
          stack[stackSize++] = neighbor
        }
      }
    }
    components.push(component)
  }
  return components
}

/**
 * Returns the strongly connected components of a directed graph.
 *
 * **When to use**
 *
 * Use when grouping nodes so every node in a component can reach every other
 * node in that component.
 *
 * **Details**
 *
 * Each component is represented as an array of node indices and is computed
 * with Kosaraju's algorithm.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when used with an undirected graph.
 *
 * **Example** (Finding strongly connected components)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, string>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, "A->B")
 *   Graph.addEdge(mutable, b, c, "B->C")
 *   Graph.addEdge(mutable, c, a, "C->A") // Creates SCC: A-B-C
 * })
 *
 * Graph.stronglyConnectedComponents(graph) // => [[0, 2, 1]]
 * ```
 *
 * @see {@link isStronglyConnected} when only a boolean check is needed
 * @see {@link weaklyConnectedComponents} when edge orientation should be ignored
 * @category algorithms
 * @since 3.18.0
 */
export const stronglyConnectedComponents = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
): Array<Array<NodeIndex>> => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "undirected") {
    throw new GraphError({ message: "Cannot find strongly connected components of undirected graph" })
  }

  const cache = csr.get(graph)
  const outgoing = csr.getOutgoing(cache)
  const incoming = csr.getIncoming(cache)
  const visited = new Uint8Array(cache.nodeIds.length)
  const finishOrder: Array<number> = []
  const stack: Array<number> = []
  const positions: Array<number> = []

  // First pass records finish order on the original graph using an explicit stack.
  for (let start = 0; start < cache.nodeIds.length; start++) {
    if (visited[start] !== 0) {
      continue
    }
    visited[start] = 1
    stack.push(start)
    positions.push(outgoing.rowOffsets[start])

    while (stack.length > 0) {
      const frame = stack.length - 1
      const node = stack[frame]
      const position = positions[frame]
      if (position < outgoing.rowOffsets[node + 1]) {
        positions[frame] = position + 1
        const neighbor = outgoing.columnIndices[position]
        if (visited[neighbor] === 0) {
          visited[neighbor] = 1
          stack.push(neighbor)
          positions.push(outgoing.rowOffsets[neighbor])
        }
      } else {
        finishOrder.push(node)
        stack.pop()
        positions.pop()
      }
    }
  }

  visited.fill(0)
  const components: Array<Array<NodeIndex>> = []
  // Reversing finish order and traversing the transpose yields one SCC per search.
  for (let i = finishOrder.length - 1; i >= 0; i--) {
    const start = finishOrder[i]
    if (visited[start] !== 0) {
      continue
    }
    const component: Array<NodeIndex> = []
    stack.push(start)

    while (stack.length > 0) {
      const node = stack.pop()!
      if (visited[node] !== 0) {
        continue
      }
      visited[node] = 1
      component.push(cache.nodeIds[node])

      for (let j = incoming.rowOffsets[node]; j < incoming.rowOffsets[node + 1]; j++) {
        const predecessor = incoming.columnIndices[j]
        if (visited[predecessor] === 0) {
          stack.push(predecessor)
        }
      }
    }

    components.push(component)
  }

  return components
}

/** @internal */
const csrReachesAll = (
  nodeCount: number,
  primary: csr.Adjacency,
  secondary?: csr.Adjacency
): boolean => {
  if (nodeCount === 0) {
    return true
  }
  const visited = new Uint8Array(nodeCount)
  const queue = new Uint32Array(nodeCount)
  let head = 0
  let tail = 1
  visited[0] = 1
  queue[0] = 0

  while (head < tail) {
    const current = queue[head++]
    for (let i = primary.rowOffsets[current]; i < primary.rowOffsets[current + 1]; i++) {
      const neighbor = primary.columnIndices[i]
      if (visited[neighbor] === 0) {
        visited[neighbor] = 1
        queue[tail++] = neighbor
      }
    }
    if (secondary !== undefined) {
      for (let i = secondary.rowOffsets[current]; i < secondary.rowOffsets[current + 1]; i++) {
        const neighbor = secondary.columnIndices[i]
        if (visited[neighbor] === 0) {
          visited[neighbor] = 1
          queue[tail++] = neighbor
        }
      }
    }
  }
  return tail === nodeCount
}

/**
 * Tests whether an undirected graph has at most one connected component.
 *
 * **When to use**
 *
 * Use when checking undirected connectivity without allocating the component
 * partition.
 *
 * **Gotchas**
 *
 * The empty graph is considered connected. Throws a `GraphError` when used
 * with a directed graph.
 *
 * @see {@link connectedComponents} for the component partition
 *
 * @category predicates
 * @since 4.0.0
 */
export const isConnected = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): boolean => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot find connected components of directed graph" })
  }
  const cache = csr.get(graph)
  return csrReachesAll(cache.nodeIds.length, csr.getOutgoing(cache))
}

/**
 * Tests whether a directed graph has at most one weakly connected component.
 *
 * **When to use**
 *
 * Use when checking whether a directed graph is connected after ignoring edge
 * orientation.
 *
 * **Gotchas**
 *
 * The empty graph is considered weakly connected. Throws a `GraphError` when
 * used with an undirected graph.
 *
 * @see {@link isStronglyConnected} when edge orientation must be respected
 *
 * @category predicates
 * @since 4.0.0
 */
export const isWeaklyConnected = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
): boolean => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "undirected") {
    throw new GraphError({ message: "Cannot find weakly connected components of undirected graph" })
  }
  const cache = csr.get(graph)
  const { primary, secondary } = csr.getAdjacencies(cache, "undirected")
  return csrReachesAll(cache.nodeIds.length, primary, secondary)
}

/**
 * Tests whether a directed graph has at most one strongly connected component.
 *
 * **When to use**
 *
 * Use when checking that every node in a directed graph can reach every other
 * node.
 *
 * **Gotchas**
 *
 * The empty graph is considered strongly connected. Throws a `GraphError` when
 * used with an undirected graph.
 *
 * @see {@link isWeaklyConnected} when edge orientation should be ignored
 *
 * @category predicates
 * @since 4.0.0
 */
export const isStronglyConnected = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
): boolean => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "undirected") {
    throw new GraphError({ message: "Cannot find strongly connected components of undirected graph" })
  }
  const cache = csr.get(graph)
  return csrReachesAll(cache.nodeIds.length, csr.getOutgoing(cache)) &&
    csrReachesAll(cache.nodeIds.length, csr.getIncoming(cache))
}

/**
 * Tests whether a non-empty undirected graph is a tree.
 *
 * **When to use**
 *
 * Use when validating that an undirected graph is connected and has no cycle.
 *
 * **Gotchas**
 *
 * The empty graph is not a tree. Parallel edges and self-loops prevent a graph
 * from being a tree. Throws a `GraphError` when used with a directed graph.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isTree = <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
): boolean => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot determine tree status of directed graph" })
  }
  const nodes = nodeCount(graph)
  return nodes > 0 && edgeCount(graph) === nodes - 1 && isConnected(graph)
}

/**
 * Returns a minimum spanning forest of an undirected graph using Kruskal's
 * algorithm.
 *
 * **When to use**
 *
 * Use when selecting a minimum-cost acyclic connector for every connected
 * component of an undirected graph.
 *
 * **Details**
 *
 * All node indices and selected edge indices are preserved. Negative finite
 * weights are allowed, `Infinity` marks an unavailable edge, and equal weights
 * are resolved by original edge order. Disconnected inputs produce a forest,
 * and isolated nodes remain present.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` for a directed graph or when a weight is `NaN` or
 * `-Infinity`. Edges weighted `Infinity` are omitted.
 *
 * @category algorithms
 * @since 4.0.0
 */
export const minimumSpanningForest: {
  <E>(cost: (edgeData: E) => number): <N>(
    graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">
  ) => Graph<N, E, "undirected">
  <N, E>(
    graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">,
    cost: (edgeData: E) => number
  ): Graph<N, E, "undirected">
} = dual(2, <N, E>(
  graph: Graph<N, E, "undirected"> | MutableGraph<N, E, "undirected">,
  cost: (edgeData: E) => number
): Graph<N, E, "undirected"> => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "directed") {
    throw new GraphError({ message: "Cannot find minimum spanning forest of directed graph" })
  }
  const impl = internal.toImpl(graph)
  const nodes: Array<IndexedNode<N>> = []
  const compactByNode = new Map<NodeIndex, number>()
  for (const [index, data] of impl.nodes) {
    compactByNode.set(index, nodes.length)
    nodes.push({ index, data })
  }
  const weightedEdges: Array<{ readonly index: EdgeIndex; readonly weight: number }> = []
  withMutationGuard(graph, () => {
    for (const [index, edge] of impl.edges) {
      const weight = cost(edge.data)
      if (Number.isNaN(weight) || weight === -Infinity) {
        throw new GraphError({ message: "Minimum spanning forest does not support NaN or -Infinity edge weights" })
      }
      if (weight !== Infinity) {
        weightedEdges.push({ index, weight })
      }
    }
  })
  weightedEdges.sort((self, that) => self.weight - that.weight)

  const parents = new Uint32Array(nodes.length)
  const ranks = new Uint8Array(nodes.length)
  for (let i = 0; i < parents.length; i++) {
    parents[i] = i
  }
  const find = (node: number): number => {
    let root = node
    while (parents[root] !== root) {
      root = parents[root]
    }
    while (parents[node] !== node) {
      const parent = parents[node]
      parents[node] = root
      node = parent
    }
    return root
  }
  const selected = new Set<EdgeIndex>()
  for (const weighted of weightedEdges) {
    const edge = impl.edges.get(weighted.index)!
    let sourceRoot = find(compactByNode.get(edge.source)!)
    let targetRoot = find(compactByNode.get(edge.target)!)
    if (sourceRoot === targetRoot) {
      continue
    }
    selected.add(weighted.index)
    if (ranks[sourceRoot] < ranks[targetRoot]) {
      const swap = sourceRoot
      sourceRoot = targetRoot
      targetRoot = swap
    }
    parents[targetRoot] = sourceRoot
    if (ranks[sourceRoot] === ranks[targetRoot]) {
      ranks[sourceRoot]++
    }
  }

  const edges: Array<IndexedEdge<E>> = []
  for (const [index, edge] of impl.edges) {
    if (selected.has(index)) {
      edges.push({ index, source: edge.source, target: edge.target, data: edge.data })
    }
  }
  return fromSnapshot({ type: "undirected", nodes, edges })
})

/**
 * Returns the transitive reduction of a directed acyclic graph.
 *
 * **When to use**
 *
 * Use when simplifying a dependency DAG while preserving which nodes can
 * reach which other nodes.
 *
 * **Details**
 *
 * The result preserves reachability with the fewest structural source-target
 * pairs. Node and retained edge indices are preserved.
 *
 * **Gotchas**
 *
 * This operation is structural and ignores edge costs. Parallel edges are
 * coalesced by retaining the first edge for each required pair. Throws a
 * `GraphError` for an undirected graph or cyclic input.
 *
 * @category algorithms
 * @since 4.0.0
 */
export const transitiveReduction = <N, E>(
  graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">
): Graph<N, E, "directed"> => {
  if ((graph as Graph<N, E, Kind> | MutableGraph<N, E, Kind>).type === "undirected") {
    throw new GraphError({ message: "Cannot transitively reduce undirected graph" })
  }
  if (!isAcyclic(graph)) {
    throw new GraphError({ message: "Cannot transitively reduce cyclic graph" })
  }

  const impl = internal.toImpl(graph)
  const nodes: Array<IndexedNode<N>> = []
  for (const [index, data] of impl.nodes) {
    nodes.push({ index, data })
  }
  const firstEdges = new Map<NodeIndex, Map<NodeIndex, EdgeIndex>>()
  for (const [edgeIndex, edge] of impl.edges) {
    let targets = firstEdges.get(edge.source)
    if (targets === undefined) {
      targets = new Map()
      firstEdges.set(edge.source, targets)
    }
    if (!targets.has(edge.target)) {
      targets.set(edge.target, edgeIndex)
    }
  }

  const retained = new Set<EdgeIndex>()
  for (const [source, targets] of firstEdges) {
    for (const [target, edgeIndex] of targets) {
      const visited = new Set<NodeIndex>([source])
      const queue = [source]
      let reachable = false
      for (let head = 0; head < queue.length && !reachable; head++) {
        const current = queue[head]
        for (const candidateIndex of impl.adjacency.get(current)!) {
          const candidate = impl.edges.get(candidateIndex)!
          if (current === source && candidate.target === target) {
            continue
          }
          if (candidate.target === target) {
            reachable = true
            break
          }
          if (!visited.has(candidate.target)) {
            visited.add(candidate.target)
            queue.push(candidate.target)
          }
        }
      }
      if (!reachable) {
        retained.add(edgeIndex)
      }
    }
  }

  const edges: Array<IndexedEdge<E>> = []
  for (const [index, edge] of impl.edges) {
    if (retained.has(index)) {
      edges.push({ index, source: edge.source, target: edge.target, data: edge.data })
    }
  }
  return fromSnapshot({ type: "directed", nodes, edges })
}

// =============================================================================
// Path Finding Algorithms
// =============================================================================

/**
 * Result of a shortest path computation.
 *
 * **When to use**
 *
 * Use to read the successful source-to-target shortest path returned by
 * path-finding algorithms, including the ordered node and edge indices, total
 * distance, and traversed edge data.
 *
 * **Details**
 *
 * Contains the node-index path, the traversed edge indices, the total numeric
 * distance, and the edge data encountered along the path.
 *
 * **Gotchas**
 *
 * `costs` contains original edge data, not the numeric output of the cost
 * function unless the edge data is numeric.
 *
 * @category models
 * @since 3.18.0
 */
export interface PathResult<E> {
  readonly path: Array<NodeIndex>
  readonly edges: Array<EdgeIndex>
  readonly distance: number
  readonly costs: Array<E>
}

interface DenseMinHeap {
  nodes: Uint32Array
  priorities: Float64Array
  sequences: Float64Array
  positions: Int32Array | undefined
  size: number
  poppedNode: number
  poppedPriority: number
}

const denseMinHeapMake = (capacity: number, indexed = false): DenseMinHeap => {
  const positions = indexed ? new Int32Array(capacity) : undefined
  positions?.fill(-1)
  return {
    nodes: new Uint32Array(Math.max(4, capacity)),
    priorities: new Float64Array(Math.max(4, capacity)),
    sequences: new Float64Array(Math.max(4, capacity)),
    positions,
    size: 0,
    poppedNode: 0,
    poppedPriority: 0
  }
}

const denseMinHeapPush = (
  heap: DenseMinHeap,
  node: number,
  priority: number,
  sequence: number
): void => {
  let index = heap.positions?.[node] ?? -1
  if (index === -1) {
    if (heap.size === heap.nodes.length) {
      const capacity = heap.size * 2
      const nodes = new Uint32Array(capacity)
      const priorities = new Float64Array(capacity)
      const sequences = new Float64Array(capacity)
      nodes.set(heap.nodes)
      priorities.set(heap.priorities)
      sequences.set(heap.sequences)
      heap.nodes = nodes
      heap.priorities = priorities
      heap.sequences = sequences
    }
    index = heap.size++
  }

  while (index > 0) {
    const parent = (index - 1) >>> 1
    if (
      priority > heap.priorities[parent] ||
      (priority === heap.priorities[parent] && sequence >= heap.sequences[parent])
    ) {
      break
    }
    heap.nodes[index] = heap.nodes[parent]
    heap.priorities[index] = heap.priorities[parent]
    heap.sequences[index] = heap.sequences[parent]
    if (heap.positions !== undefined) {
      heap.positions[heap.nodes[index]] = index
    }
    index = parent
  }
  heap.nodes[index] = node
  heap.priorities[index] = priority
  heap.sequences[index] = sequence
  if (heap.positions !== undefined) {
    heap.positions[node] = index
  }
}

const denseMinHeapPop = (heap: DenseMinHeap): boolean => {
  if (heap.size === 0) {
    return false
  }

  heap.poppedNode = heap.nodes[0]
  heap.poppedPriority = heap.priorities[0]
  if (heap.positions !== undefined) {
    heap.positions[heap.poppedNode] = -1
  }
  const last = --heap.size
  if (last === 0) {
    return true
  }

  const node = heap.nodes[last]
  const priority = heap.priorities[last]
  const sequence = heap.sequences[last]
  let index = 0
  while (true) {
    const left = index * 2 + 1
    if (left >= last) {
      break
    }
    const right = left + 1
    let child = left
    if (
      right < last &&
      (heap.priorities[right] < heap.priorities[left] ||
        (heap.priorities[right] === heap.priorities[left] && heap.sequences[right] < heap.sequences[left]))
    ) {
      child = right
    }
    if (
      heap.priorities[child] > priority ||
      (heap.priorities[child] === priority && heap.sequences[child] >= sequence)
    ) {
      break
    }
    heap.nodes[index] = heap.nodes[child]
    heap.priorities[index] = heap.priorities[child]
    heap.sequences[index] = heap.sequences[child]
    if (heap.positions !== undefined) {
      heap.positions[heap.nodes[index]] = index
    }
    index = child
  }
  heap.nodes[index] = node
  heap.priorities[index] = priority
  heap.sequences[index] = sequence
  if (heap.positions !== undefined) {
    heap.positions[node] = index
  }
  return true
}

/**
 * Configuration for finding a shortest path with Dijkstra's algorithm.
 *
 * **When to use**
 *
 * Use when configuring `dijkstra` to find a shortest path between two existing
 * node indices with non-negative edge costs.
 *
 * **Details**
 *
 * Specifies the source and target node indices, plus a cost function that maps
 * each edge's data to a non-negative numeric weight. `Infinity` is allowed and
 * behaves like an impassable edge.
 *
 * **Gotchas**
 *
 * `dijkstra` throws a `GraphError` when either endpoint does not exist or when
 * the cost function returns a negative weight or `NaN`.
 *
 * @category configuration
 * @since 3.18.0
 */
export interface DijkstraConfig<E> {
  source: NodeIndex
  target: NodeIndex
  cost: (edgeData: E) => number
}

/**
 * Finds the shortest path from the configured source node to the target node
 * using Dijkstra's algorithm.
 *
 * **When to use**
 *
 * Use when you need one source-to-target shortest path and every edge cost is
 * non-negative.
 *
 * **Details**
 *
 * Edge costs must be non-negative and not `NaN`. `Infinity` is allowed and
 * behaves like an impassable edge. Returns `Option.none()` when the target is
 * not reachable.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when either endpoint is missing or an edge cost is
 * negative or `NaN`, or when a path distance exceeds the finite number range.
 *
 * **Example** (Finding shortest paths with Dijkstra)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 5)
 *   Graph.addEdge(mutable, a, c, 10)
 *   Graph.addEdge(mutable, b, c, 2)
 * })
 *
 * const result = Graph.dijkstra(graph, {
 *   source: 0,
 *   target: 2,
 *   cost: (edgeData) => edgeData
 * })
 *
 * Option.map(result, ({ distance, path }) => [distance, path] as const) // => Option.some([7, [0, 1, 2]])
 * ```
 *
 * @see {@link astar} when a useful heuristic can guide the search
 * @see {@link bellmanFord} when edge costs may be negative
 * @see {@link floydWarshall} when shortest paths are needed for all pairs
 * @category algorithms
 * @since 3.18.0
 */
export const dijkstra: {
  <E>(
    config: DijkstraConfig<E>
  ): <N, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Option.Option<PathResult<E>>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config: DijkstraConfig<E>
  ): Option.Option<PathResult<E>>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: DijkstraConfig<E>
): Option.Option<PathResult<E>> => {
  const impl = internal.toImpl(graph)
  // Validate that source and target nodes exist
  if (!impl.nodes.has(config.source)) {
    throw missingNode(config.source)
  }
  if (!impl.nodes.has(config.target)) {
    throw missingNode(config.target)
  }

  const cache = csr.get(graph)
  const cachedEdges = csr.getEdges(cache)
  const cachedEdgeIds = csr.getEdgeIds(cache)
  const outgoing = csr.getOutgoingWithEdges(cache)
  const source = csr.getNodeIndex(cache, config.source)!
  const target = csr.getNodeIndex(cache, config.target)!
  const edgeWeights = new Float64Array(cachedEdges.length)
  withMutationGuard(graph, () => {
    for (let i = 0; i < cachedEdges.length; i++) {
      const weight = config.cost(cachedEdges[i].data)
      if (Number.isNaN(weight) || weight < 0) {
        throw new GraphError({ message: "Dijkstra's algorithm requires non-negative edge weights" })
      }
      edgeWeights[i] = weight
    }
  })

  // Early return if source equals target
  if (config.source === config.target) {
    return Option.some({
      path: [config.source],
      edges: [],
      distance: 0,
      costs: []
    })
  }

  const distances = new Float64Array(cache.nodeIds.length)
  distances.fill(Infinity)
  distances[source] = 0
  // Predecessor node and edge arrays reconstruct both the public node path and its edge data.
  const previousNode = new Int32Array(cache.nodeIds.length)
  const previousEdge = new Int32Array(cache.nodeIds.length)
  previousNode.fill(-1)
  previousEdge.fill(-1)
  const visited = new Uint8Array(cache.nodeIds.length)
  const priorityQueue = denseMinHeapMake(cache.nodeIds.length, true)
  let sequence = 0
  denseMinHeapPush(priorityQueue, source, 0, sequence++)

  while (priorityQueue.size > 0) {
    denseMinHeapPop(priorityQueue)
    const currentNode = priorityQueue.poppedNode
    const currentDistance = priorityQueue.poppedPriority
    if (visited[currentNode] !== 0) {
      continue
    }
    visited[currentNode] = 1
    if (currentNode === target) {
      break
    }

    for (let i: number = outgoing.rowOffsets[currentNode]; i < outgoing.rowOffsets[currentNode + 1]; i++) {
      const neighbor = outgoing.columnIndices[i]
      const edge = outgoing.edgeIndices[i]
      const nextDistance = currentDistance + edgeWeights[edge]
      if (edgeWeights[edge] !== Infinity && !Number.isFinite(nextDistance)) {
        throw new GraphError({ message: "Dijkstra distance calculation exceeded the finite number range" })
      }
      if (nextDistance < distances[neighbor]) {
        distances[neighbor] = nextDistance
        previousNode[neighbor] = currentNode
        previousEdge[neighbor] = edge
        if (visited[neighbor] === 0) {
          denseMinHeapPush(priorityQueue, neighbor, nextDistance, sequence++)
        }
      }
    }
  }

  if (distances[target] === Infinity) {
    return Option.none()
  }

  const path: Array<NodeIndex> = []
  const edges: Array<EdgeIndex> = []
  const costs: Array<E> = []
  let current = target
  while (current !== -1) {
    path.push(cache.nodeIds[current])
    const edge = previousEdge[current]
    if (edge !== -1) {
      edges.push(cachedEdgeIds[edge])
      costs.push(cachedEdges[edge].data)
    }
    current = previousNode[current]
  }
  path.reverse()
  edges.reverse()
  costs.reverse()

  return Option.some({ path, edges, distance: distances[target], costs })
})

/**
 * Result of an all-pairs shortest path computation.
 *
 * **When to use**
 *
 * Use when storing or passing around the complete output of `floydWarshall` so
 * callers can look up shortest distances, node and edge paths, and edge data
 * for any source and target node pair.
 *
 * **Details**
 *
 * Contains distance, node-path, edge-index-path, and edge-data maps keyed by
 * source and target node indices. Unreachable pairs have distance `Infinity`,
 * path `null`, and empty edge and cost arrays.
 *
 * @category models
 * @since 3.18.0
 */
export interface AllPairsResult<E> {
  readonly distances: Map<NodeIndex, Map<NodeIndex, number>>
  readonly paths: Map<NodeIndex, Map<NodeIndex, Array<NodeIndex> | null>>
  readonly edges: Map<NodeIndex, Map<NodeIndex, Array<EdgeIndex>>>
  readonly costs: Map<NodeIndex, Map<NodeIndex, Array<E>>>
}

/**
 * Finds shortest paths between all pairs of nodes using the Floyd-Warshall
 * algorithm.
 *
 * **When to use**
 *
 * Use when many or all node pairs will be queried and cubic computation plus
 * quadratic result storage is acceptable.
 *
 * **Details**
 *
 * Computes distances, reconstructed node paths, and edge-data paths for every
 * source and target pair in O(V^3) time. Negative edge weights are allowed, and
 * `Infinity` behaves like an impassable edge.
 *
 * **Gotchas**
 *
 * A `GraphError` is thrown if any edge weight is `NaN` or `-Infinity`, or if
 * finite arithmetic overflows or underflows, or if any negative cycle is
 * detected.
 *
 * **Example** (Finding all-pairs shortest paths)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 3)
 *   Graph.addEdge(mutable, b, c, 2)
 *   Graph.addEdge(mutable, a, c, 7)
 * })
 *
 * const result = Graph.floydWarshall(graph, (edgeData) => edgeData)
 * const shortest = { distance: result.distances.get(0)?.get(2), path: result.paths.get(0)?.get(2) }
 * shortest // => { distance: 5, path: [0, 1, 2] }
 * ```
 *
 * @see {@link dijkstra} for one query with non-negative edge costs
 * @see {@link bellmanFord} for one query that may include negative edge costs
 * @category algorithms
 * @since 3.18.0
 */
export const floydWarshall: {
  <E>(
    cost: (edgeData: E) => number
  ): <N, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => AllPairsResult<E>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    cost: (edgeData: E) => number
  ): AllPairsResult<E>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  cost: (edgeData: E) => number
): AllPairsResult<E> => {
  const cache = csr.get(graph)
  const edges = csr.getEdges(cache)
  const edgeIds = csr.getEdgeIds(cache)
  const edgeCache = csr.getEdgeEndpoints(cache)
  const size = cache.nodeIds.length
  // Flat matrices keep the O(N^2) working set contiguous and avoid nested map lookups in the O(N^3) loop.
  const distancesMatrix = new Float64Array(size * size)
  const nextMatrix = new Int32Array(size * size)
  const edgeMatrix = new Int32Array(size * size)
  distancesMatrix.fill(Infinity)
  nextMatrix.fill(-1)
  edgeMatrix.fill(-1)
  for (let i = 0; i < size; i++) {
    distancesMatrix[i * size + i] = 0
  }

  withMutationGuard(graph, () => {
    for (let edge = 0; edge < edges.length; edge++) {
      const weight = cost(edges[edge].data)
      if (Number.isNaN(weight) || weight === -Infinity) {
        throw new GraphError({ message: "Floyd-Warshall algorithm does not support NaN or -Infinity edge weights" })
      }
      const source = edgeCache.sources[edge]
      const target = edgeCache.targets[edge]
      const position = source * size + target
      if (weight < distancesMatrix[position]) {
        distancesMatrix[position] = weight
        nextMatrix[position] = target
        edgeMatrix[position] = edge
      }
      if (graph.type === "undirected") {
        const reverse = target * size + source
        if (weight < distancesMatrix[reverse]) {
          distancesMatrix[reverse] = weight
          nextMatrix[reverse] = source
          edgeMatrix[reverse] = edge
        }
      }
    }
  })

  for (let k = 0; k < size; k++) {
    const kRow = k * size
    for (let i = 0; i < size; i++) {
      const iRow = i * size
      const distanceIK = distancesMatrix[iRow + k]
      if (distanceIK === Infinity) {
        continue
      }
      const nextIK = nextMatrix[iRow + k]
      for (let j = 0; j < size; j++) {
        const distanceKJ = distancesMatrix[kRow + j]
        if (distanceKJ === Infinity) {
          continue
        }
        const candidate = distanceIK + distanceKJ
        if (!Number.isFinite(candidate)) {
          throw new GraphError({ message: "Floyd-Warshall distance calculation exceeded the finite number range" })
        }
        if (candidate < distancesMatrix[iRow + j] && nextIK !== -1) {
          distancesMatrix[iRow + j] = candidate
          nextMatrix[iRow + j] = nextIK
        }
      }
    }
  }

  for (let i = 0; i < size; i++) {
    if (distancesMatrix[i * size + i] < 0) {
      throw new GraphError({ message: `Negative cycle detected involving node ${cache.nodeIds[i]}` })
    }
  }

  const distances = new Map<NodeIndex, Map<NodeIndex, number>>()
  const paths = new Map<NodeIndex, Map<NodeIndex, Array<NodeIndex> | null>>()
  const edgePaths = new Map<NodeIndex, Map<NodeIndex, Array<EdgeIndex>>>()
  const costs = new Map<NodeIndex, Map<NodeIndex, Array<E>>>()
  for (let i = 0; i < size; i++) {
    const source = cache.nodeIds[i]
    const distanceRow = new Map<NodeIndex, number>()
    const pathRow = new Map<NodeIndex, Array<NodeIndex> | null>()
    const edgePathRow = new Map<NodeIndex, Array<EdgeIndex>>()
    const costRow = new Map<NodeIndex, Array<E>>()
    distances.set(source, distanceRow)
    paths.set(source, pathRow)
    edgePaths.set(source, edgePathRow)
    costs.set(source, costRow)

    for (let j = 0; j < size; j++) {
      const target = cache.nodeIds[j]
      const distance = distancesMatrix[i * size + j]
      distanceRow.set(target, distance)
      if (i === j) {
        pathRow.set(target, [source])
        edgePathRow.set(target, [])
        costRow.set(target, [])
      } else if (distance === Infinity) {
        pathRow.set(target, null)
        edgePathRow.set(target, [])
        costRow.set(target, [])
      } else {
        const path = [source]
        const pathEdges: Array<EdgeIndex> = []
        const pathCosts: Array<E> = []
        let current = i
        while (current !== j) {
          const next = nextMatrix[current * size + j]
          if (next === -1) {
            break
          }
          const edge = edgeMatrix[current * size + next]
          if (edge !== -1) {
            pathEdges.push(edgeIds[edge])
            pathCosts.push(edges[edge].data)
          }
          current = next
          path.push(cache.nodeIds[current])
        }
        pathRow.set(target, path)
        edgePathRow.set(target, pathEdges)
        costRow.set(target, pathCosts)
      }
    }
  }

  return { distances, paths, edges: edgePaths, costs }
})

/**
 * Configuration for finding a shortest path with the A* algorithm.
 *
 * **When to use**
 *
 * Use when configuring `astar` for point-to-point shortest-path searches where
 * node data can provide a heuristic estimate toward the target.
 *
 * **Details**
 *
 * Specifies the source and target node indices, an edge-cost function that maps
 * edge data to non-negative weights, and a heuristic that estimates the
 * remaining cost from a node to the target.
 *
 * **Gotchas**
 *
 * Heuristic values must be finite and the heuristic must be consistent for A*
 * to guarantee a shortest path.
 *
 * @category configuration
 * @since 3.18.0
 */
export interface AstarConfig<E, N> {
  source: NodeIndex
  target: NodeIndex
  cost: (edgeData: E) => number
  heuristic: (sourceNodeData: N, targetNodeData: N) => number
}

/**
 * Finds the shortest path from the configured source node to the target node
 * using the A* pathfinding algorithm.
 *
 * **When to use**
 *
 * Use when a meaningful heuristic can reduce point-to-point search compared
 * with Dijkstra's algorithm.
 *
 * **Details**
 *
 * The edge-cost function must return non-negative weights and not `NaN`.
 * `Infinity` is allowed and behaves like an impassable edge. Returns
 * `Option.none()` when the target is not reachable.
 *
 * **Gotchas**
 *
 * The heuristic must be consistent for the shortest-path guarantee and must
 * return finite values. Missing endpoints, invalid edge costs, or non-finite
 * heuristic values or arithmetic results throw a `GraphError`.
 *
 * **Example** (Finding shortest paths with A*)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<{ x: number; y: number }, number>((mutable) => {
 *   const a = Graph.addNode(mutable, { x: 0, y: 0 })
 *   const b = Graph.addNode(mutable, { x: 1, y: 0 })
 *   const c = Graph.addNode(mutable, { x: 2, y: 0 })
 *   Graph.addEdge(mutable, a, b, 1)
 *   Graph.addEdge(mutable, b, c, 1)
 * })
 *
 * // Manhattan distance heuristic
 * const heuristic = (
 *   nodeData: { x: number; y: number },
 *   targetData: { x: number; y: number }
 * ) => Math.abs(nodeData.x - targetData.x) + Math.abs(nodeData.y - targetData.y)
 *
 * const result = Graph.astar(graph, {
 *   source: 0,
 *   target: 2,
 *   cost: (edgeData) => edgeData,
 *   heuristic
 * })
 *
 * Option.map(result, ({ distance, path }) => [distance, path] as const) // => Option.some([2, [0, 1, 2]])
 * ```
 *
 * @see {@link dijkstra} when no useful heuristic is available
 * @see {@link bellmanFord} when edge costs may be negative
 * @category algorithms
 * @since 3.18.0
 */
export const astar: {
  <E, N>(
    config: AstarConfig<E, N>
  ): <T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Option.Option<PathResult<E>>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config: AstarConfig<E, N>
  ): Option.Option<PathResult<E>>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: AstarConfig<E, N>
): Option.Option<PathResult<E>> => {
  const impl = internal.toImpl(graph)
  // Validate that source and target nodes exist
  if (!impl.nodes.has(config.source)) {
    throw missingNode(config.source)
  }
  if (!impl.nodes.has(config.target)) {
    throw missingNode(config.target)
  }

  const cache = csr.get(graph)
  const cachedEdges = csr.getEdges(cache)
  const cachedEdgeIds = csr.getEdgeIds(cache)
  const outgoing = csr.getOutgoingWithEdges(cache)
  const source = csr.getNodeIndex(cache, config.source)!
  const target = csr.getNodeIndex(cache, config.target)!
  const sourceNodeData = cache.nodeData[source] as N
  const targetNodeData = cache.nodeData[target] as N
  const edgeWeights = new Float64Array(cachedEdges.length)
  withMutationGuard(graph, () => {
    for (let i = 0; i < cachedEdges.length; i++) {
      const weight = config.cost(cachedEdges[i].data)
      if (Number.isNaN(weight) || weight < 0) {
        throw new GraphError({ message: "A* algorithm requires non-negative edge weights" })
      }
      edgeWeights[i] = weight
    }
  })

  // Early return if source equals target
  if (config.source === config.target) {
    if (!Number.isFinite(withMutationGuard(graph, () => config.heuristic(sourceNodeData, targetNodeData)))) {
      throw new GraphError({ message: "A* algorithm requires finite heuristic values" })
    }
    return Option.some({
      path: [config.source],
      edges: [],
      distance: 0,
      costs: []
    })
  }

  const getHeuristic = (nodeData: N): number => {
    const value = config.heuristic(nodeData, targetNodeData)
    if (!Number.isFinite(value)) {
      throw new GraphError({ message: "A* algorithm requires finite heuristic values" })
    }
    return value
  }

  const scores = new Float64Array(cache.nodeIds.length)
  scores.fill(Infinity)
  scores[source] = 0
  // Predecessor node and edge arrays preserve path reconstruction while the hot loop uses compact indices.
  const previousNode = new Int32Array(cache.nodeIds.length)
  const previousEdge = new Int32Array(cache.nodeIds.length)
  previousNode.fill(-1)
  previousEdge.fill(-1)
  const visited = new Uint8Array(cache.nodeIds.length)
  const openSet = denseMinHeapMake(cache.nodeIds.length)
  let sequence = 0
  withMutationGuard(graph, () => {
    denseMinHeapPush(openSet, source, getHeuristic(sourceNodeData), sequence++)

    while (openSet.size > 0) {
      denseMinHeapPop(openSet)
      const current = openSet.poppedNode
      if (visited[current] !== 0) {
        continue
      }
      visited[current] = 1
      if (current === target) {
        break
      }

      const currentScore = scores[current]
      for (let i: number = outgoing.rowOffsets[current]; i < outgoing.rowOffsets[current + 1]; i++) {
        const neighbor = outgoing.columnIndices[i]
        if (visited[neighbor] !== 0) {
          continue
        }
        const edge = outgoing.edgeIndices[i]
        const tentativeScore = currentScore + edgeWeights[edge]
        if (edgeWeights[edge] !== Infinity && !Number.isFinite(tentativeScore)) {
          throw new GraphError({ message: "A* distance calculation exceeded the finite number range" })
        }
        if (tentativeScore < scores[neighbor]) {
          scores[neighbor] = tentativeScore
          previousNode[neighbor] = current
          previousEdge[neighbor] = edge
          const priority = tentativeScore + getHeuristic(cache.nodeData[neighbor] as N)
          if (!Number.isFinite(priority)) {
            throw new GraphError({ message: "A* priority calculation exceeded the finite number range" })
          }
          denseMinHeapPush(openSet, neighbor, priority, sequence++)
        }
      }
    }
  })

  if (scores[target] === Infinity) {
    return Option.none()
  }

  const path: Array<NodeIndex> = []
  const edges: Array<EdgeIndex> = []
  const costs: Array<E> = []
  let current = target
  while (current !== -1) {
    path.push(cache.nodeIds[current])
    const edge = previousEdge[current]
    if (edge !== -1) {
      edges.push(cachedEdgeIds[edge])
      costs.push(cachedEdges[edge].data)
    }
    current = previousNode[current]
  }
  path.reverse()
  edges.reverse()
  costs.reverse()
  return Option.some({ path, edges, distance: scores[target], costs })
})

/**
 * Configuration for finding a shortest path with the Bellman-Ford algorithm.
 *
 * **When to use**
 *
 * Use when configuring `bellmanFord` to find a shortest path where edge
 * weights may be negative.
 *
 * **Details**
 *
 * Specifies the source and target node indices, plus a cost function that maps
 * each edge's data to a numeric weight.
 *
 * @category configuration
 * @since 3.18.0
 */
export interface BellmanFordConfig<E> {
  source: NodeIndex
  target: NodeIndex
  cost: (edgeData: E) => number
}

/**
 * Finds the shortest path from the configured source node to the target node
 * using the Bellman-Ford algorithm.
 *
 * **When to use**
 *
 * Use when one source-to-target shortest-path query may traverse negative-cost
 * edges.
 *
 * **Details**
 *
 * Negative edge weights are allowed, and `Infinity` behaves like an impassable
 * edge. Returns `Option.none()` when the target is unreachable. A reachable
 * negative cycle only causes failure when it can affect the target.
 *
 * **Gotchas**
 *
 * Missing endpoints, unsupported weights, finite-range overflow, or a relevant
 * negative cycle throw a `GraphError`. In an undirected graph, any reachable
 * negative edge forms a negative cycle because it can be traversed both ways.
 *
 * **Example** (Finding shortest paths with Bellman-Ford)
 *
 * ```ts import.meta.vitest
 * import { Graph, Option } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, -1) // Negative weight allowed
 *   Graph.addEdge(mutable, b, c, 3)
 *   Graph.addEdge(mutable, a, c, 5)
 * })
 *
 * const result = Graph.bellmanFord(graph, {
 *   source: 0,
 *   target: 2,
 *   cost: (edgeData) => edgeData
 * })
 *
 * Option.map(result, ({ distance, path }) => [distance, path] as const) // => Option.some([2, [0, 1, 2]])
 * ```
 *
 * @see {@link dijkstra} for non-negative edge costs
 * @category algorithms
 * @since 3.18.0
 */
export const bellmanFord: {
  <E>(
    config: BellmanFordConfig<E>
  ): <N, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => Option.Option<PathResult<E>>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config: BellmanFordConfig<E>
  ): Option.Option<PathResult<E>>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: BellmanFordConfig<E>
): Option.Option<PathResult<E>> => {
  const impl = internal.toImpl(graph)
  // Validate that source and target nodes exist
  if (!impl.nodes.has(config.source)) {
    throw missingNode(config.source)
  }
  if (!impl.nodes.has(config.target)) {
    throw missingNode(config.target)
  }

  const cache = csr.get(graph)
  const edges = csr.getEdges(cache)
  const edgeIds = csr.getEdgeIds(cache)
  const edgeCache = csr.getEdgeEndpoints(cache)
  const outgoing = csr.getOutgoingWithEdges(cache)
  const source = csr.getNodeIndex(cache, config.source)!
  const target = csr.getNodeIndex(cache, config.target)!
  const weights = new Float64Array(edges.length)
  withMutationGuard(graph, () => {
    for (let i = 0; i < edges.length; i++) {
      const weight = config.cost(edges[i].data)
      if (Number.isNaN(weight) || weight === -Infinity) {
        throw new GraphError({ message: "Bellman-Ford algorithm does not support NaN or -Infinity edge weights" })
      }
      weights[i] = weight
    }
  })

  const addWeight = (distance: number, weight: number): number => {
    if (distance === Infinity || weight === Infinity) {
      return Infinity
    }
    const candidate = distance + weight
    if (!Number.isFinite(candidate)) {
      throw new GraphError({ message: "Bellman-Ford distance calculation exceeded the finite number range" })
    }
    return candidate
  }

  const distances = new Float64Array(cache.nodeIds.length)
  const previousNode = new Int32Array(cache.nodeIds.length)
  const previousEdge = new Int32Array(cache.nodeIds.length)
  distances.fill(Infinity)
  previousNode.fill(-1)
  previousEdge.fill(-1)
  distances[source] = 0

  for (let iteration = 0; iteration < cache.nodeIds.length - 1; iteration++) {
    let hasUpdate = false
    for (let edge = 0; edge < edges.length; edge++) {
      const edgeSource = edgeCache.sources[edge]
      const edgeTarget = edgeCache.targets[edge]
      const weight = weights[edge]
      const sourceDistance = distances[edgeSource]
      const candidate = addWeight(sourceDistance, weight)
      if (candidate < distances[edgeTarget]) {
        distances[edgeTarget] = candidate
        previousNode[edgeTarget] = edgeSource
        previousEdge[edgeTarget] = edge
        hasUpdate = true
      }
      if (graph.type === "undirected" && edgeSource !== edgeTarget) {
        const targetDistance = distances[edgeTarget]
        const reverseCandidate = addWeight(targetDistance, weight)
        if (reverseCandidate < distances[edgeSource]) {
          distances[edgeSource] = reverseCandidate
          previousNode[edgeSource] = edgeTarget
          previousEdge[edgeSource] = edge
          hasUpdate = true
        }
      }
    }
    if (!hasUpdate) {
      break
    }
  }

  // A relaxable edge after N-1 passes marks a reachable negative cycle; propagate to see if it reaches the target.
  const affected = new Uint8Array(cache.nodeIds.length)
  const queue = new Uint32Array(cache.nodeIds.length)
  let head = 0
  let tail = 0
  const markAffected = (node: number) => {
    if (affected[node] === 0) {
      affected[node] = 1
      queue[tail++] = node
    }
  }
  for (let edge = 0; edge < edges.length; edge++) {
    const edgeSource = edgeCache.sources[edge]
    const edgeTarget = edgeCache.targets[edge]
    const weight = weights[edge]
    if (addWeight(distances[edgeSource], weight) < distances[edgeTarget]) {
      markAffected(edgeTarget)
    }
    if (
      graph.type === "undirected" &&
      edgeSource !== edgeTarget &&
      addWeight(distances[edgeTarget], weight) < distances[edgeSource]
    ) {
      markAffected(edgeSource)
    }
  }
  if (tail > 0) {
    while (head < tail) {
      const node = queue[head++]
      for (let i = outgoing.rowOffsets[node]; i < outgoing.rowOffsets[node + 1]; i++) {
        if (weights[outgoing.edgeIndices[i]] !== Infinity) {
          markAffected(outgoing.columnIndices[i])
        }
      }
    }
  }
  if (affected[target] !== 0) {
    throw new GraphError({ message: `Negative cycle affects path to node ${config.target}` })
  }
  if (distances[target] === Infinity) {
    return Option.none()
  }

  const path: Array<NodeIndex> = []
  const pathEdges: Array<EdgeIndex> = []
  const costs: Array<E> = []
  let current = target
  let remaining = cache.nodeIds.length
  while (current !== -1) {
    if (remaining-- === 0) {
      throw new GraphError({ message: `Negative cycle affects path to node ${config.target}` })
    }
    path.push(cache.nodeIds[current])
    const edge = previousEdge[current]
    if (edge !== -1) {
      pathEdges.push(edgeIds[edge])
      costs.push(edges[edge].data)
    }
    current = previousNode[current]
  }
  path.reverse()
  pathEdges.reverse()
  costs.reverse()
  return Option.some({ path, edges: pathEdges, distance: distances[target], costs })
})

/**
 * A repeatable lazy iterable of edge-aware graph paths.
 *
 * **When to use**
 *
 * Use as the lazy result of graph path-enumeration functions.
 *
 * **Details**
 *
 * Each fresh iterator repeats the path enumeration.
 *
 * @category models
 * @since 4.0.0
 */
export interface PathWalker<E> extends Iterable<PathResult<E>> {}

/**
 * Configuration for lazy simple-path enumeration.
 *
 * **When to use**
 *
 * Use when bounding enumeration of loop-free routes between two nodes.
 *
 * **Details**
 *
 * `limit` bounds the number of yielded paths and defaults to `Infinity`.
 *
 * **Gotchas**
 *
 * `limit` must be a non-negative integer or `Infinity`.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface SimplePathsConfig {
  readonly source: NodeIndex
  readonly target: NodeIndex
  readonly limit?: number
}

/**
 * Configuration for enumerating all tied shortest paths.
 *
 * **When to use**
 *
 * Use when bounding enumeration of every route tied for minimum total cost.
 *
 * **Details**
 *
 * Edge costs must be non-negative. `limit` bounds the number of yielded paths
 * and defaults to `Infinity`.
 *
 * **Gotchas**
 *
 * Invalid costs and limits throw a `GraphError` when evaluated.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface AllShortestPathsConfig<E> extends DijkstraConfig<E> {
  readonly limit?: number
}

const pathEnumerationLimit = (limit: number | undefined): number => {
  const value = limit ?? Infinity
  if (value !== Infinity && (!Number.isInteger(value) || value < 0)) {
    throw new GraphError({ message: "Path enumeration limit must be a non-negative integer or Infinity" })
  }
  return value
}

const pathWalker = <E>(iterator: () => Iterator<PathResult<E>>): PathWalker<E> => ({
  [Symbol.iterator]: iterator
})

/**
 * Lazily enumerates simple source-to-target paths in depth-first edge order.
 *
 * **When to use**
 *
 * Use when you need possible loop-free routes rather than only an optimal
 * route.
 *
 * **Details**
 *
 * Nodes are never repeated within a path, so enumeration is finite even for
 * cyclic graphs. Path distance is the number of traversed edges.
 *
 * **Gotchas**
 *
 * The number of simple paths can be exponential. Missing endpoints or an
 * invalid `limit` throw a `GraphError`. Mutable graphs are snapshotted when
 * iteration begins.
 *
 * @see {@link allShortestPaths} for enumerating only minimum-cost routes
 *
 * @category algorithms
 * @since 4.0.0
 */
export const simplePaths: {
  <E>(config: SimplePathsConfig): <N, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => PathWalker<E>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config: SimplePathsConfig
  ): PathWalker<E>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: SimplePathsConfig
): PathWalker<E> => {
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(config.source)) {
    throw missingNode(config.source)
  }
  if (!impl.nodes.has(config.target)) {
    throw missingNode(config.target)
  }
  const limit = pathEnumerationLimit(config.limit)

  return pathWalker(function*() {
    const cache = csr.get(graph)
    const source = csr.getNodeIndex(cache, config.source)
    if (source === undefined) {
      throw missingNode(config.source)
    }
    const target = csr.getNodeIndex(cache, config.target)
    if (target === undefined) {
      throw missingNode(config.target)
    }
    if (limit === 0) {
      return
    }
    const outgoing = csr.getOutgoingWithEdges(cache)
    const edgeIds = csr.getEdgeIds(cache)
    const graphEdges = csr.getEdges(cache)
    const path = [config.source]
    const pathEdges: Array<EdgeIndex> = []
    const costs: Array<E> = []
    const visited = new Uint8Array(cache.nodeIds.length)
    visited[source] = 1
    const stack: Array<{ readonly node: number; position: number }> = [{
      node: source,
      position: outgoing.rowOffsets[source]
    }]
    let emitted = 0

    const backtrack = () => {
      const frame = stack.pop()!
      if (stack.length > 0) {
        visited[frame.node] = 0
        path.pop()
        pathEdges.pop()
        costs.pop()
      }
    }

    while (stack.length > 0 && emitted < limit) {
      const frame = stack[stack.length - 1]
      if (frame.node === target) {
        emitted++
        yield {
          path: Array.from(path),
          edges: Array.from(pathEdges),
          distance: pathEdges.length,
          costs: Array.from(costs)
        }
        backtrack()
        continue
      }
      if (frame.position >= outgoing.rowOffsets[frame.node + 1]) {
        backtrack()
        continue
      }
      const position = frame.position++
      const neighbor = outgoing.columnIndices[position]
      if (visited[neighbor] !== 0) {
        continue
      }
      const edge = outgoing.edgeIndices[position]
      visited[neighbor] = 1
      path.push(cache.nodeIds[neighbor])
      pathEdges.push(edgeIds[edge])
      costs.push(graphEdges[edge].data)
      stack.push({ node: neighbor, position: outgoing.rowOffsets[neighbor] })
    }
  })
})

/**
 * Lazily enumerates all simple paths tied for minimum total cost.
 *
 * **When to use**
 *
 * Use when every distinct route tied for the minimum total cost is required.
 *
 * **Details**
 *
 * Parallel edges produce distinct paths. Edge costs must be non-negative;
 * `Infinity` behaves as unavailable.
 *
 * **Gotchas**
 *
 * The number of tied paths can still be large. Missing endpoints, invalid
 * costs, arithmetic overflow, or an invalid `limit` throw a `GraphError`.
 * Mutable graphs are snapshotted when iteration begins.
 *
 * @see {@link dijkstra} when one shortest path is sufficient
 * @see {@link simplePaths} for routes regardless of cost
 *
 * @category algorithms
 * @since 4.0.0
 */
export const allShortestPaths: {
  <E>(config: AllShortestPathsConfig<E>): <N, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>
  ) => PathWalker<E>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config: AllShortestPathsConfig<E>
  ): PathWalker<E>
} = dual(2, <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: AllShortestPathsConfig<E>
): PathWalker<E> => {
  const impl = internal.toImpl(graph)
  if (!impl.nodes.has(config.source)) {
    throw missingNode(config.source)
  }
  if (!impl.nodes.has(config.target)) {
    throw missingNode(config.target)
  }
  const limit = pathEnumerationLimit(config.limit)

  return pathWalker(function*() {
    const cache = csr.get(graph)
    const source = csr.getNodeIndex(cache, config.source)
    if (source === undefined) {
      throw missingNode(config.source)
    }
    const target = csr.getNodeIndex(cache, config.target)
    if (target === undefined) {
      throw missingNode(config.target)
    }
    const graphEdges = csr.getEdges(cache)
    const edgeIds = csr.getEdgeIds(cache)
    const outgoing = csr.getOutgoingWithEdges(cache)
    const weights = new Float64Array(graphEdges.length)
    withMutationGuard(graph, () => {
      for (let edge = 0; edge < graphEdges.length; edge++) {
        const weight = config.cost(graphEdges[edge].data)
        if (Number.isNaN(weight) || weight < 0) {
          throw new GraphError({ message: "All shortest paths requires non-negative edge weights" })
        }
        weights[edge] = weight
      }
    })
    if (limit === 0) {
      return
    }

    const distances = new Float64Array(cache.nodeIds.length)
    distances.fill(Infinity)
    distances[source] = 0
    const previous: Array<Array<{ readonly node: number; readonly edge: number }> | undefined> = new Array(
      cache.nodeIds.length
    )
    const queue = denseMinHeapMake(cache.nodeIds.length)
    let sequence = 0
    denseMinHeapPush(queue, source, 0, sequence++)
    while (queue.size > 0) {
      denseMinHeapPop(queue)
      const currentNode = queue.poppedNode
      const currentDistance = queue.poppedPriority
      if (currentDistance !== distances[currentNode]) {
        continue
      }
      for (let i = outgoing.rowOffsets[currentNode]; i < outgoing.rowOffsets[currentNode + 1]; i++) {
        const edge = outgoing.edgeIndices[i]
        const neighbor = outgoing.columnIndices[i]
        const nextDistance = currentDistance + weights[edge]
        if (weights[edge] !== Infinity && !Number.isFinite(nextDistance)) {
          throw new GraphError({ message: "All shortest paths distance calculation exceeded the finite number range" })
        }
        const known = distances[neighbor]
        if (nextDistance < known) {
          distances[neighbor] = nextDistance
          previous[neighbor] = [{ node: currentNode, edge }]
          denseMinHeapPush(queue, neighbor, nextDistance, sequence++)
        } else if (nextDistance === known && nextDistance !== Infinity) {
          ;(previous[neighbor] ??= []).push({ node: currentNode, edge })
        }
      }
    }

    const distance = distances[target]
    if (distance === Infinity) {
      return
    }
    if (source === target) {
      yield { path: [config.source], edges: [], distance: 0, costs: [] }
      return
    }
    const reversePath = [target]
    const reverseEdges: Array<number> = []
    const visited = new Uint8Array(cache.nodeIds.length)
    visited[target] = 1
    const stack: Array<{ readonly node: number; position: number }> = [{ node: target, position: 0 }]
    let emitted = 0

    const backtrack = () => {
      const frame = stack.pop()!
      if (stack.length > 0) {
        visited[frame.node] = 0
        reversePath.pop()
        reverseEdges.pop()
      }
    }

    while (stack.length > 0 && emitted < limit) {
      const frame = stack[stack.length - 1]
      if (frame.node === source) {
        emitted++
        yield {
          path: reversePath.map((node) => cache.nodeIds[node]).reverse(),
          edges: reverseEdges.map((edge) => edgeIds[edge]).reverse(),
          distance,
          costs: reverseEdges.map((edge) => graphEdges[edge].data as E).reverse()
        }
        backtrack()
        continue
      }
      const predecessors = previous[frame.node] ?? []
      if (frame.position >= predecessors.length) {
        backtrack()
        continue
      }
      const predecessor = predecessors[frame.position++]
      if (visited[predecessor.node] !== 0) {
        continue
      }
      visited[predecessor.node] = 1
      reversePath.push(predecessor.node)
      reverseEdges.push(predecessor.edge)
      stack.push({ node: predecessor.node, position: 0 })
    }
  })
})

/**
 * Represents an iterable wrapper used by graph traversal and listing APIs.
 *
 * **Details**
 *
 * A `Walker` yields `[index, data]` pairs lazily and can be viewed as just the
 * indices, just the values, or mapped entries with `indices`, `values`,
 * `entries`, and `visit`.
 *
 * **Example** (Working with node walkers)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, 1)
 * })
 *
 * // Both traversal and element iterators return NodeWalker
 * const dfsNodes: Graph.NodeWalker<string> = Graph.dfs(graph, { start: [0] })
 * const allNodes: Graph.NodeWalker<string> = Graph.nodes(graph)
 *
 * // Common interface for working with node iterables
 * function processNodes<N>(nodeIterable: Graph.NodeWalker<N>): Array<number> {
 *   return Array.from(Graph.indices(nodeIterable))
 * }
 *
 * // Access node data using values() or entries()
 * Array.from(Graph.values(dfsNodes)) // => ["A", "B"]
 * Array.from(Graph.entries(allNodes)) // => [[0, "A"], [1, "B"]]
 * ```
 *
 * @category models
 * @since 3.18.0
 */
export class Walker<T, N> implements Iterable<[T, N]> {
  // @ts-ignore
  readonly [Symbol.iterator]: () => Iterator<[T, N]>

  /**
   * Lazily maps each walker entry with the provided function.
   *
   * **Details**
   *
   * The function receives the index and data and runs as the returned iterable
   * is consumed.
   *
   * **Example** (Visiting walker elements)
   *
   * ```ts import.meta.vitest
   * import { Graph } from "effect"
   *
   * const graph = Graph.directed<string, number>((mutable) => {
   *   const a = Graph.addNode(mutable, "A")
   *   const b = Graph.addNode(mutable, "B")
   *   Graph.addEdge(mutable, a, b, 1)
   * })
   *
   * const dfs = Graph.dfs(graph, { start: [0] })
   *
   * // Map to just the node data
   * Array.from(dfs.visit((index, data) => data)) // => ["A", "B"]
   *
   * // Map to custom objects
   * Array.from(dfs.visit((index, data) => ({ id: index, name: data }))) // => [{ id: 0, name: "A" }, { id: 1, name: "B" }]
   * ```
   *
   * @since 4.0.0
   */
  readonly visit: <U>(f: (index: T, data: N) => U) => Iterable<U>

  constructor(
    visit: <U>(f: (index: T, data: N) => U) => Iterable<U>
  ) {
    this.visit = visit
    this[Symbol.iterator] = () => visit((index, data) => [index, data] as [T, N])[Symbol.iterator]()
  }
}

const makeCsrNodeWalker = <N, E, T extends Kind>(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  makeIterator: <U>(cache: csr.Csr, f: (index: NodeIndex, data: N) => U) => Iterator<U>
): Walker<NodeIndex, N> => {
  return new Walker((f) => ({
    // Capture CSR at iterator creation so invalidation cannot change an in-flight mutable traversal.
    [Symbol.iterator]: () =>
      makeIterator(csr.get(graph), (index, data) => withMutationGuard(graph, () => f(index, data)))
  }))
}

const traversalStarts = <N, E, T extends Kind>(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  start: ReadonlyArray<NodeIndex> | undefined
): Array<NodeIndex> => {
  if (start === undefined) {
    return []
  }
  for (const nodeIndex of start) {
    if (!hasNode(graph, nodeIndex)) {
      throw missingNode(nodeIndex)
    }
  }
  return Array.from(start)
}

const traversalStartPositions = (cache: csr.Csr, start: ReadonlyArray<NodeIndex>): Array<number> => {
  const positions = new Array<number>(start.length)
  for (let i = 0; i < start.length; i++) {
    const position = csr.getNodeIndex(cache, start[i])
    if (position === undefined) {
      throw missingNode(start[i])
    }
    positions[i] = position
  }
  return positions
}

/**
 * Type alias for node iteration using Walker.
 * NodeWalker is represented as Walker<NodeIndex, N>.
 *
 * **When to use**
 *
 * Use as the shared node walker type returned by graph traversal and node
 * listing APIs.
 *
 * @see {@link Walker} for the generic lazy iterator wrapper
 * @see {@link EdgeWalker} for edge iterators
 *
 * @category models
 * @since 3.18.0
 */
export type NodeWalker<N> = Walker<NodeIndex, N>

/**
 * Type alias for edge iteration using Walker.
 * EdgeWalker is represented as Walker<EdgeIndex, Edge<E>>.
 *
 * **When to use**
 *
 * Use to type helpers or parameters that consume edge iterators returned by
 * `Graph` APIs, where each item is keyed by an `EdgeIndex` and carries the
 * full `Edge`.
 *
 * @see {@link Walker} for the generic lazy iterator wrapper
 * @see {@link NodeWalker} for node iterators
 * @see {@link edges} for creating edge walkers
 *
 * @category models
 * @since 3.18.0
 */
export type EdgeWalker<E> = Walker<EdgeIndex, Edge<E>>

/**
 * Returns an iterator over the indices in the walker.
 *
 * **Example** (Iterating walker indices)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, 1)
 * })
 *
 * const dfs = Graph.dfs(graph, { start: [0] })
 * Array.from(Graph.indices(dfs)) // => [0, 1]
 * ```
 *
 * @category iterators
 * @since 3.18.0
 */
export const indices = <T, N>(walker: Walker<T, N>): Iterable<T> => walker.visit((index, _) => index)

/**
 * Returns an iterator over the values (data) in the walker.
 *
 * **Example** (Iterating walker values)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, 1)
 * })
 *
 * const dfs = Graph.dfs(graph, { start: [0] })
 * Array.from(Graph.values(dfs)) // => ["A", "B"]
 * ```
 *
 * @category iterators
 * @since 3.18.0
 */
export const values = <T, N>(walker: Walker<T, N>): Iterable<N> => walker.visit((_, data) => data)

/**
 * Returns an iterator over [index, data] entries in the walker.
 *
 * **Example** (Iterating walker entries)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, a, b, 1)
 * })
 *
 * const dfs = Graph.dfs(graph, { start: [0] })
 * Array.from(Graph.entries(dfs)) // => [[0, "A"], [1, "B"]]
 * ```
 *
 * @category iterators
 * @since 3.18.0
 */
export const entries = <T, N>(walker: Walker<T, N>): Iterable<[T, N]> =>
  walker.visit((index, data) => [index, data] as [T, N])

/**
 * Configuration for DFS, BFS, and postorder graph traversals.
 *
 * **When to use**
 *
 * Use to configure the starting node indices and edge-following direction for
 * lazy graph traversals.
 *
 * **Details**
 *
 * `start` supplies the node indices where traversal begins. If it is omitted,
 * the iterator is empty. Distinct starts are prioritized in supplied order and
 * duplicates are ignored. `direction` chooses whether traversal follows outgoing
 * edges, incoming edges, or ignores edge direction. `radius` limits traversal
 * by edge distance from the nearest start node and accepts non-negative integers
 * or `Infinity`; omitting it means unbounded traversal.
 *
 * **Gotchas**
 *
 * Traversal creation validates and copies `start`, and throws a `GraphError`
 * when a start node does not exist or `radius` is invalid. Each fresh iterator
 * revalidates those starts against the graph snapshot it captures. Later
 * mutations are not observed by an active iterator.
 *
 * @category configuration
 * @since 3.18.0
 */
export interface SearchConfig {
  readonly start?: Array<NodeIndex>
  readonly direction?: TraversalDirection
  readonly radius?: number
}

/**
 * Creates a lazy depth-first traversal iterator from the configured start
 * nodes.
 *
 * **When to use**
 *
 * Use when exploring one branch deeply before visiting sibling branches.
 *
 * **Details**
 *
 * If no start nodes are supplied, the iterator is empty. The `direction` option
 * chooses whether to follow outgoing or incoming edges. The `radius` option
 * limits traversal by edge distance from the start nodes. It accepts
 * non-negative integers and `Infinity`; omitting it means unbounded traversal.
 *
 * **Gotchas**
 *
 * An invalid radius or missing start node throws a `GraphError`. Traversing a
 * mutable graph captures a snapshot when iteration begins; later mutations are
 * not observed by that iterator.
 *
 * **Example** (Traversing depth-first)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 1)
 *   Graph.addEdge(mutable, b, c, 1)
 * })
 *
 * // Start from a specific node
 * Array.from(Graph.indices(Graph.dfs(graph, { start: [0] }))) // => [0, 1, 2]
 *
 * Array.from(Graph.indices(Graph.dfs(graph))) // => []
 * ```
 *
 * @see {@link bfs} for traversal in increasing hop distance
 * @see {@link dfsPostOrder} for emitting descendants before ancestors
 * @category iterators
 * @since 3.18.0
 */
export const dfs: {
  (
    config?: SearchConfig
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => NodeWalker<N>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config?: SearchConfig
  ): NodeWalker<N>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: SearchConfig = {}
): NodeWalker<N> => {
  const radius = traversalRadius(config.radius, Infinity)
  const start = traversalStarts(graph, config.start)
  const direction = config.direction ?? "outgoing"

  return makeCsrNodeWalker(graph, (cache, f) => {
    const startPositions = traversalStartPositions(cache, start)
    const view = csr.getAdjacencies(cache, direction)
    const yielded = new Uint8Array(cache.nodeIds.length)
    const stack: Array<number> = []

    if (radius === Infinity) {
      // Reverse row order before pushing so LIFO traversal observes canonical adjacency order.
      for (let i = startPositions.length - 1; i >= 0; i--) {
        stack.push(startPositions[i])
      }

      const pushNeighbors = (targets: Uint32Array, offsets: Uint32Array, current: number) => {
        for (let i = offsets[current + 1] - 1; i >= offsets[current]; i--) {
          const neighbor = targets[i]
          if (yielded[neighbor] === 0) {
            stack.push(neighbor)
          }
        }
      }

      return {
        next() {
          while (stack.length > 0) {
            const current = stack.pop()!
            if (yielded[current] !== 0) {
              continue
            }

            if (view.secondary !== undefined) {
              pushNeighbors(view.secondary.columnIndices, view.secondary.rowOffsets, current)
            }
            pushNeighbors(view.primary.columnIndices, view.primary.rowOffsets, current)
            yielded[current] = 1

            return { done: false, value: f(cache.nodeIds[current], cache.nodeData[current] as N) }
          }

          return { done: true, value: undefined } as const
        }
      }
    }

    // Radius is shortest edge distance, so determine membership with BFS before imposing DFS order.
    const reached = new Uint8Array(cache.nodeIds.length)
    const queue = new Uint32Array(cache.nodeIds.length)
    const depths = new Uint32Array(cache.nodeIds.length)
    let head = 0
    let tail = 0

    for (const position of startPositions) {
      if (reached[position] === 0) {
        reached[position] = 1
        queue[tail++] = position
      }
    }

    const enqueue = (targets: Uint32Array, offsets: Uint32Array, current: number, depth: number) => {
      for (let i = offsets[current]; i < offsets[current + 1]; i++) {
        const neighbor = targets[i]
        if (reached[neighbor] === 0) {
          reached[neighbor] = 1
          queue[tail] = neighbor
          depths[tail++] = depth + 1
        }
      }
    }

    while (head < tail) {
      const current = queue[head]
      const depth = depths[head++]
      if (depth < radius) {
        enqueue(view.primary.columnIndices, view.primary.rowOffsets, current, depth)
        if (view.secondary !== undefined) {
          enqueue(view.secondary.columnIndices, view.secondary.rowOffsets, current, depth)
        }
      }
    }

    for (let i = startPositions.length - 1; i >= 0; i--) {
      stack.push(startPositions[i])
    }

    const pushNeighbors = (targets: Uint32Array, offsets: Uint32Array, current: number) => {
      for (let i = offsets[current + 1] - 1; i >= offsets[current]; i--) {
        const neighbor = targets[i]
        if (reached[neighbor] !== 0 && yielded[neighbor] === 0) {
          stack.push(neighbor)
        }
      }
    }

    return {
      next() {
        while (stack.length > 0) {
          const current = stack.pop()!
          if (yielded[current] !== 0) {
            continue
          }

          if (view.secondary !== undefined) {
            pushNeighbors(view.secondary.columnIndices, view.secondary.rowOffsets, current)
          }
          pushNeighbors(view.primary.columnIndices, view.primary.rowOffsets, current)
          yielded[current] = 1

          return { done: false, value: f(cache.nodeIds[current], cache.nodeData[current] as N) }
        }

        return { done: true, value: undefined } as const
      }
    }
  })
})

/**
 * Creates a lazy breadth-first traversal iterator from the configured start
 * nodes.
 *
 * **When to use**
 *
 * Use when visiting nodes in increasing unweighted distance from the start
 * nodes.
 *
 * **Details**
 *
 * If no start nodes are supplied, the iterator is empty. The `direction` option
 * chooses whether to follow outgoing or incoming edges. The `radius` option
 * limits traversal by edge distance from the start nodes. It accepts
 * non-negative integers and `Infinity`; omitting it means unbounded traversal.
 *
 * **Gotchas**
 *
 * An invalid radius or missing start node throws a `GraphError`. Traversing a
 * mutable graph captures a snapshot when iteration begins; later mutations are
 * not observed by that iterator.
 *
 * **Example** (Traversing breadth-first)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 1)
 *   Graph.addEdge(mutable, b, c, 1)
 * })
 *
 * // Start from a specific node
 * Array.from(Graph.indices(Graph.bfs(graph, { start: [0] }))) // => [0, 1, 2]
 *
 * Array.from(Graph.indices(Graph.bfs(graph))) // => []
 * ```
 *
 * @see {@link dfs} for branch-first traversal
 * @see {@link unweightedDistances} for collecting hop counts
 * @category iterators
 * @since 3.18.0
 */
export const bfs: {
  (
    config?: SearchConfig
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => NodeWalker<N>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config?: SearchConfig
  ): NodeWalker<N>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: SearchConfig = {}
): NodeWalker<N> => {
  const radius = traversalRadius(config.radius, Infinity)
  const start = traversalStarts(graph, config.start)
  const direction = config.direction ?? "outgoing"

  return makeCsrNodeWalker(graph, (cache, f) => {
    const startPositions = traversalStartPositions(cache, start)
    const view = csr.getAdjacencies(cache, direction)
    const discovered = new Uint8Array(cache.nodeIds.length)
    // Each compact node enters the queue once, so a fixed-size typed array is sufficient.
    const queue = new Uint32Array(cache.nodeIds.length)
    let head = 0
    let tail = 0

    for (const position of startPositions) {
      if (discovered[position] === 0) {
        discovered[position] = 1
        queue[tail++] = position
      }
    }

    const enqueue = (targets: Uint32Array, from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const neighbor = targets[i]
        if (discovered[neighbor] === 0) {
          discovered[neighbor] = 1
          queue[tail++] = neighbor
        }
      }
    }

    if (radius === Infinity) {
      return {
        next() {
          if (head >= tail) {
            return { done: true, value: undefined } as const
          }

          const current = queue[head++]
          enqueue(view.primary.columnIndices, view.primary.rowOffsets[current], view.primary.rowOffsets[current + 1])
          if (view.secondary !== undefined) {
            enqueue(
              view.secondary.columnIndices,
              view.secondary.rowOffsets[current],
              view.secondary.rowOffsets[current + 1]
            )
          }

          return { done: false, value: f(cache.nodeIds[current], cache.nodeData[current] as N) }
        }
      }
    }

    const depths = new Uint32Array(cache.nodeIds.length)
    const enqueueBounded = (targets: Uint32Array, from: number, to: number, depth: number) => {
      for (let i = from; i < to; i++) {
        const neighbor = targets[i]
        if (discovered[neighbor] === 0) {
          discovered[neighbor] = 1
          queue[tail] = neighbor
          depths[tail++] = depth + 1
        }
      }
    }

    return {
      next() {
        if (head >= tail) {
          return { done: true, value: undefined } as const
        }

        const current = queue[head]
        const depth = depths[head++]

        if (depth < radius) {
          enqueueBounded(
            view.primary.columnIndices,
            view.primary.rowOffsets[current],
            view.primary.rowOffsets[current + 1],
            depth
          )
          if (view.secondary !== undefined) {
            enqueueBounded(
              view.secondary.columnIndices,
              view.secondary.rowOffsets[current],
              view.secondary.rowOffsets[current + 1],
              depth
            )
          }
        }

        return { done: false, value: f(cache.nodeIds[current], cache.nodeData[current] as N) }
      }
    }
  })
})

/**
 * Configuration for the topological sort iterator.
 *
 * **When to use**
 *
 * Use to prioritize specific zero in-degree nodes in a topological sort.
 *
 * **Details**
 *
 * `initials` optionally supplies zero in-degree node indices used as
 * prioritized initial queue entries. Topological sorting still includes the
 * other zero in-degree nodes and produces a complete topological order.
 *
 * **Gotchas**
 *
 * Throws a `GraphError` when any initial node has incoming edges.
 *
 * @category configuration
 * @since 3.18.0
 */
export interface TopoConfig {
  readonly initials?: Array<NodeIndex>
}

/**
 * Creates a lazy topological-order iterator for a directed acyclic graph.
 *
 * **When to use**
 *
 * Use when processing dependencies so every predecessor is emitted before the
 * nodes that depend on it.
 *
 * **Details**
 *
 * The iterator uses Kahn's algorithm. Multiple valid orders may exist;
 * `initials` prioritizes eligible zero in-degree nodes without excluding other
 * nodes.
 *
 * **Gotchas**
 *
 * Undirected or cyclic graphs, missing initial nodes, and initial nodes with
 * incoming edges throw a `GraphError`. Traversing a mutable graph captures a
 * snapshot when iteration begins; later mutations are not observed.
 *
 * **Example** (Sorting topologically)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 1)
 *   Graph.addEdge(mutable, b, c, 1)
 * })
 *
 * Array.from(Graph.indices(Graph.topo(graph))) // => [0, 1, 2]
 * ```
 *
 * @see {@link isAcyclic} for checking the required graph property
 * @category iterators
 * @since 3.18.0
 */
export const topo: {
  (
    config?: TopoConfig
  ): <N, E>(graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">) => NodeWalker<N>
  <N, E>(
    graph: Graph<N, E, "directed"> | MutableGraph<N, E, "directed">,
    config?: TopoConfig
  ): NodeWalker<N>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: TopoConfig = {}
): NodeWalker<N> => {
  if (graph.type === "undirected") {
    throw new GraphError({ message: "Cannot perform topological sort on undirected graph" })
  }

  // Check if graph is acyclic first
  if (!isAcyclic(graph)) {
    throw new GraphError({ message: "Cannot perform topological sort on cyclic graph" })
  }

  const initials = Array.from(config.initials ?? [])

  // Validate that all initial nodes exist
  for (const nodeIndex of initials) {
    if (!hasNode(graph, nodeIndex)) {
      throw missingNode(nodeIndex)
    }
  }

  return makeCsrNodeWalker(graph, (cache, f) => {
    const outgoing = csr.getOutgoing(cache)
    const incoming = csr.getIncoming(cache)
    // CSR row lengths are the initial in-degrees used by Kahn's algorithm.
    const inDegree = new Uint32Array(cache.nodeIds.length)
    const remaining = new Uint8Array(cache.nodeIds.length)
    const initialSet = new Uint8Array(cache.nodeIds.length)
    const queue: Array<number> = []
    let remainingCount = cache.nodeIds.length
    let head = 0
    remaining.fill(1)

    for (let node = 0; node < cache.nodeIds.length; node++) {
      inDegree[node] = incoming.rowOffsets[node + 1] - incoming.rowOffsets[node]
    }
    for (const initial of initials) {
      const node = csr.getNodeIndex(cache, initial)
      if (node === undefined) {
        throw missingNode(initial)
      }
      if (inDegree[node] !== 0) {
        throw new GraphError({ message: `Initial node ${initial} has incoming edges` })
      }
      initialSet[node] = 1
      queue.push(node)
    }
    for (let node = 0; node < cache.nodeIds.length; node++) {
      if (inDegree[node] === 0 && initialSet[node] === 0) {
        queue.push(node)
      }
    }

    return {
      next() {
        while (head < queue.length) {
          const current = queue[head++]
          if (remaining[current] === 0) {
            continue
          }
          remaining[current] = 0
          remainingCount--

          for (let i = outgoing.rowOffsets[current]; i < outgoing.rowOffsets[current + 1]; i++) {
            const neighbor = outgoing.columnIndices[i]
            if (remaining[neighbor] !== 0) {
              const degree = --inDegree[neighbor]
              if (degree === 0) {
                queue.push(neighbor)
              }
            }
          }

          return { done: false, value: f(cache.nodeIds[current], cache.nodeData[current] as N) }
        }

        if (remainingCount > 0) {
          throw new GraphError({ message: "Cannot perform topological sort on cyclic graph" })
        }
        return { done: true, value: undefined } as const
      }
    }
  })
})

/**
 * Creates a lazy depth-first postorder traversal iterator from the configured
 * start nodes.
 *
 * **When to use**
 *
 * Use when reachable descendants must be emitted before the nodes that lead to
 * them.
 *
 * **Details**
 *
 * Nodes are emitted after their reachable descendants have been processed. If
 * no start nodes are supplied, the iterator is empty. The `direction` option
 * chooses whether to follow outgoing or incoming edges. The `radius` option
 * limits traversal by edge distance from the start nodes. It accepts
 * non-negative integers and `Infinity`; omitting it means unbounded traversal.
 * With a finite `radius`, a bounded breadth-first pass first determines
 * shortest-distance membership before nodes are emitted in postorder.
 *
 * **Gotchas**
 *
 * Invalid radii and missing start nodes throw a `GraphError`. Traversing a
 * mutable graph captures a snapshot when iteration begins; later mutations are
 * not observed by that iterator.
 *
 * **Example** (Traversing in postorder)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const root = Graph.addNode(mutable, "root")
 *   const child1 = Graph.addNode(mutable, "child1")
 *   const child2 = Graph.addNode(mutable, "child2")
 *   Graph.addEdge(mutable, root, child1, 1)
 *   Graph.addEdge(mutable, root, child2, 1)
 * })
 *
 * // Postorder: children before parents
 * Array.from(Graph.indices(Graph.dfsPostOrder(graph, { start: [0] }))) // => [1, 2, 0]
 * ```
 *
 * @see {@link dfs} for emitting nodes when first visited
 * @category iterators
 * @since 3.18.0
 */
export const dfsPostOrder: {
  (
    config?: SearchConfig
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => NodeWalker<N>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config?: SearchConfig
  ): NodeWalker<N>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: SearchConfig = {}
): NodeWalker<N> => {
  const radius = traversalRadius(config.radius, Infinity)
  const start = traversalStarts(graph, config.start)
  const direction = config.direction ?? "outgoing"

  return makeCsrNodeWalker(graph, (cache, f) => {
    const startPositions = traversalStartPositions(cache, start)
    const view = csr.getAdjacencies(cache, direction)
    let reached: Uint8Array | undefined
    if (radius !== Infinity) {
      // Radius is shortest edge distance, so determine membership with BFS before imposing postorder.
      const boundedReached = new Uint8Array(cache.nodeIds.length)
      const queue = new Uint32Array(cache.nodeIds.length)
      const depths = new Uint32Array(cache.nodeIds.length)
      let head = 0
      let tail = 0

      for (const position of startPositions) {
        if (boundedReached[position] === 0) {
          boundedReached[position] = 1
          queue[tail++] = position
        }
      }

      const enqueue = (targets: Uint32Array, offsets: Uint32Array, current: number, depth: number) => {
        for (let i = offsets[current]; i < offsets[current + 1]; i++) {
          const neighbor = targets[i]
          if (boundedReached[neighbor] === 0) {
            boundedReached[neighbor] = 1
            queue[tail] = neighbor
            depths[tail++] = depth + 1
          }
        }
      }

      while (head < tail) {
        const current = queue[head]
        const depth = depths[head++]
        if (depth < radius) {
          enqueue(view.primary.columnIndices, view.primary.rowOffsets, current, depth)
          if (view.secondary !== undefined) {
            enqueue(view.secondary.columnIndices, view.secondary.rowOffsets, current, depth)
          }
        }
      }
      reached = boundedReached
    }

    const stack: Array<number> = []
    const primaryPositions: Array<number> = []
    const secondaryPositions: Array<number> = []
    const discovered = new Uint8Array(cache.nodeIds.length)

    const push = (node: number) => {
      if ((reached === undefined || reached[node] !== 0) && discovered[node] === 0) {
        discovered[node] = 1
        stack.push(node)
        primaryPositions.push(view.primary.rowOffsets[node])
        secondaryPositions.push(view.secondary?.rowOffsets[node] ?? 0)
      }
    }

    let startPosition = 0

    return {
      next() {
        while (true) {
          while (stack.length === 0 && startPosition < startPositions.length) {
            push(startPositions[startPosition++])
          }
          if (stack.length === 0) {
            return { done: true, value: undefined } as const
          }
          const index = stack.length - 1
          const current = stack[index]
          const primaryPosition = primaryPositions[index]
          if (primaryPosition < view.primary.rowOffsets[current + 1]) {
            primaryPositions[index] = primaryPosition + 1
            push(view.primary.columnIndices[primaryPosition])
            continue
          }
          if (view.secondary !== undefined) {
            const secondaryPosition = secondaryPositions[index]
            if (secondaryPosition < view.secondary.rowOffsets[current + 1]) {
              secondaryPositions[index] = secondaryPosition + 1
              push(view.secondary.columnIndices[secondaryPosition])
              continue
            }
          }

          stack.pop()
          primaryPositions.pop()
          secondaryPositions.pop()
          return { done: false, value: f(cache.nodeIds[current], cache.nodeData[current] as N) }
        }
      }
    }
  })
})

/**
 * Creates a walker over all node index and payload entries in the graph.
 *
 * **Details**
 *
 * Entries follow graph node order and include all nodes regardless of
 * connectivity. Use `indices` or `values` to project one side of each entry.
 *
 * **Gotchas**
 *
 * Mutable graphs are not snapshotted; mutations may affect the remaining
 * iteration.
 *
 * **Example** (Iterating all nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 1)
 * })
 *
 * Array.from(Graph.indices(Graph.nodes(graph))) // => [0, 1, 2]
 * ```
 *
 * @category iterators
 * @since 3.18.0
 */
export const nodes = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): NodeWalker<N> =>
  new Walker((f) => ({
    [Symbol.iterator]() {
      const nodeMap = internal.toImpl(graph).nodes
      const iterator = nodeMap.entries()

      return {
        next() {
          const result = iterator.next()
          if (result.done) {
            return { done: true, value: undefined }
          }
          const [nodeIndex, nodeData] = result.value
          return { done: false, value: withMutationGuard(graph, () => f(nodeIndex, nodeData)) }
        }
      }
    }
  }))

/**
 * Creates a walker over all edge index and edge entries in the graph.
 *
 * **Details**
 *
 * Entries follow graph edge order and include all edges regardless of
 * connectivity. Use `indices` or `values` to project one side of each entry.
 *
 * **Gotchas**
 *
 * Mutable graphs are not snapshotted; mutations may affect the remaining
 * iteration.
 *
 * **Example** (Iterating all edges)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const a = Graph.addNode(mutable, "A")
 *   const b = Graph.addNode(mutable, "B")
 *   const c = Graph.addNode(mutable, "C")
 *   Graph.addEdge(mutable, a, b, 1)
 *   Graph.addEdge(mutable, b, c, 2)
 * })
 *
 * Array.from(Graph.indices(Graph.edges(graph))) // => [0, 1]
 * ```
 *
 * @category iterators
 * @since 3.18.0
 */
export const edges = <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>
): EdgeWalker<E> =>
  new Walker((f) => ({
    [Symbol.iterator]() {
      const edgeMap = internal.toImpl(graph).edges
      const iterator = edgeMap.entries()

      return {
        next() {
          const result = iterator.next()
          if (result.done) {
            return { done: true, value: undefined }
          }
          const [edgeIndex, edgeData] = result.value
          return { done: false, value: withMutationGuard(graph, () => f(edgeIndex, copyEdge(edgeData))) }
        }
      }
    }
  }))

/**
 * Configuration for selecting external nodes.
 *
 * **When to use**
 *
 * Use to configure how `externals` identifies graph boundary nodes when you
 * need sinks with no outgoing edges or sources with no incoming edges.
 *
 * **Details**
 *
 * `direction` chooses which missing edge direction makes a node external:
 * `"outgoing"` selects nodes with no outgoing edges, and `"incoming"` selects
 * nodes with no incoming edges. If omitted, `direction` defaults to
 * `"outgoing"`.
 *
 * @category configuration
 * @since 3.18.0
 */
export interface ExternalsConfig {
  readonly direction?: Direction
}

/**
 * Creates an iterator over external nodes (nodes without edges in the specified direction).
 *
 * **When to use**
 *
 * Use when locating sources, sinks, or isolated boundary nodes.
 *
 * **Details**
 *
 * External nodes have no outgoing edges (`direction: "outgoing"`) or no
 * incoming edges (`direction: "incoming"`).
 *
 * **Gotchas**
 *
 * For undirected graphs, incoming and outgoing adjacency are equivalent, so
 * only isolated nodes are external. Mutable graphs are not snapshotted;
 * mutations may affect the remaining iteration.
 *
 * **Example** (Iterating external nodes)
 *
 * ```ts import.meta.vitest
 * import { Graph } from "effect"
 *
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const source = Graph.addNode(mutable, "source") // 0 - no incoming
 *   const middle = Graph.addNode(mutable, "middle") // 1 - has both
 *   const sink = Graph.addNode(mutable, "sink") // 2 - no outgoing
 *   const isolated = Graph.addNode(mutable, "isolated") // 3 - no edges
 *
 *   Graph.addEdge(mutable, source, middle, 1)
 *   Graph.addEdge(mutable, middle, sink, 2)
 * })
 *
 * // Nodes with no outgoing edges (sinks + isolated)
 * Array.from(Graph.indices(Graph.externals(graph, { direction: "outgoing" }))) // => [2, 3]
 *
 * // Nodes with no incoming edges (sources + isolated)
 * Array.from(Graph.indices(Graph.externals(graph, { direction: "incoming" }))) // => [0, 3]
 * ```
 *
 * @category iterators
 * @since 3.18.0
 */
export const externals: {
  (
    config?: ExternalsConfig
  ): <N, E, T extends Kind = "directed">(graph: Graph<N, E, T> | MutableGraph<N, E, T>) => NodeWalker<N>
  <N, E, T extends Kind = "directed">(
    graph: Graph<N, E, T> | MutableGraph<N, E, T>,
    config?: ExternalsConfig
  ): NodeWalker<N>
} = dual((args) => isGraph(args[0]), <N, E, T extends Kind = "directed">(
  graph: Graph<N, E, T> | MutableGraph<N, E, T>,
  config: ExternalsConfig = {}
): NodeWalker<N> => {
  const direction = config.direction ?? "outgoing"

  return new Walker((f) => ({
    [Symbol.iterator]: () => {
      const impl = internal.toImpl(graph)
      const nodeMap = impl.nodes
      const adjacencyMap = direction === "incoming"
        ? impl.reverseAdjacency
        : impl.adjacency

      const nodeIterator = nodeMap.entries()

      const nextMapped = () => {
        let current = nodeIterator.next()
        while (!current.done) {
          const [nodeIndex, nodeData] = current.value
          const adjacencyList = adjacencyMap.get(nodeIndex)

          // Node is external if it has no edges in the specified direction
          if (adjacencyList === undefined || adjacencyList.length === 0) {
            return { done: false, value: withMutationGuard(graph, () => f(nodeIndex, nodeData)) }
          }
          current = nodeIterator.next()
        }

        return { done: true, value: undefined } as const
      }

      return { next: nextMapped }
    }
  }))
})
