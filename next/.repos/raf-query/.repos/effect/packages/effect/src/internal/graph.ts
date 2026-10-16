import * as Equal from "../Equal.ts"
import type * as Graph from "../Graph.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import * as Option from "../Option.ts"
import { pipeArguments } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"

/** @internal */
export const TypeId = "~effect/Graph"

/** @internal */
export const isGraph = <N = unknown, E = unknown, T extends Graph.Kind = Graph.Kind, U = never>(
  u: U | Graph.Graph<N, E, T> | Graph.MutableGraph<N, E, T>
): u is Graph.Graph<N, E, T> | Graph.MutableGraph<N, E, T> => hasProperty(u, TypeId)

/** @internal */
export interface GraphImpl<in out N, in out E, T extends Graph.Kind>
  extends Iterable<readonly [Graph.NodeIndex, N]>, Equal.Equal
{
  readonly [TypeId]: unknown
  type: T
  mutable: boolean
  transforming: boolean
  nodes: Map<Graph.NodeIndex, N>
  edges: Map<Graph.EdgeIndex, Graph.Edge<E>>
  adjacency: Map<Graph.NodeIndex, Array<Graph.EdgeIndex>>
  reverseAdjacency: Map<Graph.NodeIndex, Array<Graph.EdgeIndex>>
  nextNodeIndex: Graph.NodeIndex
  nextEdgeIndex: Graph.EdgeIndex
  acyclic: Option.Option<boolean>
  toJSON(): unknown
}

/** @internal */
export const toImpl = <N, E, T extends Graph.Kind>(
  graph: Graph.Graph<N, E, T> | Graph.MutableGraph<N, E, T>
): GraphImpl<N, E, T> => graph as unknown as GraphImpl<N, E, T>

/** @internal */
export const isTransforming = <N, E, T extends Graph.Kind>(
  graph: Graph.Graph<N, E, T> | Graph.MutableGraph<N, E, T>
): boolean => toImpl(graph).transforming

/** @internal */
export const withTransformation = <N, E, T extends Graph.Kind, A>(
  graph: Graph.MutableGraph<N, E, T>,
  evaluate: () => A
): A => {
  const impl = toImpl(graph)
  const transforming = impl.transforming
  impl.transforming = true
  try {
    return evaluate()
  } finally {
    impl.transforming = transforming
  }
}

const edgeEquals = (type: Graph.Kind, self: Graph.Edge<any>, that: Graph.Edge<any>): boolean =>
  (type === "directed"
    ? self.source === that.source && self.target === that.target
    : (self.source === that.source && self.target === that.target) ||
      (self.source === that.target && self.target === that.source)) &&
  Equal.equals(self.data, that.data)

const edgeHash = (type: Graph.Kind, edge: Graph.Edge<any>): number =>
  type === "directed"
    ? Hash.hash(edge)
    : Hash.optimize(Hash.combine(Hash.hash(edge.data), endpointsHash(edge.source, edge.target)))

/**
 * Addition is commutative and does not cancel self-loops.
 *
 * @internal
 */
export const endpointsHash = (source: unknown, target: unknown): number =>
  Hash.combine(0, Hash.hash(source)) + Hash.combine(0, Hash.hash(target))

const graphSeed = Hash.string("Graph")

const ProtoGraph = {
  [TypeId]: {
    _N: (_: never) => _,
    _E: (_: never) => _
  },
  [Symbol.iterator](this: GraphImpl<any, any, any>) {
    return this.nodes[Symbol.iterator]()
  },
  [NodeInspectSymbol](this: GraphImpl<any, any, any>) {
    return this.toJSON()
  },
  [Equal.symbol](this: GraphImpl<any, any, any>, that: Equal.Equal): boolean {
    if (hasProperty(that, TypeId)) {
      const thatImpl = toImpl(that as Graph.Graph<any, any, any>)
      if (
        this.nodes.size !== thatImpl.nodes.size ||
        this.edges.size !== thatImpl.edges.size ||
        this.type !== thatImpl.type
      ) {
        return false
      }
      for (const [nodeIndex, nodeData] of this.nodes) {
        if (!thatImpl.nodes.has(nodeIndex) || !Equal.equals(nodeData, thatImpl.nodes.get(nodeIndex))) {
          return false
        }
      }
      for (const [edgeIndex, edgeData] of this.edges) {
        const otherEdge = thatImpl.edges.get(edgeIndex)
        if (otherEdge === undefined || !edgeEquals(this.type, edgeData, otherEdge)) {
          return false
        }
      }
      return true
    }
    return false
  },
  [Hash.symbol](this: GraphImpl<any, any, any>): number {
    let hash = graphSeed
    hash = hash ^ Hash.string(this.type)
    hash = hash ^ Hash.number(this.nodes.size)
    hash = hash ^ Hash.number(this.edges.size)
    for (const [nodeIndex, nodeData] of this.nodes) {
      hash ^= Hash.combine(Hash.hash(nodeIndex), Hash.hash(nodeData))
    }
    for (const [edgeIndex, edgeData] of this.edges) {
      hash ^= Hash.combine(Hash.hash(edgeIndex), edgeHash(this.type, edgeData))
    }
    return Hash.optimize(hash)
  },
  toJSON(this: GraphImpl<any, any, any>) {
    return {
      _id: "Graph",
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      type: this.type
    }
  },
  toString(this: GraphImpl<any, any, any>) {
    return `Graph(${this.type}, ${this.nodes.size}, ${this.edges.size})`
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/** @internal */
export const make = <N, E, T extends Graph.Kind>(type: T, mutable: boolean): GraphImpl<N, E, T> => {
  const graph: GraphImpl<N, E, T> = Object.create(ProtoGraph)
  graph.type = type
  graph.mutable = mutable
  graph.transforming = false
  graph.nodes = new Map()
  graph.edges = new Map()
  graph.adjacency = new Map()
  graph.reverseAdjacency = new Map()
  graph.nextNodeIndex = 0
  graph.nextEdgeIndex = 0
  graph.acyclic = Option.some(true)
  return graph
}

const cloneAdjacency = (
  adjacency: Map<Graph.NodeIndex, Array<Graph.EdgeIndex>>
): Map<Graph.NodeIndex, Array<Graph.EdgeIndex>> => {
  const cloned = new Map<Graph.NodeIndex, Array<Graph.EdgeIndex>>()
  for (const [nodeIndex, edges] of adjacency) {
    cloned.set(nodeIndex, [...edges])
  }
  return cloned
}

/** @internal */
export const clone = <N, E, T extends Graph.Kind>(
  source: GraphImpl<N, E, T>,
  mutable: boolean
): GraphImpl<N, E, T> => {
  const graph = make<N, E, T>(source.type, mutable)
  graph.nodes = new Map(source.nodes)
  graph.edges = new Map(source.edges)
  graph.adjacency = cloneAdjacency(source.adjacency)
  graph.reverseAdjacency = cloneAdjacency(source.reverseAdjacency)
  graph.nextNodeIndex = source.nextNodeIndex
  graph.nextEdgeIndex = source.nextEdgeIndex
  graph.acyclic = source.acyclic
  return graph
}

/** @internal */
export const finalize = <N, E, T extends Graph.Kind>(source: GraphImpl<N, E, T>): GraphImpl<N, E, T> => {
  const graph: GraphImpl<N, E, T> = Object.create(ProtoGraph)
  graph.type = source.type
  graph.mutable = false
  graph.transforming = false
  graph.nodes = source.nodes
  graph.edges = source.edges
  graph.adjacency = source.adjacency
  graph.reverseAdjacency = source.reverseAdjacency
  graph.nextNodeIndex = source.nextNodeIndex
  graph.nextEdgeIndex = source.nextEdgeIndex
  graph.acyclic = source.acyclic
  return graph
}

/** @internal */
export const snapshot = <N, E, T extends Graph.Kind>(graph: Graph.Graph<N, E, T>): Graph.Snapshot<N, E, T> => {
  const impl = toImpl(graph)
  return {
    type: graph.type,
    nodes: Array.from(impl.nodes, ([index, data]) => ({ index, data })).sort((a, b) => a.index - b.index),
    edges: Array.from(impl.edges, ([index, edge]) => ({
      index,
      source: edge.source,
      target: edge.target,
      data: edge.data
    })).sort((a, b) => a.index - b.index)
  }
}

/** @internal */
export const hydrate = <N, E, T extends Graph.Kind>(
  snapshot: Graph.Snapshot<N, E, T>
): Graph.Graph<N, E, T> => {
  const graph = make<N, E, T>(snapshot.type, false)
  for (const node of snapshot.nodes) {
    graph.nodes.set(node.index, node.data)
    graph.adjacency.set(node.index, [])
    graph.reverseAdjacency.set(node.index, [])
  }
  for (const edge of snapshot.edges) {
    graph.edges.set(edge.index, {
      source: edge.source,
      target: edge.target,
      data: edge.data
    })
    graph.adjacency.get(edge.source)!.push(edge.index)
    graph.reverseAdjacency.get(edge.target)!.push(edge.index)
    if (snapshot.type === "undirected") {
      graph.adjacency.get(edge.target)!.push(edge.index)
      graph.reverseAdjacency.get(edge.source)!.push(edge.index)
    }
  }
  graph.nextNodeIndex = snapshot.nodes.length === 0 ? 0 : snapshot.nodes[snapshot.nodes.length - 1].index + 1
  graph.nextEdgeIndex = snapshot.edges.length === 0 ? 0 : snapshot.edges[snapshot.edges.length - 1].index + 1
  graph.acyclic = Option.none()
  return graph as unknown as Graph.Graph<N, E, T>
}
