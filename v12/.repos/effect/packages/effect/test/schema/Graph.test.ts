import { assert, describe, it } from "@effect/vitest"
import { throws } from "@effect/vitest/utils"
import { Effect, Equivalence, Graph, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const directedCodec = Schema.toCodecJson(Schema.Graph("directed", Schema.String, Schema.Number))
const undirectedCodec = Schema.toCodecJson(Schema.Graph("undirected", Schema.String, Schema.Number))
const decodeDirected = Schema.decodeUnknownSync(directedCodec)
const encodeDirected = Schema.encodeSync(directedCodec)

const empty = (type: Graph.Kind) => ({ type, nodes: [], edges: [] })

const assertDecodeFailure = (input: unknown, path: string, message?: string) => {
  throws(() => decodeDirected(input), (error) => {
    const formatted = globalThis.String(error)
    assert.include(formatted, path)
    if (message !== undefined) assert.include(formatted, message)
  })
}

describe("Schema.Graph", () => {
  it.effect("derives productive arbitrary graphs", () =>
    Effect.gen(function*() {
      for (const type of ["directed", "undirected"] as const) {
        const schema = Schema.Graph(type, Schema.String, Schema.Number)
        const arbitrary = Arbitrary.schema(schema)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 100,
          maxDiscards: 0,
          seed: `graph-${type}`
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isTrue(values.some((graph) => Array.from(graph).length > 0))
        assert.isTrue(values.some((graph) => Array.from(Graph.edges(graph)).length > 0))
      }
    }))

  it.effect("derives recursive graph payloads", () =>
    Effect.gen(function*() {
      type RecursiveGraph = Graph.Graph<RecursiveGraph, null, "directed">
      const RecursiveGraph: Schema.Codec<RecursiveGraph> = Schema.suspend(() =>
        Schema.Graph("directed", RecursiveGraph, Schema.Null)
      )
      const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(RecursiveGraph), {
        count: 30,
        maxDiscards: 0,
        seed: "recursive-graph",
        size: 5
      })

      assert.isTrue(values.every(Schema.is(RecursiveGraph)))
      assert.isTrue(values.some((graph) => Array.from(graph).length > 0))
    }))

  it("derives active-structure equivalence from payload schemas", () => {
    const modulo = Schema.Number.annotate({
      toEquivalence: (): Equivalence.Equivalence<number> => Equivalence.make((a, b) => a % 2 === b % 2)
    })
    const equivalence = Schema.toEquivalence(Schema.Graph("directed", modulo, modulo))
    const left = Graph.directed<number, number>((mutable) => {
      const a = Graph.addNode(mutable, 0)
      const b = Graph.addNode(mutable, 1)
      Graph.addEdge(mutable, a, b, 2)
    })
    const right = Graph.directed<number, number>((mutable) => {
      const a = Graph.addNode(mutable, 2)
      const b = Graph.addNode(mutable, 3)
      Graph.addEdge(mutable, a, b, 4)
    })

    assert.strictEqual(equivalence(left, right), true)

    const undirectedEquivalence = Schema.toEquivalence(Schema.Graph("undirected", Schema.Number, Schema.Number))
    const forward = Graph.undirected<number, number>((mutable) => {
      Graph.addNode(mutable, 0)
      Graph.addNode(mutable, 1)
      Graph.addEdge(mutable, 0, 1, 2)
    })
    const reversed = Graph.undirected<number, number>((mutable) => {
      Graph.addNode(mutable, 0)
      Graph.addNode(mutable, 1)
      Graph.addEdge(mutable, 1, 0, 2)
    })
    assert.strictEqual(undirectedEquivalence(forward, reversed), true)
  })

  it("encodes and decodes empty directed and undirected graphs", () => {
    assert.deepStrictEqual(encodeDirected(Graph.directed()), empty("directed"))
    assert.deepStrictEqual(Schema.encodeSync(undirectedCodec)(Graph.undirected()), empty("undirected"))
    assert.strictEqual(decodeDirected(empty("directed")).type, "directed")
    assert.strictEqual(Schema.decodeUnknownSync(undirectedCodec)(empty("undirected")).type, "undirected")
  })

  it("preserves indexed directed structure, isolated nodes, loops, parallel edges, and gaps", () => {
    const graph = Graph.directed<string, number>((mutable) => {
      const removed = Graph.addNode(mutable, "removed")
      const source = Graph.addNode(mutable, "source")
      const target = Graph.addNode(mutable, "target")
      Graph.addNode(mutable, "isolated")
      Graph.removeNode(mutable, removed)
      const removedEdge = Graph.addEdge(mutable, source, target, -1)
      Graph.addEdge(mutable, source, source, 1)
      Graph.addEdge(mutable, source, target, 2)
      Graph.addEdge(mutable, source, target, 3)
      Graph.removeEdge(mutable, removedEdge)
    })
    const encoded = {
      type: "directed",
      nodes: [
        { index: 1, data: "source" },
        { index: 2, data: "target" },
        { index: 3, data: "isolated" }
      ],
      edges: [
        { index: 1, source: 1, target: 1, data: 1 },
        { index: 2, source: 1, target: 2, data: 2 },
        { index: 3, source: 1, target: 2, data: 3 }
      ]
    } satisfies Graph.Snapshot<string, number, "directed">

    assert.deepStrictEqual(encodeDirected(graph), encoded)
    const decoded = decodeDirected(encoded)
    assert.deepStrictEqual(Array.from(decoded), encoded.nodes.map(({ index, data }) => [index, data] as const))
    assert.deepStrictEqual(
      Array.from(Graph.edges(decoded), ([index, edge]) => ({ index, ...edge })),
      encoded.edges
    )
    assert.deepStrictEqual(encodeDirected(decoded), encoded)
  })

  it("preserves stored orientation for undirected edges", () => {
    const graph = Graph.undirected<string, number>((mutable) => {
      const a = Graph.addNode(mutable, "A")
      const b = Graph.addNode(mutable, "B")
      Graph.addEdge(mutable, b, a, 1)
    })
    const encoded = Schema.encodeSync(undirectedCodec)(graph)

    assert.deepStrictEqual(encoded, {
      type: "undirected",
      nodes: [{ index: 0, data: "A" }, { index: 1, data: "B" }],
      edges: [{ index: 0, source: 1, target: 0, data: 1 }]
    })
    assert.deepStrictEqual(
      Schema.encodeSync(undirectedCodec)(Schema.decodeUnknownSync(undirectedCodec)(encoded)),
      encoded
    )
  })

  it("starts a new allocation lineage after the highest active indexes", () => {
    const decoded = decodeDirected({
      type: "directed",
      nodes: [{ index: 2, data: "A" }, { index: 5, data: "B" }],
      edges: [{ index: 4, source: 2, target: 5, data: 1 }]
    })
    let nodeIndex: Graph.NodeIndex | undefined
    let edgeIndex: Graph.EdgeIndex | undefined
    Graph.mutate(decoded, (mutable) => {
      nodeIndex = Graph.addNode(mutable, "C")
      edgeIndex = Graph.addEdge(mutable, 5, nodeIndex, 2)
    })

    assert.strictEqual(nodeIndex, 6)
    assert.strictEqual(edgeIndex, 5)
  })

  it("does not serialize removed trailing allocation history", () => {
    const graph = Graph.directed<string, number>((mutable) => {
      const a = Graph.addNode(mutable, "A")
      const b = Graph.addNode(mutable, "B")
      const trailing = Graph.addNode(mutable, "removed")
      const active = Graph.addEdge(mutable, a, b, 1)
      const removed = Graph.addEdge(mutable, a, b, 2)
      Graph.removeEdge(mutable, removed)
      Graph.removeNode(mutable, trailing)
      assert.strictEqual(active, 0)
    })
    const decoded = decodeDirected(encodeDirected(graph))
    let nodeIndex: Graph.NodeIndex | undefined
    let edgeIndex: Graph.EdgeIndex | undefined
    Graph.mutate(decoded, (mutable) => {
      nodeIndex = Graph.addNode(mutable, "next")
      edgeIndex = Graph.addEdge(mutable, 0, 1, 3)
    })

    assert.strictEqual(nodeIndex, 2)
    assert.strictEqual(edgeIndex, 1)
  })

  it("rebuilds adjacency and initializes derived caches for cyclic graphs", () => {
    const graph = decodeDirected({
      type: "directed",
      nodes: [{ index: 0, data: "A" }, { index: 2, data: "B" }, { index: 4, data: "C" }],
      edges: [
        { index: 1, source: 0, target: 2, data: 1 },
        { index: 3, source: 2, target: 4, data: 2 },
        { index: 5, source: 4, target: 0, data: 3 }
      ]
    })

    assert.deepStrictEqual(Graph.neighbors(graph, 0), [2])
    assert.deepStrictEqual(Graph.predecessors(graph, 0), [4])
    assert.strictEqual(Graph.isAcyclic(graph), false)
  })

  it("applies node and edge payload transformations", () => {
    const codec = Schema.toCodecJson(Schema.Graph("directed", Schema.FiniteFromString, Schema.FiniteFromString))
    const encoded = {
      type: "directed",
      nodes: [{ index: 0, data: "1" }, { index: 1, data: "2" }],
      edges: [{ index: 0, source: 0, target: 1, data: "3" }]
    } as const
    const graph = Schema.decodeUnknownSync(codec)(encoded)

    assert.deepStrictEqual(Array.from(graph), [[0, 1], [1, 2]])
    assert.deepStrictEqual(Option.getOrThrow(Graph.getEdge(graph, 0)).data, 3)
    assert.deepStrictEqual(Schema.encodeSync(codec)(graph), encoded)
  })

  it("rejects mutable graphs and the wrong graph kind", () => {
    const mutable = Graph.beginMutation(Graph.directed<string, number>())
    assert.throws(() => encodeDirected(mutable as never), /immutable directed Graph/)
    assert.throws(() => encodeDirected(Graph.undirected() as never), /immutable directed Graph/)
    assertDecodeFailure(empty("undirected"), "[\"type\"]", "Expected \"directed\"")
  })

  it("rejects invalid node and edge indexes at precise paths", () => {
    const nodeCases = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]
    for (const index of nodeCases) {
      assertDecodeFailure(
        { type: "directed", nodes: [{ index, data: "A" }], edges: [] },
        "[\"nodes\"][0][\"index\"]"
      )
    }
    const edgeCases = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]
    for (const index of edgeCases) {
      assertDecodeFailure({
        type: "directed",
        nodes: [{ index: 0, data: "A" }],
        edges: [{ index, source: 0, target: 0, data: 1 }]
      }, "[\"edges\"][0][\"index\"]")
    }
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 0, data: "A" }, { index: 0, data: "B" }],
        edges: []
      },
      "[\"nodes\"][1][\"index\"]",
      "strictly increasing"
    )
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 1, data: "A" }, { index: 0, data: "B" }],
        edges: []
      },
      "[\"nodes\"][1][\"index\"]",
      "strictly increasing"
    )
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 0, data: "A" }],
        edges: [
          { index: 1, source: 0, target: 0, data: 1 },
          { index: 1, source: 0, target: 0, data: 2 }
        ]
      },
      "[\"edges\"][1][\"index\"]",
      "strictly increasing"
    )
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 0, data: "A" }],
        edges: [
          { index: 2, source: 0, target: 0, data: 1 },
          { index: 1, source: 0, target: 0, data: 2 }
        ]
      },
      "[\"edges\"][1][\"index\"]",
      "strictly increasing"
    )
  })

  it("rejects dangling endpoints without leaking GraphError", () => {
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 1, data: "A" }],
        edges: [{ index: 0, source: 0, target: 1, data: 1 }]
      },
      "[\"edges\"][0][\"source\"]",
      "encoded node index"
    )
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 1, data: "A" }],
        edges: [{ index: 0, source: 1, target: 2, data: 1 }]
      },
      "[\"edges\"][0][\"target\"]",
      "encoded node index"
    )
  })

  it("reports payload failures at array and property paths", () => {
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 0, data: null }],
        edges: []
      },
      "[\"nodes\"][0][\"data\"]",
      "Expected string"
    )
    assertDecodeFailure(
      {
        type: "directed",
        nodes: [{ index: 0, data: "A" }],
        edges: [{ index: 0, source: 0, target: 0, data: null }]
      },
      "[\"edges\"][0][\"data\"]",
      "Expected number"
    )
  })
})
