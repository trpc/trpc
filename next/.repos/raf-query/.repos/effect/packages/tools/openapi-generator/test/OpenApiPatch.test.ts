import * as OpenApiPatch from "@effect/openapi-generator/OpenApiPatch"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Path from "effect/Path"

const testLayer = NodeServices.layer

describe("OpenApiPatch", () => {
  describe("parsePatchInput", () => {
    describe("inline JSON", () => {
      it.effect("parses valid inline JSON patch", () =>
        Effect.gen(function*() {
          const result = yield* OpenApiPatch.parsePatchInput(
            "[{\"op\":\"add\",\"path\":\"/foo\",\"value\":\"bar\"}]"
          )
          assert.deepStrictEqual(result, [{ op: "add", path: "/foo", value: "bar" }])
        }).pipe(Effect.provide(testLayer)))

      it.effect("parses inline JSON with multiple operations", () =>
        Effect.gen(function*() {
          const result = yield* OpenApiPatch.parsePatchInput(
            "[{\"op\":\"add\",\"path\":\"/a\",\"value\":1},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"replace\",\"path\":\"/c\",\"value\":true}]"
          )
          assert.strictEqual(result.length, 3)
          assert.strictEqual(result[0].op, "add")
          assert.strictEqual(result[1].op, "remove")
          assert.strictEqual(result[2].op, "replace")
        }).pipe(Effect.provide(testLayer)))

      it.effect("fails on invalid JSON syntax", () =>
        Effect.gen(function*() {
          const exit = yield* Effect.exit(
            OpenApiPatch.parsePatchInput("[{\"op\":\"add\" \"path\":\"/foo\"}]")
          )
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(Effect.provide(testLayer)))

      it.effect("fails on unsupported operation", () =>
        Effect.gen(function*() {
          const exit = yield* Effect.exit(
            OpenApiPatch.parsePatchInput("[{\"op\":\"copy\",\"from\":\"/a\",\"path\":\"/b\"}]")
          )
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(Effect.provide(testLayer)))

      it.effect("fails on missing path field", () =>
        Effect.gen(function*() {
          const exit = yield* Effect.exit(
            OpenApiPatch.parsePatchInput("[{\"op\":\"add\",\"value\":\"test\"}]")
          )
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(Effect.provide(testLayer)))

      it.effect("fails on missing value for add operation", () =>
        Effect.gen(function*() {
          const exit = yield* Effect.exit(
            OpenApiPatch.parsePatchInput("[{\"op\":\"add\",\"path\":\"/foo\"}]")
          )
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(Effect.provide(testLayer)))

      it.effect("allows missing value for remove operation", () =>
        Effect.gen(function*() {
          const result = yield* OpenApiPatch.parsePatchInput(
            "[{\"op\":\"remove\",\"path\":\"/foo\"}]"
          )
          assert.deepStrictEqual(result, [{ op: "remove", path: "/foo" }])
        }).pipe(Effect.provide(testLayer)))
    })

    describe("file paths", () => {
      it.effect("parses valid JSON file", () =>
        Effect.gen(function*() {
          const pathService = yield* Path.Path
          const filePath = pathService.join(
            import.meta.dirname,
            "fixtures/patches/valid-add.json"
          )
          const result = yield* OpenApiPatch.parsePatchInput(filePath)
          assert.strictEqual(result.length, 1)
          assert.strictEqual(result[0].op, "add")
          assert.strictEqual(result[0].path, "/info/x-custom")
        }).pipe(Effect.provide(testLayer)))

      it.effect("parses valid YAML file", () =>
        Effect.gen(function*() {
          const pathService = yield* Path.Path
          const filePath = pathService.join(
            import.meta.dirname,
            "fixtures/patches/valid-patch.yaml"
          )
          const result = yield* OpenApiPatch.parsePatchInput(filePath)
          assert.deepStrictEqual(result, [
            { op: "replace", path: "/info/title", value: "YAML Patched Title" },
            { op: "add", path: "/info/x-yaml-patch", value: true }
          ])
        }).pipe(Effect.provide(testLayer)))

      it.effect("parses multiple operations from JSON file", () =>
        Effect.gen(function*() {
          const pathService = yield* Path.Path
          const filePath = pathService.join(
            import.meta.dirname,
            "fixtures/patches/valid-multiple.json"
          )
          const result = yield* OpenApiPatch.parsePatchInput(filePath)
          assert.strictEqual(result.length, 3)
        }).pipe(Effect.provide(testLayer)))

      it.effect("fails on file with unsupported operation", () =>
        Effect.gen(function*() {
          const pathService = yield* Path.Path
          const filePath = pathService.join(
            import.meta.dirname,
            "fixtures/patches/invalid-op.json"
          )
          const exit = yield* Effect.exit(OpenApiPatch.parsePatchInput(filePath))
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(Effect.provide(testLayer)))

      it.effect("fails on file with missing path", () =>
        Effect.gen(function*() {
          const pathService = yield* Path.Path
          const filePath = pathService.join(
            import.meta.dirname,
            "fixtures/patches/missing-path.json"
          )
          const exit = yield* Effect.exit(OpenApiPatch.parsePatchInput(filePath))
          assert.isTrue(Exit.isFailure(exit))
        }).pipe(Effect.provide(testLayer)))

      it.effect("falls back to inline JSON when file does not exist", () =>
        Effect.gen(function*() {
          const result = yield* OpenApiPatch.parsePatchInput(
            "[{\"op\":\"add\",\"path\":\"/x\",\"value\":1}]"
          )
          assert.deepStrictEqual(result, [{ op: "add", path: "/x", value: 1 }])
        }).pipe(Effect.provide(testLayer)))
    })
  })

  describe("applyPatches", () => {
    it.effect("applies single add patch", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" } }
        const patches = [{
          source: "test",
          patch: [{ op: "add" as const, path: "/info/version", value: "1.0.0" }]
        }]
        const result = yield* OpenApiPatch.applyPatches(patches, document)
        assert.deepStrictEqual(result, { info: { title: "Test", version: "1.0.0" } })
      }))

    it.effect("applies single remove patch", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test", deprecated: true } }
        const patches = [{
          source: "test",
          patch: [{ op: "remove" as const, path: "/info/deprecated" }]
        }]
        const result = yield* OpenApiPatch.applyPatches(patches, document)
        assert.deepStrictEqual(result, { info: { title: "Test" } })
      }))

    it.effect("applies single replace patch", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Old Title" } }
        const patches = [{
          source: "test",
          patch: [{ op: "replace" as const, path: "/info/title", value: "New Title" }]
        }]
        const result = yield* OpenApiPatch.applyPatches(patches, document)
        assert.deepStrictEqual(result, { info: { title: "New Title" } })
      }))

    it.effect("applies multiple patches in sequence", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Original", version: "0.0.1" } }
        const patches = [
          {
            source: "patch1",
            patch: [{ op: "replace" as const, path: "/info/title", value: "Step 1" }]
          },
          {
            source: "patch2",
            patch: [{ op: "replace" as const, path: "/info/version", value: "1.0.0" }]
          },
          {
            source: "patch3",
            patch: [{ op: "add" as const, path: "/info/x-patched", value: true }]
          }
        ]
        const result = yield* OpenApiPatch.applyPatches(patches, document)
        assert.deepStrictEqual(result, {
          info: { title: "Step 1", version: "1.0.0", "x-patched": true }
        })
      }))

    it.effect("applies multiple operations within a single patch", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" }, paths: {} }
        const patches = [{
          source: "test",
          patch: [
            { op: "replace" as const, path: "/info/title", value: "Updated" },
            { op: "add" as const, path: "/info/version", value: "2.0.0" }
          ]
        }]
        const result = yield* OpenApiPatch.applyPatches(patches, document)
        assert.deepStrictEqual(result, {
          info: { title: "Updated", version: "2.0.0" },
          paths: {}
        })
      }))

    it.effect("fails when path does not exist for replace", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" } }
        const patches = [{
          source: "test",
          patch: [{ op: "replace" as const, path: "/info/nonexistent", value: "x" }]
        }]
        const exit = yield* Effect.exit(OpenApiPatch.applyPatches(patches, document))
        assert.isTrue(Exit.isFailure(exit))
      }))

    it.effect("fails when path does not exist for remove", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" } }
        const patches = [{
          source: "test",
          patch: [{ op: "remove" as const, path: "/info/nonexistent" }]
        }]
        const exit = yield* Effect.exit(OpenApiPatch.applyPatches(patches, document))
        assert.isTrue(Exit.isFailure(exit))
      }))

    it.effect("accumulates multiple errors", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" } }
        const patches = [{
          source: "test.json",
          patch: [
            { op: "replace" as const, path: "/info/nonexistent1", value: "x" },
            { op: "remove" as const, path: "/info/nonexistent2" },
            { op: "replace" as const, path: "/info/nonexistent3", value: "y" }
          ]
        }]
        const exit = yield* Effect.exit(OpenApiPatch.applyPatches(patches, document))
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          const failure = exit.cause.reasons[0]
          if (failure._tag === "Fail") {
            assert.strictEqual(failure.error._tag, "JsonPatchAggregateError")
            assert.strictEqual(failure.error.errors.length, 3)
            assert.include(failure.error.message, "3 patch operations failed")
            assert.include(failure.error.message, "/info/nonexistent1")
            assert.include(failure.error.message, "/info/nonexistent2")
            assert.include(failure.error.message, "/info/nonexistent3")
          }
        }
      }))

    it.effect("accumulates errors across multiple patches", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" } }
        const patches = [
          {
            source: "patch1.json",
            patch: [{ op: "remove" as const, path: "/info/missing1" }]
          },
          {
            source: "patch2.json",
            patch: [{ op: "remove" as const, path: "/info/missing2" }]
          }
        ]
        const exit = yield* Effect.exit(OpenApiPatch.applyPatches(patches, document))
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          const failure = exit.cause.reasons[0]
          if (failure._tag === "Fail") {
            assert.strictEqual(failure.error.errors.length, 2)
            assert.include(failure.error.message, "patch1.json")
            assert.include(failure.error.message, "patch2.json")
          }
        }
      }))

    it.effect("preserves unmodified parts of document", () =>
      Effect.gen(function*() {
        const document = {
          info: { title: "Test", description: "Unchanged" },
          paths: { "/users": { get: {} } },
          components: { schemas: {} }
        }
        const patches = [{
          source: "test",
          patch: [{ op: "replace" as const, path: "/info/title", value: "Changed" }]
        }]
        const result = yield* OpenApiPatch.applyPatches(patches, document)
        assert.strictEqual((result as { info: { description: string } }).info.description, "Unchanged")
        assert.deepStrictEqual((result as { paths: object }).paths, { "/users": { get: {} } })
        assert.deepStrictEqual((result as { components: object }).components, { schemas: {} })
      }))

    it.effect("returns original document when no patches provided", () =>
      Effect.gen(function*() {
        const document = { info: { title: "Test" } }
        const result = yield* OpenApiPatch.applyPatches([], document)
        assert.deepStrictEqual(result, document)
      }))
  })

  describe("error messages", () => {
    it.effect("JsonPatchParseError has descriptive message", () =>
      Effect.gen(function*() {
        const error = new OpenApiPatch.JsonPatchParseError({
          source: "./fix.json",
          reason: "Unexpected token"
        })
        assert.strictEqual(
          error.message,
          "Failed to parse patch from ./fix.json: Unexpected token"
        )
      }))

    it.effect("JsonPatchValidationError has descriptive message", () =>
      Effect.gen(function*() {
        const error = new OpenApiPatch.JsonPatchValidationError({
          source: "inline",
          reason: "Missing 'path' field"
        })
        assert.strictEqual(
          error.message,
          "Invalid JSON Patch from inline: Missing 'path' field"
        )
      }))

    it.effect("JsonPatchApplicationError has descriptive message", () =>
      Effect.gen(function*() {
        const error = new OpenApiPatch.JsonPatchApplicationError({
          source: "./fix.json",
          operationIndex: 2,
          operation: "remove",
          path: "/info/x",
          reason: "Property does not exist"
        })
        assert.strictEqual(
          error.message,
          "Failed to apply patch from ./fix.json: operation 2 (remove at /info/x): Property does not exist"
        )
      }))

    it.effect("JsonPatchAggregateError has descriptive message", () =>
      Effect.gen(function*() {
        const error = new OpenApiPatch.JsonPatchAggregateError({
          errors: [
            new OpenApiPatch.JsonPatchApplicationError({
              source: "./fix.json",
              operationIndex: 0,
              operation: "replace",
              path: "/info/x",
              reason: "Property does not exist"
            }),
            new OpenApiPatch.JsonPatchApplicationError({
              source: "./other.json",
              operationIndex: 1,
              operation: "remove",
              path: "/paths/~1users",
              reason: "Path not found"
            })
          ]
        })
        assert.include(error.message, "2 patch operations failed")
        assert.include(error.message, "1. [./fix.json] op 0 (replace at /info/x)")
        assert.include(error.message, "2. [./other.json] op 1 (remove at /paths/~1users)")
      }))
  })
})
