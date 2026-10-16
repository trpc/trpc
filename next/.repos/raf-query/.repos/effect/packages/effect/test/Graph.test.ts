import { assert, describe, it } from "@effect/vitest"
import { Equal, Graph, Hash, Option } from "effect"

const directed = <N, E>(
  nodes: ReadonlyArray<N>,
  edges: ReadonlyArray<readonly [Graph.NodeIndex, Graph.NodeIndex, E]>
) =>
  Graph.directed<N, E>((mutable) => {
    for (const node of nodes) Graph.addNode(mutable, node)
    for (const [source, target, data] of edges) Graph.addEdge(mutable, source, target, data)
  })

const undirected = <N, E>(
  nodes: ReadonlyArray<N>,
  edges: ReadonlyArray<readonly [Graph.NodeIndex, Graph.NodeIndex, E]>
) =>
  Graph.undirected<N, E>((mutable) => {
    for (const node of nodes) Graph.addNode(mutable, node)
    for (const [source, target, data] of edges) Graph.addEdge(mutable, source, target, data)
  })

const assertGraphError = (thunk: () => unknown, message: string): void => {
  let error: unknown
  try {
    thunk()
  } catch (cause) {
    error = cause
  }
  assert.ok(error instanceof Graph.GraphError)
  assert.strictEqual(error.message, message)
}

const assertSnapshot = <N, E, T extends Graph.Kind>(
  graph: Graph.Graph<N, E, T> | Graph.MutableGraph<N, E, T>,
  expected: Graph.Snapshot<N, E, T>
): void => {
  assert.deepStrictEqual(Graph.toSnapshot(graph), expected)
}

const assertPath = <E>(actual: Option.Option<Graph.PathResult<E>>, expected: Graph.PathResult<E>): void => {
  assert.deepStrictEqual(actual, Option.some(expected))
}

const assertComponents = (
  actual: ReadonlyArray<ReadonlyArray<number>>,
  expected: ReadonlyArray<ReadonlyArray<number>>
) => {
  const canonicalize = (components: ReadonlyArray<ReadonlyArray<number>>) =>
    components.map((component) => Array.from(component).sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])
  assert.deepStrictEqual(canonicalize(actual), canonicalize(expected))
}

const assertIndices = <N>(walker: Graph.NodeWalker<N>, expected: ReadonlyArray<number>): void => {
  assert.deepStrictEqual(Array.from(Graph.indices(walker)), expected)
}

describe("Graph", () => {
  describe("construction and protocols", () => {
    it("constructs directed and undirected graphs", () => {
      const directedGraph = Graph.make("directed")<string, number>()
      const undirectedGraph = Graph.undirected<string, number>()

      assert.strictEqual(directedGraph.type, "directed")
      assert.strictEqual(undirectedGraph.type, "undirected")
      assert.strictEqual(directedGraph.mutable, false)
      assert.strictEqual(Graph.nodeCount(directedGraph), 0)
      assert.strictEqual(Graph.edgeCount(undirectedGraph), 0)
    })

    it("rejects invalid runtime graph kinds", () => {
      assertGraphError(
        () => Graph.make("invalid" as Graph.Kind)<never, never>(),
        "Graph type must be directed or undirected"
      )
    })

    it("recognizes immutable and mutable graphs only", () => {
      assert.strictEqual(Graph.isGraph(Graph.directed()), true)
      assert.strictEqual(Graph.isGraph(Graph.beginMutation(Graph.undirected())), true)
      for (const value of [{}, null, undefined, "graph", 1, []]) {
        assert.strictEqual(Graph.isGraph(value), false)
      }
    })

    it("supports stringification, piping, and node iteration in graph order", () => {
      const graph = directed(["A", "B"], [[0, 1, 1]])

      assert.strictEqual(String(graph), "Graph(directed, 2, 1)")
      assert.strictEqual(graph.pipe(Graph.nodeCount), 2)
      assert.deepStrictEqual(Array.from(graph), [[0, "A"], [1, "B"]])
      const iterator = graph[Symbol.iterator]()
      assert.deepStrictEqual(iterator.next(), { done: false, value: [0, "A"] })
      assert.deepStrictEqual(iterator.next(), { done: false, value: [1, "B"] })
      assert.deepStrictEqual(iterator.next(), { done: true, value: undefined })
    })
  })

  describe("snapshots", () => {
    it("round-trips sparse indexes, parallel edges, self-loops, and stored orientation", () => {
      const snapshot = {
        type: "undirected",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
        edges: [
          { index: 3, source: 5, target: 2, data: "first" },
          { index: 7, source: 5, target: 2, data: "parallel" },
          { index: 11, source: 5, target: 5, data: "loop" }
        ]
      } as const
      const graph = Graph.fromSnapshot(snapshot)

      assertSnapshot(graph, snapshot)
      assert.deepStrictEqual(Graph.neighbors(graph, 2), [5])
      assert.deepStrictEqual(Graph.neighbors(graph, 5), [2, 5])
      assert.strictEqual(Equal.equals(Graph.fromSnapshot(Graph.toSnapshot(graph)), graph), true)
    })

    it("snapshots mutable state without exposing stored records", () => {
      const graph = directed(["A", "B"], [[0, 1, 1]])
      const mutable = Graph.beginMutation(graph)
      Graph.updateNode(mutable, 0, () => "updated")
      const snapshot = Graph.toSnapshot(mutable)
      ;(snapshot.nodes[0] as { index: number; data: string }).index = 1
      ;(snapshot.nodes[0] as { index: number; data: string }).data = "exposed"
      ;(snapshot.edges[0] as { source: number; data: number }).source = 1
      ;(snapshot.edges[0] as { source: number; data: number }).data = 2

      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: "updated" }, { index: 1, data: "B" }],
        edges: [{ index: 0, source: 0, target: 1, data: 1 }]
      })
    })

    it("continues allocation after the highest active snapshot indexes", () => {
      const mutable = Graph.beginMutation(Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
        edges: [{ index: 4, source: 2, target: 5, data: 1 }]
      }))

      assert.strictEqual(Graph.addNode(mutable, "C"), 6)
      assert.strictEqual(Graph.addEdge(mutable, 2, 5, 2), 5)
    })

    it("rejects malformed snapshot records and indexes", () => {
      const cases: ReadonlyArray<readonly [() => unknown, string]> = [
        [
          () =>
            Graph.fromSnapshot(
              { type: "invalid", nodes: [], edges: [] } as unknown as Graph.Snapshot<never, never, Graph.Kind>
            ),
          "Snapshot type must be directed or undirected"
        ],
        [
          () => Graph.fromSnapshot({ type: "directed", nodes: new Array(1), edges: [] }),
          "Node at position 0 must be defined"
        ],
        [
          () =>
            Graph.fromSnapshot(
              { type: "directed", nodes: [null], edges: [] } as unknown as Graph.Snapshot<never, never, "directed">
            ),
          "Node at position 0 must be defined"
        ],
        [
          () => Graph.fromSnapshot({ type: "directed", nodes: [{ index: -1, data: "A" }], edges: [] }),
          "Node index at position 0 must be a non-negative safe integer"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: Number.MAX_SAFE_INTEGER + 1, data: "A" }],
              edges: []
            }),
          "Node index at position 0 must be a non-negative safe integer"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 1, data: "A" }, { index: 1, data: "B" }],
              edges: []
            }),
          "Node indexes must be strictly increasing"
        ],
        [
          () => Graph.fromSnapshot({ type: "directed", nodes: [{ index: 0, data: "A" }], edges: new Array(1) }),
          "Edge at position 0 must be defined"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 0, data: "A" }],
              edges: [{ index: 0.5, source: 0, target: 0, data: 1 }]
            }),
          "Edge index at position 0 must be a non-negative safe integer"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 0, data: "A" }],
              edges: [{ index: 1, source: 0, target: 0, data: 1 }, { index: 1, source: 0, target: 0, data: 2 }]
            }),
          "Edge indexes must be strictly increasing"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 0, data: "A" }],
              edges: [{ index: 0, source: -1, target: 0, data: 1 }]
            }),
          "Edge source at position 0 must be a non-negative safe integer"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 0, data: "A" }],
              edges: [{ index: 0, source: 0, target: 0.5, data: 1 }]
            }),
          "Edge target at position 0 must be a non-negative safe integer"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 1, data: "A" }],
              edges: [{ index: 0, source: 0, target: 1, data: 1 }]
            }),
          "Edge source 0 does not reference a node"
        ],
        [
          () =>
            Graph.fromSnapshot({
              type: "directed",
              nodes: [{ index: 1, data: "A" }],
              edges: [{ index: 0, source: 1, target: 2, data: 1 }]
            }),
          "Edge target 2 does not reference a node"
        ]
      ]

      for (const [run, message] of cases) assertGraphError(run, message)
    })

    it("rejects allocation after safe indexes are exhausted", () => {
      const nodes = Graph.beginMutation(Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: Number.MAX_SAFE_INTEGER, data: "A" }],
        edges: []
      }))
      const edges = Graph.beginMutation(Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 0, data: "A" }],
        edges: [{ index: Number.MAX_SAFE_INTEGER, source: 0, target: 0, data: 1 }]
      }))

      assertGraphError(() => Graph.addNode(nodes, "B"), "Graph has exhausted safe node indexes")
      assertGraphError(() => Graph.addEdge(edges, 0, 0, 2), "Graph has exhausted safe edge indexes")
    })
  })

  describe("equality and hashing", () => {
    it("gives equal immutable graphs equal hashes", () => {
      const left = undirected(["A", "B"], [[0, 1, "first"], [0, 1, "second"], [0, 0, "loop"]])
      const right = undirected(["A", "B"], [[1, 0, "first"], [1, 0, "second"], [0, 0, "loop"]])

      assert.strictEqual(Equal.equals(left, right), true)
      assert.strictEqual(Hash.hash(left), Hash.hash(right))
    })

    it("distinguishes undirected self-loops on different nodes", () => {
      const onA = undirected(["A", "B"], [[0, 0, "loop"]])
      const onB = undirected(["A", "B"], [[1, 1, "loop"]])

      assert.strictEqual(Equal.equals(onA, onB), false)
      assert.notStrictEqual(Hash.hash(onA), Hash.hash(onB))
    })

    it("distinguishes node payload, edge payload, missing edge, kind, and sparse indexes", () => {
      const base = directed(["A", "B"], [[0, 1, "edge"]])
      const cases: ReadonlyArray<Graph.Graph<unknown, unknown, Graph.Kind>> = [
        directed(["changed", "B"], [[0, 1, "edge"]]),
        directed(["A", "B"], [[0, 1, "changed"]]),
        directed(["A", "B"], []),
        undirected(["A", "B"], [[0, 1, "edge"]]),
        Graph.fromSnapshot({
          type: "directed",
          nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
          edges: [{ index: 3, source: 2, target: 5, data: "edge" }]
        })
      ]

      for (const candidate of cases) {
        assert.strictEqual(Equal.equals(base, candidate), false)
        assert.strictEqual(Equal.equals(candidate, base), false)
      }
    })

    it("keeps directed endpoints and parallel-edge index pairing ordered", () => {
      const directedLeft = directed(["A", "B"], [[0, 1, "edge"]])
      const directedRight = directed(["A", "B"], [[1, 0, "edge"]])
      const parallel = undirected(["A", "B"], [[0, 1, "first"], [0, 1, "second"]])
      const reordered = undirected(["A", "B"], [[1, 0, "second"], [1, 0, "first"]])

      assert.strictEqual(Equal.equals(directedLeft, directedRight), false)
      assert.strictEqual(Equal.equals(parallel, reordered), false)
    })

    it("ignores removed trailing allocator history while preserving future allocation", () => {
      const left = directed(["A", "B"], [[0, 1, "edge"]])
      const right = Graph.directed<string, string>((mutable) => {
        Graph.addNode(mutable, "A")
        Graph.addNode(mutable, "B")
        Graph.addEdge(mutable, 0, 1, "edge")
        const node = Graph.addNode(mutable, "removed")
        const edge = Graph.addEdge(mutable, 0, 1, "removed")
        Graph.removeNode(mutable, node)
        Graph.removeEdge(mutable, edge)
      })

      assert.strictEqual(Equal.equals(left, right), true)
      assert.strictEqual(Hash.hash(left), Hash.hash(right))
      Graph.mutate(left, (mutable) => {
        assert.strictEqual(Graph.addNode(mutable, "next"), 2)
      })
      Graph.mutate(right, (mutable) => {
        assert.strictEqual(Graph.addNode(mutable, "next"), 3)
      })
      Graph.mutate(left, (mutable) => {
        assert.strictEqual(Graph.addEdge(mutable, 0, 1, "next"), 1)
      })
      Graph.mutate(right, (mutable) => {
        assert.strictEqual(Graph.addEdge(mutable, 0, 1, "next"), 2)
      })
    })

    it("uses reference equality for mutable graphs and structural equality after finalization", () => {
      const graph = directed(["A", "B"], [[0, 1, "edge"]])
      const left = Graph.beginMutation(graph)
      const right = Graph.beginMutation(graph)
      const hash = Hash.hash(left)

      assert.strictEqual(Equal.equals(left, right), false)
      Graph.addNode(left, "C")
      assert.strictEqual(Hash.hash(left), hash)
      const finalized = Graph.endMutation(left)
      assert.strictEqual(Equal.equals(finalized, directed(["A", "B", "C"], [[0, 1, "edge"]])), true)
    })

    it("supports undefined node and edge payloads structurally", () => {
      const make = () => directed<undefined, undefined>([undefined, undefined], [[0, 1, undefined]])
      assert.strictEqual(Equal.equals(make(), make()), true)
      assert.strictEqual(Hash.hash(make()), Hash.hash(make()))
    })
  })

  describe("mutation lifecycle", () => {
    it("isolates mutable changes from the source and finalizes to a new immutable graph", () => {
      const source = directed(["A", "B"], [[0, 1, 1]])
      const mutable = Graph.beginMutation(source)
      Graph.addNode(mutable, "C")
      const result = Graph.endMutation(mutable)

      assert.strictEqual(Graph.nodeCount(source), 2)
      assert.strictEqual(Graph.nodeCount(result), 3)
      assert.notStrictEqual(result, source)
      assert.strictEqual(result.mutable, false)
    })

    it("supports data-first and data-last scoped mutation", () => {
      const graph = Graph.directed<string, number>()
      const first = Graph.mutate(graph, (mutable) => {
        Graph.addNode(mutable, "A")
      })
      const last = graph.pipe(Graph.mutate((mutable) => {
        Graph.addNode(mutable, "A")
      }))

      assertSnapshot(first, { type: "directed", nodes: [{ index: 0, data: "A" }], edges: [] })
      assertSnapshot(last, { type: "directed", nodes: [{ index: 0, data: "A" }], edges: [] })
    })

    it("finalizes retained handles when callbacks return or throw", () => {
      let returned: Graph.MutableDirectedGraph<string, number> | undefined
      Graph.directed<string, number>((mutable) => {
        returned = mutable
      })
      assertGraphError(() => Graph.addNode(returned!, "late"), "Graph is not mutable")

      let thrown: Graph.MutableDirectedGraph<string, number> | undefined
      const cause = new Error("boom")
      let actual: unknown
      try {
        Graph.mutate(Graph.directed<string, number>(), (mutable) => {
          thrown = mutable
          throw cause
        })
      } catch (error) {
        actual = error
      }
      assert.strictEqual(actual, cause)
      assertGraphError(() => Graph.addNode(thrown!, "late"), "Graph is not mutable")
    })

    it("rejects normal callback return after manual finalization", () => {
      assertGraphError(() => {
        Graph.directed<string, number>((mutable) => {
          Graph.endMutation(mutable)
        })
      }, "Graph is not mutable")
      assertGraphError(() => {
        Graph.mutate(Graph.directed<string, number>(), (mutable) => {
          Graph.endMutation(mutable)
        })
      }, "Graph is not mutable")
    })

    it("preserves callback errors after manual finalization", () => {
      const cause = new Error("callback failure")
      for (
        const run of [
          () =>
            Graph.directed<string, number>((mutable) => {
              Graph.endMutation(mutable)
              throw cause
            }),
          () =>
            Graph.mutate(Graph.directed<string, number>(), (mutable) => {
              Graph.endMutation(mutable)
              throw cause
            })
        ]
      ) {
        let actual: unknown
        try {
          run()
        } catch (error) {
          actual = error
        }
        assert.strictEqual(actual, cause)
      }
    })

    it("rejects every mutation entry point on a finalized handle", () => {
      const mutable = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      Graph.endMutation(mutable)
      const mutations: ReadonlyArray<() => unknown> = [
        () => Graph.addNode(mutable, "C"),
        () => Graph.addEdge(mutable, 1, 0, 2),
        () => Graph.updateNode(mutable, 0, () => "updated"),
        () => Graph.updateEdge(mutable, 0, () => 2),
        () => Graph.removeNode(mutable, 0),
        () => Graph.removeNodes(mutable, [0]),
        () => Graph.removeEdge(mutable, 0),
        () => Graph.removeEdges(mutable, [0]),
        () => Graph.mapNodes(mutable, () => "mapped"),
        () => Graph.mapEdges(mutable, () => 3),
        () => Graph.filterMapNodes(mutable, () => Option.none()),
        () => Graph.filterMapEdges(mutable, () => Option.none()),
        () => Graph.filterNodes(mutable, () => true),
        () => Graph.filterEdges(mutable, () => true),
        () => Graph.reverse(mutable),
        () => Graph.endMutation(mutable)
      ]
      for (const mutation of mutations) assertGraphError(mutation, "Graph is not mutable")
    })

    it("rejects nested mutation or finalization from transformation callbacks", () => {
      const mutable = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      const mutations: ReadonlyArray<() => unknown> = [
        () => Graph.addNode(mutable, "C"),
        () => Graph.addEdge(mutable, 1, 0, 2),
        () => Graph.updateNode(mutable, 0, () => "updated"),
        () => Graph.updateEdge(mutable, 0, () => 2),
        () => Graph.removeNode(mutable, 0),
        () => Graph.removeNodes(mutable, [0]),
        () => Graph.removeEdge(mutable, 0),
        () => Graph.removeEdges(mutable, [0]),
        () => Graph.mapNodes(mutable, (node) => node),
        () => Graph.mapEdges(mutable, (edge) => edge),
        () => Graph.filterMapNodes(mutable, (node) => Option.some(node)),
        () => Graph.filterMapEdges(mutable, (edge) => Option.some(edge)),
        () => Graph.filterNodes(mutable, () => true),
        () => Graph.filterEdges(mutable, () => true),
        () => Graph.reverse(mutable),
        () => Graph.endMutation(mutable)
      ]

      for (const mutation of mutations) {
        assertGraphError(() =>
          Graph.updateNode(mutable, 0, (node) => {
            mutation()
            return node
          }), "Cannot mutate graph during a transformation")
      }
      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [{ index: 0, source: 0, target: 1, data: 1 }]
      })
    })

    it("guards every transformation callback against nested mutation", () => {
      const mutable = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      const mutate = () => Graph.addNode(mutable, "C")
      const transformations: ReadonlyArray<() => unknown> = [
        () =>
          Graph.updateNode(mutable, 0, (node) => {
            mutate()
            return node
          }),
        () =>
          Graph.updateEdge(mutable, 0, (edge) => {
            mutate()
            return edge
          }),
        () =>
          Graph.mapNodes(mutable, (node) => {
            mutate()
            return node
          }),
        () =>
          Graph.mapEdges(mutable, (edge) => {
            mutate()
            return edge
          }),
        () =>
          Graph.filterMapNodes(mutable, (node) => {
            mutate()
            return Option.some(node)
          }),
        () =>
          Graph.filterMapEdges(mutable, (edge) => {
            mutate()
            return Option.some(edge)
          }),
        () =>
          Graph.filterNodes(mutable, () => {
            mutate()
            return true
          }),
        () =>
          Graph.filterEdges(mutable, () => {
            mutate()
            return true
          })
      ]

      for (const transformation of transformations) {
        assertGraphError(transformation, "Cannot mutate graph during a transformation")
      }
    })

    it("guards read callbacks against nested mutation", () => {
      const mutable = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      const mutate = () => Graph.addNode(mutable, "C")
      const operations: ReadonlyArray<() => unknown> = [
        () =>
          Graph.findNode(mutable, () => {
            Graph.findNode(mutable, () => false)
            mutate()
            return false
          }),
        () => Graph.findNodes(mutable, () => (mutate(), false)),
        () => Graph.findEdge(mutable, () => (mutate(), false)),
        () => Graph.findEdges(mutable, () => (mutate(), false)),
        () => Graph.toGraphViz(mutable, { edgeLabel: (edge) => (mutate(), String(edge)) }),
        () => Graph.toMermaid(mutable, { nodeShape: () => (mutate(), "rectangle") }),
        () => Graph.maximumFlow(mutable, { source: 0, target: 1, capacity: (edge) => (mutate(), edge) }),
        () => Graph.minimumCut(mutable, { source: 0, target: 1, capacity: (edge) => (mutate(), edge) }),
        () => Graph.dijkstra(mutable, { source: 0, target: 1, cost: (edge) => (mutate(), edge) }),
        () => Graph.floydWarshall(mutable, (edge) => (mutate(), edge)),
        () => Graph.astar(mutable, { source: 0, target: 1, cost: (edge) => (mutate(), edge), heuristic: () => 0 }),
        () => Graph.astar(mutable, { source: 0, target: 1, cost: (edge) => edge, heuristic: () => (mutate(), 0) }),
        () => Graph.bellmanFord(mutable, { source: 0, target: 1, cost: (edge) => (mutate(), edge) }),
        () =>
          Array.from(Graph.allShortestPaths(mutable, {
            source: 0,
            target: 1,
            cost: (edge) => (mutate(), edge)
          })),
        () => Array.from(Graph.dfs(mutable, { start: [0] }).visit(() => mutate())),
        () => Array.from(Graph.nodes(mutable).visit(() => mutate())),
        () => Array.from(Graph.edges(mutable).visit(() => mutate())),
        () => Array.from(Graph.externals(mutable).visit(() => mutate()))
      ]

      for (const operation of operations) {
        assertGraphError(operation, "Cannot mutate graph during a transformation")
      }

      const undirectedMutable = Graph.beginMutation(undirected(["A", "B"], [[0, 1, 1]]))
      assertGraphError(() =>
        Graph.minimumSpanningForest(undirectedMutable, (edge) => {
          Graph.addNode(undirectedMutable, "C")
          return edge
        }), "Cannot mutate graph during a transformation")
    })
  })

  describe("node operations", () => {
    it("allocates stable indexes and supports lookup, membership, and count", () => {
      const mutable = Graph.beginMutation(Graph.directed<string | undefined, never>())
      assert.strictEqual(Graph.addNode(mutable, undefined), 0)
      assert.strictEqual(Graph.addNode(mutable, "B"), 1)

      assert.strictEqual(Graph.nodeCount(mutable), 2)
      assert.strictEqual(Graph.hasNode(mutable, 0), true)
      assert.strictEqual(Graph.hasNode(mutable, 2), false)
      assert.deepStrictEqual(Graph.getNode(mutable, 0), Option.some(undefined))
      assert.deepStrictEqual(Graph.getNode(0)(mutable), Option.some(undefined))
      assert.deepStrictEqual(Graph.getNode(mutable, 2), Option.none())
    })

    it("updates existing payloads and ignores missing indexes", () => {
      const mutable = Graph.beginMutation(directed<string | undefined, never>([undefined, "B"], []))
      Graph.updateNode(mutable, 0, () => "A")
      Graph.updateNode(mutable, 1, () => undefined)
      Graph.updateNode(mutable, 99, () => "missing")

      assert.deepStrictEqual(Array.from(mutable), [[0, "A"], [1, undefined]])
    })

    it("finds the first and all matching nodes in graph order", () => {
      const graph = directed<string | undefined, never>([undefined, "B", undefined], [])

      assert.deepStrictEqual(Graph.findNode(graph, (node) => node === undefined), Option.some(0))
      assert.deepStrictEqual(Graph.findNode((node: string | undefined) => node === "missing")(graph), Option.none())
      assert.deepStrictEqual(Graph.findNodes(graph, (node) => node === undefined), [0, 2])
    })
  })

  describe("edge operations", () => {
    it("allocates parallel edges and self-loops with exact stored orientation", () => {
      const graph = Graph.undirected<string, string>((mutable) => {
        Graph.addNode(mutable, "A")
        Graph.addNode(mutable, "B")
        assert.strictEqual(Graph.addEdge(mutable, 1, 0, "first"), 0)
        assert.strictEqual(Graph.addEdge(mutable, 1, 0, "parallel"), 1)
        assert.strictEqual(Graph.addEdge(mutable, 0, 0, "loop"), 2)
      })

      assertSnapshot(graph, {
        type: "undirected",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [
          { index: 0, source: 1, target: 0, data: "first" },
          { index: 1, source: 1, target: 0, data: "parallel" },
          { index: 2, source: 0, target: 0, data: "loop" }
        ]
      })
    })

    it("rejects missing edge endpoints", () => {
      const mutable = Graph.beginMutation(directed<string, number>(["A"], []))
      assertGraphError(() => Graph.addEdge(mutable, 1, 0, 1), "Node 1 does not exist")
      assertGraphError(() => Graph.addEdge(mutable, 0, 1, 1), "Node 1 does not exist")
    })

    it("gets and updates undefined edge data without exposing stored records", () => {
      const mutable = Graph.beginMutation(directed<string, number | undefined>(["A", "B"], [[0, 1, undefined]]))
      const fromGetter = Option.getOrThrow(Graph.getEdge(mutable, 0))
      const fromWalker = Array.from(Graph.values(Graph.edges(mutable)))[0]
      ;(fromGetter as { source: number; data: number | undefined }).source = 1
      ;(fromGetter as { source: number; data: number | undefined }).data = 1
      ;(fromWalker as { target: number; data: number | undefined }).target = 0
      ;(fromWalker as { target: number; data: number | undefined }).data = 1

      assert.deepStrictEqual(Graph.getEdge(mutable, 0), Option.some({ source: 0, target: 1, data: undefined }))
      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [{ index: 0, source: 0, target: 1, data: undefined }]
      })
      assert.deepStrictEqual(Graph.neighbors(mutable, 0), [1])
      assert.deepStrictEqual(Graph.neighbors(mutable, 1), [])

      Graph.updateEdge(mutable, 0, () => 2)
      Graph.updateEdge(mutable, 99, () => 3)

      assert.deepStrictEqual(Graph.getEdge(mutable, 0), Option.some({ source: 0, target: 1, data: 2 }))
      assert.deepStrictEqual(Graph.getEdge(99)(mutable), Option.none())
      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [{ index: 0, source: 0, target: 1, data: 2 }]
      })
      assert.deepStrictEqual(Graph.neighbors(mutable, 0), [1])
    })

    it("removes parallel undirected edges and self-loops independently", () => {
      const mutable = Graph.beginMutation(undirected(["A", "B"], [[1, 0, "first"], [0, 1, "second"], [1, 1, "loop"]]))
      Graph.removeEdge(mutable, 0)
      Graph.removeEdge(mutable, 2)
      Graph.removeEdge(mutable, 99)

      assertSnapshot(mutable, {
        type: "undirected",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [{ index: 1, source: 0, target: 1, data: "second" }]
      })
      assert.deepStrictEqual(Graph.neighbors(mutable, 0), [1])
      assert.deepStrictEqual(Graph.neighbors(mutable, 1), [0])
    })

    it("removes undirected nodes with reversed edges, parallel edges, and self-loops", () => {
      const mutable = Graph.beginMutation(undirected(["A", "B", "C"], [
        [1, 0, "reverse"],
        [0, 1, "parallel"],
        [1, 1, "loop"],
        [2, 0, "keep"]
      ]))
      Graph.removeNode(mutable, 1)

      assertSnapshot(mutable, {
        type: "undirected",
        nodes: [{ index: 0, data: "A" }, { index: 2, data: "C" }],
        edges: [{ index: 3, source: 2, target: 0, data: "keep" }]
      })
    })

    it("collects graph-backed iterables before bulk removal", () => {
      const edges = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1], [1, 0, 2]]))
      Graph.removeEdges(edges, Graph.indices(Graph.edges(edges)))
      assert.strictEqual(Graph.edgeCount(edges), 0)

      const nodes = Graph.beginMutation(directed<string, never>(["A", "B"], []))
      Graph.removeNodes(nodes, Graph.indices(Graph.nodes(nodes)))
      assert.strictEqual(Graph.nodeCount(nodes), 0)
    })

    it("keeps caches fresh when bulk-removal iterables query the graph", () => {
      const edges = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      Graph.removeEdges(edges, {
        *[Symbol.iterator]() {
          assert.strictEqual(Graph.hasPath(edges, 0, 1), true)
          yield 0
        }
      })
      assert.strictEqual(Graph.hasPath(edges, 0, 1), false)

      const nodes = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1], [1, 0, 2]]))
      Graph.removeNodes(nodes, {
        *[Symbol.iterator]() {
          assert.strictEqual(Graph.isAcyclic(nodes), false)
          yield 1
        }
      })
      assert.strictEqual(Graph.isAcyclic(nodes), true)
    })

    it("rejects finalization from bulk-removal iterables", () => {
      const mutable = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      assertGraphError(() =>
        Graph.removeEdges(mutable, {
          *[Symbol.iterator]() {
            Graph.endMutation(mutable)
            yield 0
          }
        }), "Cannot mutate graph during a transformation")
      assert.strictEqual(mutable.mutable, true)
      assert.strictEqual(Graph.edgeCount(mutable), 1)
    })
  })

  describe("transformations", () => {
    it("maps nodes and edges while preserving indexes and structure", () => {
      const mutable = Graph.beginMutation(directed(["a", "b"], [[0, 1, 2]]))
      Graph.mapNodes(mutable, (node) => node.toUpperCase())
      Graph.mapEdges(mutable, (edge) => edge * 3)

      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [{ index: 0, source: 0, target: 1, data: 6 }]
      })
    })

    it("filter-maps nodes and removes incident edges", () => {
      const mutable = Graph.beginMutation(directed([1, 2, 3], [[0, 1, "remove"], [1, 2, "remove"], [0, 2, "keep"]]))
      Graph.filterMapNodes(mutable, (node) => node === 2 ? Option.none() : Option.some(node * 10))

      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: 10 }, { index: 2, data: 30 }],
        edges: [{ index: 2, source: 0, target: 2, data: "keep" }]
      })
    })

    it("filter-maps edges without removing nodes", () => {
      const mutable = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 2], [2, 0, 3]]))
      Graph.filterMapEdges(mutable, (edge) => edge % 2 === 0 ? Option.none() : Option.some(edge * 10))

      assertSnapshot(mutable, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }, { index: 2, data: "C" }],
        edges: [{ index: 0, source: 0, target: 1, data: 10 }, { index: 2, source: 2, target: 0, data: 30 }]
      })
    })

    it("filters nodes and removes their incident edges", () => {
      const nodes = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 2], [0, 2, 3]]))
      Graph.filterNodes(nodes, (node) => node !== "B")
      assertSnapshot(nodes, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 2, data: "C" }],
        edges: [{ index: 2, source: 0, target: 2, data: 3 }]
      })
    })

    it("filters edges without removing nodes", () => {
      const edges = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 2], [0, 2, 3]]))
      Graph.filterEdges(edges, (edge) => edge % 2 === 1)
      assertSnapshot(edges, {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }, { index: 2, data: "C" }],
        edges: [{ index: 0, source: 0, target: 1, data: 1 }, { index: 2, source: 0, target: 2, data: 3 }]
      })
    })

    it("exposes earlier bulk writes to later callbacks", () => {
      const nodes = Graph.beginMutation(directed<string, never>(["a", "b"], []))
      const nodeStates: Array<Array<string>> = []
      Graph.mapNodes(nodes, (node) => {
        nodeStates.push(Array.from(Graph.values(Graph.nodes(nodes))))
        return node.toUpperCase()
      })
      assert.deepStrictEqual(nodeStates, [["a", "b"], ["A", "b"]])

      const edges = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 2]]))
      const edgeStates: Array<Array<number>> = []
      Graph.mapEdges(edges, (edge) => {
        edgeStates.push(Array.from(Graph.values(Graph.edges(edges)), (value) => value.data))
        return edge * 2
      })
      assert.deepStrictEqual(edgeStates, [[1, 2], [2, 2]])
    })

    it("publishes updated callback values to subsequent graph reads", () => {
      const nodes = Graph.beginMutation(directed<string, never>(["old"], []))
      Graph.updateNode(nodes, 0, () => {
        assert.deepStrictEqual(Array.from(Graph.values(Graph.bfs(nodes, { start: [0] }))), ["old"])
        return "new"
      })
      assert.deepStrictEqual(Array.from(Graph.values(Graph.bfs(nodes, { start: [0] }))), ["new"])

      const edges = Graph.beginMutation(directed(["source", "target"], [[0, 1, 1]]))
      Graph.updateEdge(edges, 0, () => {
        assert.deepStrictEqual(Array.from(Graph.simplePaths(edges, { source: 0, target: 1 }))[0].costs, [1])
        return 2
      })
      assert.deepStrictEqual(Array.from(Graph.simplePaths(edges, { source: 0, target: 1 }))[0].costs, [2])
    })

    it("reverses directed edges and leaves undirected stored orientation unchanged", () => {
      const directedMutable = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 2]]))
      Graph.reverse(directedMutable)
      Graph.addEdge(directedMutable, 0, 1, 3)
      assert.deepStrictEqual(Graph.toSnapshot(directedMutable).edges, [
        { index: 0, source: 1, target: 0, data: 1 },
        { index: 1, source: 2, target: 1, data: 2 },
        { index: 2, source: 0, target: 1, data: 3 }
      ])
      assert.deepStrictEqual(Graph.neighbors(directedMutable, 2), [1])
      assert.strictEqual(Graph.hasEdge(directedMutable, 1, 0), true)
      assert.strictEqual(Graph.hasEdge(directedMutable, 0, 1), true)

      const undirectedMutable = Graph.beginMutation(undirected(["A", "B"], [[1, 0, 1]]))
      Graph.reverse(undirectedMutable)
      assert.deepStrictEqual(Graph.toSnapshot(undirectedMutable).edges, [{ index: 0, source: 1, target: 0, data: 1 }])
    })
  })

  describe("set operations", () => {
    type Node = { readonly id: string; readonly label: string }
    const left = () =>
      directed<Node, string>(
        [{ id: "a", label: "A1" }, { id: "b", label: "B1" }, { id: "c", label: "C1" }],
        [[0, 1, "left"], [1, 2, "shared"]]
      )
    const right = () =>
      directed<Node, string>(
        [{ id: "b", label: "B2" }, { id: "c", label: "C2" }, { id: "d", label: "D2" }],
        [[0, 1, "shared"], [1, 2, "right"]]
      )
    const identity = { nodeIdentity: (node: Node) => node.id }
    const semantic = (graph: Graph.Graph<Node, string>) => {
      const nodes = new Map(Array.from(graph, ([index, node]) => [index, node]))
      return {
        nodes: Array.from(nodes.values(), (node) => `${node.id}:${node.label}`).sort(),
        edges: Array.from(
          Graph.values(Graph.edges(graph)),
          (edge) => `${nodes.get(edge.source)!.id}->${nodes.get(edge.target)!.id}:${edge.data}`
        ).sort()
      }
    }

    it("composes, intersects, differs, and symmetrically differs by projected identity", () => {
      const composed = {
        nodes: ["a:A1", "b:B2", "c:C2", "d:D2"],
        edges: ["a->b:left", "b->c:shared", "c->d:right"]
      }
      const intersected = {
        nodes: ["b:B1", "c:C1"],
        edges: ["b->c:shared"]
      }
      const differed = {
        nodes: ["a:A1", "b:B1", "c:C1"],
        edges: ["a->b:left"]
      }
      const symmetric = {
        nodes: ["a:A1", "b:B2", "c:C2", "d:D2"],
        edges: ["a->b:left", "c->d:right"]
      }
      assert.deepStrictEqual(semantic(Graph.compose(left(), right(), identity)), composed)
      assert.deepStrictEqual(semantic(Graph.compose(right(), identity)(left())), composed)
      assert.deepStrictEqual(semantic(Graph.intersection(left(), right(), identity)), intersected)
      assert.deepStrictEqual(semantic(Graph.intersection(right(), identity)(left())), intersected)
      assert.deepStrictEqual(semantic(Graph.difference(left(), right(), identity)), differed)
      assert.deepStrictEqual(semantic(Graph.difference(right(), identity)(left())), differed)
      assert.deepStrictEqual(semantic(Graph.symmetricDifference(left(), right(), identity)), symmetric)
      assert.deepStrictEqual(semantic(Graph.symmetricDifference(right(), identity)(left())), symmetric)
    })

    it("supports Effect Equal and Hash node identities", () => {
      class NodeKey implements Equal.Equal {
        constructor(readonly id: string) {}
        [Equal.symbol](that: Equal.Equal): boolean {
          return that instanceof NodeKey && this.id === that.id
        }
        [Hash.symbol](): number {
          return Hash.string(this.id)
        }
      }

      const result = Graph.compose(left(), right(), { nodeIdentity: (node) => new NodeKey(node.id) })
      assert.deepStrictEqual(semantic(result), {
        nodes: ["a:A1", "b:B2", "c:C2", "d:D2"],
        edges: ["a->b:left", "b->c:shared", "c->d:right"]
      })
    })

    it("coalesces duplicate identities to the last payload and redirects edges", () => {
      const graph = directed<Node, string>([{ id: "a", label: "first" }, { id: "a", label: "last" }], [[
        0,
        1,
        "edge"
      ]])
      const result = Graph.compose(graph, Graph.directed<Node, string>(), identity)
      const edge = Array.from(Graph.values(Graph.edges(result)))[0]

      assert.deepStrictEqual(Array.from(Graph.values(Graph.nodes(result))), [{ id: "a", label: "last" }])
      assert.strictEqual(edge.source, edge.target)
    })

    it("uses right edge payloads for custom-identity compose and intersection", () => {
      type Edge = { readonly id: string; readonly label: string }
      const left = directed<string, Edge>(["A", "B"], [[0, 1, { id: "shared", label: "left" }]])
      const right = directed<string, Edge>(["A", "B"], [[0, 1, { id: "shared", label: "right" }]])
      const options = { edgeIdentity: (edge: Edge) => edge.id }

      assert.strictEqual(
        Array.from(Graph.values(Graph.edges(Graph.compose(left, right, options))))[0].data.label,
        "right"
      )
      assert.strictEqual(
        Array.from(Graph.values(Graph.edges(Graph.intersection(left, right, options))))[0].data.label,
        "right"
      )
    })

    it("includes edge data in the default edge identity", () => {
      const first = directed(["A", "B"], [[0, 1, "left"]])
      const second = directed(["A", "B"], [[0, 1, "right"]])

      assert.strictEqual(Graph.edgeCount(Graph.compose(first, second)), 2)
      assert.strictEqual(Graph.edgeCount(Graph.intersection(first, second)), 0)
      assert.strictEqual(Graph.edgeCount(Graph.difference(first, second)), 1)
      assert.strictEqual(Graph.edgeCount(Graph.symmetricDifference(first, second)), 2)
    })

    it("uses undefined node data as the default node identity", () => {
      assert.strictEqual(
        Graph.nodeCount(Graph.compose(directed<undefined, never>([undefined], []), directed([undefined], []))),
        1
      )
    })

    it("treats equal parallel edges as set members while difference preserves unmatched occurrences", () => {
      const parallel = directed(["A", "B"], [[0, 1, "same"], [0, 1, "same"]])
      const one = directed(["A", "B"], [[0, 1, "same"]])
      const empty = Graph.directed<string, string>()

      assert.strictEqual(Graph.edgeCount(Graph.compose(parallel, empty)), 1)
      assert.strictEqual(Graph.edgeCount(Graph.intersection(parallel, one)), 1)
      assert.strictEqual(Graph.edgeCount(Graph.difference(parallel, empty)), 2)
      assert.strictEqual(Graph.edgeCount(Graph.difference(parallel, one)), 0)
      assert.strictEqual(Graph.edgeCount(Graph.symmetricDifference(parallel, empty)), 1)
    })

    it("matches undirected identities independent of stored orientation", () => {
      const first = undirected(["A", "B"], [[0, 1, "same"]])
      const second = undirected(["B", "A"], [[0, 1, "same"]])
      assert.strictEqual(Graph.edgeCount(Graph.intersection(first, second)), 1)
      assert.strictEqual(Graph.edgeCount(Graph.difference(first, second)), 0)
    })

    it("rejects runtime kind mismatches for every binary set operation", () => {
      const first = Graph.directed<string, string>() as Graph.Graph<string, string, Graph.Kind>
      const second = Graph.undirected<string, string>() as Graph.Graph<string, string, Graph.Kind>
      const operations: ReadonlyArray<() => unknown> = [
        () => Graph.compose(first, second),
        () => Graph.intersection(first, second),
        () => Graph.difference(first, second),
        () => Graph.symmetricDifference(first, second),
        () => Graph.sum(first, second)
      ]
      for (const operation of operations) {
        assertGraphError(operation, "Cannot combine directed and undirected graphs")
      }
    })

    it("builds directed and undirected complements without self-loops", () => {
      assertSnapshot(Graph.complement(directed(["A", "B"], [[0, 1, "existing"]]), (a, b) => `${a}-${b}`), {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
        edges: [{ index: 0, source: 1, target: 0, data: "B-A" }]
      })
      assertSnapshot(Graph.complement(undirected(["A", "B", "C"], [[0, 1, "existing"]]), (a, b) => `${a}-${b}`), {
        type: "undirected",
        nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }, { index: 2, data: "C" }],
        edges: [{ index: 0, source: 0, target: 2, data: "A-C" }, { index: 1, source: 1, target: 2, data: "B-C" }]
      })
    })

    it("returns induced neighborhoods and validates radius", () => {
      const graph = directed(["A", "B", "C", "D"], [[0, 1, "AB"], [1, 2, "BC"], [2, 1, "CB"], [2, 3, "CD"]])
      assertSnapshot(Graph.neighborhood(graph, 1, { radius: 1 }), {
        type: "directed",
        nodes: [{ index: 0, data: "B" }, { index: 1, data: "C" }],
        edges: [{ index: 0, source: 0, target: 1, data: "BC" }, { index: 1, source: 1, target: 0, data: "CB" }]
      })
      assertSnapshot(Graph.neighborhood(1, { radius: Infinity })(graph), {
        type: "directed",
        nodes: [{ index: 0, data: "B" }, { index: 1, data: "C" }, { index: 2, data: "D" }],
        edges: [
          { index: 0, source: 0, target: 1, data: "BC" },
          { index: 1, source: 1, target: 0, data: "CB" },
          { index: 2, source: 1, target: 2, data: "CD" }
        ]
      })
      for (const radius of [NaN, -1, 0.5]) {
        assertGraphError(
          () => Graph.neighborhood(graph, 1, { radius }),
          "Traversal radius must be a non-negative integer or Infinity"
        )
      }
    })

    it("can ignore edge direction when selecting a neighborhood", () => {
      const graph = directed(["A", "B", "C"], [[0, 1, "AB"], [0, 2, "AC"]])
      assertSnapshot(Graph.neighborhood(graph, 1, { radius: 2, direction: "undirected" }), {
        type: "directed",
        nodes: [{ index: 0, data: "B" }, { index: 1, data: "A" }, { index: 2, data: "C" }],
        edges: [{ index: 0, source: 1, target: 0, data: "AB" }, { index: 1, source: 1, target: 2, data: "AC" }]
      })
    })

    it("preserves sparse indexes in induced subgraphs and rejects missing nodes", () => {
      const graph = Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }],
        edges: [
          { index: 3, source: 2, target: 5, data: "AB" },
          { index: 7, source: 5, target: 9, data: "BC" },
          { index: 11, source: 5, target: 5, data: "loop" }
        ]
      })
      assertSnapshot(Graph.inducedSubgraph([9, 5, 5])(graph), {
        type: "directed",
        nodes: [{ index: 5, data: "B" }, { index: 9, data: "C" }],
        edges: [{ index: 7, source: 5, target: 9, data: "BC" }, { index: 11, source: 5, target: 5, data: "loop" }]
      })
      assertGraphError(() => Graph.inducedSubgraph(graph, [2, 4]), "Node 4 does not exist")
    })

    it("preserves graph kind for empty induced subgraphs", () => {
      assertSnapshot(Graph.inducedSubgraph(Graph.undirected<string, never>(), []), {
        type: "undirected",
        nodes: [],
        edges: []
      })
    })

    it("keeps equal nodes and their edges disjoint in sums", () => {
      const expected = {
        type: "directed",
        nodes: [
          { index: 0, data: "A" },
          { index: 1, data: "B" },
          { index: 2, data: "A" },
          { index: 3, data: "B" }
        ],
        edges: [
          { index: 0, source: 0, target: 1, data: "left" },
          { index: 1, source: 2, target: 3, data: "right" }
        ]
      } as const
      const first = directed(["A", "B"], [[0, 1, "left"]])
      const second = directed(["A", "B"], [[0, 1, "right"]])
      assertSnapshot(Graph.sum(first, second), expected)
      assertSnapshot(Graph.sum(second)(first), expected)
    })
  })

  describe("queries", () => {
    const graph = directed(["A", "B", "C"], [
      [0, 1, "first"],
      [0, 1, "parallel"],
      [2, 0, "incoming"],
      [0, 0, "loop"],
      [0, 2, "last"]
    ])

    it("reports exact edge order, multiplicity, and directed degrees", () => {
      assert.deepStrictEqual(Graph.incidentEdges(graph, 0), [0, 1, 2, 3, 4])
      assert.deepStrictEqual(Graph.outgoingEdges(graph, 0), [0, 1, 3, 4])
      assert.deepStrictEqual(Graph.incomingEdges(graph, 0), [2, 3])
      assert.deepStrictEqual(Graph.edgesBetween(graph, 0, 1), [0, 1])
      assert.deepStrictEqual(Graph.edgesBetween(graph, 1, 0), [])
      assert.strictEqual(Graph.outDegree(graph, 0), 4)
      assert.strictEqual(Graph.inDegree(graph, 0), 2)
    })

    it("deduplicates neighbors in first-edge occurrence order", () => {
      assert.deepStrictEqual(Graph.neighbors(graph, 0), [1, 0, 2])
      assert.deepStrictEqual(Graph.successors(0)(graph), [1, 0, 2])
      assert.deepStrictEqual(Graph.predecessors(graph, 0), [2, 0])
      assert.deepStrictEqual(Graph.neighborsDirected(graph, 0, "outgoing"), [1, 0, 2])
      assert.deepStrictEqual(Graph.successors(graph, 0.5), [])
    })

    it("deduplicates high-degree neighbors in first-edge occurrence order", () => {
      const targets = Array.from({ length: 34 }, (_, i) => i + 1)
      const graph = directed([0, ...targets], [2, 1, ...targets, 1].map((target) => [0, target, null] as const))
      assert.deepStrictEqual(Graph.neighbors(graph, 0), [2, 1, ...targets.slice(2)])
    })

    it("handles undirected orientation, self-loops, parallel edges, and degree", () => {
      const graph = undirected(["A", "B"], [[1, 0, 1], [0, 1, 2], [0, 0, 3]])
      assert.deepStrictEqual(Graph.neighbors(graph, 0), [1, 0])
      assert.deepStrictEqual(Graph.neighbors(graph, 1), [0])
      assert.deepStrictEqual(Graph.incidentEdges(graph, 0), [0, 1, 2])
      assert.deepStrictEqual(Graph.edgesBetween(graph, 0, 1), [0, 1])
      assert.strictEqual(Graph.degree(graph, 0), 4)
      assert.strictEqual(Graph.hasEdge(graph, 0, 1), true)
      assert.strictEqual(Graph.hasEdge(graph, 1, 0), true)
    })

    it("preserves edge order when merging directed incidence and scanning undirected adjacency", () => {
      const directedGraph = directed([0, 1, 2], [
        [0, 1, "out-first"],
        [2, 0, "in-first"],
        [0, 0, "loop"],
        [0, 2, "out-last"],
        [1, 0, "in-last"]
      ])
      assert.deepStrictEqual(Graph.incidentEdges(directedGraph, 0), [0, 1, 2, 3, 4])
      assert.deepStrictEqual(Graph.edgesBetween(directedGraph, 0, 0), [2])

      const undirectedGraph = undirected([0, 1, 2], [
        [1, 0, "reverse"],
        [0, 0, "loop"],
        [0, 2, "forward"],
        [2, 0, "reverse-last"]
      ])
      assert.deepStrictEqual(Graph.incidentEdges(undirectedGraph, 0), [0, 1, 2, 3])
      assert.deepStrictEqual(Graph.edgesBetween(undirectedGraph, 0, 2), [2, 3])
      assert.deepStrictEqual(Graph.edgesBetween(undirectedGraph, 2, 0), [2, 3])
    })

    it("reports directed edge membership without assuming symmetry", () => {
      const graph = directed(["A", "B", "C"], [[0, 1, 1]])
      assert.strictEqual(Graph.hasEdge(graph, 0, 1), true)
      assert.strictEqual(Graph.hasEdge(graph, 1, 0), false)
      assert.strictEqual(Graph.hasEdge(graph, 0, 2), false)
      assert.strictEqual(Graph.hasEdge(graph, 99, 0), false)
    })

    it("passes stored endpoints to edge finder predicates", () => {
      const graph = undirected(["A", "B", "C"], [[2, 0, "match"], [0, 1, "match"]])
      const calls: Array<readonly [string, number, number]> = []
      assert.deepStrictEqual(
        Graph.findEdge(graph, (data, source, target) => {
          calls.push([data, source, target])
          return source === 0
        }),
        Option.some(1)
      )
      assert.deepStrictEqual(calls, [["match", 2, 0], ["match", 0, 1]])
      assert.deepStrictEqual(Graph.findEdges(graph, (_, source, target) => source > target), [0])
    })

    it("finds undefined edge payloads", () => {
      const graph = directed<string, number | undefined>(["A", "B", "C"], [
        [0, 1, undefined],
        [1, 2, 42],
        [2, 0, undefined]
      ])
      assert.deepStrictEqual(Graph.findEdge(graph, (edge) => edge === undefined), Option.some(0))
      assert.deepStrictEqual(Graph.findEdges(graph, (edge) => edge === undefined), [0, 2])
    })

    it("reports kind and missing-node errors consistently", () => {
      const one = directed<string, number>(["A"], [])
      const undirectedOne = undirected<string, number>(["A"], [])
      assertGraphError(
        () => Graph.degree(one as unknown as Graph.UndirectedGraph<string, number>, 0),
        "Cannot get degree of directed graph"
      )
      assertGraphError(
        () => Graph.outgoingEdges(undirectedOne as unknown as Graph.DirectedGraph<string, number>, 0),
        "Cannot get outgoing edges of undirected graph"
      )
      assertGraphError(
        () => Graph.incomingEdges(undirectedOne as unknown as Graph.DirectedGraph<string, number>, 0),
        "Cannot get incoming edges of undirected graph"
      )
      assertGraphError(
        () => Graph.successors(undirectedOne as unknown as Graph.DirectedGraph<string, number>, 0),
        "Cannot get successors of undirected graph"
      )
      assertGraphError(() => Graph.incidentEdges(one, 1), "Node 1 does not exist")
      assertGraphError(() => Graph.edgesBetween(one, 0, 1), "Node 1 does not exist")
    })
  })

  describe("serialization", () => {
    it("serializes representative directed and undirected GraphViz graphs exactly", () => {
      const directedGraph = directed(["A", "B"], [[0, 1, 1]])
      const directedExpected = [
        "digraph \"G\" {",
        "  \"0\" [label=\"A\"];",
        "  \"1\" [label=\"B\"];",
        "  \"0\" -> \"1\" [label=\"1\"];",
        "}"
      ].join("\n")
      assert.strictEqual(Graph.toGraphViz(directedGraph), directedExpected)
      assert.strictEqual(Graph.toGraphViz()(directedGraph), directedExpected)
      assert.strictEqual(
        Graph.toGraphViz(undirected(["A", "B"], [[1, 0, "edge"]])),
        [
          "graph \"G\" {",
          "  \"0\" [label=\"A\"];",
          "  \"1\" [label=\"B\"];",
          "  \"1\" -- \"0\" [label=\"edge\"];",
          "}"
        ].join("\n")
      )
    })

    it("escapes GraphViz graph names and labels exactly", () => {
      const graph = directed([{ label: "C:\\new\n\"line\"" }, { label: "end" }], [[
        0,
        1,
        { label: "edge\\path\n\"quoted\"" }
      ]])
      assert.strictEqual(
        Graph.toGraphViz(graph, {
          graphName: "My \"Graph\"",
          nodeLabel: (node) => `node:${node.label}`,
          edgeLabel: (edge) => edge.label
        }),
        [
          "digraph \"My \\\"Graph\\\"\" {",
          "  \"0\" [label=\"node:C:\\\\new\\n\\\"line\\\"\"];",
          "  \"1\" [label=\"node:end\"];",
          "  \"0\" -> \"1\" [label=\"edge\\\\path\\n\\\"quoted\\\"\"];",
          "}"
        ].join("\n")
      )
    })

    it("serializes representative directed and undirected Mermaid graphs exactly", () => {
      const directedGraph = directed(["A", "B"], [[0, 1, "edge"]])
      const directedExpected = [
        "flowchart TD",
        "  0[\"A\"]",
        "  1[\"B\"]",
        "  0 -->|\"edge\"| 1"
      ].join("\n")
      assert.strictEqual(Graph.toMermaid(directedGraph), directedExpected)
      assert.strictEqual(Graph.toMermaid()(directedGraph), directedExpected)
      assert.strictEqual(
        Graph.toMermaid(undirected(["A", "B"], [[1, 0, ""]])),
        [
          "graph TD",
          "  0[\"A\"]",
          "  1[\"B\"]",
          "  1 --- 0"
        ].join("\n")
      )
    })

    it("escapes Mermaid labels and applies direction, type, and custom labels", () => {
      const graph = directed([{ id: "#\"<>&[]{}()|\\" }, { id: "B\r\n2\r3\n4" }], [[0, 1, { weight: 2 }]])
      const serialized = Graph.toMermaid(graph, {
        direction: "LR",
        diagramType: "graph",
        nodeLabel: (node) => node.id,
        edgeLabel: (edge) => `w(${edge.weight})`
      })
      assert.strictEqual(
        serialized,
        [
          "graph LR",
          "  0[\"#35;#quot;#lt;#gt;#amp;#91;#93;#123;#125;#40;#41;#124;#92;\"]",
          "  1[\"B<br/>2<br/>3<br/>4\"]",
          "  0 ---|\"w#40;2#41;\"| 1"
        ].join("\n")
      )
      assert.strictEqual(serialized.includes("\r"), false)
    })

    it("supports every Mermaid node shape", () => {
      const expected: ReadonlyArray<readonly [Graph.MermaidNodeShape, string]> = [
        ["rectangle", "0[\"A\"]"],
        ["rounded", "0(\"A\")"],
        ["circle", "0((\"A\"))"],
        ["diamond", "0{\"A\"}"],
        ["hexagon", "0{{\"A\"}}"],
        ["stadium", "0([\"A\"])"],
        ["subroutine", "0[[\"A\"]]"],
        ["cylindrical", "0[(\"A\")]"]
      ]
      for (const [shape, node] of expected) {
        assert.strictEqual(
          Graph.toMermaid(directed<string, never>(["A"], []), { nodeShape: () => shape }),
          `flowchart TD\n  ${node}`
        )
      }
    })
  })

  describe("cycles and connectivity", () => {
    it("returns exact sparse cycle witnesses including self-loops and parallel edges", () => {
      const directedCycle = Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }],
        edges: [
          { index: 3, source: 2, target: 5, data: 1 },
          { index: 7, source: 5, target: 9, data: 1 },
          { index: 11, source: 9, target: 2, data: 1 }
        ]
      })
      assert.deepStrictEqual(Graph.findCycle(directedCycle), Option.some({ path: [2, 5, 9, 2], edges: [3, 7, 11] }))
      assert.deepStrictEqual(Graph.findCycle(undirected(["A"], [[0, 0, 1]])), Option.some({ path: [0, 0], edges: [0] }))
      assert.deepStrictEqual(
        Graph.findCycle(undirected(["A", "B"], [[0, 1, 1], [1, 0, 2]])),
        Option.some({
          path: [0, 1, 0],
          edges: [0, 1]
        })
      )
    })

    it("returns None for acyclic directed and reversed-storage undirected graphs", () => {
      assert.deepStrictEqual(Graph.findCycle(directed([0, 1, 2], [[0, 1, 1], [1, 2, 1]])), Option.none())
      assert.deepStrictEqual(Graph.findCycle(undirected([0, 1, 2], [[0, 1, 1], [2, 1, 1]])), Option.none())
    })

    it("invalidates acyclic results after adding and removing a cycle edge", () => {
      const mutable = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 1]]))
      assert.strictEqual(Graph.isAcyclic(mutable), true)
      const cycle = Graph.addEdge(mutable, 2, 0, 1)
      assert.strictEqual(Graph.isAcyclic(mutable), false)
      Graph.removeEdge(mutable, cycle)
      assert.strictEqual(Graph.isAcyclic(mutable), true)
    })

    it("handles undirected reversed orientation, self-loops, and parallel cycles", () => {
      assert.strictEqual(Graph.isAcyclic(undirected(["A", "B", "C"], [[0, 1, 1], [2, 1, 1]])), true)
      assert.strictEqual(Graph.isAcyclic(undirected(["A"], [[0, 0, 1]])), false)
      assert.strictEqual(Graph.isAcyclic(undirected(["A", "B"], [[0, 1, 1], [0, 1, 2]])), false)
    })

    it("returns complete connected, weak, and strong component partitions", () => {
      const connected = undirected(["A", "B", "C", "D", "E"], [[0, 1, 1], [2, 3, 1]])
      const directedGraph = directed(["A", "B", "C", "D", "E"], [[0, 1, 1], [1, 0, 1], [2, 1, 1], [3, 4, 1]])

      assertComponents(Graph.connectedComponents(connected), [[0, 1], [2, 3], [4]])
      assertComponents(Graph.weaklyConnectedComponents(directedGraph), [[0, 1, 2], [3, 4]])
      assertComponents(Graph.stronglyConnectedComponents(directedGraph), [[0, 1], [2], [3], [4]])
      assertComponents(Graph.connectedComponents(Graph.beginMutation(connected)), [[0, 1], [2, 3], [4]])
      assertComponents(Graph.stronglyConnectedComponents(Graph.beginMutation(directedGraph)), [[0, 1], [2], [3], [4]])
    })

    it("computes reachability in outgoing, incoming, and undirected modes", () => {
      const graph = directed(["A", "B", "C", "D"], [[0, 1, 1], [1, 2, 1], [3, 1, 1]])
      assert.deepStrictEqual(Array.from(Graph.unweightedDistances(graph, 0)), [[0, 0], [1, 1], [2, 2]])
      assert.deepStrictEqual(Array.from(Graph.unweightedDistances(graph, 2, { direction: "incoming" })), [
        [0, 2],
        [1, 1],
        [2, 0],
        [3, 2]
      ])
      assert.deepStrictEqual(Array.from(Graph.unweightedDistances(graph, 0, { direction: "undirected" })), [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 2]
      ])
      assert.strictEqual(Graph.hasPath(graph, 0, 2), true)
      assert.strictEqual(Graph.hasPath(graph, 2, 0), false)
      assert.strictEqual(Graph.hasPath(2, 0, { direction: "incoming" })(graph), true)
      assert.strictEqual(Graph.hasPath(graph, 2, 3), false)
      assert.strictEqual(Graph.hasPath(graph, 2, 3, { direction: "undirected" }), true)
    })

    it("updates connectivity results after mutable changes", () => {
      const mutable = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1]]))
      assertComponents(Graph.weaklyConnectedComponents(mutable), [[0, 1], [2]])
      assert.strictEqual(Graph.hasPath(mutable, 0, 2), false)
      Graph.addEdge(mutable, 1, 2, 1)
      assertComponents(Graph.weaklyConnectedComponents(mutable), [[0, 1, 2]])
      assert.strictEqual(Graph.hasPath(mutable, 0, 2), true)
    })

    it("checks connected, weak, strong, and tree predicates including empty graphs", () => {
      const tree = undirected(["A", "B", "C"], [[0, 1, 1], [1, 2, 1]])
      const disconnected = undirected<string, number>(["A", "B"], [])
      const weak = directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 1]])
      const weaklyDisconnected = directed<string, number>(["A", "B"], [])
      const strong = Graph.mutate(weak, (mutable) => {
        Graph.addEdge(mutable, 2, 0, 1)
      })
      assert.strictEqual(Graph.isConnected(tree), true)
      assert.strictEqual(Graph.isConnected(disconnected), false)
      assert.strictEqual(Graph.isTree(tree), true)
      assert.strictEqual(Graph.isWeaklyConnected(weak), true)
      assert.strictEqual(Graph.isWeaklyConnected(weaklyDisconnected), false)
      assert.strictEqual(Graph.isStronglyConnected(weak), false)
      assert.strictEqual(Graph.isStronglyConnected(strong), true)
      assert.strictEqual(Graph.isConnected(Graph.undirected()), true)
      assert.strictEqual(Graph.isTree(Graph.undirected()), false)
    })

    it("rejects runtime connectivity kind mismatches and missing endpoints", () => {
      const directedGraph = Graph.directed() as unknown as Graph.Graph<never, never, Graph.Kind>
      const undirectedGraph = Graph.undirected() as unknown as Graph.Graph<never, never, Graph.Kind>
      assertGraphError(
        () => Graph.connectedComponents(directedGraph as Graph.UndirectedGraph<never, never>),
        "Cannot find connected components of directed graph"
      )
      assertGraphError(
        () => Graph.weaklyConnectedComponents(undirectedGraph as Graph.DirectedGraph<never, never>),
        "Cannot find weakly connected components of undirected graph"
      )
      assertGraphError(
        () => Graph.stronglyConnectedComponents(undirectedGraph as Graph.DirectedGraph<never, never>),
        "Cannot find strongly connected components of undirected graph"
      )
      assertGraphError(
        () => Graph.isTree(directedGraph as Graph.UndirectedGraph<never, never>),
        "Cannot determine tree status of directed graph"
      )
      assertGraphError(() => Graph.hasPath(Graph.directed(), 0, 1), "Node 0 does not exist")
    })
  })

  describe("bipartite graphs", () => {
    it("recognizes even, odd, disconnected, and self-loop cases", () => {
      const even = undirected([0, 1, 2, 3], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 0, 1]])
      assert.strictEqual(Graph.isBipartite(even), true)
      assert.strictEqual(Graph.isBipartite(Graph.beginMutation(even)), true)
      assert.strictEqual(Graph.isBipartite(undirected([0, 1, 2], [[0, 1, 1], [1, 2, 1], [2, 0, 1]])), false)
      assert.strictEqual(Graph.isBipartite(undirected([0, 1, 2, 3], [[0, 1, 1], [2, 3, 1]])), true)
      assert.strictEqual(Graph.isBipartite(undirected([0], [[0, 0, 1]])), false)
    })

    it("reads fresh mutable structure after bipartite mutations", () => {
      const mutable = Graph.beginMutation(undirected([0, 1, 2], [[0, 1, 1], [1, 2, 1]]))
      assert.strictEqual(Graph.isBipartite(mutable), true)
      Graph.addEdge(mutable, 2, 0, 1)
      assert.strictEqual(Graph.isBipartite(mutable), false)
      Graph.removeEdge(mutable, 2)
      Graph.addEdge(mutable, 0, 1, 1)
      assert.strictEqual(Graph.isBipartite(mutable), true)
      Graph.addEdge(mutable, 2, 2, 1)
      assert.strictEqual(Graph.isBipartite(mutable), false)
    })

    it("returns deterministic maximum matches and the first parallel edge", () => {
      const graph = undirected([0, 1, 2, 3], [[0, 2, "first"], [2, 0, "parallel"], [0, 3, "edge"], [1, 2, "edge"], [
        1,
        3,
        "edge"
      ]])
      assert.deepStrictEqual(Graph.maximumBipartiteMatching(graph), [
        { left: 0, right: 2, edge: 0 },
        { left: 1, right: 3, edge: 4 }
      ])
      assert.deepStrictEqual(Graph.maximumBipartiteMatching(Graph.beginMutation(graph)), [
        { left: 0, right: 2, edge: 0 },
        { left: 1, right: 3, edge: 4 }
      ])
    })

    it("matches a brute-force oracle for every three-by-three bipartite graph", () => {
      const oracle = (adjacency: ReadonlyArray<ReadonlyArray<number>>, left = 0, used = 0): number => {
        if (left === adjacency.length) return 0
        let best = oracle(adjacency, left + 1, used)
        for (const right of adjacency[left]) {
          if ((used & (1 << right)) === 0) best = Math.max(best, 1 + oracle(adjacency, left + 1, used | (1 << right)))
        }
        return best
      }
      for (let mask = 0; mask < 1 << 9; mask++) {
        const adjacency: Array<Array<number>> = [[], [], []]
        const graph = Graph.undirected<void, void>((mutable) => {
          for (let i = 0; i < 6; i++) Graph.addNode(mutable, undefined)
          for (let left = 0; left < 3; left++) {
            for (let right = 0; right < 3; right++) {
              if ((mask & (1 << (left * 3 + right))) !== 0) {
                adjacency[left].push(right)
                Graph.addEdge(mutable, left, right + 3, undefined)
              }
            }
          }
        })
        const matching = Graph.maximumBipartiteMatching(graph)
        assert.strictEqual(matching.length, oracle(adjacency))
        assert.strictEqual(new Set(matching.map((match) => match.left)).size, matching.length)
        assert.strictEqual(new Set(matching.map((match) => match.right)).size, matching.length)
        for (const match of matching) {
          assert.ok(match.left >= 0 && match.left < 3)
          assert.ok(match.right >= 3 && match.right < 6)
          const edge = Option.getOrThrow(Graph.getEdge(graph, match.edge))
          assert.ok(
            (edge.source === match.left && edge.target === match.right) ||
              (edge.source === match.right && edge.target === match.left)
          )
        }
      }
    })

    it("rejects directed and non-bipartite graphs", () => {
      assertGraphError(
        () => Graph.isBipartite(Graph.directed() as unknown as Graph.UndirectedGraph<never, never>),
        "Cannot determine bipartite status of directed graph"
      )
      assertGraphError(
        () => Graph.maximumBipartiteMatching(Graph.directed() as unknown as Graph.UndirectedGraph<never, never>),
        "Cannot find bipartite matching of directed graph"
      )
      assertGraphError(
        () => Graph.maximumBipartiteMatching(undirected([0, 1, 2], [[0, 1, 1], [1, 2, 1], [2, 0, 1]])),
        "Cannot find bipartite matching of non-bipartite graph"
      )
    })
  })

  describe("low-link connectivity", () => {
    const analyze = <N, E>(graph: Graph.UndirectedGraph<N, E> | Graph.MutableUndirectedGraph<N, E>) => ({
      bridges: Graph.bridges(graph),
      articulationPoints: Graph.articulationPoints(graph),
      biconnectedComponents: Graph.biconnectedComponents(graph)
    })

    it("handles paths, cycles, disconnected components, parallel edges, loops, and sparse indexes", () => {
      const graph = Graph.fromSnapshot({
        type: "undirected",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }, { index: 12, data: "D" }],
        edges: [
          { index: 3, source: 5, target: 2, data: "first" },
          { index: 7, source: 2, target: 5, data: "parallel" },
          { index: 11, source: 5, target: 9, data: "bridge" },
          { index: 13, source: 9, target: 9, data: "loop" }
        ]
      })
      const expected = {
        bridges: [11],
        articulationPoints: [5],
        biconnectedComponents: [[2, 5], [5, 9], [9]]
      }
      assert.deepStrictEqual(analyze(graph), expected)
      assert.deepStrictEqual(analyze(Graph.beginMutation(graph)), expected)
    })

    it("groups cycles sharing an articulation point across disconnected components", () => {
      const graph = undirected<void, void>(new Array(8).fill(undefined), [
        [0, 1, undefined],
        [1, 2, undefined],
        [2, 0, undefined],
        [2, 3, undefined],
        [3, 4, undefined],
        [4, 2, undefined],
        [5, 6, undefined]
      ])
      assert.deepStrictEqual(analyze(graph), {
        bridges: [6],
        articulationPoints: [2],
        biconnectedComponents: [[0, 1, 2], [2, 3, 4], [5, 6]]
      })
    })

    it("returns empty results for empty and isolated graphs", () => {
      assert.deepStrictEqual(analyze(Graph.undirected()), {
        bridges: [],
        articulationPoints: [],
        biconnectedComponents: []
      })
      assert.deepStrictEqual(analyze(undirected<void, never>([undefined], [])), {
        bridges: [],
        articulationPoints: [],
        biconnectedComponents: []
      })
    })

    it("rejects directed graphs at runtime", () => {
      const graph = Graph.directed() as unknown as Graph.UndirectedGraph<never, never>
      for (const operation of [Graph.bridges, Graph.articulationPoints, Graph.biconnectedComponents]) {
        assertGraphError(() => operation(graph), "Cannot analyze undirected connectivity of directed graph")
      }
    })
  })

  describe("flow", () => {
    it("returns fixed flow and cut results in data-first and data-last forms", () => {
      const graph = directed(["source", "target"], [[0, 1, 3]])
      const config = { source: 0, target: 1, capacity: (edge: number) => edge }
      const flow = { value: 3, flows: new Map([[0, 3]]), cut: [0] }
      const cut = { value: 3, edges: [0], source: [0], target: [1] }
      assert.deepStrictEqual(Graph.maximumFlow(graph, config), flow)
      assert.deepStrictEqual(Graph.maximumFlow(config)(graph), flow)
      assert.deepStrictEqual(Graph.minimumCut(graph, config), cut)
      assert.deepStrictEqual(Graph.minimumCut(config)(Graph.beginMutation(graph)), cut)
    })

    it("enforces capacities, conservation, and max-flow/min-cut equality", () => {
      const capacities = [16, 13, 10, 4, 12, 9, 14, 7, 20, 4]
      const endpoints = [[0, 1], [0, 2], [1, 2], [2, 1], [1, 3], [3, 2], [2, 4], [4, 3], [3, 5], [4, 5]] as const
      const graph = directed<void, number>(
        new Array(6).fill(undefined),
        endpoints.map(([source, target], index) => [source, target, capacities[index]])
      )
      const config = { source: 0, target: 5, capacity: (edge: number) => edge }
      for (const candidate of [graph, Graph.beginMutation(graph)]) {
        const flow = Graph.maximumFlow(candidate, config)
        const cut = Graph.minimumCut(candidate, config)
        const balance = new Float64Array(6)
        for (let edge = 0; edge < endpoints.length; edge++) {
          const value = flow.flows.get(edge)!
          assert.ok(value >= 0 && value <= capacities[edge])
          balance[endpoints[edge][0]] -= value
          balance[endpoints[edge][1]] += value
        }
        assert.strictEqual(flow.value, 23)
        assert.strictEqual(cut.value, 23)
        assert.strictEqual(cut.edges.reduce((total, edge) => total + capacities[edge], 0), 23)
        assert.deepStrictEqual(Array.from(balance), [-23, 0, 0, 0, 0, 23])
        assert.deepStrictEqual([...cut.source, ...cut.target].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5])
      }
    })

    it("uses reverse residual edges to reroute flow", () => {
      const graph = directed<void, number>(new Array(6).fill(undefined), [
        [0, 1, 1],
        [0, 2, 1],
        [1, 3, 1],
        [2, 3, 1],
        [3, 5, 1],
        [1, 4, 1],
        [4, 5, 1]
      ])
      assert.strictEqual(Graph.maximumFlow(graph, { source: 0, target: 5, capacity: (edge) => edge }).value, 2)
    })

    it("handles parallel edges, self-loops, fractions, and disconnected targets", () => {
      const graph = directed<void, number>(new Array(4).fill(undefined), [
        [0, 0, 100],
        [0, 1, 0],
        [0, 2, 0.75],
        [2, 1, 1],
        [0, 2, 0.25]
      ])
      assert.deepStrictEqual(Graph.maximumFlow(graph, { source: 0, target: 1, capacity: (edge) => edge }), {
        value: 1,
        flows: new Map([[0, 0], [1, 0], [2, 0.75], [3, 1], [4, 0.25]]),
        cut: [1, 2, 4]
      })
      assert.deepStrictEqual(Graph.maximumFlow(graph, { source: 0, target: 3, capacity: (edge) => edge }), {
        value: 0,
        flows: new Map([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]),
        cut: []
      })
    })

    it("rejects invalid graphs, endpoints, capacities, and finite-range overflow", () => {
      const graph = directed<void, number>([undefined, undefined], [])
      assertGraphError(
        () => Graph.maximumFlow(graph, { source: 0, target: 2, capacity: (edge) => edge }),
        "Node 2 does not exist"
      )
      assertGraphError(
        () => Graph.maximumFlow(graph, { source: 0, target: 0, capacity: (edge) => edge }),
        "Flow source and target must be different nodes"
      )
      assertGraphError(
        () =>
          Graph.maximumFlow(Graph.undirected() as unknown as Graph.DirectedGraph<never, number>, {
            source: 0,
            target: 1,
            capacity: (edge) => edge
          }),
        "Cannot compute flow of undirected graph"
      )
      for (const capacity of [-1, NaN, Infinity, -Infinity]) {
        const invalid = directed<void, number>([undefined, undefined], [[0, 0, capacity]])
        assertGraphError(
          () => Graph.maximumFlow(invalid, { source: 0, target: 1, capacity: (edge) => edge }),
          "Edge 0 capacity must be a finite non-negative number"
        )
      }
      const overflow = directed<void, number>([undefined, undefined], [[0, 1, Number.MAX_VALUE], [
        0,
        1,
        Number.MAX_VALUE
      ]])
      assertGraphError(
        () => Graph.maximumFlow(overflow, { source: 0, target: 1, capacity: (edge) => edge }),
        "Maximum flow exceeds the finite number range"
      )
    })
  })

  describe("spanning forests and reductions", () => {
    it("preserves sparse indexes, isolated nodes, and fixed mutable parity in minimum spanning forests", () => {
      const graph = Graph.fromSnapshot({
        type: "undirected",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }, {
          index: 20,
          data: "isolated"
        }],
        edges: [
          { index: 3, source: 2, target: 5, data: 4 },
          { index: 7, source: 2, target: 5, data: 1 },
          { index: 11, source: 5, target: 9, data: -2 },
          { index: 13, source: 2, target: 9, data: 2 },
          { index: 17, source: 9, target: 20, data: Infinity }
        ]
      })
      const expected = {
        type: "undirected",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }, {
          index: 20,
          data: "isolated"
        }],
        edges: [{ index: 7, source: 2, target: 5, data: 1 }, { index: 11, source: 5, target: 9, data: -2 }]
      } as const
      assertSnapshot(Graph.minimumSpanningForest(graph, (edge) => edge), expected)
      assertSnapshot(Graph.minimumSpanningForest(Graph.beginMutation(graph), (edge) => edge), expected)
    })

    it("breaks equal spanning-forest weights by first edge order", () => {
      const graph = undirected([0, 1, 2], [[0, 1, 1], [1, 2, 1], [0, 2, 1]])
      assert.deepStrictEqual(
        Graph.toSnapshot(Graph.minimumSpanningForest(graph, (edge) => edge)).edges.map((edge) => edge.index),
        [0, 1]
      )
    })

    it("preserves sparse reachability and first parallel edges in transitive reductions", () => {
      const graph = Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }],
        edges: [
          { index: 3, source: 2, target: 5, data: "first" },
          { index: 4, source: 2, target: 5, data: "parallel" },
          { index: 7, source: 5, target: 9, data: "next" },
          { index: 11, source: 2, target: 9, data: "redundant" }
        ]
      })
      const expected = {
        type: "directed",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 9, data: "C" }],
        edges: [{ index: 3, source: 2, target: 5, data: "first" }, { index: 7, source: 5, target: 9, data: "next" }]
      } as const
      assertSnapshot(Graph.transitiveReduction(graph), expected)
      assertSnapshot(Graph.transitiveReduction(Graph.beginMutation(graph)), expected)
    })

    it("keeps both branches of a diamond", () => {
      const graph = directed([0, 1, 2, 3], [[0, 1, 1], [0, 2, 1], [1, 3, 1], [2, 3, 1]])
      assert.deepStrictEqual(Array.from(Graph.indices(Graph.edges(Graph.transitiveReduction(graph)))), [0, 1, 2, 3])
    })

    it("rejects invalid kinds, weights, and cyclic reductions", () => {
      assertGraphError(
        () => Graph.minimumSpanningForest(Graph.directed() as unknown as Graph.UndirectedGraph<never, number>, () => 1),
        "Cannot find minimum spanning forest of directed graph"
      )
      for (const weight of [NaN, -Infinity]) {
        assertGraphError(
          () => Graph.minimumSpanningForest(undirected([0, 1], [[0, 1, weight]]), (edge) => edge),
          "Minimum spanning forest does not support NaN or -Infinity edge weights"
        )
      }
      assertGraphError(
        () => Graph.transitiveReduction(Graph.undirected() as unknown as Graph.DirectedGraph<never, never>),
        "Cannot transitively reduce undirected graph"
      )
      assertGraphError(
        () => Graph.transitiveReduction(directed([0, 1], [[0, 1, 1], [1, 0, 1]])),
        "Cannot transitively reduce cyclic graph"
      )
    })
  })

  describe("pathfinding", () => {
    const graph = directed(["source", "first", "second", "target"], [
      [0, 1, 1],
      [0, 2, 1],
      [2, 3, 1],
      [1, 3, 1]
    ])
    const expected = { path: [0, 1, 3], edges: [0, 3], distance: 2, costs: [1, 1] }

    it("returns complete Dijkstra and A* paths with deterministic ties and fixed mutable parity", () => {
      const dijkstra = { source: 0, target: 3, cost: (edge: number) => edge }
      const astar = { ...dijkstra, heuristic: () => 0 }
      const bellmanFord = { path: [0, 2, 3], edges: [1, 2], distance: 2, costs: [1, 1] }
      assertPath(Graph.dijkstra(graph, dijkstra), expected)
      assertPath(Graph.dijkstra(Graph.beginMutation(graph), dijkstra), expected)
      assertPath(Graph.dijkstra(dijkstra)(graph), expected)
      assertPath(Graph.astar(graph, astar), expected)
      assertPath(Graph.astar(Graph.beginMutation(graph), astar), expected)
      assertPath(Graph.astar(astar)(graph), expected)
      assertPath(Graph.bellmanFord(dijkstra)(graph), bellmanFord)
      const all = Graph.floydWarshall((edge: number) => edge)(graph)
      assert.strictEqual(all.distances.get(0)?.get(3), 2)
      assert.deepStrictEqual(all.paths.get(0)?.get(3), expected.path)
      assert.deepStrictEqual(all.edges.get(0)?.get(3), expected.edges)
      assert.deepStrictEqual(all.costs.get(0)?.get(3), expected.costs)
    })

    it("preserves parallel edges for topological and weighted algorithms", () => {
      const graph = directed([0, 1, 2], [[0, 1, 10], [0, 1, 1], [1, 2, 2]])

      assertIndices(Graph.topo(graph), [0, 1, 2])
      assertPath(Graph.dijkstra(graph, { source: 0, target: 2, cost: (edge) => edge }), {
        path: [0, 1, 2],
        edges: [1, 2],
        distance: 3,
        costs: [1, 2]
      })
    })

    it("handles decreased Dijkstra priorities with fresh order and stale entries", () => {
      const reordered = directed(["source", "improved", "shortcut", "direct", "target"], [
        [0, 1, 10],
        [0, 2, 1],
        [0, 3, 2],
        [2, 1, 1],
        [1, 4, 1],
        [3, 4, 1]
      ])
      assertPath(Graph.dijkstra(reordered, { source: 0, target: 4, cost: (edge) => edge }), {
        path: [0, 3, 4],
        edges: [2, 5],
        distance: 3,
        costs: [2, 1]
      })

      const stale = directed(["source", "improved", "shortcut", "middle", "target"], [
        [0, 1, 10],
        [0, 2, 1],
        [2, 1, 1],
        [1, 3, 20],
        [3, 4, 20]
      ])
      assertPath(Graph.dijkstra(stale, { source: 0, target: 4, cost: (edge) => edge }), {
        path: [0, 2, 1, 3, 4],
        edges: [1, 2, 3, 4],
        distance: 42,
        costs: [1, 1, 20, 20]
      })
    })

    it("skips stale A* entries and does not reopen closed nodes", () => {
      const stale = directed(["source", "improved", "shortcut", "middle", "target"], [
        [0, 1, 10],
        [0, 2, 1],
        [2, 1, 1],
        [1, 3, 20],
        [3, 4, 20]
      ])
      assertPath(Graph.astar(stale, { source: 0, target: 4, cost: (edge) => edge, heuristic: () => 0 }), {
        path: [0, 2, 1, 3, 4],
        edges: [1, 2, 3, 4],
        distance: 42,
        costs: [1, 1, 20, 20]
      })

      const closed = directed(["source", "closed", "later", "target"], [
        [0, 1, 10],
        [1, 3, 1],
        [0, 2, 1],
        [2, 1, 1]
      ])
      assertPath(
        Graph.astar(closed, {
          source: 0,
          target: 3,
          cost: (edge) => edge,
          heuristic: (node) => node === "closed" ? -100 : 0
        }),
        { path: [0, 1, 3], edges: [0, 1], distance: 11, costs: [10, 1] }
      )
    })

    it("preserves sparse parallel edge identity across all shortest-path algorithms", () => {
      const graph = Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 2, data: "source" }, { index: 5, data: "target" }],
        edges: [{ index: 3, source: 2, target: 5, data: 1 }, { index: 1_000_000, source: 2, target: 5, data: 1 }]
      })
      const expected = { path: [2, 5], edges: [3], distance: 1, costs: [1] }
      for (const candidate of [graph, Graph.beginMutation(graph)]) {
        assertPath(Graph.dijkstra(candidate, { source: 2, target: 5, cost: (edge) => edge }), expected)
        assertPath(Graph.astar(candidate, { source: 2, target: 5, cost: (edge) => edge, heuristic: () => 0 }), expected)
        assertPath(Graph.bellmanFord(candidate, { source: 2, target: 5, cost: (edge) => edge }), expected)
        const all = Graph.floydWarshall(candidate, (edge) => edge)
        assert.strictEqual(all.distances.get(2)?.get(5), 1)
        assert.deepStrictEqual(all.paths.get(2)?.get(5), [2, 5])
        assert.deepStrictEqual(all.edges.get(2)?.get(5), [3])
        assert.deepStrictEqual(all.costs.get(2)?.get(5), [1])
      }
    })

    it("handles unreachable and same-node paths completely", () => {
      const graph = directed<string, number>(["A", "B"], [])
      const expected = { path: [0], edges: [], distance: 0, costs: [] }
      assert.deepStrictEqual(Graph.dijkstra(graph, { source: 0, target: 1, cost: (edge) => edge }), Option.none())
      assertPath(Graph.dijkstra(graph, { source: 0, target: 0, cost: (edge) => edge }), expected)
      assertPath(Graph.astar(graph, { source: 0, target: 0, cost: (edge) => edge, heuristic: () => 0 }), expected)
      assertPath(Graph.bellmanFord(graph, { source: 0, target: 0, cost: (edge) => edge }), expected)
      const all = Graph.floydWarshall(graph, (edge) => edge)
      assert.strictEqual(all.distances.get(0)?.get(1), Infinity)
      assert.strictEqual(all.paths.get(0)?.get(1), null)
      assert.deepStrictEqual(all.edges.get(0)?.get(1), [])
      assert.deepStrictEqual(all.costs.get(0)?.get(1), [])
      assert.strictEqual(all.distances.get(0)?.get(0), 0)
      assert.deepStrictEqual(all.paths.get(0)?.get(0), [0])
      assert.deepStrictEqual(all.edges.get(0)?.get(0), [])
      assert.deepStrictEqual(all.costs.get(0)?.get(0), [])
    })

    it("uses negative Bellman-Ford edges in shortest paths", () => {
      assertPath(
        Graph.bellmanFord(directed([0, 1, 2], [[0, 1, -1], [1, 2, 3], [0, 2, 5]]), {
          source: 0,
          target: 2,
          cost: (edge) => edge
        }),
        { path: [0, 1, 2], edges: [0, 1], distance: 2, costs: [-1, 3] }
      )
    })

    it("ignores negative cycles separated from the Bellman-Ford target by impassable edges", () => {
      const graph = directed([0, 1, 2, 3], [[0, 1, 1], [1, 2, -2], [2, 1, 1], [0, 3, 5], [2, 3, Infinity]])
      const expected = { path: [0, 3], edges: [3], distance: 5, costs: [5] }
      assertPath(Graph.bellmanFord(graph, { source: 0, target: 3, cost: (edge) => edge }), expected)
      assertPath(
        Graph.bellmanFord(Graph.beginMutation(graph), { source: 0, target: 3, cost: (edge) => edge }),
        expected
      )

      const unreachable = directed([0, 1, 2, 3], [[0, 1, 1], [1, 2, -2], [2, 1, 1], [2, 3, Infinity]])
      assert.deepStrictEqual(
        Graph.bellmanFord(unreachable, { source: 0, target: 3, cost: (edge) => edge }),
        Option.none()
      )
    })

    it("detects directed and undirected negative self-loops when source equals target", () => {
      for (const graph of [directed([0], [[0, 0, -1]]), undirected([0], [[0, 0, -1]])]) {
        assertGraphError(
          () => Graph.bellmanFord(graph, { source: 0, target: 0, cost: (edge) => edge }),
          "Negative cycle affects path to node 0"
        )
      }
    })

    it("preserves null edge payloads in Floyd-Warshall multihop paths", () => {
      type Edge = null | { readonly weight: number }
      const graph = directed<string, Edge>(["A", "B", "C"], [
        [0, 1, null],
        [1, 2, null],
        [0, 2, { weight: 10 }]
      ])
      const result = Graph.floydWarshall(graph, (edge) => edge === null ? 1 : edge.weight)
      assert.strictEqual(result.distances.get(0)?.get(2), 2)
      assert.deepStrictEqual(result.paths.get(0)?.get(2), [0, 1, 2])
      assert.deepStrictEqual(result.edges.get(0)?.get(2), [0, 1])
      assert.deepStrictEqual(result.costs.get(0)?.get(2), [null, null])
    })

    it("treats positive Infinity as unreachable in every shortest-path algorithm", () => {
      const graph = directed([0, 1], [[0, 1, Infinity]])
      assert.deepStrictEqual(Graph.dijkstra(graph, { source: 0, target: 1, cost: (edge) => edge }), Option.none())
      assert.deepStrictEqual(
        Graph.astar(graph, { source: 0, target: 1, cost: (edge) => edge, heuristic: () => 0 }),
        Option.none()
      )
      assert.deepStrictEqual(Graph.bellmanFord(graph, { source: 0, target: 1, cost: (edge) => edge }), Option.none())
      const all = Graph.floydWarshall(graph, (edge) => edge)
      assert.strictEqual(all.distances.get(0)?.get(1), Infinity)
      assert.strictEqual(all.paths.get(0)?.get(1), null)
      assert.deepStrictEqual(all.edges.get(0)?.get(1), [])
      assert.deepStrictEqual(all.costs.get(0)?.get(1), [])
    })

    it("reports relevant Bellman-Ford and Floyd-Warshall negative cycles", () => {
      const cycle = directed([0, 1, 2], [[0, 1, 1], [1, 2, -3], [2, 0, 1]])
      assertGraphError(
        () => Graph.bellmanFord(cycle, { source: 0, target: 2, cost: (edge) => edge }),
        "Negative cycle affects path to node 2"
      )
      assertGraphError(() => Graph.floydWarshall(cycle, (edge) => edge), "Negative cycle detected involving node 0")
      const negativeUndirected = undirected([0, 1], [[0, 1, -1]])
      assertGraphError(
        () => Graph.bellmanFord(negativeUndirected, { source: 0, target: 1, cost: (edge) => edge }),
        "Negative cycle affects path to node 1"
      )
    })

    it("validates endpoints, edge weights, heuristics, and finite arithmetic", () => {
      assertGraphError(
        () => Graph.dijkstra(Graph.directed(), { source: 0, target: 1, cost: () => 1 }),
        "Node 0 does not exist"
      )
      for (const weight of [-1, NaN, -Infinity]) {
        const invalid = directed([0, 1], [[0, 1, weight]])
        assertGraphError(
          () => Graph.dijkstra(invalid, { source: 0, target: 1, cost: (edge) => edge }),
          "Dijkstra's algorithm requires non-negative edge weights"
        )
        assertGraphError(
          () => Graph.astar(invalid, { source: 0, target: 1, cost: (edge) => edge, heuristic: () => 0 }),
          "A* algorithm requires non-negative edge weights"
        )
      }
      for (const heuristic of [NaN, Infinity, -Infinity]) {
        assertGraphError(() =>
          Graph.astar(directed<string, never>(["A"], []), {
            source: 0,
            target: 0,
            cost: () => 1,
            heuristic: () => heuristic
          }), "A* algorithm requires finite heuristic values")
        assertGraphError(() =>
          Graph.astar(directed(["source", "middle", "target"], [[0, 1, 1], [1, 2, 1]]), {
            source: 0,
            target: 2,
            cost: (edge) => edge,
            heuristic: (node) => node === "middle" ? heuristic : 0
          }), "A* algorithm requires finite heuristic values")
      }
      for (const weight of [NaN, -Infinity]) {
        const invalid = directed([0, 1], [[0, 1, weight]])
        assertGraphError(
          () => Graph.bellmanFord(invalid, { source: 0, target: 1, cost: (edge) => edge }),
          "Bellman-Ford algorithm does not support NaN or -Infinity edge weights"
        )
        assertGraphError(
          () => Graph.floydWarshall(invalid, (edge) => edge),
          "Floyd-Warshall algorithm does not support NaN or -Infinity edge weights"
        )
      }
      const overflow = directed([0, 1, 2], [[0, 1, Number.MAX_VALUE], [1, 2, Number.MAX_VALUE]])
      assertGraphError(
        () => Graph.dijkstra(overflow, { source: 0, target: 2, cost: (edge) => edge }),
        "Dijkstra distance calculation exceeded the finite number range"
      )
      assertGraphError(
        () => Graph.astar(overflow, { source: 0, target: 2, cost: (edge) => edge, heuristic: () => 0 }),
        "A* distance calculation exceeded the finite number range"
      )
      assertGraphError(
        () =>
          Graph.astar(directed([0, 1], [[0, 1, Number.MAX_VALUE]]), {
            source: 0,
            target: 1,
            cost: (edge) => edge,
            heuristic: (node) => node === 1 ? Number.MAX_VALUE : 0
          }),
        "A* priority calculation exceeded the finite number range"
      )
      assertGraphError(
        () => Graph.bellmanFord(overflow, { source: 0, target: 2, cost: (edge) => edge }),
        "Bellman-Ford distance calculation exceeded the finite number range"
      )
      assertGraphError(
        () => Graph.floydWarshall(overflow, (edge) => edge),
        "Floyd-Warshall distance calculation exceeded the finite number range"
      )
      const underflow = directed([0, 1, 2], [[0, 1, -Number.MAX_VALUE], [1, 2, -Number.MAX_VALUE]])
      assertGraphError(
        () => Graph.bellmanFord(underflow, { source: 0, target: 2, cost: (edge) => edge }),
        "Bellman-Ford distance calculation exceeded the finite number range"
      )
      assertGraphError(
        () => Graph.floydWarshall(underflow, (edge) => edge),
        "Floyd-Warshall distance calculation exceeded the finite number range"
      )
    })

    it("validates negative Dijkstra and A* weights before early returns", () => {
      const early = directed([0, 1, 2], [[0, 1, 1], [0, 2, 2], [2, 1, -5]])
      const same = directed([0], [[0, 0, -1]])
      for (const [graph, source, target] of [[early, 0, 1], [same, 0, 0]] as const) {
        assertGraphError(
          () => Graph.dijkstra(graph, { source, target, cost: (edge) => edge }),
          "Dijkstra's algorithm requires non-negative edge weights"
        )
        assertGraphError(
          () => Graph.astar(graph, { source, target, cost: (edge) => edge, heuristic: () => 0 }),
          "A* algorithm requires non-negative edge weights"
        )
      }
    })

    it("traverses undirected edges against stored orientation", () => {
      const graph = undirected(["A", "B", "C"], [[0, 1, 1], [2, 1, 1]])
      const expected = { path: [0, 1, 2], edges: [0, 1], distance: 2, costs: [1, 1] }
      assertPath(Graph.dijkstra(graph, { source: 0, target: 2, cost: (edge) => edge }), expected)
      assertPath(Graph.astar(graph, { source: 0, target: 2, cost: (edge) => edge, heuristic: () => 0 }), expected)
      assertPath(Graph.bellmanFord(graph, { source: 0, target: 2, cost: (edge) => edge }), expected)
      const all = Graph.floydWarshall(graph, (edge) => edge)
      assert.strictEqual(all.distances.get(0)?.get(2), 2)
      assert.deepStrictEqual(all.paths.get(0)?.get(2), [0, 1, 2])
      assert.deepStrictEqual(all.edges.get(0)?.get(2), [0, 1])
      assert.deepStrictEqual(all.costs.get(0)?.get(2), [1, 1])
    })
  })

  describe("path enumeration", () => {
    it("lazily and repeatably enumerates complete simple paths in edge order", () => {
      const graph = directed([0, 1, 2, 3], [
        [0, 1, "01"],
        [0, 2, "02"],
        [1, 2, "12"],
        [1, 3, "13"],
        [2, 3, "23"],
        [2, 1, "21"]
      ])
      const paths = Graph.simplePaths(graph, { source: 0, target: 3, limit: 3 })
      const expected = [
        { path: [0, 1, 2, 3], edges: [0, 2, 4], distance: 3, costs: ["01", "12", "23"] },
        { path: [0, 1, 3], edges: [0, 3], distance: 2, costs: ["01", "13"] },
        { path: [0, 2, 3], edges: [1, 4], distance: 2, costs: ["02", "23"] }
      ]
      assert.deepStrictEqual(Array.from(paths), expected)
      assert.deepStrictEqual(Array.from(paths), expected)
      assert.deepStrictEqual(Array.from(Graph.simplePaths({ source: 0, target: 3, limit: 3 })(graph)), expected)
    })

    it("enumerates parallel and structurally tied shortest paths exactly", () => {
      const graph = directed([0, 1, 2, 3], [[0, 1, 1], [0, 2, 1], [1, 3, 1], [2, 3, 1], [0, 1, 1]])
      const expected = [
        { path: [0, 1, 3], edges: [0, 2], distance: 2, costs: [1, 1] },
        { path: [0, 1, 3], edges: [4, 2], distance: 2, costs: [1, 1] },
        { path: [0, 2, 3], edges: [1, 3], distance: 2, costs: [1, 1] }
      ]
      assert.deepStrictEqual(
        Array.from(Graph.allShortestPaths(graph, { source: 0, target: 3, cost: (edge) => edge })),
        expected
      )
      assert.deepStrictEqual(
        Array.from(Graph.allShortestPaths({ source: 0, target: 3, cost: (edge: number) => edge })(graph)),
        expected
      )
      assert.deepStrictEqual(
        Array.from(Graph.allShortestPaths(Graph.beginMutation(graph), {
          source: 0,
          target: 3,
          cost: (edge) => edge,
          limit: 2
        })),
        expected.slice(0, 2)
      )
    })

    it("terminates zero-cost predecessor cycles and emits only simple shortest paths", () => {
      const graph = directed([0, 1, 2, 3], [[0, 1, 0], [1, 2, 0], [2, 1, 0], [1, 3, 1], [2, 3, 1]])
      assert.deepStrictEqual(
        Array.from(Graph.allShortestPaths(graph, { source: 0, target: 3, cost: (edge) => edge })),
        [
          { path: [0, 1, 3], edges: [0, 3], distance: 1, costs: [0, 1] },
          { path: [0, 1, 2, 3], edges: [0, 1, 4], distance: 1, costs: [0, 0, 1] }
        ]
      )
    })

    it("defers shortest-path cost evaluation until iteration", () => {
      let calls = 0
      const paths = Graph.allShortestPaths(directed([0, 1], [[0, 1, 1]]), {
        source: 0,
        target: 1,
        cost: (edge) => {
          calls++
          return edge
        }
      })
      assert.strictEqual(calls, 0)
      assert.deepStrictEqual(Array.from(paths), [{ path: [0, 1], edges: [0], distance: 1, costs: [1] }])
      assert.strictEqual(calls, 1)
    })

    it("revalidates mutable endpoints and isolates active snapshots", () => {
      const removed = Graph.beginMutation(directed([0, 1], [[0, 1, 1]]))
      const pending = Graph.simplePaths(removed, { source: 0, target: 1 })
      Graph.removeNode(removed, 0)
      assertGraphError(() => Array.from(pending), "Node 0 does not exist")

      const shortestRemoved = Graph.beginMutation(directed([0, 1], [[0, 1, 1]]))
      const shortestPending = Graph.allShortestPaths(shortestRemoved, {
        source: 0,
        target: 1,
        cost: (edge) => edge
      })
      Graph.removeNode(shortestRemoved, 1)
      assertGraphError(() => Array.from(shortestPending), "Node 1 does not exist")

      const mutable = Graph.beginMutation(directed([0, 1, 2, 3], [[0, 1, 1], [0, 2, 1], [1, 3, 1], [2, 3, 1]]))
      const paths = Graph.simplePaths(mutable, { source: 0, target: 3 })
      const iterator = paths[Symbol.iterator]()
      assert.deepStrictEqual(iterator.next().value, {
        path: [0, 1, 3],
        edges: [0, 2],
        distance: 2,
        costs: [1, 1]
      })
      Graph.removeEdge(mutable, 1)
      assert.deepStrictEqual(iterator.next().value, {
        path: [0, 2, 3],
        edges: [1, 3],
        distance: 2,
        costs: [1, 1]
      })
      assert.deepStrictEqual(Array.from(paths), [{ path: [0, 1, 3], edges: [0, 2], distance: 2, costs: [1, 1] }])

      const shortestMutable = Graph.beginMutation(directed([0, 1, 2, 3], [
        [0, 1, 1],
        [0, 2, 1],
        [1, 3, 1],
        [2, 3, 1]
      ]))
      const shortest = Graph.allShortestPaths(shortestMutable, { source: 0, target: 3, cost: (edge) => edge })
      const shortestIterator = shortest[Symbol.iterator]()
      assert.deepStrictEqual(shortestIterator.next().value, {
        path: [0, 1, 3],
        edges: [0, 2],
        distance: 2,
        costs: [1, 1]
      })
      Graph.removeEdge(shortestMutable, 1)
      assert.deepStrictEqual(shortestIterator.next().value, {
        path: [0, 2, 3],
        edges: [1, 3],
        distance: 2,
        costs: [1, 1]
      })
      assert.deepStrictEqual(Array.from(shortest), [
        { path: [0, 1, 3], edges: [0, 2], distance: 2, costs: [1, 1] }
      ])
    })

    it("handles empty path enumerations", () => {
      const graph = directed<string, number>(["A", "B"], [])
      const same = [{ path: [0], edges: [], distance: 0, costs: [] }]

      assert.deepStrictEqual(Array.from(Graph.simplePaths(graph, { source: 0, target: 0 })), same)
      assert.deepStrictEqual(
        Array.from(Graph.allShortestPaths(graph, { source: 0, target: 0, cost: (edge) => edge })),
        same
      )
      assert.deepStrictEqual(
        Array.from(Graph.allShortestPaths(graph, { source: 0, target: 1, cost: (edge) => edge })),
        []
      )
    })

    it("validates limits, endpoints, and non-negative shortest-path costs", () => {
      const graph = directed([0, 1], [[0, 1, -1]])
      assertGraphError(
        () => Array.from(Graph.allShortestPaths(graph, { source: 0, target: 1, cost: (edge) => edge })),
        "All shortest paths requires non-negative edge weights"
      )
      assertGraphError(
        () => Array.from(Graph.allShortestPaths(graph, { source: 0, target: 1, cost: (edge) => edge, limit: 0 })),
        "All shortest paths requires non-negative edge weights"
      )
      const overflow = directed([0, 1, 2], [[0, 1, Number.MAX_VALUE], [1, 2, Number.MAX_VALUE]])
      assertGraphError(
        () => Array.from(Graph.allShortestPaths(overflow, { source: 0, target: 2, cost: (edge) => edge })),
        "All shortest paths distance calculation exceeded the finite number range"
      )
      assertGraphError(
        () => Graph.simplePaths(graph, { source: 0, target: 1, limit: -1 }),
        "Path enumeration limit must be a non-negative integer or Infinity"
      )
      assertGraphError(() => Graph.simplePaths(graph, { source: 0, target: 2 }), "Node 2 does not exist")
      assert.deepStrictEqual(Array.from(Graph.simplePaths(graph, { source: 0, target: 1, limit: 0 })), [])
    })
  })

  describe("traversal", () => {
    const graph = directed(["A", "B", "C", "D"], [[0, 1, 1], [0, 2, 2], [1, 3, 3], [2, 3, 4]])

    it("traverses DFS, BFS, and postorder in documented order", () => {
      assertIndices(Graph.dfs(graph, { start: [0] }), [0, 1, 3, 2])
      assertIndices(Graph.bfs(graph, { start: [0] }), [0, 1, 2, 3])
      assertIndices(Graph.dfsPostOrder(graph, { start: [0] }), [3, 1, 2, 0])
      assertIndices(Graph.dfs(graph), [])
    })

    it("preserves postorder with parallel edges, self-loops, and directionless traversal", () => {
      const parallel = directed([0, 1, 2, 3, 4], [
        [0, 1, 1],
        [0, 1, 2],
        [0, 1, 3],
        [1, 2, 4],
        [1, 3, 5],
        [1, 4, 6],
        [1, 1, 7]
      ])
      assertIndices(Graph.dfsPostOrder(parallel, { start: [0] }), [2, 3, 4, 1, 0])
      assertIndices(Graph.dfsPostOrder(parallel, { start: [0, 1] }), [2, 3, 4, 1, 0])

      const directionless = directed([0, 1, 2, 3], [[0, 1, 1], [2, 1, 2], [1, 3, 3], [1, 1, 4]])
      assertIndices(Graph.dfsPostOrder(directionless, { start: [1], direction: "undirected" }), [3, 0, 2, 1])
    })

    it("uses shortest distance for radius membership and supports traversal directions", () => {
      const graph = directed([0, 1, 2, 3], [[0, 1, 1], [1, 2, 1], [0, 2, 1], [2, 3, 1]])
      assertIndices(Graph.dfs(graph, { start: [0], radius: 2 }), [0, 1, 2, 3])
      assertIndices(Graph.bfs(graph, { start: [2], direction: "incoming" }), [2, 1, 0])
      assertIndices(Graph.dfsPostOrder(graph, { start: [2], direction: "incoming" }), [0, 1, 2])
      assertIndices(Graph.bfs(graph, { start: [1], direction: "undirected", radius: 1 }), [1, 2, 0])
      assertIndices(
        Graph.dfsPostOrder(directed([0, 1, 2], [[0, 1, 1], [1, 2, 1]]), {
          start: [0],
          radius: 1
        }),
        [1, 0]
      )
    })

    it("preserves bounded undirected DFS order for reciprocal neighbors", () => {
      const graph = directed<void, number>(new Array(5).fill(undefined), [[0, 1, 1], [4, 1, 2], [1, 4, 3]])

      assertIndices(Graph.dfs(graph, { start: [1], direction: "undirected", radius: 2 }), [1, 4, 0])
    })

    it("validates radius in data-first and data-last forms", () => {
      for (const radius of [NaN, -Infinity, -1, 0.5]) {
        for (
          const run of [
            () => Graph.dfs(graph, { start: [0], radius }),
            () => Graph.bfs({ start: [0], radius })(graph),
            () => Graph.dfsPostOrder(graph, { start: [0], radius })
          ]
        ) assertGraphError(run, "Traversal radius must be a non-negative integer or Infinity")
      }
    })

    it("copies starts, prioritizes distinct roots, and preserves sparse indexes", () => {
      const start = [0]
      const walkers = [Graph.dfs(graph, { start }), Graph.bfs(graph, { start }), Graph.dfsPostOrder(graph, { start })]
      start[0] = 3
      assertIndices(walkers[0], [0, 1, 3, 2])
      assertIndices(walkers[1], [0, 1, 2, 3])
      assertIndices(walkers[2], [3, 1, 2, 0])
      assertIndices(Graph.bfs(graph, { start: [0, 0, 2, 2] }), [0, 2, 1, 3])

      const sparse = Graph.fromSnapshot({
        type: "directed",
        nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }, { index: 1_000_000, data: "C" }],
        edges: [{ index: 3, source: 2, target: 5, data: 1 }, {
          index: 1_000_000,
          source: 5,
          target: 1_000_000,
          data: 2
        }]
      })
      assertIndices(Graph.bfs(sparse, { start: [2] }), [2, 5, 1_000_000])
      assertIndices(Graph.dfsPostOrder(sparse, { start: [2] }), [1_000_000, 5, 2])
    })

    it("revalidates missing starts for fresh DFS, BFS, and postorder iterators", () => {
      const mutable = Graph.beginMutation(directed([0, 1], [[0, 1, 1]]))
      const walkers = [
        Graph.indices(Graph.dfs(mutable, { start: [0] })),
        Graph.indices(Graph.bfs(mutable, { start: [0] })),
        Graph.indices(Graph.dfsPostOrder(mutable, { start: [0] }))
      ]
      Graph.removeNode(mutable, 0)
      for (const walker of walkers) assertGraphError(() => walker[Symbol.iterator](), "Node 0 does not exist")
    })

    it("isolates active mutable traversal snapshots while fresh iterators see mutations", () => {
      const mutable = Graph.beginMutation(directed(["A", "B", "C"], [[0, 1, 1], [1, 2, 2]]))
      const walkers = [
        Graph.indices(Graph.dfs(mutable, { start: [0] })),
        Graph.indices(Graph.bfs(mutable, { start: [0] })),
        Graph.indices(Graph.dfsPostOrder(mutable, { start: [0] }))
      ]
      const active = walkers.map((walker) => walker[Symbol.iterator]())
      Graph.removeNode(mutable, 1)
      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => active[0] }), [0, 1, 2])
      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => active[1] }), [0, 1, 2])
      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => active[2] }), [2, 1, 0])
      for (const walker of walkers) assert.deepStrictEqual(Array.from(walker), [0])
    })

    it("topologically sorts with prioritized initials and validates fresh mutable state", () => {
      const graph = directed(["A", "B", "C", "D"], [[0, 1, 1], [2, 3, 1]])
      assertIndices(Graph.topo(graph, { initials: [2] }), [2, 0, 3, 1])

      const mutable = Graph.beginMutation(directed<string, number>(["A", "B"], []))
      const walker = Graph.topo(mutable)
      assertIndices(walker, [0, 1])
      Graph.addEdge(mutable, 0, 1, 1)
      Graph.addEdge(mutable, 1, 0, 2)
      assertGraphError(() => Array.from(Graph.indices(walker)), "Cannot perform topological sort on cyclic graph")
    })

    it("isolates active mutable topological snapshots while fresh iterators see mutations", () => {
      const mutable = Graph.beginMutation(directed([0, 1, 2], [[0, 1, 1], [1, 2, 1]]))
      const walker = Graph.indices(Graph.topo(mutable))
      const active = walker[Symbol.iterator]()
      Graph.removeNode(mutable, 1)

      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => active }), [0, 1, 2])
      assert.deepStrictEqual(Array.from(walker), [0, 2])
    })

    it("rejects invalid topological graphs and initials", () => {
      assertGraphError(
        () => Graph.topo(Graph.undirected() as unknown as Graph.DirectedGraph<never, never>),
        "Cannot perform topological sort on undirected graph"
      )
      assertGraphError(
        () => Graph.topo(directed([0, 1], [[0, 1, 1], [1, 0, 1]])),
        "Cannot perform topological sort on cyclic graph"
      )
      const graph = directed([0, 1], [[0, 1, 1]])
      assertGraphError(() => Array.from(Graph.topo(graph, { initials: [1] })), "Initial node 1 has incoming edges")
      assertGraphError(() => Graph.topo(graph, { initials: [2] }), "Node 2 does not exist")
    })

    it("keeps nodes, edges, and externals live on mutable graphs", () => {
      const mutable = Graph.beginMutation(directed(["A", "B"], [[0, 1, 1]]))
      const nodes = Graph.indices(Graph.nodes(mutable))[Symbol.iterator]()
      const edges = Graph.indices(Graph.edges(mutable))[Symbol.iterator]()
      const externals = Graph.indices(Graph.externals(mutable))[Symbol.iterator]()
      assert.strictEqual(nodes.next().value, 0)
      assert.strictEqual(edges.next().value, 0)
      assert.strictEqual(externals.next().value, 1)

      Graph.addNode(mutable, "C")
      Graph.addEdge(mutable, 1, 2, 2)
      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => nodes }), [1, 2])
      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => edges }), [1])
      assert.deepStrictEqual(Array.from({ [Symbol.iterator]: () => externals }), [2])
    })

    it("selects outgoing sinks and incoming sources", () => {
      const graph = directed(["source", "middle", "sink", "isolated"], [[0, 1, 1], [1, 2, 2]])
      assertIndices(Graph.externals(graph), [2, 3])
      assertIndices(Graph.externals(graph, { direction: "outgoing" }), [2, 3])
      assertIndices(Graph.externals(graph, { direction: "incoming" }), [0, 3])
    })
  })

  describe("Walker", () => {
    it("projects representative walkers through indices, values, entries, and visit", () => {
      const walker = new Graph.Walker<number, string>(function*(visit) {
        yield visit(2, "A")
        yield visit(5, "B")
      })

      assert.deepStrictEqual(Array.from(Graph.indices(walker)), [2, 5])
      assert.deepStrictEqual(Array.from(Graph.values(walker)), ["A", "B"])
      assert.deepStrictEqual(Array.from(Graph.entries(walker)), [[2, "A"], [5, "B"]])
      assert.deepStrictEqual(Array.from(walker.visit((index, value) => `${index}:${value}`)), ["2:A", "5:B"])
    })

    it("is repeatable and gives independent iterators fresh state", () => {
      const walker = new Graph.Walker<number, string>(function*(visit) {
        yield visit(0, "A")
        yield visit(1, "B")
      })
      assert.deepStrictEqual(Array.from(walker), [[0, "A"], [1, "B"]])
      assert.deepStrictEqual(Array.from(walker), [[0, "A"], [1, "B"]])

      const left = walker[Symbol.iterator]()
      const right = walker[Symbol.iterator]()
      assert.deepStrictEqual(left.next(), { done: false, value: [0, "A"] })
      assert.deepStrictEqual(right.next(), { done: false, value: [0, "A"] })
      assert.deepStrictEqual(left.next(), { done: false, value: [1, "B"] })
      assert.deepStrictEqual(right.next(), { done: false, value: [1, "B"] })
    })

    it("preserves receivers supplied by iterable iterator methods", () => {
      const walker = new Graph.Walker<number, string>((visit) => new Set([visit(0, "A"), visit(1, "B")]))
      assert.deepStrictEqual(Array.from(walker), [[0, "A"], [1, "B"]])
    })
  })
})
