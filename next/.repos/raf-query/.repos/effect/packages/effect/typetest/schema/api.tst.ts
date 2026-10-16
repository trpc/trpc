import { hole, Schema } from "effect"
import type { Effect, Exit, Option, Result } from "effect"
import { describe, expect, it } from "tstyche"

describe("decoding / encoding API", () => {
  it("is", () => {
    const is = Schema.is(Schema.String)
    const u = hole<unknown>()
    if (is(u)) {
      expect(u).type.toBe<string>()
    }
    const sn = hole<string | number>()
    if (is(sn)) {
      expect(sn).type.toBe<string>()
    }
    const struct = Schema.Struct({ a: Schema.String })
    const isStruct = Schema.is(struct)
    const s = hole<{ b: string }>()
    if (isStruct(s)) {
      expect(s).type.toBe<{ readonly a: string; b: string }>()
    }
    const schema = Schema.Array(Schema.String).pipe(
      Schema.refine(
        (arr): arr is readonly [string, string, ...Array<string>] => arr.length >= 2
      )
    )
    expect(schema).type.toBe<Schema.refine<readonly [string, string, ...Array<string>], Schema.$Array<Schema.String>>>()
  })

  it("asserts", () => {
    const schema = Schema.String
    const u = hole<unknown>()
    {
      Schema.asserts(schema, u)
      expect(u).type.toBe<string>()
    }
    const sn = hole<string | number>()
    {
      Schema.asserts(schema, sn)
      expect(sn).type.toBe<string>()
    }
    const struct = Schema.Struct({ a: Schema.String })
    const s = hole<{ b: string }>()
    {
      Schema.asserts(struct, s)
      expect(s).type.toBe<{ readonly a: string; b: string }>()
    }
  })

  it("decodeUnknownSync should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeUnknownSync).type.not.toBeCallableWith(schema)
  })

  it("decodeSync should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeSync).type.not.toBeCallableWith(schema)
  })

  it("decodeUnknownResult should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeUnknownResult).type.not.toBeCallableWith(schema)
  })

  it("decodeResult should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeResult).type.not.toBeCallableWith(schema)
  })

  it("decodeUnknownExit should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeUnknownExit).type.not.toBeCallableWith(schema)
  })

  it("decodeExit should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeExit).type.not.toBeCallableWith(schema)
  })

  it("decodeUnknownOption should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeUnknownOption).type.not.toBeCallableWith(schema)
  })

  it("decodeOption should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeOption).type.not.toBeCallableWith(schema)
  })

  it("decodeUnknownPromise should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodeUnknownPromise).type.not.toBeCallableWith(schema)
  })

  it("decodePromise should not be callable with a schema with DecodingServices", () => {
    const schema = hole<Schema.Codec<string, string, {}, never>>()
    expect(Schema.decodePromise).type.not.toBeCallableWith(schema)
  })

  it("encodeUnknownSync should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeUnknownSync).type.not.toBeCallableWith(schema)
  })

  it("encodeSync should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeSync).type.not.toBeCallableWith(schema)
  })

  it("encodeUnknownResult should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeUnknownResult).type.not.toBeCallableWith(schema)
  })

  it("encodeResult should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeResult).type.not.toBeCallableWith(schema)
  })

  it("encodeUnknownExit should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeUnknownExit).type.not.toBeCallableWith(schema)
  })

  it("encodeExit should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeExit).type.not.toBeCallableWith(schema)
  })

  it("encodeUnknownOption should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeUnknownOption).type.not.toBeCallableWith(schema)
  })

  it("encodeOption should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeOption).type.not.toBeCallableWith(schema)
  })

  it("encodeUnknownPromise should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodeUnknownPromise).type.not.toBeCallableWith(schema)
  })

  it("encodePromise should not be callable with a schema with EncodingServices", () => {
    const schema = hole<Schema.Codec<string, string, never, {}>>()
    expect(Schema.encodePromise).type.not.toBeCallableWith(schema)
  })

  it("decoding / encoding APIs should work with a union of schemas", () => {
    const schemas = {
      a: Schema.Struct({ a: Schema.FiniteFromString }),
      b: Schema.Struct({ b: Schema.Boolean })
    }

    const decodeUnknownEffect = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeUnknownEffect(schemas[key])
    })("a")({ a: "1" })
    expect(decodeUnknownEffect).type.toBe<Effect.Effect<{ readonly a: number }, Schema.SchemaError>>()

    const decodeEffect = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeEffect(schemas[key])
    })("a")({ a: "1" })
    expect(decodeEffect).type.toBe<Effect.Effect<{ readonly a: number }, Schema.SchemaError>>()

    const decodeUnknownExit = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeUnknownExit(schemas[key])
    })("a")({ a: "1" })
    expect(decodeUnknownExit).type.toBe<Exit.Exit<{ readonly a: number }, Schema.SchemaError>>()

    const decodeExit = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeExit(schemas[key])
    })("a")({ a: "1" })
    expect(decodeExit).type.toBe<Exit.Exit<{ readonly a: number }, Schema.SchemaError>>()

    const decodeUnknownResult = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeUnknownResult(schemas[key])
    })("a")({ a: "1" })
    expect(decodeUnknownResult).type.toBe<Result.Result<{ readonly a: number }, Schema.SchemaError>>()

    const decodeResult = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeResult(schemas[key])
    })("a")({ a: "1" })
    expect(decodeResult).type.toBe<Result.Result<{ readonly a: number }, Schema.SchemaError>>()

    const decodeUnknownOption = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeUnknownOption(schemas[key])
    })("a")({ a: "1" })
    expect(decodeUnknownOption).type.toBe<Option.Option<{ readonly a: number }>>()

    const decodeOption = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeOption(schemas[key])
    })("a")({ a: "1" })
    expect(decodeOption).type.toBe<Option.Option<{ readonly a: number }>>()

    const decodeUnknownPromise = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeUnknownPromise(schemas[key])
    })("a")({ a: "1" })
    expect(decodeUnknownPromise).type.toBe<Promise<{ readonly a: number }>>()

    const decodePromise = (<K extends "a" | "b">(key: K) => {
      return Schema.decodePromise(schemas[key])
    })("a")({ a: "1" })
    expect(decodePromise).type.toBe<Promise<{ readonly a: number }>>()

    const decodeUnknownSync = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeUnknownSync(schemas[key])
    })("a")({ a: "1" })
    expect(decodeUnknownSync).type.toBe<{ readonly a: number }>()

    const decodeSync = (<K extends "a" | "b">(key: K) => {
      return Schema.decodeSync(schemas[key])
    })("a")({ a: "1" })
    expect(decodeSync).type.toBe<{ readonly a: number }>()

    const encodeUnknownEffect = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeUnknownEffect(schemas[key])
    })("a")({ a: 1 })
    expect(encodeUnknownEffect).type.toBe<Effect.Effect<{ readonly a: string }, Schema.SchemaError>>()

    const encodeEffect = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeEffect(schemas[key])
    })("a")({ a: 1 })
    expect(encodeEffect).type.toBe<Effect.Effect<{ readonly a: string }, Schema.SchemaError>>()

    const encodeUnknownExit = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeUnknownExit(schemas[key])
    })("a")({ a: 1 })
    expect(encodeUnknownExit).type.toBe<Exit.Exit<{ readonly a: string }, Schema.SchemaError>>()

    const encodeExit = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeExit(schemas[key])
    })("a")({ a: 1 })
    expect(encodeExit).type.toBe<Exit.Exit<{ readonly a: string }, Schema.SchemaError>>()

    const encodeUnknownResult = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeUnknownResult(schemas[key])
    })("a")({ a: 1 })
    expect(encodeUnknownResult).type.toBe<Result.Result<{ readonly a: string }, Schema.SchemaError>>()

    const encodeResult = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeResult(schemas[key])
    })("a")({ a: 1 })
    expect(encodeResult).type.toBe<Result.Result<{ readonly a: string }, Schema.SchemaError>>()

    const encodeUnknownOption = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeUnknownOption(schemas[key])
    })("a")({ a: 1 })
    expect(encodeUnknownOption).type.toBe<Option.Option<{ readonly a: string }>>()

    const encodeOption = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeOption(schemas[key])
    })("a")({ a: 1 })
    expect(encodeOption).type.toBe<Option.Option<{ readonly a: string }>>()

    const encodeUnknownPromise = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeUnknownPromise(schemas[key])
    })("a")({ a: 1 })
    expect(encodeUnknownPromise).type.toBe<Promise<{ readonly a: string }>>()

    const encodePromise = (<K extends "a" | "b">(key: K) => {
      return Schema.encodePromise(schemas[key])
    })("a")({ a: 1 })
    expect(encodePromise).type.toBe<Promise<{ readonly a: string }>>()

    const encodeUnknownSync = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeUnknownSync(schemas[key])
    })("a")({ a: 1 })
    expect(encodeUnknownSync).type.toBe<{ readonly a: string }>()

    const encodeSync = (<K extends "a" | "b">(key: K) => {
      return Schema.encodeSync(schemas[key])
    })("a")({ a: 1 })
    expect(encodeSync).type.toBe<{ readonly a: string }>()
  })
})
