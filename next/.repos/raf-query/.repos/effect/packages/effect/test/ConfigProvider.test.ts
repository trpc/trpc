import { describe, it } from "@effect/vitest"
import { deepStrictEqual } from "@effect/vitest/utils"
import { ConfigProvider, Effect, FileSystem, Layer, Path, PlatformError, Result } from "effect"

const notFound = (method: string): PlatformError.PlatformError =>
  PlatformError.systemError({
    module: "FileSystem",
    _tag: "NotFound",
    method
  })

async function assertSuccess(
  provider: ConfigProvider.ConfigProvider,
  path: ConfigProvider.Path,
  expected: ConfigProvider.Node
) {
  const r = Effect.result(provider.load(path))
  deepStrictEqual(await Effect.runPromise(r), Result.succeed(expected))
}

async function assertMissing(
  provider: ConfigProvider.ConfigProvider,
  path: ConfigProvider.Path
) {
  const r = Effect.result(provider.load(path))
  deepStrictEqual(await Effect.runPromise(r), Result.succeed(undefined))
}

async function assertFailure(
  provider: ConfigProvider.ConfigProvider,
  path: ConfigProvider.Path,
  expected: ConfigProvider.SourceError
) {
  const r = Effect.result(provider.load(path))
  deepStrictEqual(await Effect.runPromise(r), Result.fail(expected))
}

describe("ConfigProvider", () => {
  describe("make", () => {
    it.effect("exposes lookup absence and input transformation as provider behavior", () =>
      Effect.gen(function*() {
        const provider = ConfigProvider.fromUnknown({
          APP: {
            PORT: "3000"
          }
        })
        const nested = provider.mapInput((path) => ["APP", ...path])

        deepStrictEqual(
          yield* nested.load(["PORT"]),
          ConfigProvider.makeValue("3000")
        )
        deepStrictEqual(yield* nested.load(["MISSING"]), undefined)
      }))

    it("creates a provider from a lookup function", async () => {
      const provider = ConfigProvider.make((path) =>
        Effect.succeed(
          path.join(".") === "A.B"
            ? ConfigProvider.makeValue("value")
            : undefined
        )
      )

      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeValue("value"))
      await assertMissing(provider, ["missing"])
    })

    it("preserves SourceError failures", async () => {
      const error = new ConfigProvider.SourceError({ message: "source unavailable" })
      const provider = ConfigProvider.make(() => Effect.fail(error))

      await assertFailure(provider, ["A"], error)
    })
  })

  describe("combinators", () => {
    describe("orElse", () => {
      it("uses the fallback when the primary provider is missing the path", async () => {
        const primary = ConfigProvider.fromEnv({
          env: {
            "A": "value1"
          }
        })
        const fallback = ConfigProvider.fromEnv({
          env: {
            "B": "value2"
          }
        })
        const provider = ConfigProvider.orElse(primary, fallback)
        await assertSuccess(provider, ["A"], ConfigProvider.makeValue("value1"))
        await assertSuccess(provider, ["B"], ConfigProvider.makeValue("value2"))
      })

      it("does not use the fallback after a SourceError", async () => {
        const error = new ConfigProvider.SourceError({ message: "io down" })
        const primary = ConfigProvider.make(() => Effect.fail(error))
        const fallback = ConfigProvider.fromEnv({ env: { KEY: "fallback" } })
        const provider = primary.pipe(ConfigProvider.orElse(fallback))
        await assertFailure(provider, ["KEY"], error)
      })

      it("does not evaluate the fallback after the primary provider finds a node", async () => {
        const primary = ConfigProvider.fromUnknown({ KEY: "primary" })
        const fallback = ConfigProvider.make(() =>
          Effect.fail(new ConfigProvider.SourceError({ message: "fallback evaluated" }))
        )
        const provider = primary.pipe(ConfigProvider.orElse(fallback))

        await assertSuccess(provider, ["KEY"], ConfigProvider.makeValue("primary"))
      })

      it("preserves each operand's transformations", async () => {
        const primary = ConfigProvider.fromEnv({
          env: {
            "DATABASE_HOST": "from-env"
          }
        }).pipe(ConfigProvider.constantCase)
        const fallback = ConfigProvider.fromEnv({
          env: {
            "APP_PORT": "3000"
          }
        }).pipe(ConfigProvider.nested("APP"))
        const provider = primary.pipe(ConfigProvider.orElse(fallback))
        await assertSuccess(provider, ["databaseHost"], ConfigProvider.makeValue("from-env"))
        await assertSuccess(provider, ["PORT"], ConfigProvider.makeValue("3000"))
      })

      it("distributes mapInput over both operands", async () => {
        const appendSuffix = ConfigProvider.mapInput((path) =>
          path.map((seg) => typeof seg === "string" ? `${seg}_SUFFIX` : seg)
        )
        const primary = ConfigProvider.fromEnv({
          env: {
            "prefix_SUFFIX_KEY_SUFFIX": "primary"
          }
        }).pipe(ConfigProvider.nested("prefix"))
        const fallback = ConfigProvider.fromEnv({
          env: {
            "fallback_SUFFIX_KEY_SUFFIX": "fallback",
            "fallback_SUFFIX_OTHER_SUFFIX": "fallback"
          }
        }).pipe(ConfigProvider.nested("fallback"))
        const provider = primary.pipe(ConfigProvider.orElse(fallback), appendSuffix)
        await assertSuccess(provider, ["KEY"], ConfigProvider.makeValue("primary"))
        await assertSuccess(provider, ["OTHER"], ConfigProvider.makeValue("fallback"))
      })

      it("distributes nested over both operands", async () => {
        const primary = ConfigProvider.fromEnv({
          env: {
            "app_DATABASE_HOST": "primary"
          }
        }).pipe(ConfigProvider.constantCase)
        const fallback = ConfigProvider.fromEnv({
          env: {
            "app_PORT": "fallback"
          }
        })
        const provider = primary.pipe(ConfigProvider.orElse(fallback), ConfigProvider.nested("app"))
        await assertSuccess(provider, ["databaseHost"], ConfigProvider.makeValue("primary"))
        await assertSuccess(provider, ["PORT"], ConfigProvider.makeValue("fallback"))
      })

      it("uses the fallback when the primary value is an empty string", async () => {
        const primary = ConfigProvider.fromEnv({
          env: {
            "KEY": ""
          }
        })
        const fallback = ConfigProvider.fromUnknown({ KEY: "fallback" })
        const provider = primary.pipe(ConfigProvider.orElse(fallback))
        await assertSuccess(provider, ["KEY"], ConfigProvider.makeValue("fallback"))
      })

      it("does not merge a fallback container into an existing primary container", async () => {
        const primary = ConfigProvider.fromUnknown({ primary: "value1" })
        const fallback = ConfigProvider.fromUnknown({ fallback: "value2" })
        const provider = primary.pipe(ConfigProvider.orElse(fallback))

        await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["primary"])))
        await assertSuccess(provider, ["fallback"], ConfigProvider.makeValue("value2"))
      })
    })

    describe("mapInput", () => {
      it("composes transformations in application order", async () => {
        const appendB = ConfigProvider.mapInput((path) => path.map((sn) => typeof sn === "string" ? sn + "_B" : sn))
        const provider = ConfigProvider.mapInput(
          ConfigProvider.fromEnv({
            env: {
              "KEY_A_B": "value"
            }
          }),
          (path) => path.map((sn) => typeof sn === "string" ? sn + "_A" : sn)
        ).pipe(appendB)
        await assertSuccess(provider, ["KEY"], ConfigProvider.makeValue("value"))
      })
    })

    describe("constantCase", () => {
      it("converts string path segments to config case", async () => {
        const provider = ConfigProvider.constantCase(ConfigProvider.fromEnv({
          env: {
            "CONSTANT_CASE": "value1"
          }
        }))
        await assertSuccess(provider, ["constant.case"], ConfigProvider.makeValue("value1"))
      })

      it("preserves numeric word groups", async () => {
        const provider = ConfigProvider.constantCase(ConfigProvider.fromEnv({
          env: {
            "API_V2_XML": "value1",
            "FIELD2_VALUE": "value2"
          }
        }))
        await assertSuccess(provider, ["api-v2 xml"], ConfigProvider.makeValue("value1"))
        await assertSuccess(provider, ["field2Value"], ConfigProvider.makeValue("value2"))
      })

      it("leaves numeric path segments unchanged", async () => {
        const provider = ConfigProvider.fromUnknown({
          ITEMS: ["value"]
        }).pipe(ConfigProvider.constantCase)

        await assertSuccess(provider, ["items", 0], ConfigProvider.makeValue("value"))
      })
    })

    describe("nested", () => {
      it("adds a string prefix to the path", async () => {
        const provider = ConfigProvider.fromEnv({
          env: {
            "prefix_A": "value"
          }
        }).pipe(ConfigProvider.nested("prefix"))
        await assertSuccess(provider, ["A"], ConfigProvider.makeValue("value"))
      })

      it("adds a Path prefix with string and numeric segments", async () => {
        const provider = ConfigProvider.nested(
          ConfigProvider.fromUnknown({
            apps: [{ PORT: "3000" }]
          }),
          ["apps", 0]
        )

        await assertSuccess(provider, ["PORT"], ConfigProvider.makeValue("3000"))
      })

      it("preserves order when constantCase is applied before nested", async () => {
        const provider = ConfigProvider.fromEnv({
          env: {
            "prefix_KEY_WITH_DOTS": "value"
          }
        }).pipe(ConfigProvider.constantCase, ConfigProvider.nested("prefix"))
        await assertSuccess(provider, ["key.with.dots"], ConfigProvider.makeValue("value"))
      })

      it("preserves order when constantCase is applied after nested", async () => {
        const provider = ConfigProvider.fromEnv({
          env: {
            "PREFIX_WITH_DOTS_KEY_WITH_DOTS": "value"
          }
        }).pipe(ConfigProvider.nested("prefix.with.dots"), ConfigProvider.constantCase)
        await assertSuccess(provider, ["key.with.dots"], ConfigProvider.makeValue("value"))
      })

      it("composes multiple prefixes as wrappers", async () => {
        const provider = ConfigProvider.fromEnv({
          env: {
            "b_a_KEY": "value"
          }
        }).pipe(ConfigProvider.nested("a"), ConfigProvider.nested("b"))
        await assertSuccess(provider, ["KEY"], ConfigProvider.makeValue("value"))
      })

      it("allows a later mapInput to transform the prefixed path", async () => {
        const appendLeaf = ConfigProvider.mapInput((path) => [...path, "leaf"])
        const provider = ConfigProvider.fromEnv({
          env: {
            "app_KEY_leaf": "value"
          }
        }).pipe(ConfigProvider.nested("app"), appendLeaf)
        await assertSuccess(provider, ["KEY"], ConfigProvider.makeValue("value"))
      })
    })
  })

  describe("fromEnvRecord", () => {
    it("reads defined values and skips undefined values", async () => {
      const env: Record<string, string | undefined> = {
        DEFINED: "value",
        UNDEFINED: undefined
      }
      const provider = ConfigProvider.fromEnvRecord(env)

      await assertSuccess(provider, ["DEFINED"], ConfigProvider.makeValue("value"))
      await assertMissing(provider, ["UNDEFINED"])
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["DEFINED"])))
    })

    it("treats empty strings as missing by default", async () => {
      await assertMissing(ConfigProvider.fromEnvRecord({ EMPTY: "" }), ["EMPTY"])
    })

    it("preserves empty strings when requested", async () => {
      const provider = ConfigProvider.fromEnvRecord(
        { EMPTY: "" },
        { preserveEmptyStrings: true }
      )

      await assertSuccess(provider, ["EMPTY"], ConfigProvider.makeValue(""))
    })
  })

  describe("fromEnv", () => {
    it("env without an underscore", async () => {
      const env = { A: "value1" }
      const provider = ConfigProvider.fromEnv({ env })
      await assertSuccess(provider, ["A"], ConfigProvider.makeValue("value1"))
    })

    it("missing key returns None", async () => {
      const env = { A: "value1" }
      const provider = ConfigProvider.fromEnv({ env })
      await assertMissing(provider, ["missing"])
    })

    it("does not read inherited environment properties", async () => {
      const provider = ConfigProvider.fromEnv({ env: {} })
      await assertMissing(provider, ["constructor"])
    })

    it("does not traverse inherited trie properties", async () => {
      delete (Object as any).children
      const provider = ConfigProvider.fromEnv({ env: { constructor_X: "value" } })
      const polluted = Object.hasOwn(Object, "children")
      delete (Object as any).children

      deepStrictEqual(polluted, false)
      await assertSuccess(provider, ["constructor", "X"], ConfigProvider.makeValue("value"))
    })

    it("treats empty string values as missing while preserving structure by default", async () => {
      const env = { A: "", B: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["A", "B"])))
      await assertMissing(provider, ["A"])
      await assertSuccess(provider, ["B"], ConfigProvider.makeValue("value1"))
    })

    it("preserves empty strings when requested", async () => {
      const env = { A: "" }
      const provider = ConfigProvider.fromEnv({ env, preserveEmptyStrings: true })

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["A"])))
      await assertSuccess(provider, ["A"], ConfigProvider.makeValue(""))
    })

    it("treats empty co-located record values as missing and preserves children", async () => {
      const env = { A: "", A_B: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["B"])))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeValue("value1"))
    })

    it("preserves empty co-located record values when requested", async () => {
      const env = { A: "", A_B: "value1" }
      const provider = ConfigProvider.fromEnv({ env, preserveEmptyStrings: true })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["B"]), ""))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeValue("value1"))
    })

    it("treats empty co-located array values as missing and preserves children", async () => {
      const env = { A: "", A_0: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeArray(1))
      await assertSuccess(provider, ["A", 0], ConfigProvider.makeValue("value1"))
    })

    it("preserves empty array children structurally while treating their values as missing", async () => {
      const env = { A_0: "", A_1: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeArray(2))
      await assertMissing(provider, ["A", 0])
      await assertSuccess(provider, ["A", 1], ConfigProvider.makeValue("value1"))
    })

    it("direct lookup of a key containing underscores", async () => {
      const env = { NODE_ENV: "value1" }
      const provider = ConfigProvider.fromEnv({ env })
      await assertSuccess(provider, ["NODE_ENV"], ConfigProvider.makeValue("value1"))
    })

    it("single underscore creates nesting", async () => {
      const env = { NODE_ENV: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["NODE"], ConfigProvider.makeRecord(new Set(["ENV"])))
      await assertSuccess(provider, ["NODE", "ENV"], ConfigProvider.makeValue("value1"))
    })

    it("prefix can be both a value and a container", async () => {
      const env = { NODE: "value1", NODE_ENV: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["NODE"], ConfigProvider.makeRecord(new Set(["ENV"]), "value1"))
      await assertSuccess(provider, ["NODE", "ENV"], ConfigProvider.makeValue("value2"))
      await assertSuccess(provider, ["NODE_ENV"], ConfigProvider.makeValue("value2"))
    })

    it("multiple nested children under the same prefix", async () => {
      const env = { NODE: "value1", NODE_ENV: "value2", NODE_PATH: "value3" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["NODE"], ConfigProvider.makeRecord(new Set(["ENV", "PATH"]), "value1"))
      await assertSuccess(provider, ["NODE", "ENV"], ConfigProvider.makeValue("value2"))
      await assertSuccess(provider, ["NODE", "PATH"], ConfigProvider.makeValue("value3"))
      await assertSuccess(provider, ["NODE_PATH"], ConfigProvider.makeValue("value3"))
    })

    it("nested depth > 2 works", async () => {
      const env = { A_B_C: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["B"])))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeRecord(new Set(["C"])))
      await assertSuccess(provider, ["A", "B", "C"], ConfigProvider.makeValue("value1"))
    })

    it("array: dense numeric children yield an Array node", async () => {
      const env = { A_0: "value1", A_1: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeArray(2))
      await assertSuccess(provider, ["A", 0], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A", 1], ConfigProvider.makeValue("value2"))
    })

    it("array: non-dense numeric children still yield an Array node", async () => {
      const env = { A: "root", A_0: "value1", A_2: "value3" }
      const provider = ConfigProvider.fromEnv({ env })

      // max index is 2 => length 3 (sparse is allowed)
      await assertSuccess(provider, ["A"], ConfigProvider.makeArray(3, "root"))
      await assertSuccess(provider, ["A", 0], ConfigProvider.makeValue("value1"))
      await assertMissing(provider, ["A", 1])
      await assertSuccess(provider, ["A", 2], ConfigProvider.makeValue("value3"))
    })

    it("array: parent can have a co-located value", async () => {
      const env = { A: "root", A_0: "value1", A_1: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeArray(2, "root"))
      await assertSuccess(provider, ["A", 0], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A", 1], ConfigProvider.makeValue("value2"))
    })

    it("mixed children (numeric + non-numeric) yields Record", async () => {
      const env = { A_0: "value1", A_B: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["0", "B"])))
      await assertSuccess(provider, ["A", 0], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeValue("value2"))
    })

    it("double underscore produces an empty segment (no special handling)", async () => {
      const env = { A__B: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set([""])))
      await assertSuccess(provider, ["A", ""], ConfigProvider.makeRecord(new Set(["B"])))
      await assertSuccess(provider, ["A", "", "B"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A__B"], ConfigProvider.makeValue("value1"))
    })

    it("empty segment node can be both a value and a container", async () => {
      const env = { A_: "value1", A__B: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A", ""], ConfigProvider.makeRecord(new Set(["B"]), "value1"))
      await assertSuccess(provider, ["A", "", "B"], ConfigProvider.makeValue("value2"))
    })

    it("leading underscore creates an empty first segment", async () => {
      const env = { _A: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set([""])))
      await assertSuccess(provider, [""], ConfigProvider.makeRecord(new Set(["A"])))
      await assertSuccess(provider, ["", "A"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["_A"], ConfigProvider.makeValue("value1"))
    })

    it("trailing underscore creates an empty last segment", async () => {
      const env = { A_: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set([""])))
      await assertSuccess(provider, ["A", ""], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A_"], ConfigProvider.makeValue("value1"))
    })

    it("cannot descend past a leaf (A exists, but A_B does not)", async () => {
      const env = { A: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeValue("value1"))
      await assertMissing(provider, ["A", "B"])
      await assertMissing(provider, ["A_B"])
    })

    it("direct lookup and nested lookup both work for the same env var", async () => {
      const env = { A_B: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A_B"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["B"])))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeValue("value1"))
    })

    it("prefix value is preserved when there are multiple nested children", async () => {
      const env = { A: "root", A_B: "value1", A_C: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["B", "C"]), "root"))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A", "C"], ConfigProvider.makeValue("value2"))
    })

    it("intermediate node can be both a value and a container (A_B and A_B_C)", async () => {
      const env = { A_B: "value1", A_B_C: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A_B"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["B"])))
      await assertSuccess(provider, ["A", "B"], ConfigProvider.makeRecord(new Set(["C"]), "value1"))
      await assertSuccess(provider, ["A", "B", "C"], ConfigProvider.makeValue("value2"))
    })

    it("numeric index: string and number segments should resolve the same", async () => {
      const env = { A_0: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A", 0], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A", "0"], ConfigProvider.makeValue("value1"))
    })

    it("array: leading-zero indices are not numeric, so it yields a Record", async () => {
      const env = { A_01: "value1", A_1: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["01", "1"])))
      await assertSuccess(provider, ["A", "01"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["A", 1], ConfigProvider.makeValue("value2"))
    })

    it("array: values outside the JavaScript array index range yield a Record", async () => {
      const env = { A_4294967295: "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["4294967295"])))
      await assertSuccess(provider, ["A", "4294967295"], ConfigProvider.makeValue("value1"))
    })

    it("root path exposes top-level keys", async () => {
      const env = { A: "value1", B_C: "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["A", "B"])))
      await assertSuccess(provider, ["A"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["B"], ConfigProvider.makeRecord(new Set(["C"])))
    })

    it("underscore-only key creates empty segments", async () => {
      const env = { "_": "value1" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["_"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set([""])))
      await assertSuccess(provider, [""], ConfigProvider.makeRecord(new Set([""])))
      await assertSuccess(provider, ["", ""], ConfigProvider.makeValue("value1"))
    })

    it("array: non-integer indices do not yield an Array node", async () => {
      const env = { "A_-1": "value1", "A_1.5": "value2" }
      const provider = ConfigProvider.fromEnv({ env })

      await assertSuccess(provider, ["A"], ConfigProvider.makeRecord(new Set(["-1", "1.5"])))
    })
  })

  describe("fromUnknown", () => {
    const provider = ConfigProvider.fromUnknown({
      string: "value1",
      record: {
        key1: "value2",
        key2: {
          key3: "value3"
        }
      },
      array: ["value4", {
        key4: "value5"
      }, ["value6"]],
      null: null,
      number: 42,
      boolean: true,
      bigint: 0n,
      undefined,
      unknown: Symbol("unknown")
    })

    it("Root node", async () => {
      await assertSuccess(
        provider,
        [],
        ConfigProvider.makeRecord(
          new Set(["string", "record", "array", "null", "number", "boolean", "bigint", "undefined", "unknown"])
        )
      )
    })

    it("Exact leaf resolution", async () => {
      await assertSuccess(provider, ["string"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["record", "key1"], ConfigProvider.makeValue("value2"))
      await assertSuccess(provider, ["array", 0], ConfigProvider.makeValue("value4"))
      await assertSuccess(provider, ["array", 1, "key4"], ConfigProvider.makeValue("value5"))
      await assertSuccess(provider, ["array", 2, 0], ConfigProvider.makeValue("value6"))
    })

    it("treats empty string leaves as missing by default", async () => {
      const provider = ConfigProvider.fromUnknown({
        a: "",
        b: "value1",
        record: {
          key: ""
        },
        array: [""]
      })

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["a", "b", "record", "array"])))
      await assertMissing(provider, ["a"])
      await assertSuccess(provider, ["b"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["record"], ConfigProvider.makeRecord(new Set(["key"])))
      await assertMissing(provider, ["record", "key"])
      await assertSuccess(provider, ["array"], ConfigProvider.makeArray(1))
      await assertMissing(provider, ["array", 0])
    })

    it("preserves empty string leaves when requested", async () => {
      const provider = ConfigProvider.fromUnknown(
        {
          a: "",
          array: [""]
        },
        { preserveEmptyStrings: true }
      )

      await assertSuccess(provider, ["a"], ConfigProvider.makeValue(""))
      await assertSuccess(provider, ["array", 0], ConfigProvider.makeValue(""))
    })

    it("Object detection", async () => {
      await assertSuccess(provider, ["record"], ConfigProvider.makeRecord(new Set(["key1", "key2"])))
      await assertSuccess(provider, ["record", "key2"], ConfigProvider.makeRecord(new Set(["key3"])))
    })

    it("Array detection", async () => {
      await assertSuccess(provider, ["array"], ConfigProvider.makeArray(3))
      await assertSuccess(provider, ["array", 2], ConfigProvider.makeArray(1))
    })

    it("should return None on non-existing paths", async () => {
      await assertMissing(provider, ["string", "non-existing"])
      await assertMissing(provider, ["record", "non-existing"])
      await assertMissing(provider, ["array", 3, "non-existing"])
    })

    it("does not read inherited object properties", async () => {
      const root = Object.assign(Object.create({ inherited: "value1" }), {
        own: "value2"
      })
      const provider = ConfigProvider.fromUnknown(root)

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["own"])))
      await assertMissing(provider, ["inherited"])
      await assertSuccess(provider, ["own"], ConfigProvider.makeValue("value2"))
    })

    it("null values", async () => {
      await assertMissing(provider, ["null"])
    })

    it("number values", async () => {
      await assertSuccess(provider, ["number"], ConfigProvider.makeValue("42"))
    })

    it("boolean values", async () => {
      await assertSuccess(provider, ["boolean"], ConfigProvider.makeValue("true"))
    })

    it("bigint values", async () => {
      await assertSuccess(provider, ["bigint"], ConfigProvider.makeValue("0"))
    })

    it("undefined values", async () => {
      await assertMissing(provider, ["undefined"])
    })

    it("unknown values", async () => {
      await assertSuccess(provider, ["unknown"], ConfigProvider.makeValue("Symbol(unknown)"))
    })
  })

  describe("fromDotEnvContents", () => {
    it("comments are ignored", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
# comments are ignored
API_URL=https://api.example.com
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["API"])))
      await assertSuccess(provider, ["API_URL"], ConfigProvider.makeValue("https://api.example.com"))
    })

    it("export is allowed", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
export NODE_ENV=production
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["NODE"])))
      await assertSuccess(provider, ["NODE_ENV"], ConfigProvider.makeValue("production"))
    })

    it("supports single, double, and backtick quoted values", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
SINGLE='value # one'
DOUBLE="line 1\\nline 2"
BACKTICK=\`value # two\`
`)
      await assertSuccess(provider, ["SINGLE"], ConfigProvider.makeValue("value # one"))
      await assertSuccess(provider, ["DOUBLE"], ConfigProvider.makeValue("line 1\nline 2"))
      await assertSuccess(provider, ["BACKTICK"], ConfigProvider.makeValue("value # two"))
    })

    it("removes inline comments from unquoted values", async () => {
      const provider = ConfigProvider.fromDotEnvContents("VALUE=value # comment")

      await assertSuccess(provider, ["VALUE"], ConfigProvider.makeValue("value"))
    })

    it("objects are supported", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
OBJECT_key1=value1
OBJECT_key2=value2
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["OBJECT"])))
      await assertSuccess(provider, ["OBJECT"], ConfigProvider.makeRecord(new Set(["key1", "key2"])))
      await assertSuccess(provider, ["OBJECT", "key1"], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["OBJECT", "key2"], ConfigProvider.makeValue("value2"))
    })

    it("treats empty string values as missing while preserving structure by default", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
A=
B=value1
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["A", "B"])))
      await assertMissing(provider, ["A"])
      await assertSuccess(provider, ["B"], ConfigProvider.makeValue("value1"))
    })

    it("preserves empty strings when requested", async () => {
      const provider = ConfigProvider.fromDotEnvContents(
        `
A=
`,
        { preserveEmptyStrings: true }
      )
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["A"])))
      await assertSuccess(provider, ["A"], ConfigProvider.makeValue(""))
    })

    it("a node may be both leaf and object", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
OBJECT=value1
OBJECT_key1=value2
OBJECT_key2=value3
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["OBJECT"])))
      await assertSuccess(provider, ["OBJECT"], ConfigProvider.makeRecord(new Set(["key1", "key2"]), "value1"))
      await assertSuccess(provider, ["OBJECT", "key1"], ConfigProvider.makeValue("value2"))
      await assertSuccess(provider, ["OBJECT", "key2"], ConfigProvider.makeValue("value3"))
    })

    it("a node may be both leaf and array", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
ARRAY=value1
ARRAY_0=value2
ARRAY_1=value3
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["ARRAY"])))
      await assertSuccess(provider, ["ARRAY"], ConfigProvider.makeArray(2, "value1"))
      await assertSuccess(provider, ["ARRAY", 0], ConfigProvider.makeValue("value2"))
      await assertSuccess(provider, ["ARRAY", 1], ConfigProvider.makeValue("value3"))
    })

    it("arrays are supported", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
ARRAY_0=value1
ARRAY_1=value2
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["ARRAY"])))
      await assertSuccess(provider, ["ARRAY"], ConfigProvider.makeArray(2))
      await assertSuccess(provider, ["ARRAY", 0], ConfigProvider.makeValue("value1"))
      await assertSuccess(provider, ["ARRAY", 1], ConfigProvider.makeValue("value2"))
    })

    it("expansion of environment variables is off by default", async () => {
      const provider = ConfigProvider.fromDotEnvContents(`
PASSWORD="value"
DB_PASS=$PASSWORD
`)
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["PASSWORD", "DB"])))
      await assertSuccess(provider, ["PASSWORD"], ConfigProvider.makeValue("value"))
      await assertSuccess(provider, ["DB_PASS"], ConfigProvider.makeValue("$PASSWORD"))
    })

    it("expansion of environment variables is supported", async () => {
      const provider = ConfigProvider.fromDotEnvContents(
        `
PASSWORD="value"
DB_PASS=\${PASSWORD}
`,
        { expandVariables: true }
      )
      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["PASSWORD", "DB"])))
      await assertSuccess(provider, ["PASSWORD"], ConfigProvider.makeValue("value"))
      await assertSuccess(provider, ["DB_PASS"], ConfigProvider.makeValue("value"))
    })

    it("expands referenced values as literal data", async () => {
      const provider = ConfigProvider.fromDotEnvContents(
        `
SOURCE=a$&b$'c$\`d
TARGET=\${SOURCE}
`,
        { expandVariables: true }
      )
      await assertSuccess(provider, ["TARGET"], ConfigProvider.makeValue("a$&b$'c$`d"))
    })

    it("expansion defaults are used only for empty or unset variables", async () => {
      const provider = ConfigProvider.fromDotEnvContents(
        `
SET=actual
EMPTY=
FROM_SET=\${SET:-fallback}
FROM_EMPTY=\${EMPTY:-fallback}
FROM_UNSET=\${UNSET:-fallback}
`,
        { expandVariables: true }
      )
      await assertSuccess(provider, ["FROM_SET"], ConfigProvider.makeValue("actual"))
      await assertSuccess(provider, ["FROM_EMPTY"], ConfigProvider.makeValue("fallback"))
      await assertSuccess(provider, ["FROM_UNSET"], ConfigProvider.makeValue("fallback"))
    })

    it("does not expand missing inherited variables", async () => {
      const provider = ConfigProvider.fromDotEnvContents("VALUE=$constructor", {
        expandVariables: true
      })
      await assertMissing(provider, ["VALUE"])
    })
  })

  describe("fromDotEnv", () => {
    it("should load configuration from .env file", async () => {
      const provider = await Effect.runPromise(
        ConfigProvider.fromDotEnv().pipe(
          Effect.provide(FileSystem.layerNoop({
            readFileString: (path) =>
              Effect.succeed(`PATH=${path}
A=1`)
          }))
        )
      )

      await assertSuccess(provider, ["PATH"], ConfigProvider.makeValue(".env"))
      await assertSuccess(provider, ["A"], ConfigProvider.makeValue("1"))
    })

    it("should support `path` option to specify the path to the .env file", async () => {
      const provider = await Effect.runPromise(
        ConfigProvider.fromDotEnv({ path: "custom.env" }).pipe(
          Effect.provide(FileSystem.layerNoop({
            readFileString: (path) =>
              Effect.succeed(`CUSTOM_PATH=${path}
A=1`)
          }))
        )
      )

      await assertSuccess(provider, ["CUSTOM_PATH"], ConfigProvider.makeValue("custom.env"))
      await assertSuccess(provider, ["A"], ConfigProvider.makeValue("1"))
    })

    it("should support `expandVariables` option", async () => {
      const provider = await Effect.runPromise(
        ConfigProvider.fromDotEnv({ expandVariables: true }).pipe(
          Effect.provide(FileSystem.layerNoop({
            readFileString: () =>
              Effect.succeed(`PASSWORD=value
DB_PASS=$PASSWORD`)
          }))
        )
      )

      await assertSuccess(provider, ["DB_PASS"], ConfigProvider.makeValue("value"))
    })

    it("should treat empty string values as missing while preserving structure by default", async () => {
      const provider = await Effect.runPromise(
        ConfigProvider.fromDotEnv().pipe(
          Effect.provide(FileSystem.layerNoop({
            readFileString: () => Effect.succeed("A=")
          }))
        )
      )

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["A"])))
      await assertMissing(provider, ["A"])
    })

    it("should support `preserveEmptyStrings` option", async () => {
      const provider = await Effect.runPromise(
        ConfigProvider.fromDotEnv({ preserveEmptyStrings: true }).pipe(
          Effect.provide(FileSystem.layerNoop({
            readFileString: () => Effect.succeed("A=")
          }))
        )
      )

      await assertSuccess(provider, ["A"], ConfigProvider.makeValue(""))
    })

    it("fails with the FileSystem error when the file cannot be read", async () => {
      const error = PlatformError.systemError({
        module: "FileSystem",
        _tag: "PermissionDenied",
        method: "readFileString"
      })
      const result = await Effect.runPromise(
        ConfigProvider.fromDotEnv().pipe(
          Effect.provide(FileSystem.layerNoop({
            readFileString: () => Effect.fail(error)
          })),
          Effect.result
        )
      )

      deepStrictEqual(result, Result.fail(error))
    })
  })

  describe("fromDir", () => {
    const files: Record<string, string> = {
      "/secret": "keepitsafe\n",
      "/SHOUTING": "value",
      "/integer": "123",
      "/nested/config": "hello"
    }
    const Fs = FileSystem.layerNoop({
      readFileString(path) {
        if (path in files) {
          return Effect.succeed(files[path])
        }
        return Effect.fail(notFound("readFileString"))
      },
      readDirectory(_path) {
        return Effect.fail(notFound("readDirectory"))
      }
    })
    const Platform = Layer.mergeAll(Fs, Path.layer)

    it("reads trimmed file contents at root and nested paths", async () => {
      const provider = await Effect.runPromise(
        ConfigProvider.fromDir({ rootPath: "/" }).pipe(Effect.provide(Platform))
      )

      await assertSuccess(provider, ["secret"], ConfigProvider.makeValue("keepitsafe"))
      await assertSuccess(provider, ["SHOUTING"], ConfigProvider.makeValue("value"))
      await assertSuccess(provider, ["integer"], ConfigProvider.makeValue("123"))
      await assertSuccess(provider, ["nested", "config"], ConfigProvider.makeValue("hello"))
      await assertMissing(provider, ["missing"])
    })

    it("treats empty files as missing by default", async () => {
      const Fs = FileSystem.layerNoop({
        readFileString(path) {
          return path === "/empty"
            ? Effect.succeed("")
            : Effect.fail(notFound("readFileString"))
        },
        readDirectory(path) {
          return path === "/"
            ? Effect.succeed(["empty"])
            : Effect.fail(notFound("readDirectory"))
        }
      })
      const provider = await Effect.runPromise(
        ConfigProvider.fromDir({ rootPath: "/" }).pipe(Effect.provide(Layer.mergeAll(Fs, Path.layer)))
      )

      await assertSuccess(provider, [], ConfigProvider.makeRecord(new Set(["empty"])))
      await assertMissing(provider, ["empty"])
    })

    it("preserves empty files when requested", async () => {
      const Fs = FileSystem.layerNoop({
        readFileString(path) {
          return path === "/empty"
            ? Effect.succeed("\n")
            : Effect.fail(notFound("readFileString"))
        },
        readDirectory() {
          return Effect.fail(notFound("readDirectory"))
        }
      })
      const provider = await Effect.runPromise(
        ConfigProvider.fromDir({ rootPath: "/", preserveEmptyStrings: true }).pipe(
          Effect.provide(Layer.mergeAll(Fs, Path.layer))
        )
      )

      await assertSuccess(provider, ["empty"], ConfigProvider.makeValue(""))
    })

    it("reads directory entries as a record", async () => {
      const dirs: Record<string, ReadonlyArray<string>> = {
        "/app": ["host", "port"]
      }
      const Fs = FileSystem.layerNoop({
        readFileString() {
          return Effect.fail(notFound("readFileString"))
        },
        readDirectory(path) {
          const entries = dirs[path]
          return entries
            ? Effect.succeed([...entries])
            : Effect.fail(notFound("readDirectory"))
        }
      })
      const provider = await Effect.runPromise(
        ConfigProvider.fromDir({ rootPath: "/" }).pipe(Effect.provide(Layer.mergeAll(Fs, Path.layer)))
      )
      await assertSuccess(provider, ["app"], ConfigProvider.makeRecord(new Set(["host", "port"])))
    })

    it("wraps non-NotFound failures in SourceError", async () => {
      const cause = PlatformError.systemError({
        module: "FileSystem",
        _tag: "PermissionDenied",
        method: "readFileString"
      })
      const Fs = FileSystem.layerNoop({
        readFileString: () => Effect.fail(cause),
        readDirectory: () => Effect.fail(notFound("readDirectory"))
      })
      const provider = await Effect.runPromise(
        ConfigProvider.fromDir({ rootPath: "/config" }).pipe(
          Effect.provide(Layer.mergeAll(Fs, Path.layer))
        )
      )

      await assertFailure(
        provider,
        ["secret"],
        new ConfigProvider.SourceError({
          message: "Failed to read file at /config/secret",
          cause
        })
      )
    })
  })

  describe("layers", () => {
    const loadFromContext = (path: ConfigProvider.Path) =>
      Effect.gen(function*() {
        const provider = yield* ConfigProvider.ConfigProvider
        return yield* provider.load(path)
      })

    it("layer installs a provider", async () => {
      const result = await Effect.runPromise(
        loadFromContext(["KEY"]).pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ KEY: "value" })))
        )
      )

      deepStrictEqual(result, ConfigProvider.makeValue("value"))
    })

    it("layer accepts an Effect that produces a provider", async () => {
      const result = await Effect.runPromise(
        loadFromContext(["KEY"]).pipe(
          Effect.provide(ConfigProvider.layer(Effect.succeed(ConfigProvider.fromUnknown({ KEY: "value" }))))
        )
      )

      deepStrictEqual(result, ConfigProvider.makeValue("value"))
    })

    it("layerAdd adds an Effect-produced provider as fallback", async () => {
      const current = ConfigProvider.fromUnknown({
        CURRENT: "current",
        SHARED: "current"
      })
      const fallback = ConfigProvider.fromUnknown({
        FALLBACK: "fallback",
        SHARED: "fallback"
      })
      const Added = ConfigProvider.layerAdd(Effect.succeed(fallback)).pipe(
        Layer.provide(ConfigProvider.layer(current))
      )

      const result = await Effect.runPromise(
        Effect.all({
          current: loadFromContext(["CURRENT"]),
          fallback: loadFromContext(["FALLBACK"]),
          shared: loadFromContext(["SHARED"])
        }).pipe(Effect.provide(Added))
      )

      deepStrictEqual(result, {
        current: ConfigProvider.makeValue("current"),
        fallback: ConfigProvider.makeValue("fallback"),
        shared: ConfigProvider.makeValue("current")
      })
    })

    it("layerAdd can install the added provider as primary", async () => {
      const current = ConfigProvider.fromUnknown({
        CURRENT: "current",
        SHARED: "current"
      })
      const primary = ConfigProvider.fromUnknown({
        PRIMARY: "primary",
        SHARED: "primary"
      })
      const Added = ConfigProvider.layerAdd(primary, { asPrimary: true }).pipe(
        Layer.provide(ConfigProvider.layer(current))
      )

      const result = await Effect.runPromise(
        Effect.all({
          current: loadFromContext(["CURRENT"]),
          primary: loadFromContext(["PRIMARY"]),
          shared: loadFromContext(["SHARED"])
        }).pipe(Effect.provide(Added))
      )

      deepStrictEqual(result, {
        current: ConfigProvider.makeValue("current"),
        primary: ConfigProvider.makeValue("primary"),
        shared: ConfigProvider.makeValue("primary")
      })
    })
  })
})
