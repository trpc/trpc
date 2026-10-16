import { Graph, hole, type Option, pipe } from "effect"
import { describe, expect, it } from "tstyche"

declare const directed: Graph.DirectedGraph<string, number>
declare const undirected: Graph.UndirectedGraph<string, number>
declare const mutableDirected: Graph.MutableDirectedGraph<string, number>
declare const mutableUndirected: Graph.MutableUndirectedGraph<string, number>
declare const unknownKind: Graph.Graph<string, number, Graph.Kind>
declare const mixedKind: Graph.DirectedGraph<string, number> | Graph.UndirectedGraph<string, number>

interface Node {
  readonly id: string
}

interface Animal {
  readonly name: string
}

interface Dog extends Animal {
  readonly breed: string
}

declare const directedNodes: Graph.DirectedGraph<Node, number>
declare const undirectedNodes: Graph.UndirectedGraph<Node, number>
declare const dogGraph: Graph.DirectedGraph<Dog, 1>
declare const animalGraph: Graph.DirectedGraph<Animal, number>
declare const dogMutableGraph: Graph.MutableDirectedGraph<Dog, 1>
declare const animalMutableGraph: Graph.MutableDirectedGraph<Animal, number>

describe("Graph", () => {
  it("make", () => {
    expect(
      Graph.make("directed")<string, number>((mutable) => {
        expect(mutable).type.toBe<Graph.MutableDirectedGraph<string, number>>()
      })
    ).type.toBe<Graph.DirectedGraph<string, number>>()

    expect(
      Graph.make("undirected")<string, number>((mutable) => {
        expect(mutable).type.toBe<Graph.MutableUndirectedGraph<string, number>>()
      })
    ).type.toBe<Graph.UndirectedGraph<string, number>>()

    expect(Graph.make("directed")<string, number>).type.not.toBeCallableWith(async () => {})
    expect(Graph.make("undirected")<string, number>).type.not.toBeCallableWith(() => Promise.resolve())
  })

  it("fromSnapshot", () => {
    expect(Graph.fromSnapshot({
      type: "directed",
      nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
      edges: [{ index: 3, source: 2, target: 5, data: 1 }]
    })).type.toBe<Graph.DirectedGraph<string, number>>()

    expect(Graph.fromSnapshot({
      type: "undirected",
      nodes: [{ index: 0, data: "A" }],
      edges: [] as ReadonlyArray<Graph.IndexedEdge<number>>
    })).type.toBe<Graph.UndirectedGraph<string, number>>()
  })

  it("mutation callbacks must be synchronous", () => {
    expect(Graph.directed<string, number>).type.not.toBeCallableWith(async () => {})
    expect(Graph.undirected<string, number>).type.not.toBeCallableWith(() => Promise.resolve())
    expect(Graph.mutate).type.not.toBeCallableWith(directed, async () => {})
    expect(Graph.mutate).type.not.toBeCallableWith(async () => {})

    expect(Graph.mutate(directed, (mutable) => {
      expect(mutable).type.toBe<Graph.MutableDirectedGraph<string, number>>()
    })).type.toBe<Graph.DirectedGraph<string, number>>()
    expect(pipe(
      directed,
      Graph.mutate((mutable) => {
        expect(mutable).type.toBe<Graph.MutableDirectedGraph<string, number>>()
      })
    )).type.toBe<Graph.DirectedGraph<string, number>>()
  })

  it("opaque interface", () => {
    expect(Graph.nodes(directed)).type.toBe<Graph.NodeWalker<string>>()
    expect(Graph.edges(directed)).type.toBe<Graph.EdgeWalker<number>>()

    // @ts-expect-error Property 'nodes' does not exist on type 'DirectedGraph<string, number>'
    const _nodes: unknown = directed.nodes
    // @ts-expect-error Property 'edges' does not exist on type 'DirectedGraph<string, number>'
    const _edges: unknown = directed.edges
    // @ts-expect-error Property 'adjacency' does not exist on type 'DirectedGraph<string, number>'
    const _adjacency: unknown = directed.adjacency
    // @ts-expect-error Property 'nodes' does not exist on type 'MutableGraph<string, number, "directed">'
    const _mutableNodes: unknown = Graph.beginMutation(directed).nodes

    expect(_nodes).type.toBe<unknown>()
    expect(_edges).type.toBe<unknown>()
    expect(_adjacency).type.toBe<unknown>()
    expect(_mutableNodes).type.toBe<unknown>()
  })

  it("variance", () => {
    expect(dogGraph).type.toBeAssignableTo<Graph.DirectedGraph<Animal, number>>()
    expect(animalGraph).type.not.toBeAssignableTo<Graph.DirectedGraph<Dog, 1>>()
    expect(dogMutableGraph).type.not.toBeAssignableTo<Graph.MutableDirectedGraph<Animal, number>>()
    expect(animalMutableGraph).type.not.toBeAssignableTo<Graph.MutableDirectedGraph<Dog, 1>>()
  })

  it("standalone data-last getters", () => {
    const getNode = Graph.getNode(0)
    const getEdge = Graph.getEdge(0)

    expect(getNode(directed)).type.toBe<Option.Option<string>>()
    expect(getNode(undirected)).type.toBe<Option.Option<string>>()
    expect(getNode(Graph.beginMutation(directed))).type.toBe<Option.Option<string>>()
    expect(getNode(Graph.beginMutation(undirected))).type.toBe<Option.Option<string>>()

    expect(getEdge(directed)).type.toBe<Option.Option<Graph.Edge<number>>>()
    expect(getEdge(undirected)).type.toBe<Option.Option<Graph.Edge<number>>>()
    expect(getEdge(Graph.beginMutation(directed))).type.toBe<Option.Option<Graph.Edge<number>>>()
    expect(getEdge(Graph.beginMutation(undirected))).type.toBe<Option.Option<Graph.Edge<number>>>()
  })

  it("guards", () => {
    const input = hole<unknown>()
    if (Graph.isGraph(input)) {
      expect(input).type.toBe<
        Graph.Graph<unknown, unknown, Graph.Kind> | Graph.MutableGraph<unknown, unknown, Graph.Kind>
      >()
    }

    const known = hole<
      | Graph.UndirectedGraph<string, number>
      | Graph.MutableUndirectedGraph<string, number>
      | { readonly _tag: "other" }
    >()
    if (Graph.isGraph(known)) {
      expect(known).type.toBe<Graph.UndirectedGraph<string, number> | Graph.MutableUndirectedGraph<string, number>>()
    }

    const mixed = hole<
      | Graph.DirectedGraph<string, number>
      | Graph.UndirectedGraph<string, number>
      | Graph.MutableDirectedGraph<string, number>
      | Graph.MutableUndirectedGraph<string, number>
      | { readonly _tag: "other" }
    >()
    if (Graph.isGraph(mixed)) {
      expect(mixed.type).type.toBe<Graph.Kind>()
      if (mixed.type === "undirected") {
        expect(mixed.type).type.toBe<"undirected">()
      }
    }
  })

  it("compose", () => {
    expect(Graph.compose(directedNodes, directedNodes, {
      nodeIdentity: (node) => {
        expect(node).type.toBe<Node>()
        return node.id
      },
      edgeIdentity: (edge) => {
        expect(edge).type.toBe<number>()
        return edge
      }
    })).type.toBe<Graph.DirectedGraph<Node, number>>()

    expect(pipe(
      undirectedNodes,
      Graph.compose(undirectedNodes, {
        nodeIdentity: (node) => {
          expect(node).type.toBe<Node>()
          return node.id
        }
      })
    )).type.toBe<Graph.UndirectedGraph<Node, number>>()
  })

  it("intersection", () => {
    expect(Graph.intersection(directedNodes, directedNodes)).type.toBe<Graph.DirectedGraph<Node, number>>()

    expect(pipe(
      undirectedNodes,
      Graph.intersection(undirectedNodes)
    )).type.toBe<Graph.UndirectedGraph<Node, number>>()
  })

  it("difference", () => {
    expect(Graph.difference(directedNodes, directedNodes, {
      nodeIdentity: (node) => {
        expect(node).type.toBe<Node>()
        return node.id
      }
    })).type.toBe<Graph.DirectedGraph<Node, number>>()

    expect(pipe(
      undirectedNodes,
      Graph.difference(undirectedNodes, {
        nodeIdentity: (node) => {
          expect(node).type.toBe<Node>()
          return node.id
        }
      })
    )).type.toBe<Graph.UndirectedGraph<Node, number>>()
  })

  it("symmetricDifference", () => {
    expect(Graph.symmetricDifference(directedNodes, directedNodes, {
      nodeIdentity: (node) => {
        expect(node).type.toBe<Node>()
        return node.id
      }
    })).type.toBe<Graph.DirectedGraph<Node, number>>()

    expect(pipe(
      undirectedNodes,
      Graph.symmetricDifference(undirectedNodes, {
        nodeIdentity: (node) => {
          expect(node).type.toBe<Node>()
          return node.id
        }
      })
    )).type.toBe<Graph.UndirectedGraph<Node, number>>()
  })

  it("complement", () => {
    expect(Graph.complement(directed, (source, target) => {
      expect(source).type.toBe<string>()
      expect(target).type.toBe<string>()
      return source.length + target.length
    })).type.toBe<Graph.DirectedGraph<string, number>>()

    expect(pipe(
      undirected,
      Graph.complement((source, target) => {
        expect(source).type.toBe<string>()
        expect(target).type.toBe<string>()
        return source.length + target.length
      })
    )).type.toBe<Graph.UndirectedGraph<string, number>>()
  })

  it("neighborhood", () => {
    expect(Graph.neighborhood(directed, 0)).type.toBe<Graph.DirectedGraph<string, number>>()
    expect(Graph.neighborhood(directed, 0, { radius: 2, direction: "undirected" })).type.toBe<
      Graph.DirectedGraph<string, number>
    >()
    expect(pipe(undirected, Graph.neighborhood(0, { radius: 2, direction: "outgoing" }))).type.toBe<
      Graph.UndirectedGraph<string, number>
    >()
  })

  it("inducedSubgraph", () => {
    expect(Graph.inducedSubgraph(directed, [0, 1])).type.toBe<Graph.DirectedGraph<string, number>>()
    expect(pipe(undirected, Graph.inducedSubgraph(new Set([0, 1])))).type.toBe<
      Graph.UndirectedGraph<string, number>
    >()
  })

  it("undirected traversal", () => {
    expect(Graph.dfs(directed, { direction: "undirected", radius: 1 })).type.toBe<Graph.NodeWalker<string>>()
    expect(Graph.bfs(directed, { direction: "undirected", radius: 1 })).type.toBe<Graph.NodeWalker<string>>()
    expect(Graph.dfsPostOrder(directed, { direction: "undirected", radius: 1 })).type.toBe<Graph.NodeWalker<string>>()
  })

  it("path edge indexes", () => {
    const path = hole<Graph.PathResult<number>>()
    const allPairs = hole<Graph.AllPairsResult<number>>()

    expect(path.edges).type.toBe<Array<Graph.EdgeIndex>>()
    expect(allPairs.edges).type.toBe<Map<Graph.NodeIndex, Map<Graph.NodeIndex, Array<Graph.EdgeIndex>>>>()
  })

  it("edge and degree queries", () => {
    expect(Graph.incidentEdges(directed, 0)).type.toBe<Array<Graph.EdgeIndex>>()
    expect(pipe(undirected, Graph.incidentEdges(0))).type.toBe<Array<Graph.EdgeIndex>>()
    expect(Graph.edgesBetween(directed, 0, 1)).type.toBe<Array<Graph.EdgeIndex>>()
    expect(pipe(undirected, Graph.edgesBetween(0, 1))).type.toBe<Array<Graph.EdgeIndex>>()
    expect(Graph.outgoingEdges(directed, 0)).type.toBe<Array<Graph.EdgeIndex>>()
    expect(Graph.incomingEdges(mutableDirected, 0)).type.toBe<Array<Graph.EdgeIndex>>()
    expect(Graph.degree(undirected, 0)).type.toBe<number>()
    expect(Graph.outDegree(directed, 0)).type.toBe<number>()
    expect(Graph.inDegree(mutableDirected, 0)).type.toBe<number>()

    // @ts-expect-error! Directed edge queries require a directed graph
    Graph.outgoingEdges(undirected, 0)
    // @ts-expect-error! Directed edge queries require a directed graph
    Graph.incomingEdges(mutableUndirected, 0)
    // @ts-expect-error! Degree requires an undirected graph
    Graph.degree(directed, 0)
  })

  it("reachability and connectivity", () => {
    expect(Graph.unweightedDistances(directed, 0)).type.toBe<Map<Graph.NodeIndex, number>>()
    expect(pipe(directed, Graph.unweightedDistances(0, { direction: "incoming" }))).type.toBe<
      Map<Graph.NodeIndex, number>
    >()
    expect(Graph.hasPath(directed, 0, 1)).type.toBe<boolean>()
    expect(pipe(undirected, Graph.hasPath(0, 1))).type.toBe<boolean>()
    expect(Graph.weaklyConnectedComponents(directed)).type.toBe<Array<Array<Graph.NodeIndex>>>()
    expect(Graph.isConnected(undirected)).type.toBe<boolean>()
    expect(Graph.isWeaklyConnected(directed)).type.toBe<boolean>()
    expect(Graph.isStronglyConnected(mutableDirected)).type.toBe<boolean>()
    expect(Graph.isTree(mutableUndirected)).type.toBe<boolean>()

    // @ts-expect-error! Weak connectivity requires a directed graph
    Graph.weaklyConnectedComponents(undirected)
    // @ts-expect-error! Undirected connectivity requires an undirected graph
    Graph.isConnected(directed)
    // @ts-expect-error! Trees require an undirected graph
    Graph.isTree(directed)
  })

  it("findCycle", () => {
    expect(Graph.findCycle(directed)).type.toBe<Option.Option<Graph.CycleResult>>()
    expect(Graph.findCycle(mutableUndirected)).type.toBe<Option.Option<Graph.CycleResult>>()
  })

  it("minimumSpanningForest", () => {
    expect(Graph.minimumSpanningForest(undirected, (edge) => edge)).type.toBe<
      Graph.UndirectedGraph<string, number>
    >()
    expect(pipe(mutableUndirected, Graph.minimumSpanningForest((edge) => edge))).type.toBe<
      Graph.UndirectedGraph<string, number>
    >()

    // @ts-expect-error! Minimum spanning forests require an undirected graph
    Graph.minimumSpanningForest(directed, (edge) => edge)
  })

  it("transitiveReduction", () => {
    expect(Graph.transitiveReduction(directed)).type.toBe<Graph.DirectedGraph<string, number>>()
    expect(Graph.transitiveReduction(mutableDirected)).type.toBe<Graph.DirectedGraph<string, number>>()

    // @ts-expect-error! Transitive reduction requires a directed graph
    Graph.transitiveReduction(undirected)
  })

  it("lazy path enumeration", () => {
    expect(Graph.simplePaths(directed, { source: 0, target: 1 })).type.toBe<Graph.PathWalker<number>>()
    expect(pipe(undirected, Graph.simplePaths({ source: 0, target: 1, limit: 10 }))).type.toBe<
      Graph.PathWalker<number>
    >()
    expect(Graph.allShortestPaths(directed, { source: 0, target: 1, cost: (edge) => edge })).type.toBe<
      Graph.PathWalker<number>
    >()
    expect(pipe(
      mutableDirected,
      Graph.allShortestPaths({
        source: 0,
        target: 1,
        cost: (edge) => edge
      })
    )).type.toBe<Graph.PathWalker<number>>()
  })

  it("topo", () => {
    expect(Graph.topo(directed)).type.toBe<Graph.NodeWalker<string>>()
    expect(Graph.topo(directed, { initials: [0] })).type.toBe<Graph.NodeWalker<string>>()
    expect(Graph.topo(mutableDirected)).type.toBe<Graph.NodeWalker<string>>()

    expect(pipe(directed, Graph.topo())).type.toBe<Graph.NodeWalker<string>>()
    expect(pipe(directed, Graph.topo({ initials: [0] }))).type.toBe<Graph.NodeWalker<string>>()
    expect(pipe(mutableDirected, Graph.topo())).type.toBe<Graph.NodeWalker<string>>()

    // @ts-expect-error! Topological sorting requires a directed graph
    Graph.topo(undirected)
    // @ts-expect-error! Topological sorting requires a directed graph
    Graph.topo(mutableUndirected)
    // @ts-expect-error! Topological sorting requires a directed graph
    pipe(undirected, Graph.topo())
    // @ts-expect-error! Topological sorting requires a directed graph
    pipe(mutableUndirected, Graph.topo({ initials: [0] }))
    // @ts-expect-error! The graph kind must first be narrowed to directed
    Graph.topo(unknownKind)

    if (mixedKind.type === "directed") {
      expect(Graph.topo(mixedKind)).type.toBe<Graph.NodeWalker<string>>()
    }
  })

  it("sum", () => {
    expect(Graph.sum(directed, directed)).type.toBe<Graph.DirectedGraph<string, number>>()
    expect(pipe(undirected, Graph.sum(undirected))).type.toBe<Graph.UndirectedGraph<string, number>>()
  })
})
