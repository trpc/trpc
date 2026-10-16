import { describe, it } from "@effect/vitest"
import { deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import * as JsonPatch from "effect/JsonPatch"
import type * as Schema from "effect/Schema"

const expectMessage = (f: () => unknown, includes: string) => {
  throws(f, (e) => {
    if (e instanceof Error && e.message.includes(includes)) return undefined
    throw e
  })
}

const expectAppliesTo = (patch: JsonPatch.JsonPatch, oldValue: Schema.Json, newValue: Schema.Json) => {
  deepStrictEqual(JsonPatch.apply(patch, oldValue), newValue)
}

describe("JsonPatch", () => {
  describe("get", () => {
    describe("root values", () => {
      it("returns [] for identical values", () => {
        const cases: ReadonlyArray<Schema.Json> = [
          1,
          "hello",
          true,
          null,
          [1, 2, 3],
          { a: 1 }
        ]
        for (const v of cases) {
          deepStrictEqual(JsonPatch.get(v, v), [])
        }
      })

      it("emits a root replace for primitive changes", () => {
        const cases: ReadonlyArray<[Schema.Json, Schema.Json]> = [
          [1, 2],
          ["hello", "world"],
          [true, false],
          [null, 42]
        ]
        for (const [from, to] of cases) {
          deepStrictEqual(JsonPatch.get(from, to), [{ op: "replace", path: "", value: to }])
        }
      })

      it("emits a root replace for type changes", () => {
        deepStrictEqual(JsonPatch.get(1, "string"), [{ op: "replace", path: "", value: "string" }])
        deepStrictEqual(JsonPatch.get([1, 2], { a: 1 }), [{ op: "replace", path: "", value: { a: 1 } }])
        deepStrictEqual(JsonPatch.get({ a: 1 }, [1, 2]), [{ op: "replace", path: "", value: [1, 2] }])
      })
    })

    describe("arrays", () => {
      it("adds new elements (append semantics)", () => {
        deepStrictEqual(JsonPatch.get([1, 2], [1, 2, 3]), [{ op: "add", path: "/2", value: 3 }])
        deepStrictEqual(JsonPatch.get([], [1, 2, 3]), [
          { op: "add", path: "/0", value: 1 },
          { op: "add", path: "/1", value: 2 },
          { op: "add", path: "/2", value: 3 }
        ])
      })

      it("removes elements in descending index order (no index shifting)", () => {
        deepStrictEqual(JsonPatch.get([1, 2, 3], [1, 2]), [{ op: "remove", path: "/2" }])

        const patch = JsonPatch.get([0, 1, 2, 3, 4, 5], [0, 1, 3])
        const removeIdx = patch
          .filter((op) => op.op === "remove")
          .map((op) => Number(op.path.slice(1)))

        deepStrictEqual(removeIdx, [...removeIdx].sort((a, b) => b - a))
        expectAppliesTo(patch, [0, 1, 2, 3, 4, 5], [0, 1, 3])
      })

      it("replaces modified elements", () => {
        deepStrictEqual(JsonPatch.get([1, 2, 3], [1, 4, 3]), [{ op: "replace", path: "/1", value: 4 }])
      })

      it("handles mixed operations", () => {
        deepStrictEqual(JsonPatch.get([1, 2, 3], [1, 4, 5, 6]), [
          { op: "replace", path: "/1", value: 4 },
          { op: "replace", path: "/2", value: 5 },
          { op: "add", path: "/3", value: 6 }
        ])

        deepStrictEqual(JsonPatch.get([1, 2, 3, 4], [1, 5]), [
          { op: "replace", path: "/1", value: 5 },
          { op: "remove", path: "/3" },
          { op: "remove", path: "/2" }
        ])
      })

      it("supports nested arrays", () => {
        deepStrictEqual(JsonPatch.get([[1, 2], [3, 4]], [[1, 2], [3, 5]]), [
          { op: "replace", path: "/1/1", value: 5 }
        ])

        deepStrictEqual(JsonPatch.get([[1, 2]], [[1, 2], [3, 4]]), [
          { op: "add", path: "/1", value: [3, 4] }
        ])
      })
    })

    describe("objects", () => {
      it("uses stable key order for deterministic patches", () => {
        const patch = JsonPatch.get({ b: 1, a: 1 }, { a: 2, b: 2 })
        deepStrictEqual(
          patch.filter((op) => op.op === "replace").map((op) => op.path),
          ["/a", "/b"]
        )
        expectAppliesTo(patch, { b: 1, a: 1 }, { a: 2, b: 2 })
      })

      it("adds / removes / replaces properties", () => {
        deepStrictEqual(JsonPatch.get({ a: 1 }, { a: 1, b: 2 }), [{ op: "add", path: "/b", value: 2 }])
        deepStrictEqual(JsonPatch.get({ a: 1, b: 2 }, { a: 1 }), [{ op: "remove", path: "/b" }])
        deepStrictEqual(JsonPatch.get({ a: 1, b: 2 }, { a: 1, b: 3 }), [{ op: "replace", path: "/b", value: 3 }])
      })

      it("removes properties in sorted key order", () => {
        deepStrictEqual(JsonPatch.get({ a: 1, b: 2, c: 3 }, {}), [
          { op: "remove", path: "/a" },
          { op: "remove", path: "/b" },
          { op: "remove", path: "/c" }
        ])
      })

      it("handles mixed object operations", () => {
        deepStrictEqual(JsonPatch.get({ a: 1, b: 2 }, { a: 1, c: 3, d: 4 }), [
          { op: "remove", path: "/b" },
          { op: "add", path: "/c", value: 3 },
          { op: "add", path: "/d", value: 4 }
        ])
      })

      it("supports nested objects", () => {
        deepStrictEqual(JsonPatch.get({ a: { b: 1 } }, { a: { b: 2 } }), [
          { op: "replace", path: "/a/b", value: 2 }
        ])
        deepStrictEqual(JsonPatch.get({ a: { b: 1 } }, { a: { b: 1, c: 2 } }), [
          { op: "add", path: "/a/c", value: 2 }
        ])
        deepStrictEqual(JsonPatch.get({ a: { b: 1, c: 2 } }, { a: { b: 1 } }), [
          { op: "remove", path: "/a/c" }
        ])
      })

      describe("JSON Pointer escaping in keys", () => {
        it("escapes '/' as '~1' and '~' as '~0'", () => {
          deepStrictEqual(JsonPatch.get({ "a/b": 1 }, { "a/b": 2 }), [
            { op: "replace", path: "/a~1b", value: 2 }
          ])
          deepStrictEqual(JsonPatch.get({ "a~b": 1 }, { "a~b": 2 }), [
            { op: "replace", path: "/a~0b", value: 2 }
          ])
        })

        it("represents a literal key '~1' as token '~01'", () => {
          deepStrictEqual(JsonPatch.get({}, { "~1": 0 }), [
            { op: "add", path: "/~01", value: 0 }
          ])
        })

        it("does not confuse '~01' with '/' (unescape order)", () => {
          deepStrictEqual(JsonPatch.get({ "a~1b": 1 }, { "a~1b": 2 }), [
            { op: "replace", path: "/a~01b", value: 2 }
          ])
        })

        it("treats '__proto__' as an own key", () => {
          const oldValue = JSON.parse(`{"__proto__":{"value":1}}`)
          const newValue = JSON.parse(`{"__proto__":{"value":2}}`)

          deepStrictEqual(JsonPatch.get(oldValue, newValue), [
            { op: "replace", path: "/__proto__/value", value: 2 }
          ])
        })
      })
    })

    describe("complex nested structures", () => {
      it("emits a minimal-ish patch for deep updates (and is applicable)", () => {
        const oldValue: Schema.Json = {
          users: [
            { id: 1, name: "Alice", tags: ["admin"] },
            { id: 2, name: "Bob", tags: [] }
          ],
          metadata: { version: 1 }
        }

        const newValue: Schema.Json = {
          users: [
            { id: 1, name: "Alice", tags: ["admin", "moderator"] },
            { id: 2, name: "Bob", tags: [] },
            { id: 3, name: "Charlie", tags: [] }
          ],
          metadata: { version: 2 }
        }

        const patch = JsonPatch.get(oldValue, newValue)
        deepStrictEqual(patch, [
          { op: "replace", path: "/metadata/version", value: 2 },
          { op: "add", path: "/users/0/tags/1", value: "moderator" },
          { op: "add", path: "/users/2", value: { id: 3, name: "Charlie", tags: [] } }
        ])

        expectAppliesTo(patch, oldValue, newValue)
      })
    })

    describe("immutability", () => {
      it("does not mutate input values", () => {
        const oldArray = [1, 2, 3]
        const newArray = [1, 2, 4]
        const originalArray = [...oldArray]

        JsonPatch.get(oldArray, newArray)
        deepStrictEqual(oldArray, originalArray)

        const oldObject = { a: 1, b: 2 }
        const newObject = { a: 1, b: 3, c: 4 }
        const originalObject = { ...oldObject }

        JsonPatch.get(oldObject, newObject)
        deepStrictEqual(oldObject, originalObject)
      })

      it("returns empty array for identical references", () => {
        const value = { a: 1, b: [2, 3] }
        const patch = JsonPatch.get(value, value)
        deepStrictEqual(patch, [])
      })
    })

    describe("empty structures", () => {
      it("handles empty array to empty array", () => {
        deepStrictEqual(JsonPatch.get([], []), [])
      })

      it("handles empty object to empty object", () => {
        deepStrictEqual(JsonPatch.get({}, {}), [])
      })

      it("handles empty array to non-empty array", () => {
        deepStrictEqual(JsonPatch.get([], [1, 2]), [
          { op: "add", path: "/0", value: 1 },
          { op: "add", path: "/1", value: 2 }
        ])
      })

      it("handles non-empty array to empty array", () => {
        const patch = JsonPatch.get([1, 2], [])
        deepStrictEqual(patch, [{ op: "remove", path: "/1" }, { op: "remove", path: "/0" }])
        expectAppliesTo(patch, [1, 2], [])
      })

      it("handles empty object to non-empty object", () => {
        deepStrictEqual(JsonPatch.get({}, { a: 1, b: 2 }), [
          { op: "add", path: "/a", value: 1 },
          { op: "add", path: "/b", value: 2 }
        ])
      })

      it("handles non-empty object to empty object", () => {
        const patch = JsonPatch.get({ a: 1, b: 2 }, {})
        deepStrictEqual(patch, [
          { op: "remove", path: "/a" },
          { op: "remove", path: "/b" }
        ])
        expectAppliesTo(patch, { a: 1, b: 2 }, {})
      })
    })

    describe("reference equality optimization", () => {
      it("returns empty patch for structurally equal objects and same references", () => {
        const value1 = { a: 1 }
        const value2 = { a: 1 }
        const value3 = value1

        const patch1 = JsonPatch.get(value1, value2)
        deepStrictEqual(patch1, [])
        expectAppliesTo(patch1, value1, value2)

        deepStrictEqual(JsonPatch.get(value1, value3), [])
      })

      it("returns empty patch for structurally equal but different objects", () => {
        const value1 = { a: 1, b: { c: 2 } }
        const value2 = { a: 1, b: { c: 2 } }
        deepStrictEqual(JsonPatch.get(value1, value2), [])
      })

      it("emits the property replace for structurally different objects", () => {
        const value1 = { a: 1 }
        const value2 = { a: 2 }
        const patch = JsonPatch.get(value1, value2)
        deepStrictEqual(patch.length > 0, true)
        expectAppliesTo(patch, value1, value2)
      })

      it("returns empty patch for same array reference", () => {
        const arr = [1, 2, 3]
        deepStrictEqual(JsonPatch.get(arr, arr), [])
      })

      it("returns empty patch for same object reference", () => {
        const obj = { a: 1, b: 2 }
        deepStrictEqual(JsonPatch.get(obj, obj), [])
      })
    })

    describe("edge cases", () => {
      it("handles single-element arrays", () => {
        deepStrictEqual(JsonPatch.get([1], [2]), [{ op: "replace", path: "/0", value: 2 }])
        deepStrictEqual(JsonPatch.get([1], []), [{ op: "remove", path: "/0" }])
        deepStrictEqual(JsonPatch.get([], [1]), [{ op: "add", path: "/0", value: 1 }])
      })

      it("handles single-property objects", () => {
        deepStrictEqual(JsonPatch.get({ a: 1 }, { a: 2 }), [{ op: "replace", path: "/a", value: 2 }])
        deepStrictEqual(JsonPatch.get({ a: 1 }, {}), [{ op: "remove", path: "/a" }])
        deepStrictEqual(JsonPatch.get({}, { a: 1 }), [{ op: "add", path: "/a", value: 1 }])
      })

      it("handles array index 0 operations", () => {
        deepStrictEqual(JsonPatch.get([1, 2, 3], [0, 2, 3]), [{ op: "replace", path: "/0", value: 0 }])
        const patch = JsonPatch.get([1, 2, 3], [2, 3])
        expectAppliesTo(patch, [1, 2, 3], [2, 3])
        deepStrictEqual(patch, [
          { op: "replace", path: "/0", value: 2 },
          { op: "replace", path: "/1", value: 3 },
          { op: "remove", path: "/2" }
        ])
      })

      it("handles operations at last array index", () => {
        deepStrictEqual(JsonPatch.get([1, 2, 3], [1, 2, 4]), [{ op: "replace", path: "/2", value: 4 }])
        deepStrictEqual(JsonPatch.get([1, 2, 3], [1, 2]), [{ op: "remove", path: "/2" }])
      })
    })

    describe("deep nesting", () => {
      it("handles deeply nested structures", () => {
        const oldValue: Schema.Json = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: { value: "old" }
                }
              }
            }
          }
        }

        const newValue: Schema.Json = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: { value: "new", extra: "added" }
                }
              }
            }
          }
        }

        const patch = JsonPatch.get(oldValue, newValue)
        expectAppliesTo(patch, oldValue, newValue)
      })

      it("handles nested arrays within objects", () => {
        const oldValue: Schema.Json = {
          items: [
            [1, 2],
            [3, 4]
          ]
        }

        const newValue: Schema.Json = {
          items: [
            [1, 2],
            [3, 5],
            [6, 7]
          ]
        }

        const patch = JsonPatch.get(oldValue, newValue)
        expectAppliesTo(patch, oldValue, newValue)
      })
    })
  })

  describe("apply", () => {
    describe("happy paths", () => {
      it("applies operations after a root replace", () => {
        deepStrictEqual(
          JsonPatch.apply(
            [
              { op: "replace", path: "", value: {} },
              { op: "add", path: "/a", value: 1 }
            ],
            { old: true }
          ),
          { a: 1 }
        )
      })

      it("replace", () => {
        deepStrictEqual(JsonPatch.apply([{ op: "replace", path: "", value: 42 }], 1), 42)

        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/a", value: 2 }], { a: 1 }),
          { a: 2 }
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/1", value: 20 }], [1, 2, 3]),
          [1, 20, 3]
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/a/b", value: 2 }], { a: { b: 1 } }),
          { a: { b: 2 } }
        )
      })

      it("add", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/b", value: 2 }], { a: 1 }),
          { a: 1, b: 2 }
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/1", value: 10 }], [1, 2, 3]),
          [1, 10, 2, 3]
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/-", value: 4 }], [1, 2, 3]),
          [1, 2, 3, 4]
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/users/0/tags/-", value: "admin" }], {
            users: [{ id: 1, tags: [] }]
          }),
          { users: [{ id: 1, tags: ["admin"] }] }
        )
      })

      it("remove", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/a" }], { a: 1, b: 2 }),
          { b: 2 }
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/1" }], [1, 2, 3]),
          [1, 3]
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/a/b" }], { a: { b: 1, c: 2 } }),
          { a: { c: 2 } }
        )
      })

      it("applies multiple operations in sequence", () => {
        deepStrictEqual(
          JsonPatch.apply(
            [
              { op: "add", path: "/c", value: 3 },
              { op: "replace", path: "/a", value: 10 },
              { op: "remove", path: "/b" }
            ],
            { a: 1, b: 2 }
          ),
          { a: 10, c: 3 }
        )
      })
    })

    describe("JSON Pointer decoding", () => {
      it("decodes '~1' as '/' and '~0' as '~'", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/a~1b", value: 2 }], { "a/b": 1 }),
          { "a/b": 2 }
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/a~0b", value: 1 }], {}),
          { "a~b": 1 }
        )

        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/path~1to~0key", value: "value" }], {}),
          { "path/to~key": "value" }
        )
      })

      it("decodes '~01' as a literal '~1' (unescape order)", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/a~01b", value: 1 }], {}),
          { "a~1b": 1 }
        )
      })

      it("addresses a literal key '~1' via token '~01'", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/~01", value: 0 }], {}),
          { "~1": 0 }
        )
      })
    })

    describe("errors", () => {
      it("rejects non-empty pointers that do not start with '/'", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "invalid", value: 1 }], {}),
          `must start with "/"`
        )
      })

      it("rejects invalid array indices", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/abc", value: 1 }], []),
          `Invalid array index`
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "replace", path: "/-1", value: 1 }], [1, 2, 3]),
          `Invalid array index`
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/items/abc/value", value: 1 }], { items: [] }),
          `Invalid array index: "abc"`
        )
      })

      it("rejects out-of-bounds array access", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "replace", path: "/10", value: 1 }], [1, 2, 3]),
          "Array index out of bounds"
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/10", value: 1 }], [1, 2, 3]),
          "Array index out of bounds"
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "remove", path: "/10" }], [1, 2, 3]),
          "Array index out of bounds"
        )
      })

      it("rejects '-' for replace/remove", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "replace", path: "/-", value: 1 }], [1, 2, 3]),
          `"-" is not valid for replace`
        )

        expectMessage(
          () => JsonPatch.apply([{ op: "remove", path: "/-" }], [1, 2, 3]),
          `"-" is not valid for remove`
        )
      })

      it("rejects replace/remove of non-existent object members", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "replace", path: "/nonexistent", value: 1 }], { a: 1 }),
          `does not exist`
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "remove", path: "/nonexistent" }], { a: 1 }),
          `does not exist`
        )
      })

      it("does not treat inherited properties as document members", () => {
        const document = Object.create({ inherited: { value: 1 } }) as Schema.JsonObject

        expectMessage(
          () => JsonPatch.apply([{ op: "replace", path: "/inherited/value", value: 2 }], document),
          "Cannot replace at"
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "remove", path: "/inherited" }], document),
          "does not exist"
        )
      })

      it("rejects add/replace when the parent is missing or not a container", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/a/b", value: 1 }], { a: null }),
          "Cannot add at"
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/a/b", value: 1 }], {}),
          "Cannot add at"
        )

        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/a/b", value: 1 }], { a: "string" }),
          "not a container"
        )
        expectMessage(
          () => JsonPatch.apply([{ op: "replace", path: "/a/b", value: 1 }], { a: 42 }),
          "not a container"
        )

        expectMessage(
          () => JsonPatch.apply([{ op: "add", path: "/a/b/c", value: 1 }], { a: { b: "not-object" } }),
          "not a container"
        )
      })

      it("rejects operations when a nested parent cannot be resolved", () => {
        const cases: ReadonlyArray<[JsonPatch.JsonPatchOperation, Schema.Json]> = [
          [{ op: "add", path: "/a/b/c", value: 1 }, { a: null }],
          [{ op: "add", path: "/a/0/b", value: 1 }, { a: [] }],
          [{ op: "replace", path: "/a/b", value: 1 }, {}],
          [{ op: "remove", path: "/a/b" }, {}],
          [{ op: "remove", path: "/a/b/c" }, { a: "not-object" }]
        ]
        for (const [operation, document] of cases) {
          expectMessage(
            () => JsonPatch.apply([operation], document),
            `Cannot ${operation.op} at`
          )
        }
      })

      it("rejects remove at the root", () => {
        expectMessage(
          () => JsonPatch.apply([{ op: "remove", path: "" }], { a: 1 }),
          "root"
        )
      })
    })

    describe("immutability", () => {
      it("does not mutate input document", () => {
        const original = { a: 1, b: [2, 3] }
        const originalCopy = { a: 1, b: [2, 3] }

        JsonPatch.apply([{ op: "replace", path: "/a", value: 10 }], original)
        deepStrictEqual(original, originalCopy)

        const originalArray = [1, 2, 3]
        const originalArrayCopy = [1, 2, 3]

        JsonPatch.apply([{ op: "add", path: "/1", value: 99 }], originalArray)
        deepStrictEqual(originalArray, originalArrayCopy)
      })

      it("does not mutate patch array", () => {
        const patch: JsonPatch.JsonPatch = [{ op: "add", path: "/b", value: 2 }]
        const patchCopy = JSON.parse(JSON.stringify(patch))

        JsonPatch.apply(patch, { a: 1 })
        deepStrictEqual(patch, patchCopy)
      })

      it("preserves references outside the modified path", () => {
        const unchanged = { value: 1 }
        const original = { changed: { value: 1 }, unchanged }
        const result = JsonPatch.apply([{ op: "replace", path: "/changed/value", value: 2 }], original)

        strictEqual((result as any).unchanged, unchanged)
        deepStrictEqual(original, { changed: { value: 1 }, unchanged: { value: 1 } })
      })

      it("handles '__proto__' as an own data property", () => {
        const original = JSON.parse(`{"nested":{"__proto__":{"value":1}}}`)
        const result = JsonPatch.apply(
          [
            { op: "replace", path: "/nested/__proto__/value", value: 2 },
            { op: "add", path: "/__proto__", value: { value: 3 } }
          ],
          original
        ) as any

        strictEqual(Object.getPrototypeOf(result), Object.prototype)
        strictEqual(Object.getPrototypeOf(result.nested), Object.prototype)
        strictEqual(Object.hasOwn(result, "__proto__"), true)
        strictEqual(Object.hasOwn(result.nested, "__proto__"), true)
        deepStrictEqual(result.__proto__, { value: 3 })
        deepStrictEqual(result.nested.__proto__, { value: 2 })
        deepStrictEqual(original, JSON.parse(`{"nested":{"__proto__":{"value":1}}}`))
      })
    })

    describe("empty patch optimization", () => {
      it("returns original reference for empty patch", () => {
        const doc = { a: 1, b: 2 }
        const result = JsonPatch.apply([], doc)
        strictEqual(result, doc)
      })

      it("returns original reference for empty patch with arrays", () => {
        const arr = [1, 2, 3]
        const result = JsonPatch.apply([], arr)
        strictEqual(result, arr)
      })

      it("returns original reference for empty patch with primitives", () => {
        const primitives: ReadonlyArray<Schema.Json> = [1, "hello", true, null]
        for (const value of primitives) {
          const result = JsonPatch.apply([], value)
          strictEqual(result, value)
        }
      })
    })

    describe("sequential path dependencies", () => {
      it("applies operations on paths created by earlier operations", () => {
        const result = JsonPatch.apply(
          [
            { op: "add", path: "/new", value: {} },
            { op: "add", path: "/new/nested", value: { value: 1 } },
            { op: "replace", path: "/new/nested/value", value: 2 }
          ],
          {}
        )
        deepStrictEqual(result, { new: { nested: { value: 2 } } })
      })

      it("applies operations on array paths created by earlier operations", () => {
        const result = JsonPatch.apply(
          [
            { op: "add", path: "/items", value: [] },
            { op: "add", path: "/items/-", value: 1 },
            { op: "add", path: "/items/-", value: 2 },
            { op: "replace", path: "/items/0", value: 10 }
          ],
          {}
        )
        deepStrictEqual(result, { items: [10, 2] })
      })

      it("applies multiple operations on same path", () => {
        const result = JsonPatch.apply(
          [
            { op: "add", path: "/counter", value: 0 },
            { op: "replace", path: "/counter", value: 1 },
            { op: "replace", path: "/counter", value: 2 }
          ],
          {}
        )
        deepStrictEqual(result, { counter: 2 })
      })

      it("applies remove then add on same path", () => {
        const result = JsonPatch.apply(
          [
            { op: "remove", path: "/a" },
            { op: "add", path: "/a", value: "new" }
          ],
          { a: "old", b: 2 }
        )
        deepStrictEqual(result, { a: "new", b: 2 })
      })
    })

    describe("edge cases", () => {
      it("handles operations on empty arrays", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/-", value: 1 }], []),
          [1]
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/0", value: 1 }], []),
          [1]
        )
      })

      it("handles operations on empty objects", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/key", value: "value" }], {}),
          { key: "value" }
        )
      })

      it("handles array operations at index 0", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/0", value: 10 }], [1, 2, 3]),
          [10, 2, 3]
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/0" }], [1, 2, 3]),
          [2, 3]
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/0", value: 0 }], [1, 2, 3]),
          [0, 1, 2, 3]
        )
      })

      it("handles array operations at last index", () => {
        const arr = [1, 2, 3]
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/2", value: 30 }], arr),
          [1, 2, 30]
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/2" }], arr),
          [1, 2]
        )
      })

      it("handles single-element array operations", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/0", value: 2 }], [1]),
          [2]
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/0" }], [1]),
          []
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "/0", value: 0 }], [1]),
          [0, 1]
        )
      })

      it("handles single-property object operations", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "/a", value: 2 }], { a: 1 }),
          { a: 2 }
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "remove", path: "/a" }], { a: 1 }),
          {}
        )
      })
    })

    describe("root operations", () => {
      it("applies root add", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "add", path: "", value: { replacement: true } }], { old: true }),
          { replacement: true }
        )
      })

      it("applies root replace followed by nested operations", () => {
        const result = JsonPatch.apply(
          [
            { op: "replace", path: "", value: {} },
            { op: "add", path: "/a", value: 1 },
            { op: "add", path: "/b", value: 2 }
          ],
          { old: "data" }
        )
        deepStrictEqual(result, { a: 1, b: 2 })
      })

      it("applies root replace to different types", () => {
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "", value: [] }], { a: 1 }),
          []
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "", value: "string" }], 42),
          "string"
        )
        deepStrictEqual(
          JsonPatch.apply([{ op: "replace", path: "", value: null }], true),
          null
        )
      })
    })
  })

  describe("round-trip", () => {
    const cases: ReadonlyArray<[Schema.Json, Schema.Json]> = [
      [
        {
          users: [
            { id: 1, name: "Alice", active: true },
            { id: 2, name: "Bob", active: false }
          ],
          metadata: { version: 1, tags: ["v1"] }
        },
        {
          users: [
            { id: 1, name: "Alice Updated", active: true },
            { id: 3, name: "Charlie", active: true }
          ],
          metadata: { version: 2, tags: ["v2", "latest"] }
        }
      ],
      [
        [1, 2, 3, 4, 5],
        [1, 20, 3, 40, 50, 60]
      ],
      [
        { a: 1, b: 2, c: 3 },
        { a: 10, d: 4, e: 5 }
      ],
      [
        { level1: { level2: { level3: { value: "old" } } } },
        { level1: { level2: { level3: { value: "new", extra: "added" } } } }
      ]
    ]

    it("apply(get(old, new), old) === new", () => {
      for (const [oldValue, newValue] of cases) {
        const patch = JsonPatch.get(oldValue, newValue)
        expectAppliesTo(patch, oldValue, newValue)
      }
    })

    it("round-trip with empty structures", () => {
      const emptyCases: ReadonlyArray<[Schema.Json, Schema.Json]> = [
        [[], [1, 2, 3]],
        [[1, 2, 3], []],
        [{}, { a: 1, b: 2 }],
        [{ a: 1, b: 2 }, {}]
      ]

      for (const [oldValue, newValue] of emptyCases) {
        const patch = JsonPatch.get(oldValue, newValue)
        expectAppliesTo(patch, oldValue, newValue)
      }
    })

    it("round-trip with nested arrays and objects", () => {
      const oldValue: Schema.Json = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9]
        ],
        config: {
          settings: {
            nested: {
              deep: { value: "old" }
            }
          }
        }
      }

      const newValue: Schema.Json = {
        matrix: [
          [1, 2, 3],
          [4, 50, 6],
          [7, 8, 9],
          [10, 11, 12]
        ],
        config: {
          settings: {
            nested: {
              deep: { value: "new", extra: "field" }
            }
          }
        }
      }

      const patch = JsonPatch.get(oldValue, newValue)
      expectAppliesTo(patch, oldValue, newValue)
    })

    it("round-trip with complex array operations", () => {
      const oldValue: Schema.Json = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      const newValue: Schema.Json = [10, 1, 20, 3, 40, 50, 6, 70, 8]

      const patch = JsonPatch.get(oldValue, newValue)
      expectAppliesTo(patch, oldValue, newValue)
    })

    it("round-trip with escaped keys", () => {
      const oldValue: Schema.Json = {
        "key/with/slash": 1,
        "key~with~tilde": 2,
        "normal": 3
      }

      const newValue: Schema.Json = {
        "key/with/slash": 10,
        "key~with~tilde": 20,
        "normal": 30,
        "new/key": 40
      }

      const patch = JsonPatch.get(oldValue, newValue)
      expectAppliesTo(patch, oldValue, newValue)
    })

    it("round-trip with type changes", () => {
      const typeChangeCases: ReadonlyArray<[Schema.Json, Schema.Json]> = [
        [1, "string"],
        ["string", 42],
        [true, null],
        [null, []],
        [[], {}],
        [{}, []]
      ]

      for (const [oldValue, newValue] of typeChangeCases) {
        const patch = JsonPatch.get(oldValue, newValue)
        expectAppliesTo(patch, oldValue, newValue)
      }
    })

    it("round-trip preserves identical values (empty patch)", () => {
      const identicalCases: ReadonlyArray<Schema.Json> = [
        { a: 1, b: 2 },
        [1, 2, 3],
        "string",
        42,
        true,
        null,
        { nested: { deep: { value: "test" } } },
        [[1, 2], [3, 4]]
      ]

      for (const value of identicalCases) {
        const patch = JsonPatch.get(value, value)
        deepStrictEqual(patch, [])
        const result = JsonPatch.apply(patch, value)
        deepStrictEqual(result, value)
      }
    })
  })
})
