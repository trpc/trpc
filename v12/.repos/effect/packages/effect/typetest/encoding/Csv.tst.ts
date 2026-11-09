import { type Array as Arr, type Channel, Schema, SchemaGetter } from "effect"
import { Csv } from "effect/encoding"
import { describe, expect, it } from "tstyche"

type HeaderRecord = { readonly [x: string]: string }

describe("Csv", () => {
  const person = Schema.Struct({ name: Schema.String, age: Schema.NumberFromString }).pipe(
    Schema.encodeKeys({ name: "Full Name", age: "Age (years)" })
  )

  it("selects decoded rows from literal headers", () => {
    expect(Csv.decodeString()).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<Csv.Row>,
        Csv.CsvError,
        unknown,
        Arr.NonEmptyReadonlyArray<string>,
        never,
        unknown
      >
    >()
    expect(Csv.decodeString({ headers: true })).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<HeaderRecord>,
        Csv.CsvError,
        unknown,
        Arr.NonEmptyReadonlyArray<string>,
        never,
        unknown
      >
    >()
    const headers = true as boolean
    expect(Csv.decode({ headers })).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<Csv.Row | HeaderRecord>,
        Csv.CsvError,
        unknown,
        Arr.NonEmptyReadonlyArray<Uint8Array>,
        never,
        unknown
      >
    >()
  })

  it("selects encoded input from literal columns", () => {
    expect(Csv.encodeString()).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<string>,
        never,
        unknown,
        Arr.NonEmptyReadonlyArray<Csv.Row>,
        never,
        unknown
      >
    >()
    expect(Csv.encode({ columns: ["a"], headers: true })).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<Uint8Array>,
        never,
        unknown,
        Arr.NonEmptyReadonlyArray<{ readonly [x: string]: string | undefined }>,
        never,
        unknown
      >
    >()
  })

  it("accepts only encoded column names", () => {
    const encode = Csv.encodeSchemaString(person)
    expect(encode).type.toBeCallableWith()
    expect(encode).type.toBeCallableWith({ headers: true })
    expect(encode).type.toBeCallableWith({ columns: ["Age (years)"], headers: true })
    expect(encode).type.not.toBeCallableWith({ columns: ["name"] })
    const union = Schema.Union([Schema.Struct({ a: Schema.String }), Schema.Struct({ b: Schema.String })])
    expect(Csv.encodeSchemaString(union)).type.toBeCallableWith({ columns: ["a", "b"] })
    expect(Csv.encodeSchemaString(union)).type.not.toBeCallableWith({ columns: ["c"] })
  })

  it("accepts any column names for positional schemas", () => {
    const schema = Schema.Tuple([Schema.String, Schema.NumberFromString]).pipe(
      Schema.decodeTo(Schema.Struct({ name: Schema.String, age: Schema.Number }), {
        decode: SchemaGetter.transform(([name, age]) => ({ name, age })),
        encode: SchemaGetter.transform(({ name, age }) => [name, age] as const)
      })
    )
    expect(Csv.encodeSchemaString(schema)).type.toBeCallableWith({ columns: ["name", "age"], headers: true })
  })

  it("accepts schemas with non-string encoded leaves", () => {
    const schema = Schema.Struct({ age: Schema.Number })
    expect(Csv.decodeSchemaString).type.toBeCallableWith(schema)
    expect(Csv.encodeSchemaString(schema)).type.toBeCallableWith({ columns: ["age"], disableCodecs: true })
  })

  it("keeps SchemaError and independent services", () => {
    interface DecodeService {
      readonly decode: unique symbol
    }
    interface EncodeService {
      readonly encode: unique symbol
    }
    const schema = {} as Schema.Codec<
      { readonly name: string },
      { readonly csv_name: string },
      DecodeService,
      EncodeService
    >
    expect(Csv.decodeSchemaString(schema)({ headers: true })).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<{ readonly name: string }>,
        Csv.CsvError | Schema.SchemaError,
        unknown,
        Arr.NonEmptyReadonlyArray<string>,
        never,
        unknown,
        DecodeService
      >
    >()
    expect(Csv.encodeSchema(schema)({ columns: ["csv_name"] })).type.toBe<
      Channel.Channel<
        Arr.NonEmptyReadonlyArray<Uint8Array>,
        Schema.SchemaError,
        unknown,
        Arr.NonEmptyReadonlyArray<{ readonly name: string }>,
        never,
        unknown,
        EncodeService
      >
    >()
  })
})
