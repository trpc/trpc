import { type Graph, hole, Schema, SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("Schema.Graph", () => {
  it("infers directed and undirected graph kinds", () => {
    const directed = Schema.Graph("directed", Schema.String, Schema.Number)
    const undirected = Schema.Graph("undirected", Schema.String, Schema.Number)
    const kind = hole<Graph.Kind>()
    const generic = Schema.Graph(kind, Schema.String, Schema.Number)

    expect(directed).type.toBe<Schema.Graph<"directed", Schema.String, Schema.Number>>()
    expect(undirected).type.toBe<Schema.Graph<"undirected", Schema.String, Schema.Number>>()
    expect<Schema.Schema.Type<Schema.Graph<"directed", Schema.String, Schema.Number>>>().type.toBe<
      Graph.DirectedGraph<string, number>
    >()
    expect<Schema.Schema.Type<Schema.Graph<"undirected", Schema.String, Schema.Number>>>().type.toBe<
      Graph.UndirectedGraph<string, number>
    >()
    expect<Schema.Schema.Type<typeof generic>>().type.toBe<Graph.Graph<string, number, Graph.Kind>>()
  })

  it("propagates transformed encoded payloads", () => {
    const schema = Schema.Graph("directed", Schema.FiniteFromString, Schema.BigIntFromString)

    expect<Schema.Schema.Type<typeof schema>>().type.toBe<Graph.DirectedGraph<number, bigint>>()
    expect<Schema.Codec.Encoded<typeof schema>>().type.toBe<Graph.DirectedGraph<string, string>>()
    expect<Schema.Codec.Encoded<ReturnType<typeof Schema.toCodecIso<typeof schema>>>>().type.toBe<
      Schema.GraphIso<"directed", Schema.FiniteFromString, Schema.BigIntFromString>
    >()
  })

  it("propagates schema services", () => {
    const node = hole<Schema.Codec<string, string, "NodeDecode", "NodeEncode">>()
    const edge = hole<Schema.Codec<number, number, "EdgeDecode", "EdgeEncode">>()
    const schema = Schema.Graph("directed", node, edge)

    expect<Schema.Codec.DecodingServices<typeof schema>>().type.toBe<"NodeDecode" | "EdgeDecode">()
    expect<Schema.Codec.EncodingServices<typeof schema>>().type.toBe<"NodeEncode" | "EdgeEncode">()
  })

  it("accepts only immutable graphs for encoding", () => {
    const schema = Schema.Graph("directed", Schema.String, Schema.Number)
    const encode = Schema.encodeSync(schema)
    const immutable = hole<Graph.DirectedGraph<string, number>>()
    const mutable = hole<Graph.MutableDirectedGraph<string, number>>()

    expect(encode).type.toBeCallableWith(immutable)
    expect(encode).type.not.toBeCallableWith(mutable)
  })

  it("preserves public fields through annotations", () => {
    const schema = Schema.Graph("undirected", Schema.String, Schema.Number)
    const annotated = schema.annotate({ identifier: "Graph" })

    expect(annotated.type).type.toBe<"undirected">()
    expect(annotated.node).type.toBe<Schema.String>()
    expect(annotated.edge).type.toBe<Schema.Number>()
  })

  it("exposes a kind-aware declaration reviver", () => {
    expect(SchemaRepresentation.GraphReviver).type.toBe<SchemaRepresentation.DeclarationReviver<Graph.Kind>>()
  })
})
