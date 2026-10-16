import * as JsonSchemaGenerator from "@effect/openapi-generator/JsonSchemaGenerator"
import { describe, expect, it } from "@effect/vitest"

describe("JsonSchemaGenerator", () => {
  it("schema & no definitions", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { type: "string" })
    const definitions = {}
    const result = generator.generate("openapi-3.1", definitions, false)
    expect(result).toBe(`// schemas
export type A = string
export const A = Schema.String
`)
  })

  it("schema & definitions", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { $ref: "#/components/schemas/B" })
    const definitions = {
      B: { type: "string" }
    }
    const result = generator.generate("openapi-3.1", definitions, false)
    expect(result).toBe(`// non-recursive definitions
export type B = string
export const B = Schema.String.annotate({ "identifier": "B" })
// schemas
export type A = B
export const A = B
`)
  })

  it("onEnter strips specified keys", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { type: "string", description: "desc", examples: ["ex"] })
    const definitions = {}
    const result = generator.generate("openapi-3.1", definitions, false, {
      onEnter: (js) => {
        const out = { ...js }
        delete out.examples
        return out
      }
    })
    expect(result).toBe(`// schemas
export type A = string
export const A = Schema.String.annotate({ "description": "desc" })
`)
  })

  it("default preserves all annotations", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { type: "string", description: "desc", examples: ["ex"] })
    const definitions = {}
    const result = generator.generate("openapi-3.1", definitions, false)
    expect(result).toBe(`// schemas
export type A = string
export const A = Schema.String.annotate({ "description": "desc", "examples": ["ex"] })
`)
  })

  const definitions = {
    A: {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"]
    },
    B: {
      type: "object",
      properties: { b: { type: "string" } },
      required: ["b"]
    }
  } as const

  const openA =
    `Schema.StructWithRest(Schema.Struct({ "a": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`
  const openB =
    `Schema.StructWithRest(Schema.Struct({ "b": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`

  for (
    const [keyword, expected] of [
      ["oneOf", `export const Choice = Schema.Union([${openA}, ${openB}], { mode: "oneOf" })`],
      ["anyOf", `export const Choice = Schema.Union([${openA}, ${openB}])`],
      [
        "allOf",
        `export const Choice = Schema.StructWithRest(Schema.Struct({ "a": Schema.String, "b": Schema.String }), [Schema.Record(Schema.String, Schema.Json.annotate({ "expected": "JSON value" }))])`
      ]
    ] as const
  ) {
    it(`preserves omitted additionalProperties with ${keyword}`, () => {
      const generator = JsonSchemaGenerator.make()
      generator.addSchema("Choice", {
        type: "object",
        [keyword]: [
          { $ref: "#/components/schemas/A" },
          { $ref: "#/components/schemas/B" }
        ]
      })

      const result = generator.generate("openapi-3.1", definitions, false)

      expect(result).toContain(expected)
    })
  }

  it("honors explicit additionalProperties false with oneOf", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("Choice", {
      type: "object",
      additionalProperties: false,
      oneOf: [
        { $ref: "#/components/schemas/A" },
        { $ref: "#/components/schemas/B" }
      ]
    })

    const result = generator.generate("openapi-3.1", definitions, false)

    // The closed outer object forbids the properties required by both branches.
    expect(result).toContain("export const Choice = Schema.Never")
  })

  it("generateHttpApi emits explicit type and const declarations", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { type: "string" })
    generator.addSchema("B", {
      type: "object",
      properties: {
        id: {
          type: "string"
        }
      },
      required: ["id"],
      additionalProperties: false
    })

    const result = generator.generateHttpApi("openapi-3.1", {})

    expect(result).toContain(`export type A = string
export const A = Schema.String`)
    expect(result).toContain(`export type B = { readonly "id": string }
export const B = Schema.Struct({ "id": Schema.String })`)
    expect(result).not.toContain("Schema.Class<")
    expect(result).not.toContain("Schema.Opaque<")
  })

  it("recursive schema", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { $ref: "#/components/schemas/B" })
    const definitions = {
      B: {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/B"
            }
          }
        },
        "required": [
          "name",
          "children"
        ],
        "additionalProperties": false
      }
    }
    const result = generator.generate("openapi-3.1", definitions, false)
    expect(result).toBe(`// recursive definitions
export type B = { readonly "name": string, readonly "children": ReadonlyArray<B> }
export const B = Schema.Struct({ "name": Schema.String, "children": Schema.Array(Schema.suspend((): Schema.Codec<B> => B)) }).annotate({ "identifier": "B" })
// schemas
export type A = B
export const A = B
`)
  })

  it("hoists recursive definitions referenced by earlier recursive definitions", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { $ref: "#/components/schemas/ResourcesNetworkCard" })
    const definitions = {
      ResourcesNetworkCard: {
        type: "object",
        properties: {
          sriov: {
            $ref: "#/components/schemas/ResourcesNetworkCardSRIOV"
          }
        },
        additionalProperties: false
      },
      ResourcesNetworkCardSRIOV: {
        type: "object",
        properties: {
          vfs: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ResourcesNetworkCard"
            }
          }
        },
        additionalProperties: false
      }
    }

    const result = generator.generate("openapi-3.1", definitions, false)
    const recursiveDeclaration =
      "export const ResourcesNetworkCard = Schema.suspend((): Schema.Codec<ResourcesNetworkCard> => __recursive_ResourcesNetworkCard)"

    expect(result).toContain(recursiveDeclaration)
    expect(result).toContain("const __recursive_ResourcesNetworkCard =")
    expect(result.indexOf(recursiveDeclaration)).toBeLessThan(
      result.indexOf("export const ResourcesNetworkCardSRIOV =")
    )
    expect(result.indexOf("export const ResourcesNetworkCardSRIOV =")).toBeLessThan(
      result.indexOf("const __recursive_ResourcesNetworkCard =")
    )
  })

  it("renders recursive definitions before non-recursive references for runtime generation", () => {
    const generator = JsonSchemaGenerator.make()
    generator.addSchema("A", { $ref: "#/components/schemas/ErrorResponse" })
    const definitions = {
      InnerErrors: {
        type: "object",
        properties: {
          field: {
            type: "string"
          }
        },
        required: ["field"],
        additionalProperties: false
      },
      ErrorDetails: {
        oneOf: [
          {
            type: "object",
            additionalProperties: {
              $ref: "#/components/schemas/ErrorDetails"
            }
          },
          {
            $ref: "#/components/schemas/InnerErrors"
          }
        ]
      },
      ErrorResponse: {
        type: "object",
        properties: {
          errors: {
            $ref: "#/components/schemas/ErrorDetails"
          }
        },
        additionalProperties: false
      }
    }

    const runtimeResult = generator.generate("openapi-3.1", definitions, false)
    const recursiveDeclaration =
      "export const ErrorDetails = Schema.suspend((): Schema.Codec<ErrorDetails> => __recursive_ErrorDetails)"

    expect(runtimeResult).toContain(recursiveDeclaration)
    expect(runtimeResult).toContain("const __recursive_ErrorDetails =")
    expect(runtimeResult.indexOf(recursiveDeclaration)).toBeLessThan(
      runtimeResult.indexOf("export const ErrorResponse =")
    )

    const httpApiResult = generator.generateHttpApi("openapi-3.1", definitions)
    expect(httpApiResult).toContain(recursiveDeclaration)
    expect(httpApiResult).toContain("const __recursive_ErrorDetails =")
    expect(httpApiResult.indexOf(recursiveDeclaration)).toBeLessThan(
      httpApiResult.indexOf("export const ErrorResponse =")
    )
  })
})
