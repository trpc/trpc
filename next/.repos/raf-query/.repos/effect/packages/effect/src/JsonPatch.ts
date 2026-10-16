/**
 * The `JsonPatch` module computes and applies deterministic patch documents for
 * JSON values. A patch is an ordered list of `add`, `remove`, and `replace`
 * operations addressed by JSON Pointer paths. Use it to describe the structural
 * difference between two JSON documents, serialize that difference, and replay
 * it without mutating the original input.
 *
 * @since 4.0.0
 */
import * as InternalRecord from "./internal/record.ts"
import { escapeToken, unescapeToken } from "./JsonPointer.ts"
import type * as Schema from "./Schema.ts"

/**
 * A single JSON Patch operation.
 *
 * **When to use**
 *
 * Use to manually construct patch operations, accept patch operations from
 * callers, or type-check patch operation structures.
 *
 * **Details**
 *
 * Represents one transformation step in a JSON Patch document. This is a subset
 * of RFC 6902, restricted to operations that can be applied deterministically
 * without additional context. All fields are readonly, paths use JSON Pointer
 * syntax, and the empty string `""` refers to the root document. Operations are
 * discriminated by the `op` field, and the optional `description` field can be
 * used for documentation.
 *
 * **Example** (Defining all operation types)
 *
 * ```ts import.meta.vitest
 * import { JsonPatch } from "effect"
 *
 * const addOp: JsonPatch.JsonPatchOperation = {
 *   op: "add",
 *   path: "/users/-",
 *   value: { id: 1, name: "Alice" }
 * }
 *
 * const removeOp: JsonPatch.JsonPatchOperation = {
 *   op: "remove",
 *   path: "/users/0"
 * }
 *
 * const replaceOp: JsonPatch.JsonPatchOperation = {
 *   op: "replace",
 *   path: "/users/0/name",
 *   value: "Bob"
 * }
 *
 * Array.of(addOp.op, removeOp.op, replaceOp.op) // => ["add", "remove", "replace"]
 * ```
 *
 * @see {@link JsonPatch} for the array of operations forming a complete patch
 * @see {@link get} to compute operations automatically from value differences
 * @see {@link apply} to apply operations to transform documents
 * @category models
 * @since 4.0.0
 */
export type JsonPatchOperation =
  | {
    readonly op: "add"
    /**
     * JSON Pointer to the target location. For arrays, the last token may be `-`
     * to append.
     *
     * **When to use**
     *
     * Use to identify where the `add` operation inserts its value.
     */
    readonly path: string
    readonly value: Schema.Json
    readonly description?: string
  }
  | {
    readonly op: "remove"
    /**
     * JSON Pointer to the target location.
     *
     * **When to use**
     *
     * Use to identify which location the `remove` operation deletes.
     */
    readonly path: string
    readonly description?: string
  }
  | {
    readonly op: "replace"
    /**
     * JSON Pointer to the target location. Use `""` to replace the root document.
     *
     * **When to use**
     *
     * Use to identify which location the `replace` operation overwrites.
     */
    readonly path: string
    readonly value: Schema.Json
    readonly description?: string
  }

/**
 * A JSON Patch document (an ordered list of operations).
 *
 * **When to use**
 *
 * Use to store, serialize, pass, or validate complete patch documents.
 *
 * **Details**
 *
 * Represents a complete transformation as a readonly sequence of immutable
 * operations. Operations are applied sequentially from first to last, and later
 * operations observe the document state produced by earlier operations. An empty
 * array represents a no-op patch and returns the original document.
 *
 * **Example** (Defining a multi-operation patch)
 *
 * ```ts import.meta.vitest
 * import { JsonPatch } from "effect"
 *
 * const patch: JsonPatch.JsonPatch = [
 *   { op: "add", path: "/items/-", value: "apple" },
 *   { op: "replace", path: "/count", value: 5 },
 *   { op: "remove", path: "/oldField" }
 * ]
 *
 * JsonPatch.apply(patch, { items: [], count: 3, oldField: "value" }) // => { items: ["apple"], count: 5 }
 * ```
 *
 * @see {@link JsonPatchOperation} for individual operation types
 * @see {@link get} to generate patches from value differences
 * @see {@link apply} to execute patches to transform documents
 * @category models
 * @since 4.0.0
 */
export type JsonPatch = ReadonlyArray<JsonPatchOperation>

/**
 * Computes a structural patch that transforms `oldValue` into `newValue`.
 *
 * **When to use**
 *
 * Use to compute a JSON Patch from before and after JSON documents, detect
 * structural changes, or create deterministic update operations.
 *
 * **Details**
 *
 * Generates a structural diff between two JSON values, producing a patch that
 * yields `newValue` when applied to `oldValue`. It returns an empty array when
 * values are identical, recursively diffs nested structures, emits root
 * `replace` operations for primitive changes, and processes object keys in
 * sorted order for stable output.
 *
 * **Gotchas**
 *
 * Arrays are compared by index position, with no move or copy detection. Array
 * removals are emitted from highest to lowest index to prevent index shifting.
 * The output is deterministic but not guaranteed to be minimal.
 *
 * **Example** (Computing object diff)
 *
 * ```ts import.meta.vitest
 * import { JsonPatch } from "effect"
 *
 * const oldValue = { users: [{ id: 1, name: "Alice" }], count: 1 }
 * const newValue = { users: [{ id: 1, name: "Bob" }, { id: 2, name: "Charlie" }], count: 2 }
 *
 * const patch = JsonPatch.get(oldValue, newValue)
 * patch[0] // => { op: "replace", path: "/count", value: 2 }
 * patch[1] // => { op: "replace", path: "/users/0/name", value: "Bob" }
 * patch[2] // => { op: "add", path: "/users/1", value: { id: 2, name: "Charlie" } }
 * ```
 *
 * @see {@link apply} to apply the generated patch to a document
 * @see {@link JsonPatchOperation} for the operation types in the patch
 * @category transforming
 * @since 4.0.0
 */
export function get(oldValue: Schema.Json, newValue: Schema.Json): JsonPatch {
  const patches: Array<JsonPatchOperation> = []
  getLoop(oldValue, newValue, "", patches)
  return patches
}

function getLoop(
  oldValue: Schema.Json,
  newValue: Schema.Json,
  path: string,
  patches: Array<JsonPatchOperation>
): void {
  if (Object.is(oldValue, newValue)) return
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const len1 = oldValue.length
    const len2 = newValue.length

    // Compare shared prefix by index
    const shared = Math.min(len1, len2)
    for (let i = 0; i < shared; i++) {
      getLoop(oldValue[i], newValue[i], `${path}/${i}`, patches)
    }

    // Remove from end to start so later indices do not shift.
    for (let i = len1 - 1; i >= len2; i--) {
      patches.push({ op: "remove", path: `${path}/${i}` })
    }

    // Add from beginning to end.
    for (let i = len1; i < len2; i++) {
      patches.push({ op: "add", path: `${path}/${i}`, value: newValue[i] })
    }

    return
  }

  if (isJsonObject(oldValue) && isJsonObject(newValue)) {
    const keys1 = Object.keys(oldValue)
    const keys2 = Object.keys(newValue)
    const allKeys = Array.from(new Set([...keys1, ...keys2])).sort()

    for (const key of allKeys) {
      const keyPath = `${path}/${escapeToken(key)}`
      const hasKey1 = Object.hasOwn(oldValue, key)
      const hasKey2 = Object.hasOwn(newValue, key)

      if (hasKey1 && hasKey2) {
        getLoop(oldValue[key], newValue[key], keyPath, patches)
      } else if (!hasKey1 && hasKey2) {
        patches.push({ op: "add", path: keyPath, value: newValue[key] })
      } else {
        patches.push({ op: "remove", path: keyPath })
      }
    }

    return
  }

  patches.push({ op: "replace", path, value: newValue })
}

/**
 * Applies a JSON Patch to a JSON document.
 *
 * **When to use**
 *
 * Use to execute patches generated by {@link get}, transform documents
 * with manually constructed patches, or process patch operations from external
 * sources.
 *
 * **Details**
 *
 * Executes patch operations sequentially, so later operations see changes made
 * by earlier operations. It never mutates the input document; array and object
 * operations copy the affected containers. An empty patch returns the original
 * reference, and a root replace (`path: ""`) returns the provided value
 * directly.
 *
 * **Gotchas**
 *
 * Invalid paths, missing properties, and out-of-bounds array indices throw
 * errors.
 *
 * **Example** (Applying a patch)
 *
 * ```ts import.meta.vitest
 * import { JsonPatch } from "effect"
 *
 * const document = { items: [1, 2, 3], total: 6 }
 * const patch: JsonPatch.JsonPatch = [
 *   { op: "add", path: "/items/-", value: 4 },
 *   { op: "replace", path: "/total", value: 10 }
 * ]
 *
 * JsonPatch.apply(patch, document) // => { items: [1, 2, 3, 4], total: 10 }
 * ```
 *
 * @see {@link get} to generate patches from value differences
 * @see {@link JsonPatchOperation} for the operation types being applied
 * @category transforming
 * @since 4.0.0
 */
export function apply(patch: JsonPatch, oldValue: Schema.Json): Schema.Json {
  let doc = oldValue

  for (const op of patch) {
    doc = applyOperation(doc, op)
  }

  return doc
}

function isJsonObject(value: unknown): value is Schema.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Tokenize a JSON Pointer into unescaped reference tokens.
 *
 * - `""` (empty pointer) refers to the root and returns `[]`
 * - Non-empty pointers must start with `/`
 */
function tokenize(pointer: string): Array<string> {
  if (pointer === "") return []
  if (pointer.charCodeAt(0) !== 47 /* "/" */) {
    throw new Error(`Invalid JSON Pointer, it must start with "/": ${JSON.stringify(pointer)}`)
  }
  return pointer.split("/").slice(1).map(unescapeToken)
}

/** Converts a JSON Pointer reference token to a non-negative array index. */
function toJsonPointerArrayIndex(token: string): number {
  if (!/^(0|[1-9]\d*)$/.test(token)) {
    throw new Error(`Invalid array index: "${token}"`)
  }
  return Number(token)
}

function applyOperation(doc: Schema.Json, op: JsonPatchOperation): Schema.Json {
  if (op.path === "") {
    if (op.op === "remove") throw new Error("Unsupported operation at the root")
    return op.value
  }

  const resolved = resolveParent(doc, op.path)
  if (resolved === null) {
    throw new Error(`Cannot ${op.op} at "${op.path}" (parent not found or not a container).`)
  }

  const { lastToken, parent, stack } = resolved

  if (Array.isArray(parent)) {
    if (lastToken === "-" && op.op !== "add") {
      throw new Error(`"-" is not valid for ${op.op} at "${op.path}".`)
    }
    const index = lastToken === "-" ? parent.length : toJsonPointerArrayIndex(lastToken)
    const maxIndex = op.op === "add" ? parent.length : parent.length - 1
    if (index > maxIndex) throw new Error(`Array index out of bounds at "${op.path}".`)
    const updated = parent.slice()
    if (op.op === "add") updated.splice(index, 0, op.value)
    else if (op.op === "remove") updated.splice(index, 1)
    else updated[index] = op.value
    return rebuildFromStack(stack, updated)
  }

  if (isJsonObject(parent)) {
    if (op.op !== "add" && !Object.hasOwn(parent, lastToken)) {
      throw new Error(`Property "${lastToken}" does not exist at "${op.path}".`)
    }
    const updated = { ...parent }
    if (op.op === "remove") delete updated[lastToken]
    else InternalRecord.assignProperty(updated, lastToken, op.value)
    return rebuildFromStack(stack, updated)
  }

  throw new Error(`Cannot ${op.op} at "${op.path}" (parent not found or not a container).`)
}

type StackEntry = { readonly container: unknown; readonly token: number | string }

// Walk to the parent of `pointer`, recording the path.
// Returns null if the parent path cannot be resolved.
function resolveParent(
  doc: Schema.Json,
  pointer: string
): { readonly stack: ReadonlyArray<StackEntry>; readonly parent: unknown; readonly lastToken: string } | null {
  const tokens = tokenize(pointer)
  if (tokens.length === 0) return null // caller handles root

  const lastToken = tokens[tokens.length - 1]
  const stack: Array<StackEntry> = []
  let cur: unknown = doc

  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]

    if (Array.isArray(cur)) {
      const idx = toJsonPointerArrayIndex(token)
      if (idx >= cur.length) return null
      stack.push({ container: cur, token: idx })
      cur = cur[idx]
      continue
    }

    if (isJsonObject(cur)) {
      if (!Object.hasOwn(cur, token)) return null
      stack.push({ container: cur, token })
      cur = cur[token]
      continue
    }

    return null
  }

  return { stack, parent: cur, lastToken }
}

// Rebuild the document by writing `newParent` back through `stack`.
function rebuildFromStack(stack: ReadonlyArray<StackEntry>, newParent: Schema.Json): Schema.Json {
  let acc: Schema.Json = newParent

  for (let i = stack.length - 1; i >= 0; i--) {
    const { container, token } = stack[i]

    if (Array.isArray(container)) {
      const copy = container.slice()
      copy[token as number] = acc
      acc = copy
    } else {
      const copy = { ...(container as Schema.JsonObject) }
      InternalRecord.assignProperty(copy, token as string, acc)
      acc = copy
    }
  }

  return acc
}
